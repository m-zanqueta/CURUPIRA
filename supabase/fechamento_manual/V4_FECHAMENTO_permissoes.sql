-- =============================================================================
-- V4 · FECHAMENTO DE PERMISSÕES (MANUAL — NÃO é migration; NÃO colocar em supabase/migrations)
--
-- Executar pelo responsável pelo banco SOMENTE quando:
--   (1) backup restaurável verificado; (2) migrations V3 e 20261027 aplicadas;
--   (3) administrador provisionado (V4_provisionar_admin.sql); (4) o APP NOVO está publicado e validado
--       (o app antigo acessa as tabelas direto e PARA de funcionar depois deste script — planeje a janela);
--   (5) credencial padrão do repositório do coordenador foi trocada (ver trava abaixo).
--
-- O que faz (tudo em UMA transação: qualquer trava/verificação que falhar desfaz TUDO — o banco nunca
-- fica parcialmente fechado):
--   a) trava os pré-requisitos e falha com mensagem explícita;
--   b) guarda um retrato do estado atual (RLS, privilégios, políticas) em public.v4_fechamento_snapshot;
--   c) por tabela: remove privilégios de tabela E de coluna de anon/authenticated, remove TODAS as políticas
--      existentes (inclusive as permissivas "pelo app"), liga RLS;
--   d) concede de volta SOMENTE o necessário: SELECT (com uma política SELECT-only) em acessorios e icones_missoes
--      (catálogos públicos). TODAS as outras tabelas (alunos, professores, turmas, pets, missoes, missoes_turmas,
--      alunos_missoes, conquistas, ...) ficam SEM acesso direto — o app lê e escreve por RPCs com escopo de sessão;
--   e) revoga EXECUTE das RPCs antigas que confiavam em p_professor_id / não verificavam identidade;
--   f) verifica o resultado e aborta se sobrar função SECURITY DEFINER de public executável por anon
--      fora da lista permitida, ou se algum privilégio proibido persistir.
--
-- NÃO resolve (continua aberto, ver README): Storage (upload público do bucket pets-images, ver storage/);
-- senhas em texto puro gravadas em alunos.senha/professores.senha (inacessíveis ao app; apagar com a Fase 2 manual).
-- =============================================================================
BEGIN;

DO $fechamento$
DECLARE
  -- Aceitar conscientemente a credencial padrão do repositório (coordenador@email.com / Coordenador123!)?
  -- Mantenha false: troque a senha antes. true só para homologação descartável.
  v_aceito_credencial_padrao boolean := false;

  -- Leitura pública MÍNIMA: só catálogos sem dado de aluno (justificativa em V4_MATRIZ_ACESSOS.md). Todo o resto é lido por RPC com escopo de sessão (migration 20261028).
  t_leitura  text[] := ARRAY['acessorios','icones_missoes'];
  t_fechadas text[] := ARRAY['alunos','professores','alunos_missoes_etapas','turmas','pets','missoes','missoes_turmas','alunos_missoes','conquistas'];
  t_todas    text[];
  v_tab text; v_col text; v_pol record; v_seq record; v_fn record; v_falta text; v_dono record; v_ruins text;
  v_permitidas text[] := ARRAY[
    'login_aluno','logout_aluno','obter_estado_loja','comprar_acessorio','equipar_acessorio','importar_estado_local',
    'login_staff','logout_staff','staff_perfil','cadastrar_aluno','email_aluno_existe','entrar_na_turma',
    'staff_listar_alunos','staff_atualizar_aluno','staff_remover_aluno_da_turma','staff_definir_status_missao',
    'aluno_definir_status_missao','staff_salvar_missao','staff_definir_turmas_missao','staff_definir_ativa_missao_turma',
    'staff_remover_missao_da_turma','staff_excluir_missao','staff_criar_turma','staff_excluir_turma',
    'admin_listar','admin_atualizar','admin_inserir','admin_excluir','admin_definir_senha',
    'obter_meu_perfil','staff_listar_professores','staff_alterar_minha_senha',
    'staff_atribuir_tarefa_global','staff_salvar_tarefa_global','aluno_avancar_etapa',
    'staff_listar_turmas','staff_listar_pets','staff_listar_missoes','staff_listar_status_missoes','aluno_minha_turma','aluno_minhas_missoes','aluno_meu_progresso_geral','aluno_minhas_conquistas'];
