-- Regressa ao modo de acesso anônimo usado antes da migração Auth/RLS.
-- Foi solicitado pelo proprietário para manter o login próprio do Curupira.

-- O app não estabelece sessão Supabase Auth; suas chamadas usam o papel anon.
-- Restaura as operações CRUD e remove as políticas Auth que bloqueavam a UI.
ALTER TABLE public.professores DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.alunos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.turmas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pets DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.icones_missoes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.acessorios DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.missoes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.missoes_turmas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.alunos_missoes DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.professores, public.alunos, public.turmas, public.pets,
  public.icones_missoes, public.acessorios,
  public.missoes, public.missoes_turmas, public.alunos_missoes
TO anon, authenticated;

-- Inclui as sequences novas da tabela de etapas se ela já existir.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.salvar_missao_com_turmas(bigint, bigint, text, text, bigint, text, text, boolean, bigint[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.definir_turmas_missao(bigint, bigint, bigint[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.definir_ativa_missao_turma(bigint, bigint, bigint, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remover_missao_da_turma(bigint, bigint, bigint) TO anon, authenticated;

-- Compatibilidade com a versão mais recente do app, sem retornar a senha ao cliente.
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
REVOKE ALL ON FUNCTION public.login_professor(text, text), public.login_aluno(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_professor(text, text), public.login_aluno(text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
