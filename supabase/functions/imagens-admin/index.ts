// Edge Function "imagens-admin" — adaptador fino para o Supabase (Deno). Toda a política está em politica.js (testada localmente).
// Variáveis de ambiente (injetadas pelo Supabase no runtime das Edge Functions; NUNCA coloque valores aqui nem no app):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   -> a chave service_role existe SÓ no servidor.
//   IMAGENS_BUCKET (opcional, padrão "pets-images")
// Deploy (manual, ver supabase/storage/LEIAME_STORAGE.md):  supabase functions deploy imagens-admin
// ATENÇÃO: este arquivo NÃO foi executado em ambiente local (sem Deno/Supabase aqui). Validar na homologação.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import { tratar } from './politica.js'

const BUCKET = Deno.env.get('IMAGENS_BUCKET') ?? 'pets-images'
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const deps = {
  async autorizar({ token, operacao, pasta, caminho }: { token: string; operacao: string; pasta: string; caminho: string | null }) {
    const { data, error } = await admin.rpc('storage_autorizar_operacao', {
      p_token: token, p_operacao: operacao, p_pasta: pasta, p_caminho: caminho,
    })
    if (error) { console.error('autorizar falhou', error.code); throw { codigo: error.code } }   // o token NUNCA é registrado no log
    return data
  },
  async enviar(caminho: string, bytes: Uint8Array, mime: string) {
    const { error } = await admin.storage.from(BUCKET).upload(caminho, bytes, { contentType: mime, cacheControl: '3600', upsert: false })
    if (error) { console.error('upload falhou', error.message); throw error }
  },
  async remover(caminho: string) {
    const { error } = await admin.storage.from(BUCKET).remove([caminho])
    if (error) { console.error('remoção falhou', error.message); throw error }
  },
}

Deno.serve((req: Request) => tratar(req, deps))