BEGIN
  t_todas := t_leitura || t_fechadas;

  -- a) PRÉ-REQUISITOS -------------------------------------------------------
  SELECT string_agg(t, ', ') INTO v_falta FROM unnest(t_todas || ARRAY['administradores','staff_sessoes','professores_credenciais',
         'alunos_sessoes','alunos_credenciais','coordenadores']) AS t WHERE to_regclass('public.' || t) IS NULL;
  IF v_falta IS NOT NULL THEN RAISE EXCEPTION 'FECHAMENTO ABORTADO: tabelas ausentes: %', v_falta; END IF;

  SELECT string_agg(f, ', ') INTO v_falta FROM unnest(v_permitidas) AS f
   WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                      WHERE n.nspname = 'public' AND p.proname = f);
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'FECHAMENTO ABORTADO: RPCs ausentes (aplique V3 e as migrations 20261027 e 20261028): %', v_falta;
  END IF;

  -- A 20261026 (origin/dev) sobrescreve login_aluno por uma versão legada SEM token; a 20261027 restaura a da V3. Sem isso a Loja não funciona.
  IF pg_get_functiondef('public.login_aluno(text,text)'::regprocedure) NOT LIKE '%alunos_sessoes%' THEN
    RAISE EXCEPTION 'FECHAMENTO ABORTADO: public.login_aluno é a versão LEGADA (sem token de sessão). Reaplique a migration 20261027 depois da 20261026.';
  END IF;

  -- Tabela desconhecida (criada depois deste script) com acesso anônimo: o fechamento não a conhece, então NÃO finge que fechou tudo.
  SELECT string_agg(c.relname, ', ') INTO v_ruins FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p') AND c.relname <> ALL (t_todas)
     AND c.relname NOT IN ('v4_fechamento_snapshot','v4_fechamento_snapshot_funcoes')
     AND (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'));
  IF v_ruins IS NOT NULL THEN
    RAISE EXCEPTION 'FECHAMENTO ABORTADO: tabelas de public com acesso anon/authenticated que este script não trata (inclua-as em t_leitura/t_fechadas após revisão): %', v_ruins;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.administradores WHERE ativo) THEN
    RAISE EXCEPTION 'FECHAMENTO ABORTADO: nenhum administrador ativo. Execute V4_provisionar_admin.sql primeiro (sem admin o painel ficaria inacessível).';
  END IF;

  IF NOT v_aceito_credencial_padrao AND EXISTS (
       SELECT 1 FROM public.coordenadores c WHERE c.ativo AND c.senha_hash = extensions.crypt('Coordenador123!', c.senha_hash)) THEN
    RAISE EXCEPTION 'FECHAMENTO ABORTADO: o coordenador ainda usa a senha padrão publicada no repositório. Troque-a (UPDATE public.coordenadores SET senha_hash = extensions.crypt(''<nova forte>'', extensions.gen_salt(''bf'',10)) WHERE ...) e repita.';
  END IF;

  -- As funções SECURITY DEFINER precisam atravessar o RLS que será ligado: o dono delas tem que ter BYPASSRLS/superuser.
  FOR v_dono IN
    SELECT DISTINCT r.rolname, (r.rolsuper OR r.rolbypassrls) AS ok
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_roles r ON r.oid = p.proowner
    WHERE n.nspname = 'public' AND p.prosecdef AND p.proname = ANY (v_permitidas)
  LOOP
    IF NOT v_dono.ok THEN
      RAISE EXCEPTION 'FECHAMENTO ABORTADO: o dono (%) das RPCs SECURITY DEFINER não ignora RLS; as RPCs parariam de funcionar. Recrie-as com um dono com BYPASSRLS (ex.: postgres).', v_dono.rolname;
    END IF;
  END LOOP;
  FOR v_dono IN
    SELECT DISTINCT r.rolname, (r.rolsuper OR r.rolbypassrls) AS ok
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_roles r ON r.oid = p.proowner
    WHERE n.nspname = 'public' AND p.prosecdef AND p.proname IN ('aplicar_xp_aluno_missao','preparar_aluno_missao','sincronizar_xp_missao_editada',
      'validar_status_tarefa_autenticado','preparar_moedas_tarefa','aplicar_moedas_tarefa','aplicar_xp_etapa_tarefa','proteger_alteracoes_perfil')
  LOOP
    IF NOT v_dono.ok THEN RAISE EXCEPTION 'FECHAMENTO ABORTADO: o dono (%) dos gatilhos de XP não ignora RLS.', v_dono.rolname; END IF;
  END LOOP;

  -- b) RETRATO DO ESTADO ATUAL (primeira execução apenas; reexecução não sobrescreve o original) -------------
  CREATE TABLE IF NOT EXISTS public.v4_fechamento_snapshot (
    tabela text PRIMARY KEY, rls boolean NOT NULL, acl text, colunas_acl jsonb, politicas jsonb, em timestamptz NOT NULL DEFAULT now());
  ALTER TABLE public.v4_fechamento_snapshot ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE public.v4_fechamento_snapshot FROM PUBLIC, anon, authenticated;
  FOREACH v_tab IN ARRAY t_todas LOOP
    INSERT INTO public.v4_fechamento_snapshot (tabela, rls, acl, colunas_acl, politicas)
    SELECT v_tab, c.relrowsecurity, c.relacl::text,
           (SELECT COALESCE(jsonb_object_agg(a.attname, a.attacl::text), '{}'::jsonb) FROM pg_attribute a
             WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL),
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('nome', p.policyname, 'cmd', p.cmd, 'permissive', p.permissive,
                   'roles', p.roles, 'qual', p.qual, 'with_check', p.with_check)), '[]'::jsonb)
              FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = v_tab)
    FROM pg_class c WHERE c.oid = ('public.' || v_tab)::regclass
    ON CONFLICT (tabela) DO NOTHING;
  END LOOP;

  -- b2) RETRATO DAS FUNÇÕES de public (ACL original; usado só pelo nível D do rollback). Não sobrescreve na reexecução.
  CREATE TABLE IF NOT EXISTS public.v4_fechamento_snapshot_funcoes (
    assinatura text PRIMARY KEY, nome text NOT NULL, acl text, em timestamptz NOT NULL DEFAULT now());
  ALTER TABLE public.v4_fechamento_snapshot_funcoes ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE public.v4_fechamento_snapshot_funcoes FROM PUBLIC, anon, authenticated;
  INSERT INTO public.v4_fechamento_snapshot_funcoes (assinatura, nome, acl)
  SELECT format('public.%I(%s)', p.proname, oidvectortypes(p.proargtypes)), p.proname, p.proacl::text
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind = 'f'
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  ON CONFLICT (assinatura) DO NOTHING;

  -- c) FECHA: privilégios de tabela e de COLUNA, políticas, RLS ----------------------------------------
  FOREACH v_tab IN ARRAY t_todas LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_tab);
    FOR v_col IN SELECT a.attname FROM pg_attribute a
                  WHERE a.attrelid = ('public.' || v_tab)::regclass AND a.attnum > 0 AND NOT a.attisdropped LOOP
      EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_col, v_tab);
    END LOOP;
    FOR v_pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = v_tab LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', v_pol.policyname, v_tab);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tab);
    -- sequências ligadas à tabela (id identity/serial): ninguém insere direto, logo ninguém precisa delas
    FOR v_seq IN SELECT s.oid::regclass AS nome FROM pg_class s JOIN pg_depend d ON d.objid = s.oid AND d.deptype IN ('a','i')
                  WHERE s.relkind = 'S' AND d.refobjid = ('public.' || v_tab)::regclass LOOP
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated', v_seq.nome);
    END LOOP;
  END LOOP;

  -- d) CONCEDE O MÍNIMO: leitura (somente SELECT) com política SELECT-only. Interina: ver README (Etapa 2).
  FOREACH v_tab IN ARRAY t_leitura LOOP
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon, authenticated', v_tab);
    EXECUTE format('CREATE POLICY v4_leitura ON public.%I AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true)', v_tab);
  END LOOP;

  -- e) RPCs ANTIGAS (confiam em p_professor_id / sem identidade) e funções de gatilho --------------------------
  FOR v_fn IN SELECT p.oid::regprocedure AS assinatura FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.proname IN ('login_coordenador','login_professor','email_aluno_ja_existe','avancar_etapa_tarefa',
                 'salvar_missao_com_turmas','definir_turmas_missao',
                 'definir_ativa_missao_turma','remover_missao_da_turma','preparar_aluno_missao','aplicar_xp_aluno_missao',
                 'sincronizar_xp_missao_editada','validar_status_tarefa_autenticado','preparar_moedas_tarefa','aplicar_moedas_tarefa',
                 'aplicar_xp_etapa_tarefa','proteger_alteracoes_perfil') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn.assinatura);
  END LOOP;

  -- f) VERIFICAÇÃO FINAL ---------------------------------------------------------------------------------
  FOREACH v_tab IN ARRAY t_todas LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || v_tab)::regclass) THEN
      RAISE EXCEPTION 'VERIFICAÇÃO FALHOU: RLS desligado em %', v_tab; END IF;
    IF has_table_privilege('anon', 'public.' || v_tab, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('authenticated', 'public.' || v_tab, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'VERIFICAÇÃO FALHOU: ainda há privilégio de escrita para anon/authenticated em %', v_tab; END IF;
    FOR v_col IN SELECT a.attname FROM pg_attribute a WHERE a.attrelid = ('public.' || v_tab)::regclass AND a.attnum > 0 AND NOT a.attisdropped LOOP
      IF has_column_privilege('anon', 'public.' || v_tab, v_col, 'INSERT,UPDATE') OR
         (v_tab = ANY (t_fechadas) AND has_column_privilege('anon', 'public.' || v_tab, v_col, 'SELECT')) THEN
        RAISE EXCEPTION 'VERIFICAÇÃO FALHOU: privilégio de coluna indevido para anon em %.%', v_tab, v_col; END IF;
    END LOOP;
  END LOOP;

  SELECT string_agg(p.oid::regprocedure::text, '; ') INTO v_ruins
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proname <> ALL (v_permitidas)
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');
  IF v_ruins IS NOT NULL THEN
    RAISE EXCEPTION 'FECHAMENTO ABORTADO: funções de public executáveis por anon fora da lista permitida (revise/revogue e repita; nada foi aplicado): %', v_ruins;
  END IF;

  RAISE NOTICE 'Fechamento aplicado. Rode consultas_pos_check_v4.sql e os testes dos fluxos autorizados e proibidos.';
END
$fechamento$;

NOTIFY pgrst, 'reload schema';
COMMIT;
