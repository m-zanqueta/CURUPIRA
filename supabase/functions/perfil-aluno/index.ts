import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const BUCKET = 'perfis-alunos'
const MAX = 1024 * 1024
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
  'access-control-max-age': '86400',
}
const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { ...CORS, 'content-type': 'application/json' } })
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
const PATH = /^\d+\/[0-9]{13}-[a-f0-9]{32}\.(jpg|png|webp)$/

function detectarTipo(b: Uint8Array): string | null {
  if (b.length >= 8 && b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71 && b[4] === 13 && b[5] === 10 && b[6] === 26 && b[7] === 10) return 'image/png'
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg'
  if (b.length >= 12 && b[0] === 82 && b[1] === 73 && b[2] === 70 && b[3] === 70 && b[8] === 87 && b[9] === 69 && b[10] === 66 && b[11] === 80) return 'image/webp'
  return null
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await admin.rpc(name, args)
  if (error) { console.error('RPC perfil-aluno falhou', name, error.code); throw new Error(error.code || 'database_error') }
  return data
}

async function criarUrl(caminho: string) {
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(caminho, 3600)
  if (error || !data?.signedUrl) throw new Error('signed_url_error')
  return data.signedUrl
}

Deno.serve(async (req: Request) => {
  // O navegador envia preflight antes do JSON e do multipart; responda 200 e
  // aceite os headers realmente solicitados pelo supabase-js.
  if (req.method === 'OPTIONS') {
    const solicitados = req.headers.get('access-control-request-headers')
    return new Response('ok', { status: 200, headers: { ...CORS, ...(solicitados ? { 'access-control-allow-headers': solicitados } : {}) } })
  }
  if (req.method !== 'POST') return json(405, { ok: false, erro: 'metodo_nao_permitido' })
  try {
    const contentType = req.headers.get('content-type') || ''
    if (contentType.startsWith('application/json')) {
      const body = await req.json()
      const token = body?.token
      if (typeof token !== 'string' || token.length < 32 || token.length > 256) return json(422, { ok: false, erro: 'pedido_invalido' })
      if (body.operacao === 'ranking') {
        const alunos = await rpc('aluno_ranking_turma', { p_token: token })
        const ranking = await Promise.all((Array.isArray(alunos) ? alunos : []).map(async (aluno: { id: number; nome: string; xp: number; avatar_path?: string | null }) => {
          const caminho = aluno.avatar_path
          let foto: string | null = null
          if (caminho && PATH.test(caminho) && caminho.startsWith(`${aluno.id}/`)) {
            try { foto = await criarUrl(caminho) } catch { /* avatar ausente: mostra o ícone padrão */ }
          }
          return { id: aluno.id, nome: aluno.nome, xp: Number(aluno.xp) || 0, foto }
        }))
        return json(200, { ok: true, ranking })
      }
      if (body.operacao !== 'visualizar') return json(422, { ok: false, erro: 'pedido_invalido' })
      const perfil = await rpc('aluno_avatar_obter', { p_token: token })
      if (!perfil?.caminho) return json(200, { ok: true, url: null })
      if (!PATH.test(perfil.caminho) || !perfil.caminho.startsWith(`${perfil.aluno_id}/`)) return json(422, { ok: false, erro: 'pedido_invalido' })
      return json(200, { ok: true, url: await criarUrl(perfil.caminho) })
    }

    if (!contentType.startsWith('multipart/form-data')) return json(415, { ok: false, erro: 'tipo_nao_suportado' })
    const form = await req.formData()
    const token = form.get('token')
    const file = form.get('arquivo')
    const arquivo = file && typeof file === 'object' && typeof (file as Blob).arrayBuffer === 'function' ? file as File : null
    if (typeof token !== 'string' || token.length < 32 || token.length > 256 || !arquivo) return json(422, { ok: false, erro: 'pedido_invalido' })
    if (arquivo.size < 12 || arquivo.size > MAX) return json(413, { ok: false, erro: 'arquivo_grande' })

    // Identidade vem exclusivamente do token; o id e o nome do arquivo são gerados no servidor.
    const alunoId = String(await rpc('aluno_avatar_autorizar_upload', { p_token: token }))
    if (!/^\d+$/.test(alunoId)) return json(401, { ok: false, erro: 'sessao_invalida' })
    const bytes = new Uint8Array(await arquivo.arrayBuffer())
    if (bytes.length > MAX) return json(413, { ok: false, erro: 'arquivo_grande' })
    const mime = detectarTipo(bytes)
    if (!mime) return json(415, { ok: false, erro: 'tipo_nao_suportado' })
    const declared = (arquivo.type || '').toLowerCase().split(';')[0].trim()
    if (declared && declared !== mime && !(declared === 'image/jpg' && mime === 'image/jpeg')) return json(415, { ok: false, erro: 'tipo_divergente' })

    const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp'
    const caminho = `${alunoId}/${Date.now()}-${crypto.randomUUID().replaceAll('-', '')}.${ext}`
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(caminho, bytes, { contentType: mime, cacheControl: '3600', upsert: false })
    if (uploadError) throw uploadError
    let antigo: string | null
    try { antigo = await rpc('aluno_avatar_salvar', { p_token: token, p_caminho: caminho }) }
    catch (error) { await admin.storage.from(BUCKET).remove([caminho]); throw error }
    if (typeof antigo === 'string' && PATH.test(antigo) && antigo.startsWith(`${alunoId}/`) && antigo !== caminho) {
      const { error } = await admin.storage.from(BUCKET).remove([antigo])
      if (error) console.warn('Não foi possível remover a foto anterior do perfil.')
    }
    return json(200, { ok: true, url: await criarUrl(caminho) })
  } catch (error) {
    const code = String((error as Error)?.message || '')
    const status = code === 'PT401' || code === '42501' ? 401 : code === 'PT403' ? 403 : code === 'PT422' ? 422 : 500
    if (status === 500) console.error('Erro interno em perfil-aluno', code)
    return json(status, { ok: false, erro: status === 401 ? 'sessao_invalida' : status === 403 ? 'sem_permissao' : status === 422 ? 'pedido_invalido' : 'falha_no_servidor' })
  }
})
