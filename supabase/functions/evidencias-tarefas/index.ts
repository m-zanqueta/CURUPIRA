import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const BUCKET = 'tarefas-envios'
const MAX = 1024 * 1024
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' }
const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { ...CORS, 'content-type': 'application/json' } })
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
const PATH = /^tarefas-envios\/[0-9]{13}-[a-f0-9]{32}\.(jpg|png|webp)$/

function detectarTipo(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0]===137 && bytes[1]===80 && bytes[2]===78 && bytes[3]===71 && bytes[4]===13 && bytes[5]===10 && bytes[6]===26 && bytes[7]===10) return 'image/png'
  if (bytes.length >= 3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return 'image/jpeg'
  if (bytes.length >= 12 && bytes[0]===82 && bytes[1]===73 && bytes[2]===70 && bytes[3]===70 && bytes[8]===87 && bytes[9]===69 && bytes[10]===66 && bytes[11]===80) return 'image/webp'
  return null
}

async function rpc(nome: string, args: Record<string, unknown>) {
  const { data, error } = await admin.rpc(nome, args)
  if (error) { console.error('RPC evidencias falhou', nome, error.code); throw new Error(error.code || 'database_error') }
  return data
}

async function apagar(caminho: string) {
  let ultimoErro: unknown = null
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const { error } = await admin.storage.from(BUCKET).remove([caminho])
      if (!error) {
        const { error: deleteError } = await admin.from('tarefas_evidencias_lixeira').delete().eq('caminho', caminho)
        if (deleteError) console.error('Falha ao remover evidencia da fila de limpeza', deleteError.code || deleteError.name)
        return
      }
      ultimoErro = error
    } catch (error) {
      ultimoErro = error
    }
    if (tentativa < 2) await new Promise(resolve => setTimeout(resolve, 250 * (tentativa + 1)))
  }
  console.error('Remocao de evidencia falhou apos retentativas', (ultimoErro as { name?: string })?.name || 'unknown')
  const { error: filaError } = await admin.from('tarefas_evidencias_lixeira').upsert({ caminho }, { onConflict: 'caminho' })
  if (filaError) console.error('Falha ao registrar evidencia para limpeza posterior', filaError.code || filaError.name)
}

async function limparLixeira() {
  const { data, error: filaErro } = await admin.from('tarefas_evidencias_lixeira').select('caminho').order('criado_em').limit(20)
  if (filaErro) {
    console.error('Falha ao consultar fila de limpeza de evidencias', filaErro.code || filaErro.name)
    return
  }
  for (const item of data || []) {
    try {
      const { error } = await admin.storage.from(BUCKET).remove([item.caminho])
      if (!error) {
        const { error: deleteError } = await admin.from('tarefas_evidencias_lixeira').delete().eq('caminho', item.caminho)
        if (deleteError) console.error('Falha ao remover evidencia da fila de limpeza', deleteError.code || deleteError.name)
      } else console.error('Nova tentativa de limpeza de evidencia falhou', error.name)
    } catch (error) {
      console.error('Nova tentativa de limpeza de evidencia falhou', (error as { name?: string })?.name || 'unknown')
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json(405, { ok: false, erro: 'metodo_nao_permitido' })
  const contentType = req.headers.get('content-type') || ''
  const size = Number(req.headers.get('content-length') || 0)
  if (size > MAX + 48 * 1024) return json(413, { ok: false, erro: 'arquivo_grande' })
  try {
    await limparLixeira()
    if (contentType.startsWith('multipart/form-data')) {
      const form = await req.formData()
      const token = form.get('token')
      const file = form.get('arquivo')
      const missaoId = Number(form.get('missao_id'))
      const etapaOrdem = Number(form.get('etapa_ordem'))
      if (typeof token !== 'string' || token.length < 32 || token.length > 256 || !Number.isSafeInteger(missaoId) || !Number.isSafeInteger(etapaOrdem) || !(file instanceof File)) return json(422, { ok: false, erro: 'pedido_invalido' })
      if (file.size < 12 || file.size > MAX) return json(413, { ok: false, erro: 'arquivo_grande' })
      await rpc('storage_autorizar_envio_tarefa', { p_token: token, p_missao_id: missaoId, p_etapa_ordem: etapaOrdem })
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (bytes.length > MAX) return json(413, { ok: false, erro: 'arquivo_grande' })
      const mime = detectarTipo(bytes)
      if (!mime || !['image/jpeg','image/png','image/webp'].includes(mime)) return json(415, { ok: false, erro: 'tipo_nao_suportado' })
      const declarado = (file.type || '').toLowerCase()
      if (declarado && declarado !== mime && !(declarado === 'image/jpg' && mime === 'image/jpeg')) return json(415, { ok: false, erro: 'tipo_divergente' })
      const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp'
      const caminho = `${BUCKET}/${Date.now()}-${crypto.randomUUID().replaceAll('-', '')}.${ext}`
      const { error: uploadError } = await admin.storage.from(BUCKET).upload(caminho, bytes, { contentType: mime, cacheControl: '3600', upsert: false })
      if (uploadError) throw uploadError
      try {
        await rpc('aluno_registrar_envio_tarefa', { p_token: token, p_missao_id: missaoId, p_etapa_ordem: etapaOrdem, p_caminho: caminho })
      } catch (error) {
        await apagar(caminho)
        throw error
      }
      return json(200, { ok: true })
    }

    if (!contentType.startsWith('application/json')) return json(415, { ok: false, erro: 'tipo_nao_suportado' })
    const body = await req.json()
    const token = body?.token
    if (typeof token !== 'string' || token.length < 32 || token.length > 256) return json(401, { ok: false, erro: 'sessao_invalida' })
    if (body.operacao === 'visualizar') {
      const caminho = body.caminho
      if (typeof caminho !== 'string' || !PATH.test(caminho)) return json(422, { ok: false, erro: 'pedido_invalido' })
      await rpc('staff_autorizar_visualizar_envio', { p_token: token, p_caminho: caminho })
      const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(caminho, 120)
      if (error || !data?.signedUrl) throw error || new Error('signed_url_error')
      return json(200, { ok: true, url: data.signedUrl })
    }
    if (body.operacao === 'corrigir') {
      if (!Number.isSafeInteger(Number(body.envio_id)) || typeof body.aprovado !== 'boolean') return json(422, { ok: false, erro: 'pedido_invalido' })
      const resultado = await rpc('staff_revisar_envio_tarefa', { p_token: token, p_envio_id: Number(body.envio_id), p_aprovado: body.aprovado })
      if (typeof resultado?.caminho === 'string' && PATH.test(resultado.caminho)) await apagar(resultado.caminho)
      return json(200, { ok: true, status: resultado.status })
    }
    return json(422, { ok: false, erro: 'pedido_invalido' })
  } catch (error) {
    const code = String((error as Error)?.message || '')
    const status = code === 'PT401' || code === '42501' ? 401 : code === 'PT403' ? 403 : code === 'PT409' ? 409 : code === 'PT422' ? 422 : 500
    if (status === 500) console.error('Erro interno em evidencias-tarefas', code)
    return json(status, { ok: false, erro: status === 401 ? 'sessao_invalida' : status === 403 ? 'sem_permissao' : status === 409 ? 'etapa_indisponivel' : status === 422 ? 'pedido_invalido' : 'falha_no_servidor' })
  }
})
