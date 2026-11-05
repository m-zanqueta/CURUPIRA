-- Cadastro, consulta e gestão administrativa segura de coordenadores.
-- Senhas são armazenadas somente como hash bcrypt; nenhuma RPC retorna hashes.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_criar_coordenador(
  p_token text, p_nome text, p_email text, p_senha text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_nome text := btrim(COALESCE(p_nome, '')); v_email text := lower(btrim(COALESCE(p_email, ''))); v_id bigint;
BEGIN
  PERFORM 1 FROM public._staff_exigir(p_token, ARRAY['admin']);
  IF v_nome = '' THEN RAISE EXCEPTION 'nome_invalido' USING ERRCODE = 'PT422'; END IF;
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN RAISE EXCEPTION 'email_invalido' USING ERRCODE = 'PT422'; END IF;
  IF NOT public._senha_forte(p_senha, true) THEN RAISE EXCEPTION 'senha_fraca' USING ERRCODE = 'PT422'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('email:' || v_email, 0));
  IF EXISTS (SELECT 1 FROM public.coordenadores WHERE lower(email) = v_email)
     OR EXISTS (SELECT 1 FROM public.professores WHERE lower(email) = v_email)
     OR EXISTS (SELECT 1 FROM public.alunos WHERE lower(email) = v_email)
     OR EXISTS (SELECT 1 FROM public.administradores WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'email_ja_cadastrado' USING ERRCODE = 'PT409';
  END IF;
  INSERT INTO public.coordenadores (nome, email, senha_hash, ativo)
  VALUES (v_nome, v_email, extensions.crypt(p_senha, extensions.gen_salt('bf', 10)), true)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'nome', v_nome, 'email', v_email, 'ativo', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_listar_coordenadores(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_resultado jsonb;
BEGIN
  PERFORM 1 FROM public._staff_exigir(p_token, ARRAY['admin']);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'email', c.email, 'ativo', c.ativo) ORDER BY c.id), '[]'::jsonb)
    INTO v_resultado FROM public.coordenadores c;
  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_atualizar_coordenador(p_token text, p_id bigint, p_dados jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE k text; v_email text;
BEGIN
  PERFORM 1 FROM public._staff_exigir(p_token, ARRAY['admin']);
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' OR p_dados = '{}'::jsonb THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'PT422';
  END IF;
  FOR k IN SELECT jsonb_object_keys(p_dados) LOOP
    IF k <> ALL (ARRAY['nome','email','ativo']) THEN RAISE EXCEPTION 'campo_nao_permitido' USING ERRCODE = 'PT422'; END IF;
  END LOOP;
  IF p_dados ? 'nome' AND btrim(COALESCE(p_dados->>'nome','')) = '' THEN RAISE EXCEPTION 'nome_invalido' USING ERRCODE = 'PT422'; END IF;
  IF p_dados ? 'email' THEN
    v_email := lower(btrim(COALESCE(p_dados->>'email','')));
    IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN RAISE EXCEPTION 'email_invalido' USING ERRCODE = 'PT422'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('email:' || v_email, 0));
    IF EXISTS (SELECT 1 FROM public.coordenadores WHERE lower(email) = v_email AND id <> p_id)
       OR EXISTS (SELECT 1 FROM public.professores WHERE lower(email) = v_email)
       OR EXISTS (SELECT 1 FROM public.alunos WHERE lower(email) = v_email)
       OR EXISTS (SELECT 1 FROM public.administradores WHERE lower(email) = v_email) THEN
      RAISE EXCEPTION 'email_ja_cadastrado' USING ERRCODE = 'PT409';
    END IF;
  END IF;
  IF p_dados ? 'ativo' AND jsonb_typeof(p_dados->'ativo') <> 'boolean' THEN RAISE EXCEPTION 'ativo_invalido' USING ERRCODE = 'PT422'; END IF;
  UPDATE public.coordenadores c SET
    nome = CASE WHEN p_dados ? 'nome' THEN btrim(p_dados->>'nome') ELSE c.nome END,
    email = CASE WHEN p_dados ? 'email' THEN v_email ELSE c.email END,
    ativo = CASE WHEN p_dados ? 'ativo' THEN (p_dados->>'ativo')::boolean ELSE c.ativo END
  WHERE c.id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_definir_senha_coordenador(p_token text, p_id bigint, p_senha text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM public._staff_exigir(p_token, ARRAY['admin']);
  IF NOT public._senha_forte(p_senha, true) THEN RAISE EXCEPTION 'senha_fraca' USING ERRCODE = 'PT422'; END IF;
  UPDATE public.coordenadores SET senha_hash = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)) WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404'; END IF;
  UPDATE public.staff_sessoes SET revogado_em = now() WHERE papel = 'coordenador' AND usuario_id = p_id AND revogado_em IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_excluir_coordenador(p_token text, p_id bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM public._staff_exigir(p_token, ARRAY['admin']);
  UPDATE public.staff_sessoes SET revogado_em = now() WHERE papel = 'coordenador' AND usuario_id = p_id AND revogado_em IS NULL;
  DELETE FROM public.coordenadores WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_criar_coordenador(text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_listar_coordenadores(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_atualizar_coordenador(text,bigint,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_definir_senha_coordenador(text,bigint,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_excluir_coordenador(text,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_criar_coordenador(text,text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_listar_coordenadores(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_atualizar_coordenador(text,bigint,jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_definir_senha_coordenador(text,bigint,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_excluir_coordenador(text,bigint) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
