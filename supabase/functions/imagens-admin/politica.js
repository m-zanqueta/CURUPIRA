// Política e tratamento de requisições da Edge Function "imagens-admin" (upload/remoção de imagens do bucket pets-images).
// ESM puro, só API padrão Fetch (Request/Response/FormData): roda igual no Deno (Supabase Edge Functions) e no Node 22 (testes locais).
// NENHUM segredo aqui: a chave service_role fica só no ambiente do servidor e é usada em index.ts, nunca neste arquivo.
//
// Fluxo: cliente -> (anon key + token de sessão do Curupira) -> esta função -> RPC storage_autorizar_operacao (valida token, papel,
// pasta, caminho, taxa e "em uso") -> só então o Storage é tocado, com o caminho GERADO AQUI (o cliente nunca escolhe o nome).

export const PASTAS = ['pets', 'icones-missoes', 'acessorios']
export const TAMANHO_MAXIMO_BYTES = 2 * 1024 * 1024          // 2 MB por imagem
export const MARGEM_CORPO_BYTES = 64 * 1024                  // cabeçalhos/campos do multipart
const TIPOS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }   // SVG de propósito fora (XSS)
export const REGEX_CAMINHO = /^(pets|icones-missoes|acessorios)\/[0-9]{13}-[a-f0-9]{16}\.(png|jpg|webp|gif)$/

const CORS = {
  'access-control-allow-origin': '*',          // o app é web/nativo; a autorização NÃO depende de origem (token + papel no servidor)
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
}
const resp = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'content-type': 'application/json' } })
const erro = (status, codigo) => resp(status, { ok: false, erro: codigo })

// Tipo REAL pelos primeiros bytes (não confia no Content-Type nem na extensão enviados pelo cliente).
export function detectarTipo(b) {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}

export function gerarCaminho(pasta, mime, agora = Date.now(), aleatorio = null) {
  const ext = TIPOS[mime]
  if (!PASTAS.includes(pasta) || !ext) throw new Error('parametros_invalidos')
  const hex = aleatorio ?? Array.from(crypto.getRandomValues(new Uint8Array(8)), x => x.toString(16).padStart(2, '0')).join('')
  const caminho = `${pasta}/${String(agora).padStart(13, '0')}-${hex}.${ext}`
  if (!REGEX_CAMINHO.test(caminho)) throw new Error('caminho_gerado_invalido')
  return caminho
}

// Códigos SQLSTATE das RPCs -> HTTP (nada de mensagem interna vaza ao cliente)
function mapearErro(e) {
  const c = String(e?.codigo || e?.code || '')
  if (c === 'PT401' || c === '42501') return erro(401, 'sessao_invalida')
  if (c === 'PT403') return erro(403, 'sem_permissao')
  if (c === 'PT409') return erro(409, 'objeto_em_uso')
  if (c === 'PT422') return erro(422, 'pedido_invalido')
  if (c === 'PT429') return erro(429, 'muitas_tentativas')
  return erro(502, 'falha_no_servidor')       // sem detalhes; o log do servidor tem o erro real (sem token)
}

// deps = { autorizar({token, operacao, pasta, caminho}) -> objeto | lança {codigo},
//          enviar(caminho, bytes, mime) -> void | lança, remover(caminho) -> void | lança }
export async function tratar(req, deps) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return erro(405, 'metodo_nao_permitido')
  const ct = req.headers.get('content-type') || ''
  const tam = Number(req.headers.get('content-length') || 0)
  if (tam > TAMANHO_MAXIMO_BYTES + MARGEM_CORPO_BYTES) return erro(413, 'arquivo_grande')

  let operacao, pasta, token, caminho, arquivo = null
  try {
    if (ct.startsWith('multipart/form-data')) {
      const f = await req.formData()
      operacao = f.get('operacao'); pasta = f.get('pasta'); token = f.get('token'); caminho = f.get('caminho'); arquivo = f.get('arquivo')
    } else if (ct.startsWith('application/json')) {
      const j = await req.json(); operacao = j?.operacao; pasta = j?.pasta; token = j?.token; caminho = j?.caminho
    } else return erro(415, 'tipo_nao_suportado')
  } catch { return erro(400, 'corpo_invalido') }

  const texto = v => (typeof v === 'string' ? v : null)
  operacao = texto(operacao); pasta = texto(pasta); token = texto(token); caminho = texto(caminho)
  if (!token || token.length < 32 || token.length > 256) return erro(401, 'sessao_invalida')
  if (operacao !== 'upload' && operacao !== 'remover') return erro(422, 'pedido_invalido')
  if (!PASTAS.includes(pasta)) return erro(422, 'pedido_invalido')

  try {
    if (operacao === 'upload') {
      if (!arquivo || typeof arquivo === 'string' || typeof arquivo.arrayBuffer !== 'function') return erro(422, 'pedido_invalido')
      if (arquivo.size > TAMANHO_MAXIMO_BYTES) return erro(413, 'arquivo_grande')
      if (arquivo.size < 12) return erro(422, 'arquivo_invalido')
      // 1) autorização ANTES de olhar/guardar qualquer byte (um não-autorizado não gasta armazenamento nem revela nada sobre o arquivo)
      await deps.autorizar({ token, operacao, pasta, caminho: null })
      const bytes = new Uint8Array(await arquivo.arrayBuffer())
      if (bytes.length > TAMANHO_MAXIMO_BYTES) return erro(413, 'arquivo_grande')
      const mime = detectarTipo(bytes)
      if (!mime) return erro(415, 'tipo_nao_suportado')
      const declarado = (arquivo.type || '').toLowerCase().split(';')[0].trim()
      if (declarado && declarado !== mime && !(declarado === 'image/jpg' && mime === 'image/jpeg')) return erro(415, 'tipo_divergente')
      const novo = gerarCaminho(pasta, mime)
      await deps.enviar(novo, bytes, mime)
      return resp(200, { ok: true, caminho: novo })
    }
    // remover: o caminho precisa ser do formato do servidor, dentro da pasta pedida, e o objeto não pode estar em uso (a RPC valida)
    if (!caminho || !REGEX_CAMINHO.test(caminho) || !caminho.startsWith(pasta + '/')) return erro(422, 'pedido_invalido')
    await deps.autorizar({ token, operacao, pasta, caminho })
    await deps.remover(caminho)
    return resp(200, { ok: true })
  } catch (e) {
    return mapearErro(e)
  }
}
