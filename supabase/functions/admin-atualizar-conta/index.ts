import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (request) => {
  if (request.method !== 'POST') return Response.json({ error: 'Método não permitido.' }, { status: 405 })
  try {
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return Response.json({ error: 'Sessão ausente.' }, { status: 401 })
    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, key, { auth: { persistSession: false } })
    const { data: { user: caller }, error: authError } = await admin.auth.getUser(token)
    if (authError || caller?.app_metadata?.role !== 'admin') return Response.json({ error: 'Ação exclusiva do administrador.' }, { status: 403 })

    const { tabela, profileId, email, password } = await request.json()
    if (!['professores', 'alunos'].includes(tabela) || !profileId) return Response.json({ error: 'Cadastro inválido.' }, { status: 400 })
    if (password && (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password))) {
      return Response.json({ error: 'A senha deve ter 8 caracteres, maiúscula, minúscula, número e símbolo.' }, { status: 400 })
    }

    const role = tabela === 'professores' ? 'professor' : 'aluno'
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (error) throw error
    const account = data.users.find(user => user.app_metadata?.role === role && String(user.app_metadata?.profile_id) === String(profileId))
    if (!account) return Response.json({ updated: false, reason: 'Conta ainda migrará no próximo login.' })

    const changes: Record<string, unknown> = {}
    if (email) {
      const normalized = String(email).trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) return Response.json({ error: 'E-mail inválido.' }, { status: 400 })
      changes.email = normalized
      changes.email_confirm = true
    }
    if (password) changes.password = password
    if (!Object.keys(changes).length) return Response.json({ updated: true })
    const { error: updateError } = await admin.auth.admin.updateUserById(account.id, changes)
    if (updateError) throw updateError
    return Response.json({ updated: true })
  } catch (error) {
    console.error('Falha ao atualizar conta Auth:', error)
    return Response.json({ error: error?.message || 'Não foi possível atualizar a conta.' }, { status: 500 })
  }
})
