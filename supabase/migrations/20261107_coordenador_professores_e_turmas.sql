BEGIN;

-- A turma só pode ser excluída ou renomeada pelo coordenador.
CREATE OR REPLACE FUNCTION public.staff_excluir_turma(p_token text, p_turma_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public._staff_exigir(p_token, ARRAY['coordenador']);
  DELETE FROM public.turmas WHERE id = p_turma_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_renomear_turma(p_token text, p_turma_id bigint, p_nome text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_nome text := left(btrim(COALESCE(p_nome, '')), 100);
BEGIN
  PERFORM public._staff_exigir(p_token, ARRAY['coordenador']);
  IF v_nome = '' THEN RAISE EXCEPTION 'nome_invalido' USING ERRCODE = 'PT422'; END IF;
  UPDATE public.turmas SET nome = v_nome WHERE id = p_turma_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404'; END IF;
END;
$$;

-- Senha temporária: a sessão pode consultar o próprio perfil e trocar a senha,
-- mas _staff_exigir bloqueia as demais operações até a troca ser concluída.
ALTER TABLE public.professores_credenciais
  ADD COLUMN IF NOT EXISTS deve_trocar_senha boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public._staff_exigir(p_token text, p_papeis text[])
RETURNS TABLE (papel text, usuario_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_papel text; v_id bigint;
BEGIN
  SELECT s.papel, s.usuario_id INTO v_papel, v_id FROM public._staff_sessao(p_token) s;
  IF NOT (v_papel = ANY (p_papeis)) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'PT403';
  END IF;
  IF v_papel = 'professor' AND EXISTS (
    SELECT 1
    FROM public.staff_sessoes s
    JOIN public.professores_credenciais c ON c.professor_id = s.usuario_id
    WHERE s.token_hash = extensions.digest(p_token, 'sha256')
      AND s.revogado_em IS NULL AND c.deve_trocar_senha
  ) THEN
    RAISE EXCEPTION 'troca_senha_obrigatoria' USING ERRCODE = 'PT403';
  END IF;
  RETURN QUERY SELECT v_papel, v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.coordenador_preparar_professor_convite(
  p_token text, p_nome text, p_email text, p_senha_temporaria text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nome text := left(btrim(COALESCE(p_nome, '')), 100);
  v_email text := left(lower(btrim(COALESCE(p_email, ''))), 254);
  v_id bigint;
  v_linhas integer;
BEGIN
  PERFORM public._staff_exigir(p_token, ARRAY['coordenador']);
  IF v_nome = '' THEN RAISE EXCEPTION 'nome_invalido' USING ERRCODE = 'PT422'; END IF;
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'email_invalido' USING ERRCODE = 'PT422';
  END IF;
  IF NOT public._senha_forte(p_senha_temporaria, true) THEN
    RAISE EXCEPTION 'senha_fraca' USING ERRCODE = 'PT422';
  END IF;

  PERFORM public._limite_taxa('convite_professor:' || v_email, 5, interval '1 hour');
  PERFORM pg_advisory_xact_lock(hashtextextended('email:' || v_email, 0));

  -- Permite reenviar um convite pendente. Convites já aceitos e outros papéis
  -- continuam protegidos contra reutilização de e-mail.
  SELECT p.id INTO v_id
  FROM public.professores p
  JOIN public.professores_credenciais c ON c.professor_id = p.id
  WHERE lower(p.email) = v_email
    AND COALESCE(p.tipo, 'professor') = 'professor'
    AND c.deve_trocar_senha
  ORDER BY p.id LIMIT 1 FOR UPDATE OF p;

  IF v_id IS NOT NULL THEN
    UPDATE public.professores SET nome = v_nome, senha = p_senha_temporaria WHERE id = v_id;
    UPDATE public.professores_credenciais
      SET deve_trocar_senha = true, atualizado_em = now()
      WHERE professor_id = v_id;
    GET DIAGNOSTICS v_linhas = ROW_COUNT;
    IF v_linhas = 0 THEN RAISE EXCEPTION 'credencial_professor_ausente' USING ERRCODE = 'PT500'; END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.alunos WHERE lower(email) = v_email)
       OR EXISTS (SELECT 1 FROM public.professores WHERE lower(email) = v_email)
       OR EXISTS (SELECT 1 FROM public.coordenadores WHERE lower(email) = v_email)
       OR EXISTS (SELECT 1 FROM public.administradores WHERE lower(email) = v_email) THEN
      RAISE EXCEPTION 'email_ja_cadastrado' USING ERRCODE = 'PT409';
    END IF;
    INSERT INTO public.professores (nome, email, senha, tipo)
      VALUES (v_nome, v_email, p_senha_temporaria, 'professor')
      RETURNING id INTO v_id;
    UPDATE public.professores_credenciais
      SET deve_trocar_senha = true, atualizado_em = now()
      WHERE professor_id = v_id;
    GET DIAGNOSTICS v_linhas = ROW_COUNT;
    IF v_linhas = 0 THEN RAISE EXCEPTION 'credencial_professor_ausente' USING ERRCODE = 'PT500'; END IF;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'nome', v_nome, 'email', v_email);
END;
$$;

CREATE OR REPLACE FUNCTION public.login_staff(p_email text, p_senha text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text := left(lower(trim(COALESCE(p_email, ''))), 254);
  v_senha text := left(COALESCE(p_senha, ''), 1000);
  v_ip text := public._ip_cliente();
  v_papel text; v_id bigint; v_nome text; v_ok boolean := false;
  v_gastou boolean := false; v_deve_trocar boolean := false;
  r record; v_token text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('login_staff:' || v_email, 0));
  DELETE FROM public.staff_login_falhas WHERE ocorrido_em < now() - interval '1 day';
  DELETE FROM public.staff_sessoes WHERE expira_em < now() - interval '30 days' OR revogado_em < now() - interval '30 days';
  IF (SELECT count(*) FROM public.staff_login_falhas WHERE email = v_email AND ip IS NOT DISTINCT FROM v_ip AND ocorrido_em > now() - interval '15 minutes') >= 5
     OR (SELECT count(*) FROM public.staff_login_falhas WHERE email = v_email AND ocorrido_em > now() - interval '15 minutes') >= 30
     OR (SELECT count(*) FROM public.staff_login_falhas WHERE ip IS NOT DISTINCT FROM v_ip AND ocorrido_em > now() - interval '15 minutes') >= 60 THEN
    RAISE EXCEPTION 'muitas_tentativas' USING ERRCODE = 'PT429';
  END IF;

  IF v_senha <> '' THEN
    FOR r IN SELECT a.id, a.nome, a.senha_hash AS h FROM public.administradores a WHERE lower(a.email) = v_email AND a.ativo LIMIT 1 LOOP
      v_gastou := true;
      IF r.h = extensions.crypt(v_senha, r.h) THEN v_ok := true; v_papel := 'admin'; v_id := r.id; v_nome := r.nome; END IF;
    END LOOP;
    IF NOT v_ok THEN
      FOR r IN SELECT c.id, c.nome, c.senha_hash AS h FROM public.coordenadores c WHERE lower(c.email) = v_email AND c.ativo LIMIT 1 LOOP
        v_gastou := true;
        IF r.h = extensions.crypt(v_senha, r.h) THEN v_ok := true; v_papel := 'coordenador'; v_id := r.id; v_nome := r.nome; END IF;
      END LOOP;
    END IF;
    IF NOT v_ok THEN
      FOR r IN
        SELECT p.id, p.nome, k.senha_hash AS h, k.deve_trocar_senha
        FROM public.professores p JOIN public.professores_credenciais k ON k.professor_id = p.id
        WHERE lower(p.email) = v_email AND COALESCE(p.tipo, 'professor') = 'professor'
        ORDER BY p.id LIMIT 5
      LOOP
        v_gastou := true;
        IF r.h = extensions.crypt(v_senha, r.h) THEN
          v_ok := true; v_papel := 'professor'; v_id := r.id; v_nome := r.nome;
          v_deve_trocar := COALESCE(r.deve_trocar_senha, false);
          EXIT;
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF NOT v_gastou THEN PERFORM extensions.crypt(v_senha, extensions.gen_salt('bf', 10)); END IF;
  IF NOT v_ok THEN
    INSERT INTO public.staff_login_falhas (email, ip) VALUES (v_email, v_ip);
    RETURN NULL;
  END IF;

  DELETE FROM public.staff_login_falhas WHERE email = v_email AND ip IS NOT DISTINCT FROM v_ip;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.staff_sessoes (papel, usuario_id, token_hash)
    VALUES (v_papel, v_id, extensions.digest(v_token, 'sha256'));
  RETURN jsonb_build_object('token', v_token, 'usuario', jsonb_build_object(
    'id', v_id, 'nome', v_nome, 'email', v_email, 'tipo', v_papel,
    'deveTrocarSenha', v_deve_trocar
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_perfil(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_papel text; v_id bigint; v_r jsonb;
BEGIN
  SELECT s.papel, s.usuario_id INTO v_papel, v_id FROM public._staff_sessao(p_token) s;
  IF v_papel = 'admin' THEN
    SELECT jsonb_build_object('id', x.id, 'nome', x.nome, 'email', lower(x.email), 'tipo', 'admin') INTO v_r
      FROM public.administradores x WHERE x.id = v_id;
  ELSIF v_papel = 'coordenador' THEN
    SELECT jsonb_build_object('id', x.id, 'nome', x.nome, 'email', lower(x.email), 'tipo', 'coordenador') INTO v_r
      FROM public.coordenadores x WHERE x.id = v_id;
  ELSE
    SELECT jsonb_build_object('id', x.id, 'nome', x.nome, 'email', lower(x.email), 'tipo', 'professor',
      'deveTrocarSenha', COALESCE(c.deve_trocar_senha, false)) INTO v_r
      FROM public.professores x LEFT JOIN public.professores_credenciais c ON c.professor_id = x.id
      WHERE x.id = v_id;
  END IF;
  RETURN v_r;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_alterar_minha_senha(p_token text, p_senha_atual text, p_senha_nova text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_papel text; v_id bigint; v_hash text; v_chave text;
BEGIN
  SELECT s.papel, s.usuario_id INTO v_papel, v_id FROM public._staff_sessao(p_token) s;
  v_chave := 'senha_staff_falha:' || v_papel || ':' || v_id;
  PERFORM public._limite_verificar(v_chave, 5, interval '15 minutes');
  IF NOT public._senha_forte(p_senha_nova, true) THEN RAISE EXCEPTION 'senha_fraca' USING ERRCODE = 'PT422'; END IF;
  IF v_papel = 'admin' THEN SELECT a.senha_hash INTO v_hash FROM public.administradores a WHERE a.id = v_id;
  ELSIF v_papel = 'coordenador' THEN SELECT c.senha_hash INTO v_hash FROM public.coordenadores c WHERE c.id = v_id;
  ELSE SELECT c.senha_hash INTO v_hash FROM public.professores_credenciais c WHERE c.professor_id = v_id; END IF;
  IF v_hash IS NULL OR v_hash <> extensions.crypt(COALESCE(p_senha_atual, ''), v_hash) THEN
    PERFORM public._limite_registrar(v_chave);
    RETURN jsonb_build_object('erro', 'senha_atual_incorreta');
  END IF;
  IF v_papel = 'admin' THEN
    UPDATE public.administradores SET senha_hash = extensions.crypt(p_senha_nova, extensions.gen_salt('bf', 10)) WHERE id = v_id;
  ELSIF v_papel = 'coordenador' THEN
    UPDATE public.coordenadores SET senha_hash = extensions.crypt(p_senha_nova, extensions.gen_salt('bf', 10)) WHERE id = v_id;
  ELSE
    UPDATE public.professores SET senha = p_senha_nova WHERE id = v_id;
    UPDATE public.professores_credenciais SET
      senha_hash = extensions.crypt(p_senha_nova, extensions.gen_salt('bf', 10)),
      atualizado_em = now(), deve_trocar_senha = false
      WHERE professor_id = v_id;
  END IF;
  UPDATE public.staff_sessoes SET revogado_em = now()
    WHERE papel = v_papel AND usuario_id = v_id AND revogado_em IS NULL;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.coordenador_preparar_professor_convite(text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coordenador_preparar_professor_convite(text,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.staff_renomear_turma(text,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_renomear_turma(text,bigint,text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
