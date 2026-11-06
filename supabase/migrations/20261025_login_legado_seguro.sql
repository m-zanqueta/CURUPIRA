-- Mantém o login próprio do Curupira sem expor as tabelas de perfis ao anon.
CREATE OR REPLACE FUNCTION public.login_professor(p_email text, p_senha text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT to_jsonb(p) - 'senha'
  FROM public.professores AS p
  WHERE lower(p.email) = lower(trim(p_email)) AND p.senha = p_senha
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.login_aluno(p_email text, p_senha text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT to_jsonb(a) - 'senha'
  FROM public.alunos AS a
  WHERE lower(a.email) = lower(trim(p_email)) AND a.senha = p_senha
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.login_professor(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.login_aluno(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_professor(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_aluno(text, text) TO anon, authenticated;
