-- =============================================================================
-- V4 · PROVISIONAMENTO MANUAL DO PRIMEIRO ADMINISTRADOR  (NÃO é migration; NÃO aplicar via CLI)
--
-- Executar UMA vez, pelo responsável pelo banco, no SQL Editor (papel postgres), DEPOIS da migration
-- 20261027 e ANTES do fechamento. Não existe RPC pública que crie administrador: a única forma de
-- existir um admin é esta operação privilegiada. A senha fixa antiga do app ("Adm123!") deixa de
-- valer — o app novo não a conhece e o servidor só aceita o hash gravado aqui.
--
-- COMO USAR
--   1. Edite SOMENTE as três linhas marcadas com «EDITE» (nome, e-mail, senha temporária forte).
--      Mín. 12 caracteres, com maiúscula, minúscula, número e símbolo. NUNCA faça commit deste
--      arquivo com valores reais; o SQL Editor guarda histórico de consultas — por isso use uma
--      senha TEMPORÁRIA e troque-a logo após o 1º login (RPC staff_alterar_minha_senha).
--   2. Execute. A senha é gravada apenas como hash bcrypt (custo 10) em public.administradores.
--   3. Verifique (consulta no fim do arquivo) e faça login no app novo com e-mail + senha.
--
-- RECUPERAÇÃO DE ACESSO (admin esqueceu a senha / conta comprometida)
--   Execute este mesmo script com o e-mail existente e v_redefinir := true. Isso troca o hash, reativa
--   a conta e REVOGA todas as sessões dela. Para desativar um admin: UPDATE public.administradores
--   SET ativo = false WHERE lower(email) = '...';  (sessões passam a ser inválidas na próxima chamada).
-- =============================================================================
DO $$
DECLARE
  v_nome      text    := '<<EDITE: nome do administrador>>';
  v_email     text    := '<<EDITE: e-mail do administrador>>';
  v_senha     text    := '<<EDITE: senha temporária forte>>';
  v_redefinir boolean := false;   -- true = redefinir senha de um admin que já existe
  v_id bigint;
BEGIN
  IF to_regclass('public.administradores') IS NULL OR to_regprocedure('public._senha_forte(text,boolean)') IS NULL THEN
    RAISE EXCEPTION 'ERRO: aplique antes a migration 20261027_v4_identidade_staff_e_rpcs_autorizadas.sql.';
  END IF;
  IF v_nome LIKE '%<<%' OR v_email LIKE '%<<%' OR v_senha LIKE '%<<%' THEN
    RAISE EXCEPTION 'ERRO: edite nome, e-mail e senha antes de executar (valores de exemplo ainda presentes).';
  END IF;
  v_nome := trim(v_nome); v_email := lower(trim(v_email));
  IF v_nome = '' OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'ERRO: nome vazio ou e-mail inválido.';
  END IF;
  IF length(v_senha) < 12 OR NOT public._senha_forte(v_senha, true) THEN
    RAISE EXCEPTION 'ERRO: a senha deve ter 12+ caracteres, com maiúscula, minúscula, número e símbolo.';
  END IF;
  IF lower(v_senha) IN ('adm123!', 'coordenador123!') THEN
    RAISE EXCEPTION 'ERRO: senha conhecida/publicada no repositório não pode ser usada.';
  END IF;

  SELECT id INTO v_id FROM public.administradores WHERE lower(email) = v_email;
  IF v_id IS NULL THEN
    INSERT INTO public.administradores (nome, email, senha_hash, ativo)
    VALUES (v_nome, v_email, extensions.crypt(v_senha, extensions.gen_salt('bf', 10)), true)
    RETURNING id INTO v_id;
    RAISE NOTICE 'Administrador criado (id %). Nenhuma senha foi registrada em log.', v_id;
  ELSIF v_redefinir THEN
    UPDATE public.administradores
       SET nome = v_nome, senha_hash = extensions.crypt(v_senha, extensions.gen_salt('bf', 10)), ativo = true
     WHERE id = v_id;
    UPDATE public.staff_sessoes SET revogado_em = now() WHERE papel = 'admin' AND usuario_id = v_id AND revogado_em IS NULL;
    RAISE NOTICE 'Senha do administrador % redefinida e sessões revogadas.', v_id;
  ELSE
    RAISE EXCEPTION 'ERRO: já existe administrador com este e-mail. Use v_redefinir := true para redefinir a senha.';
  END IF;
END $$;

-- Verificação (não mostra hash): deve listar o admin ativo.
SELECT id, nome, email, ativo, criado_em FROM public.administradores ORDER BY id;
