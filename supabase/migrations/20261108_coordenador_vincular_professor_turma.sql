BEGIN;

-- Somente o coordenador pode alterar o professor responsável por uma turma.
CREATE OR REPLACE FUNCTION public.staff_atribuir_professor_turma(
  p_token text,
  p_turma_id bigint,
  p_professor_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public._staff_exigir(p_token, ARRAY['coordenador']);

  IF NOT EXISTS (
    SELECT 1 FROM public.professores p
    WHERE p.id = p_professor_id AND COALESCE(p.tipo, 'professor') = 'professor'
  ) THEN
    RAISE EXCEPTION 'professor_invalido' USING ERRCODE = 'PT422';
  END IF;

  UPDATE public.turmas SET professor_id = p_professor_id WHERE id = p_turma_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_atribuir_professor_turma(text,bigint,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_atribuir_professor_turma(text,bigint,bigint) TO anon, authenticated;

COMMIT;
