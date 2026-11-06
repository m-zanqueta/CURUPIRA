-- Cadastro de aluno iniciado pelo administrador, autorizado pelo token de staff.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_criar_aluno(
  p_token text,
  p_nome text,
  p_email text,
  p_senha text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nome text := left(btrim(COALESCE(p_nome, '')), 100);
  v_email text := left(lower(btrim(COALESCE(p_email, ''))), 254);
  v_aluno jsonb;
BEGIN
  PERFORM public._staff_exigir(p_token, ARRAY['admin']);

  IF v_nome = '' THEN
    RAISE EXCEPTION 'nome_invalido' USING ERRCODE = 'PT422';
  END IF;
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'email_invalido' USING ERRCODE = 'PT422';
  END IF;
  IF NOT public._senha_forte(p_senha, true) THEN
    RAISE EXCEPTION 'senha_fraca' USING ERRCODE = 'PT422';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('email:' || v_email, 0));
  IF EXISTS (SELECT 1 FROM public.alunos WHERE lower(email) = v_email)
     OR EXISTS (SELECT 1 FROM public.professores WHERE lower(email) = v_email)
     OR EXISTS (SELECT 1 FROM public.coordenadores WHERE lower(email) = v_email)
     OR EXISTS (SELECT 1 FROM public.administradores WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'email_ja_cadastrado' USING ERRCODE = 'PT409';
  END IF;

  -- Reutiliza a criação central para manter os mesmos defaults e validações.
  v_aluno := public.cadastrar_aluno(v_nome, v_email, p_senha);
  IF v_aluno ? 'erro' THEN
    RAISE EXCEPTION '%', v_aluno->>'erro' USING ERRCODE = 'PT409';
  END IF;
  RETURN v_aluno;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_criar_aluno(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_criar_aluno(text, text, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
