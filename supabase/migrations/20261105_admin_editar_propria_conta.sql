-- Permite ao administrador editar a própria identificação e senha sem expor
-- a tabela/hash nem confiar em um ID enviado pelo cliente.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_atualizar_meus_dados(
  p_token text, p_nome text DEFAULT NULL, p_email text DEFAULT NULL, p_senha text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_id bigint;
  v_nome text;
  v_email text;
BEGIN
  SELECT s.usuario_id INTO v_id FROM public._staff_exigir(p_token, ARRAY['admin']) s;
  IF p_nome IS NULL AND p_email IS NULL AND p_senha IS NULL THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'PT422';
  END IF;

  IF p_nome IS NOT NULL THEN
    v_nome := btrim(p_nome);
    IF v_nome = '' OR length(v_nome) > 100 THEN RAISE EXCEPTION 'nome_invalido' USING ERRCODE = 'PT422'; END IF;
  END IF;

  IF p_email IS NOT NULL THEN
    v_email := lower(btrim(p_email));
    IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      RAISE EXCEPTION 'email_invalido' USING ERRCODE = 'PT422';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('email:' || v_email, 0));
    IF EXISTS (SELECT 1 FROM public.administradores a WHERE lower(a.email) = v_email AND a.id <> v_id)
       OR EXISTS (SELECT 1 FROM public.coordenadores c WHERE lower(c.email) = v_email)
       OR EXISTS (SELECT 1 FROM public.professores p WHERE lower(p.email) = v_email)
       OR EXISTS (SELECT 1 FROM public.alunos al WHERE lower(al.email) = v_email) THEN
      RAISE EXCEPTION 'email_ja_cadastrado' USING ERRCODE = 'PT409';
    END IF;
  END IF;

  IF p_senha IS NOT NULL AND NOT public._senha_forte(p_senha, true) THEN
    RAISE EXCEPTION 'senha_fraca' USING ERRCODE = 'PT422';
  END IF;

  UPDATE public.administradores a SET
    nome = CASE WHEN p_nome IS NOT NULL THEN v_nome ELSE a.nome END,
    email = CASE WHEN p_email IS NOT NULL THEN v_email ELSE a.email END,
    senha_hash = CASE WHEN p_senha IS NOT NULL THEN extensions.crypt(p_senha, extensions.gen_salt('bf', 10)) ELSE a.senha_hash END
  WHERE a.id = v_id AND a.ativo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404'; END IF;

  -- Trocar senha revoga outras sessões, preservando a sessão que acabou de autorizar a mudança.
  IF p_senha IS NOT NULL THEN
    UPDATE public.staff_sessoes SET revogado_em = now()
    WHERE papel = 'admin' AND usuario_id = v_id AND revogado_em IS NULL
      AND token_hash <> extensions.digest(p_token, 'sha256');
  END IF;

  RETURN (SELECT jsonb_build_object('id', a.id, 'nome', a.nome, 'email', lower(a.email), 'tipo', 'admin')
          FROM public.administradores a WHERE a.id = v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_atualizar_meus_dados(text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_atualizar_meus_dados(text,text,text,text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
