import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Private-Network': 'true',
  'Vary': 'Origin, Access-Control-Request-Headers, Access-Control-Request-Private-Network',
  'Content-Type': 'application/json; charset=utf-8',
}

function resposta(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS })
}

function normalizarEmail(valor: unknown) { return String(valor || '').trim().toLowerCase() }
function emailValido(email: string) { return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) }

async function hashHmac(texto: string, pepper: string) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const assinatura = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(texto))
  return Array.from(new Uint8Array(assinatura), b => b.toString(16).padStart(2, '0')).join('')
}

function codigoEmail(error: { code?: string } | null) {
  if (error?.code === 'PGRST202' || error?.code === '42883') return 'A recuperação ainda não foi ativada no banco. Aplique a migration de recuperação de senha.'
  return 'Não foi possível concluir agora. Tente novamente mais tarde.'
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS })
  if (request.method !== 'POST') return resposta({ ok: false, erro: 'Método não permitido.' }, 405)
  try {
    const body = await request.json()
    const operacao = String(body?.operacao || '')
    const email = normalizarEmail(body?.email)
    const papel = String(body?.papel || '')
    if (!emailValido(email) || !['aluno', 'staff'].includes(papel)) return resposta({ ok: false, erro: 'Confira o e-mail e tente novamente.' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const pepper = Deno.env.get('EMAIL_CODE_PEPPER')?.trim()
    if (!supabaseUrl || !serviceKey || !pepper || pepper.length < 32) {
      console.error('Configuração interna ausente na Edge Function recuperar-senha.')
      return resposta({ ok: false, erro: 'A recuperação de senha ainda não está configurada no servidor.' }, 500)
    }
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

    if (operacao === 'enviar') {
      const codigo = String(crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000)
      const hash = await hashHmac(`recuperacao:v1:${papel}:${email}:${codigo}`, pepper)
      const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for') || 'indisponivel'
      const ipHash = await hashHmac(`ip:v1:${ip}`, pepper)
      const { data, error } = await admin.rpc('recuperacao_senha_iniciar', {
        p_email: email, p_papel: papel, p_codigo_hash: hash, p_ip_hash: ipHash,
      })
      if (error) {
        console.error('RPC recuperar senha iniciar falhou:', { code: error.code })
        if (error.code === 'PT429') return resposta({ ok: true, mensagem: 'Se houver uma conta com esse e-mail, enviaremos um código. Confira também a caixa de spam.' })
        return resposta({ ok: false, erro: codigoEmail(error) }, 500)
      }

      // Resposta externa idêntica para contas existentes e inexistentes.
      if (data?.enviar) {
        const sendgridKey = Deno.env.get('SENDGRID_API_KEY')
        const remetente = Deno.env.get('SENDGRID_FROM_EMAIL')
        if (!sendgridKey || !remetente) {
          await admin.rpc('recuperacao_senha_cancelar', { p_email: email, p_papel: papel })
          console.error('Secrets do SendGrid ausentes em recuperar-senha.')
          return resposta({ ok: false, erro: 'O envio de e-mail não está configurado. Avise o administrador.' }, 500)
        }
        const envio = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST', headers: { Authorization: `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personalizations: [{ to: [{ email }] }], from: { email: remetente, name: 'Curupira' },
            subject: 'Código para trocar sua senha do Curupira',
            content: [
              { type: 'text/plain', value: `Seu código para trocar a senha é ${codigo}. Ele expira em 10 minutos e só pode ser usado uma vez. Se você não pediu a troca, ignore este e-mail.` },
              { type: 'text/html', value: `<div style="font-family:Arial,sans-serif;color:#20251f"><h2>Troque sua senha do Curupira</h2><p>Digite este código no aplicativo:</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px">${codigo}</p><p>Ele expira em 10 minutos e só pode ser usado uma vez. Se você não pediu a troca, ignore este e-mail.</p></div>` },
            ],
          }),
        })
        if (!envio.ok) {
          await admin.rpc('recuperacao_senha_cancelar', { p_email: email, p_papel: papel })
          console.error('SendGrid recusou recuperação de senha:', { status: envio.status })
          return resposta({ ok: false, erro: 'O serviço de e-mail recusou o envio. Verifique o remetente e a API Key do SendGrid.' }, 502)
        }
      }
      return resposta({ ok: true, mensagem: 'Se houver uma conta com esse e-mail, enviaremos um código. Confira também a caixa de spam.' })
    }

    if (operacao === 'confirmar') {
      const codigo = String(body?.codigo || '').trim()
      const senha = String(body?.senha || '')
      if (!/^\d{6}$/.test(codigo)) return resposta({ ok: false, erro: 'Digite o código de 6 números.' }, 400)
      if (senha.length < 8 || senha.length > 200 || !/[A-Z]/.test(senha) || !/[a-z]/.test(senha) || !/\d/.test(senha) || !/[^A-Za-z0-9]/.test(senha)) {
        return resposta({ ok: false, erro: 'Use 8 caracteres ou mais, com maiúscula, minúscula, número e símbolo.' }, 400)
      }
      const hash = await hashHmac(`recuperacao:v1:${papel}:${email}:${codigo}`, pepper)
      const { data, error } = await admin.rpc('recuperacao_senha_confirmar', {
        p_email: email, p_papel: papel, p_codigo_hash: hash, p_senha_nova: senha,
      })
      if (error) {
        console.error('RPC recuperar senha confirmar falhou:', { code: error.code })
        return resposta({ ok: false, erro: codigoEmail(error) }, 500)
      }
      if (!data?.ok) return resposta({ ok: false, erro: 'Código incorreto, expirado ou já usado. Peça um novo código e tente novamente.' }, 400)
      return resposta({ ok: true, mensagem: 'Senha alterada. Entre com sua nova senha.' })
    }
    return resposta({ ok: false, erro: 'Ação inválida.' }, 400)
  } catch (error) {
    console.error('Falha em recuperar-senha:', error instanceof Error ? error.message : 'erro desconhecido')
    return resposta({ ok: false, erro: 'Não foi possível concluir agora. Tente novamente mais tarde.' }, 500)
  }
})
