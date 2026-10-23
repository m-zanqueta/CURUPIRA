import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return response({ error: 'Método não permitido.' }, 405)

  try {
    const { email: rawEmail, password } = await request.json()
    const email = String(rawEmail || '').trim().toLowerCase()
    if (!email || !password) return response({ error: 'Informe e-mail e senha.' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    let role: string | null = null
    let profileId: number | null = null
    if (email === String(Deno.env.get('ADMIN_LOGIN_EMAIL') || '').toLowerCase() && password === Deno.env.get('ADMIN_LOGIN_PASSWORD')) {
      role = 'admin'
    } else {
      const { data: coordinator } = await supabase.rpc('login_coordenador', { p_email: email, p_senha: password })
      if (coordinator?.length) {
        role = 'coordenador'
        profileId = Number(coordinator[0].id)
      } else {
        const { data: teacher } = await supabase.from('professores').select('id').eq('email', email).eq('senha', password).maybeSingle()
        if (teacher) {
          role = 'professor'
          profileId = Number(teacher.id)
        } else {
          const { data: student } = await supabase.from('alunos').select('id').eq('email', email).eq('senha', password).maybeSingle()
          if (student) {
            role = 'aluno'
            profileId = Number(student.id)
          }
        }
      }
    }
    if (!role) return response({ error: 'E-mail ou senha incorretos.' }, 401)

    const userData = {
      email,
      password,
      email_confirm: true,
      app_metadata: { role, profile_id: profileId },
    }
    const { data: created, error: createError } = await supabase.auth.admin.createUser(userData)
    if (!createError && created.user) return response({ migrated: true })

    // A conta pode já existir no Auth. Só atualizamos os claims depois que a
    // senha antiga foi verificada acima; nenhum cliente pode escolher seu papel.
    if (!/already|registered|exists/i.test(createError?.message || '')) {
      throw createError || new Error('Não foi possível criar a conta de autenticação.')
    }
    const { data: users, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (listError) throw listError
    const existing = users.users.find((user) => user.email?.toLowerCase() === email)
    if (!existing) throw new Error('A conta existe no Auth, mas não foi possível localizá-la.')
    const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      app_metadata: { ...(existing.app_metadata || {}), role, profile_id: profileId },
      email_confirm: true,
    })
    if (updateError) throw updateError
    return response({ migrated: true })
  } catch (error) {
    console.error('Falha ao migrar login:', error)
    return response({ error: error?.message || 'Não foi possível migrar este login.' }, 500)
  }
})

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
