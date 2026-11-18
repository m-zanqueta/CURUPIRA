BEGIN;

-- O ranking nunca aceita um id de turma do cliente: a turma vem do token do aluno.
CREATE OR REPLACE FUNCTION public.aluno_ranking_turma(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_aluno bigint := public._aluno_da_sessao(p_token);
  v_turma bigint;
  v_resultado jsonb;
BEGIN
  SELECT a."turmaId" INTO v_turma FROM public.alunos a WHERE a.id = v_aluno;
  IF v_turma IS NULL THEN RETURN '[]'::jsonb; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', a.id,
      'nome', a.nome,
      'xp', COALESCE(a.xp, 0),
      'avatar_path', a.avatar_path
    ) ORDER BY COALESCE(a.xp, 0) DESC, a.nome ASC, a.id ASC), '[]'::jsonb)
    INTO v_resultado
    FROM public.alunos a
   WHERE a."turmaId" = v_turma;
  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.aluno_ranking_turma(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aluno_ranking_turma(text) TO anon, authenticated;

COMMIT;
