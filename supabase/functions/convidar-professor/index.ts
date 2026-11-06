import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json; charset=utf-8',
}

function resposta(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS })
}

function escaparHtml(texto: string) {
  return texto.replace(/[&<>"']/g, caractere => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[caractere] || caractere))
}

function gerarSenhaTemporaria() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  const alfabeto = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ'
  const aleatoria = Array.from(bytes, byte => alfabeto[byte % alfabeto.length]).join('')
  return `Curu!${aleatoria}7a#`
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return resposta({ erro: 'Método não permitido.' }, 405)

  try {
    const body = await request.json()
    const token = String(body?.token || '')
    const nome = String(body?.nome || '').trim()
    const email = String(body?.email || '').trim().toLowerCase()
    if (token.length < 32) return resposta({ erro: 'Sua sessão expirou. Entre novamente.' }, 401)
    if (nome.length < 3 || nome.length > 100) return resposta({ erro: 'O nome deve ter entre 3 e 100 caracteres.' }, 400)
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return resposta({ erro: 'Informe um e-mail válido.' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const sendgridKey = Deno.env.get('SENDGRID_API_KEY')
    const remetente = Deno.env.get('SENDGRID_FROM_EMAIL')
    if (!supabaseUrl || !serviceKey || !sendgridKey || !remetente) {
      console.error('Faltam secrets Supabase/SendGrid na Edge Function de convite.')
      return resposta({ erro: 'O envio de convites não está configurado no servidor.' }, 500)
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const senhaTemporaria = gerarSenhaTemporaria()
    const { error: criarErro } = await admin.rpc('coordenador_preparar_professor_convite', {
      p_token: token,
      p_nome: nome,
      p_email: email,
      p_senha_temporaria: senhaTemporaria,
    })
    if (criarErro) {
      console.error('RPC de convite de professor falhou:', { code: criarErro.code, message: criarErro.message })
      if (criarErro.code === 'PT401') return resposta({ erro: 'Sua sessão expirou. Entre novamente.' }, 401)
      if (criarErro.code === 'PT403') return resposta({ erro: 'Somente coordenadores podem cadastrar professores.' }, 403)
      if (criarErro.code === 'PT409') return resposta({ erro: 'Já existe uma conta com esse e-mail.' }, 409)
      if (criarErro.code === 'PT429') return resposta({ erro: 'Limite de convites atingido para este e-mail. Tente novamente mais tarde.' }, 429)
      if (criarErro.code === 'PT422') return resposta({ erro: 'Confira o nome, e-mail e senha do convite.' }, 400)
      return resposta({ erro: 'Não foi possível preparar o convite. Confira a migration do Supabase.' }, 500)
    }

    const nomeSeguro = escaparHtml(nome)
    const envio = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: remetente, name: 'Curupira' },
        subject: 'Seu acesso de professor ao Curupira',
        content: [
          { type: 'text/plain', value: `Olá, ${nome}. Seu acesso de professor ao Curupira está pronto. E-mail: ${email}. Senha temporária: ${senhaTemporaria}. Ao entrar, você deverá cadastrar uma nova senha antes de usar o sistema. Se você não esperava este convite, ignore esta mensagem.` },
          { type: 'text/html', value: `<div style="font-family:Arial,sans-serif;color:#20251f"><h2>Seu acesso ao Curupira</h2><p>Olá, ${nomeSeguro}.</p><p>Use estas credenciais para entrar no portal do professor:</p><p><strong>E-mail:</strong> ${escaparHtml(email)}<br><strong>Senha temporária:</strong> <code>${senhaTemporaria}</code></p><p>Por segurança, você deverá cadastrar uma nova senha assim que entrar, antes de usar o sistema.</p><p>Se você não esperava este convite, ignore esta mensagem.</p></div>` },
        ],
      }),
    })
    if (!envio.ok) {
      console.error('SendGrid recusou o convite de professor:', { status: envio.status })
      return resposta({ erro: 'A conta foi preparada, mas o SendGrid não enviou o e-mail. Confira o remetente e reenvie o convite.' }, 502)
    }
    return resposta({ ok: true, mensagem: `Convite enviado para ${email}.` })
  } catch (error) {
    console.error('Falha ao convidar professor:', error instanceof Error ? error.message : 'erro desconhecido')
    return resposta({ erro: 'Não foi possível enviar o convite. Tente novamente.' }, 500)
  }
})
