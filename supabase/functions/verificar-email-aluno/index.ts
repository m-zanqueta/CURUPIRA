import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
}

function resposta(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS })
}

function normalizarEmail(valor: unknown) {
  return String(valor || '').trim().toLowerCase()
}

function emailValido(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

async function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function hashIp(ip: string) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip || 'indisponivel')))
}

async function hashCodigo(email: string, codigo: string, pepper: string) {
  const chave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return hex(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(`${email}:${codigo}`)))
}

function mensagemBanco(error: { code?: string; message?: string } | null) {
  if (error?.code === 'PT429') return { mensagem: 'Aguarde um pouco antes de solicitar outro código.', status: 429 }
  if (error?.code === 'PT422') return { mensagem: 'Confira o e-mail informado e tente novamente.', status: 400 }
  if (error?.code === 'PGRST202' || error?.code === '42883') return { mensagem: 'As funções de verificação não foram encontradas. Execute a migration 20261106_verificacao_email_cadastro_aluno.sql no Supabase.', status: 500 }
  if (error?.code === '42501') return { mensagem: 'O Supabase negou o acesso ao banco. Confira as permissões service_role da migration.', status: 500 }
  return { mensagem: 'Não foi possível validar o cadastro. Confira se a migration de verificação foi aplicada no Supabase.', status: 500 }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return resposta({ erro: 'Método não permitido.' }, 405)

  try {
    const body = await request.json()
    const acao = String(body?.acao || '')
    const email = normalizarEmail(body?.email)
    if (!emailValido(email)) return resposta({ erro: 'Informe um e-mail válido.' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const pepper = Deno.env.get('EMAIL_CODE_PEPPER')?.trim()
    if (!supabaseUrl || !serviceKey) {
      console.error('Configuração interna Supabase ausente na Edge Function', {
        SUPABASE_URL: Boolean(supabaseUrl), SUPABASE_SERVICE_ROLE_KEY: Boolean(serviceKey),
      })
      return resposta({ erro: 'Falta configuração interna do Supabase na Edge Function.' }, 500)
    }
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

    if (acao === 'enviar') {
      const sendgridKey = Deno.env.get('SENDGRID_API_KEY')
      const remetente = Deno.env.get('SENDGRID_FROM_EMAIL')
      const secretsAusentes = [
        !pepper || pepper.length < 32 ? 'EMAIL_CODE_PEPPER (mínimo 32 caracteres)' : null,
        !sendgridKey ? 'SENDGRID_API_KEY' : null,
        !remetente ? 'SENDGRID_FROM_EMAIL' : null,
      ].filter(Boolean)
      if (secretsAusentes.length) {
        console.error('Secrets necessários ausentes/inválidos na Edge Function:', secretsAusentes)
        return resposta({ erro: `Confira estes Edge Function Secrets no Supabase: ${secretsAusentes.join(', ')}.` }, 500)
      }
      // Reafirma o narrowing de tipos depois da validação agregada acima.
      if (!pepper || pepper.length < 32 || !sendgridKey || !remetente) return resposta({ erro: 'Configuração de e-mail incompleta no Supabase.' }, 500)

      const codigo = String(crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000)
      const codigoHash = await hashCodigo(email, codigo, pepper)
      const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for') || 'indisponivel'
      const ipHash = await hashIp(ip)
      const { error: salvarErro } = await admin.rpc('aluno_iniciar_verificacao_email', {
        p_email: email, p_codigo_hash: codigoHash, p_ip_hash: ipHash,
      })
      if (salvarErro) {
        console.error('RPC aluno_iniciar_verificacao_email falhou:', { code: salvarErro.code, message: salvarErro.message })
        const erro = mensagemBanco(salvarErro)
        return resposta({ erro: erro.mensagem }, erro.status)
      }

      const envio = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email }] }],
          from: { email: remetente, name: 'Curupira' },
          subject: 'Seu código de confirmação do Curupira',
          content: [
            { type: 'text/plain', value: `Seu código de confirmação é ${codigo}. Ele expira em 10 minutos. Se você não solicitou este cadastro, ignore esta mensagem.` },
            { type: 'text/html', value: `<div style="font-family:Arial,sans-serif;color:#20251f"><h2>Confirme seu e-mail</h2><p>Digite este código no Curupira:</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px">${codigo}</p><p>Ele expira em 10 minutos. Se você não solicitou este cadastro, ignore esta mensagem.</p></div>` },
          ],
        }),
      })
      if (!envio.ok) {
        await admin.from('alunos_codigos_email').delete().eq('email', email)
        console.error('SendGrid recusou envio:', { status: envio.status })
        return resposta({ erro: 'O SendGrid não aceitou o e-mail. Confira se o remetente está verificado e tente novamente.' }, 502)
      }
      return resposta({ ok: true, mensagem: 'Se o endereço puder receber mensagens, enviaremos um código de confirmação.' })
    }

    if (acao === 'confirmar') {
      const nome = String(body?.nome || '').trim()
      const senha = String(body?.senha || '')
      const codigo = String(body?.codigo || '').trim()
      if (nome.length < 3 || nome.length > 100) return resposta({ erro: 'O nome deve ter entre 3 e 100 caracteres.' }, 400)
      if (!/^[0-9]{6}$/.test(codigo)) return resposta({ erro: 'Digite o código de 6 números recebido por e-mail.' }, 400)
      if (senha.length < 8 || !/[A-Z]/.test(senha) || !/[0-9]/.test(senha)) return resposta({ erro: 'A senha precisa ter ao menos 8 caracteres, uma maiúscula e um número.' }, 400)
      if (!pepper || pepper.length < 32) return resposta({ erro: 'Configuração de verificação incompleta no Supabase.' }, 500)

      const codigoHash = await hashCodigo(email, codigo, pepper)
      const { data, error } = await admin.rpc('aluno_confirmar_codigo_e_cadastrar', {
        p_email: email, p_codigo_hash: codigoHash, p_nome: nome, p_senha: senha,
      })
      if (error) {
        console.error('RPC aluno_confirmar_codigo_e_cadastrar falhou:', { code: error.code, message: error.message })
        const erro = mensagemBanco(error)
        return resposta({ erro: erro.mensagem }, erro.status)
      }
      if (data?.erro) {
        const textos: Record<string, string> = {
          codigo_invalido: 'Código incorreto. Confira o e-mail e tente novamente.',
          codigo_expirado: 'O código expirou ou já foi usado. Solicite um novo código.',
          muitas_tentativas: 'Limite de tentativas atingido. Solicite um novo código.',
          email_ja_cadastrado: 'Já existe uma conta com esse e-mail.',
          senha_fraca: 'A senha precisa ter ao menos 8 caracteres, uma maiúscula e um número.',
          nome_invalido: 'Informe um nome válido.',
        }
        return resposta({ erro: textos[data.erro] || 'Não foi possível criar a conta.' }, data.erro === 'muitas_tentativas' ? 429 : 400)
      }
      return resposta({ ok: true, aluno: data.aluno })
    }

    return resposta({ erro: 'Ação inválida.' }, 400)
  } catch (error) {
    console.error('Falha na verificação de e-mail de aluno:', error instanceof Error ? error.message : 'erro desconhecido')
    return resposta({ erro: 'Não foi possível concluir a solicitação. Tente novamente.' }, 500)
  }
})
