-- Código de confirmação por e-mail antes de permitir criar um login de aluno.
BEGIN;

CREATE TABLE IF NOT EXISTS public.alunos_codigos_email (
  email text PRIMARY KEY,
  codigo_hash text NOT NULL CHECK (codigo_hash ~ '^[0-9a-f]{64}$'),
  expira_em timestamptz NOT NULL,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  tentativas smallint NOT NULL DEFAULT 0 CHECK (tentativas BETWEEN 0 AND 5),
  usado_em timestamptz
);
ALTER TABLE public.alunos_codigos_email ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.alunos_codigos_email FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alunos_codigos_email TO service_role;

CREATE OR REPLACE FUNCTION public.aluno_iniciar_verificacao_email(
  p_email text, p_codigo_hash text, p_ip_hash text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_email text := lower(btrim(COALESCE(p_email, '')));
BEGIN
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     OR p_codigo_hash IS NULL OR p_codigo_hash !~ '^[0-9a-f]{64}$'
     OR p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'PT422';
  END IF;
  DELETE FROM public.alunos_codigos_email WHERE expira_em < now() - interval '1 day' OR usado_em < now() - interval '1 day';
  PERFORM public._limite_taxa('codigo_aluno_ip:' || p_ip_hash, 100, interval '1 hour');
  PERFORM public._limite_taxa('codigo_aluno_email:' || v_email, 5, interval '1 hour');
  PERFORM pg_advisory_xact_lock(hashtextextended('codigo_aluno:' || v_email, 0));
  IF EXISTS (SELECT 1 FROM public.alunos_codigos_email c
             WHERE c.email = v_email AND c.usado_em IS NULL AND c.enviado_em > now() - interval '60 seconds') THEN
    RAISE EXCEPTION 'aguarde_reenvio' USING ERRCODE = 'PT429';
  END IF;
  INSERT INTO public.alunos_codigos_email (email, codigo_hash, expira_em, enviado_em, tentativas, usado_em)
  VALUES (v_email, p_codigo_hash, now() + interval '10 minutes', now(), 0, NULL)
  ON CONFLICT (email) DO UPDATE SET codigo_hash = EXCLUDED.codigo_hash,
    expira_em = EXCLUDED.expira_em, enviado_em = EXCLUDED.enviado_em, tentativas = 0, usado_em = NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.aluno_confirmar_codigo_e_cadastrar(
  p_email text, p_codigo_hash text, p_nome text, p_senha text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_email text := lower(btrim(COALESCE(p_email, ''))); v_codigo public.alunos_codigos_email%ROWTYPE; v_aluno jsonb;
BEGIN
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     OR p_codigo_hash IS NULL OR p_codigo_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('erro', 'dados_invalidos');
  END IF;
  SELECT * INTO v_codigo FROM public.alunos_codigos_email c WHERE c.email = v_email FOR UPDATE;
  IF NOT FOUND OR v_codigo.usado_em IS NOT NULL OR v_codigo.expira_em <= now() THEN
    RETURN jsonb_build_object('erro', 'codigo_expirado');
  END IF;
  IF v_codigo.tentativas >= 5 THEN
    RETURN jsonb_build_object('erro', 'muitas_tentativas');
  END IF;
  IF v_codigo.codigo_hash <> p_codigo_hash THEN
    UPDATE public.alunos_codigos_email SET tentativas = tentativas + 1 WHERE email = v_email;
    RETURN jsonb_build_object('erro', 'codigo_invalido', 'tentativas_restantes', greatest(4 - v_codigo.tentativas, 0));
  END IF;

  -- A criação existente valida nome/senha e aplica XP=0/turma nula. Só o service_role
  -- poderá chamá-la após esta migration; anon/authenticated deixam de ter acesso direto.
  v_aluno := public.cadastrar_aluno(p_nome, v_email, p_senha);
  UPDATE public.alunos_codigos_email SET usado_em = now() WHERE email = v_email;
  IF v_aluno ? 'erro' THEN RETURN v_aluno; END IF;
  RETURN jsonb_build_object('aluno', v_aluno);
END;
$$;

REVOKE ALL ON FUNCTION public.aluno_iniciar_verificacao_email(text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aluno_confirmar_codigo_e_cadastrar(text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aluno_iniciar_verificacao_email(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.aluno_confirmar_codigo_e_cadastrar(text,text,text,text) TO service_role;

-- Fecha o caminho público antigo: cadastro agora só é feito depois da verificação na Edge Function.
REVOKE ALL ON FUNCTION public.cadastrar_aluno(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cadastrar_aluno(text,text,text) TO service_role;
-- Remove também a consulta pública antiga que revelava se um e-mail tinha conta.
REVOKE ALL ON FUNCTION public.email_aluno_existe(text) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
