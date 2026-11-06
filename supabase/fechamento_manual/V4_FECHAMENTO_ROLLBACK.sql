-- =============================================================================
-- V4 · ROLLBACK DO FECHAMENTO — LEIA ANTES.  (MANUAL; fora de supabase/migrations)
--
-- SEGURO POR PADRÃO. Com apenas a confirmação básica (v_confirmo_reexposicao := true) este script NÃO reabre nada:
--   * RPCs legadas inseguras continuam SEM EXECUTE para anon/authenticated;
--   * nenhuma tabela volta a aceitar escrita anônima; alunos/professores continuam fechados;
--   * apenas REAFIRMA o estado seguro: as RPCs seguras (lista explícita abaixo) executáveis, a leitura pública mínima
--     (acessorios, icones_missoes) e verifica que nada inseguro ficou aberto. É a recuperação operacional "sem risco".
-- Reexposição é opcional, em níveis independentes, e cada um exige DUAS coisas: o boolean := true E a frase exata
-- (digitada de propósito) — não dá para ativar por engano nem por um sed de "false"->"true":
--   B) v_reabrir_escrita_tabelas   + 'REABRIR_ESCRITA_ANON_EM_TABELAS'    : devolve ao anon os privilégios/políticas ORIGINAIS
--        (do retrato) das tabelas que NÃO são alunos/professores. Reabre: forjar XP via alunos_missoes, trocar dono de turma, etc.
--   C) v_reabrir_alunos_professores + 'REABRIR_ALUNOS_PROFESSORES_E_ETAPAS' : idem para alunos, professores e alunos_missoes_etapas.
--        Reabre: leitura/escrita de alunos.xp e (se ainda existir) professores/alunos.senha.
--   D) v_reabrir_rpcs_legadas      + 'REABRIR_RPCS_LEGADAS_INSEGURAS'      : devolve o EXECUTE ORIGINAL (retrato de funções)
--        só das RPCs legadas listadas, cada uma com o motivo de ser insegura (ver v_legadas).
-- Pré-requisitos: retrato das tabelas (v4_fechamento_snapshot) e, para o nível D, retrato das funções
-- (v4_fechamento_snapshot_funcoes). O retrato é gravado na 1ª execução do fechamento e nunca sobrescrito.
-- NÃO desfaz a migration 20261027 nem a V3; dados alterados depois do fechamento permanecem; reversibilidade total
-- NÃO é prometida (o retrato guarda ACLs/políticas por nome; roles personalizadas não são tratadas).
-- Restaurar o app ANTIGO por completo exige os níveis B+C+D, ou seja, reabrir TODAS as vulnerabilidades conhecidas.
-- =============================================================================
BEGIN;
DO $rb$
DECLARE
  v_confirmo_reexposicao        boolean := false;  -- obrigatório para qualquer coisa
  v_reabrir_escrita_tabelas     boolean := false;  v_frase_escrita      text := '';
  v_reabrir_alunos_professores  boolean := false;  v_frase_alunos       text := '';
  v_reabrir_rpcs_legadas        boolean := false;  v_frase_rpcs         text := '';
  c_frase_escrita constant text := 'REABRIR_ESCRITA_ANON_EM_TABELAS';
  c_frase_alunos  constant text := 'REABRIR_ALUNOS_PROFESSORES_E_ETAPAS';
  c_frase_rpcs    constant text := 'REABRIR_RPCS_LEGADAS_INSEGURAS';

  t_publicas  text[] := ARRAY['acessorios','icones_missoes'];                -- leitura pública mínima (catálogos)
  t_sensiveis text[] := ARRAY['alunos','professores','alunos_missoes_etapas'];
  -- RPCs SEGURAS (verificam o token/papel no servidor) — sempre executáveis por anon/authenticated:
  v_seguras text[] := ARRAY[
    'login_aluno','logout_aluno','obter_estado_loja','comprar_acessorio','equipar_acessorio','importar_estado_local',
    'login_staff','logout_staff','staff_perfil','cadastrar_aluno','email_aluno_existe','entrar_na_turma',
    'staff_listar_alunos','staff_atualizar_aluno','staff_remover_aluno_da_turma','staff_definir_status_missao',
    'aluno_definir_status_missao','staff_salvar_missao','staff_definir_turmas_missao','staff_definir_ativa_missao_turma',
    'staff_remover_missao_da_turma','staff_excluir_missao','staff_criar_turma','staff_excluir_turma',
    'admin_listar','admin_atualizar','admin_inserir','admin_excluir','admin_definir_senha',
    'obter_meu_perfil','staff_listar_professores','staff_alterar_minha_senha',
    'staff_atribuir_tarefa_global','staff_salvar_tarefa_global','aluno_avancar_etapa',
    'staff_listar_turmas','staff_listar_pets','staff_listar_missoes','staff_listar_status_missoes','aluno_minha_turma','aluno_minhas_missoes','aluno_meu_progresso_geral','aluno_minhas_conquistas'];
  -- RPCs LEGADAS (ficam revogadas; só o nível D as devolve) e o motivo:
  v_legadas text[] := ARRAY[
    'login_coordenador',            -- autentica sem sessão nem limite de tentativas (força bruta / oráculo)
    'login_professor',              -- compara senha em TEXTO PURO, sem token nem limite
    'email_aluno_ja_existe',        -- enumera e-mails cadastrados sem limite de taxa
    'avancar_etapa_tarefa',         -- age sobre aluno/tarefa informados pelo cliente
    'salvar_missao_com_turmas',     -- confia em p_professor_id enviado pelo cliente
    'definir_turmas_missao',        -- idem
    'definir_ativa_missao_turma',   -- idem
    'remover_missao_da_turma'];     -- idem
  -- funções de gatilho: nunca precisam de EXECUTE para o app; permanecem revogadas em TODOS os níveis
  v_gatilhos text[] := ARRAY['preparar_aluno_missao','aplicar_xp_aluno_missao','sincronizar_xp_missao_editada','validar_status_tarefa_autenticado',
    'preparar_moedas_tarefa','aplicar_moedas_tarefa','aplicar_xp_etapa_tarefa','proteger_alteracoes_perfil'];

  r record; p jsonb; v_acl aclitem; c record; v_n int := 0; v_tab text; v_restaurar text[] := ARRAY[]::text[]; v_fn record; v_ruim text;
BEGIN
  IF NOT v_confirmo_reexposicao THEN
    RAISE EXCEPTION 'ROLLBACK RECUSADO: defina v_confirmo_reexposicao := true. (Com só essa confirmação nada é reaberto: o script apenas reafirma o estado seguro.)';
  END IF;
  IF to_regclass('public.v4_fechamento_snapshot') IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK RECUSADO: não há retrato do estado anterior (v4_fechamento_snapshot ausente).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.v4_fechamento_snapshot) THEN
    RAISE EXCEPTION 'ROLLBACK RECUSADO: não há retrato do estado anterior (v4_fechamento_snapshot vazio).';
  END IF;
  -- cada nível opcional: boolean E frase exata
  IF v_reabrir_escrita_tabelas AND v_frase_escrita IS DISTINCT FROM c_frase_escrita THEN
    RAISE EXCEPTION 'ROLLBACK RECUSADO: v_reabrir_escrita_tabelas exige v_frase_escrita := ''%''.', c_frase_escrita; END IF;
  IF v_reabrir_alunos_professores AND v_frase_alunos IS DISTINCT FROM c_frase_alunos THEN
    RAISE EXCEPTION 'ROLLBACK RECUSADO: v_reabrir_alunos_professores exige v_frase_alunos := ''%''.', c_frase_alunos; END IF;
  IF v_reabrir_rpcs_legadas AND v_frase_rpcs IS DISTINCT FROM c_frase_rpcs THEN
    RAISE EXCEPTION 'ROLLBACK RECUSADO: v_reabrir_rpcs_legadas exige v_frase_rpcs := ''%''.', c_frase_rpcs; END IF;
  IF v_reabrir_rpcs_legadas THEN
    IF to_regclass('public.v4_fechamento_snapshot_funcoes') IS NULL THEN
      RAISE EXCEPTION 'ROLLBACK RECUSADO (nível D): não há retrato das funções (v4_fechamento_snapshot_funcoes ausente).'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.v4_fechamento_snapshot_funcoes) THEN
      RAISE EXCEPTION 'ROLLBACK RECUSADO (nível D): retrato das funções vazio.'; END IF;
  END IF;

  -- A) REAFIRMA O ESTADO SEGURO ------------------------------------------------------------------
  FOREACH v_tab IN ARRAY t_publicas LOOP
    IF to_regclass('public.' || v_tab) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tab);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon, authenticated', v_tab);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = v_tab AND policyname = 'v4_leitura') THEN
      EXECUTE format('CREATE POLICY v4_leitura ON public.%I AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true)', v_tab);
    END IF;
  END LOOP;
  FOR v_fn IN SELECT p2.oid::regprocedure AS assinatura FROM pg_proc p2 JOIN pg_namespace n ON n.oid = p2.pronamespace
               WHERE n.nspname = 'public' AND p2.proname = ANY (v_seguras) LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', v_fn.assinatura);
  END LOOP;
  FOR v_fn IN SELECT p2.oid::regprocedure AS assinatura FROM pg_proc p2 JOIN pg_namespace n ON n.oid = p2.pronamespace
               WHERE n.nspname = 'public' AND p2.proname = ANY (v_gatilhos || CASE WHEN v_reabrir_rpcs_legadas THEN ARRAY[]::text[] ELSE v_legadas END) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn.assinatura);
  END LOOP;

  -- B / C) REEXPOSIÇÃO DE TABELAS (opcional, deliberada) ----------------------------------------
  IF v_reabrir_escrita_tabelas THEN
    v_restaurar := v_restaurar || ARRAY(SELECT s.tabela FROM public.v4_fechamento_snapshot s WHERE s.tabela <> ALL (t_sensiveis));
  END IF;
  IF v_reabrir_alunos_professores THEN
    v_restaurar := v_restaurar || ARRAY(SELECT s.tabela FROM public.v4_fechamento_snapshot s WHERE s.tabela = ANY (t_sensiveis));
  END IF;
  FOR r IN SELECT * FROM public.v4_fechamento_snapshot WHERE tabela = ANY (v_restaurar) ORDER BY tabela LOOP
    FOR c IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = r.tabela LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', c.policyname, r.tabela);
    END LOOP;
    FOR p IN SELECT * FROM jsonb_array_elements(r.politicas) LOOP
      EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s %s %s',
        p->>'nome', r.tabela, p->>'permissive', p->>'cmd',
        (SELECT string_agg(CASE WHEN x = 'public' THEN 'PUBLIC' ELSE quote_ident(x) END, ', ')
           FROM jsonb_array_elements_text(p->'roles') AS x),
        CASE WHEN p->>'cmd' = 'INSERT' THEN '' ELSE 'USING (' || COALESCE(p->>'qual', 'true') || ')' END,
        CASE WHEN p->>'cmd' IN ('SELECT','DELETE') THEN ''
             WHEN p->>'cmd' = 'INSERT' THEN 'WITH CHECK (' || COALESCE(p->>'with_check', 'true') || ')'
             WHEN p->>'with_check' IS NOT NULL THEN 'WITH CHECK (' || (p->>'with_check') || ')' ELSE '' END);
    END LOOP;
    IF r.rls THEN EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tabela);
    ELSE EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', r.tabela); END IF;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', r.tabela);
    IF r.acl IS NOT NULL THEN
      FOR v_acl IN SELECT unnest(r.acl::aclitem[]) LOOP
        FOR c IN SELECT (aclexplode(ARRAY[v_acl])).* LOOP
          IF c.grantee IN ('anon'::regrole::oid, 'authenticated'::regrole::oid) THEN
            EXECUTE format('GRANT %s ON TABLE public.%I TO %s', c.privilege_type, r.tabela, c.grantee::regrole);
          END IF;
        END LOOP;
      END LOOP;
    END IF;
    v_n := v_n + 1;
  END LOOP;

  -- D) REEXPOSIÇÃO DE RPCs LEGADAS (opcional, deliberada): devolve o EXECUTE original do retrato, só da lista v_legadas
  IF v_reabrir_rpcs_legadas THEN
    FOR r IN SELECT * FROM public.v4_fechamento_snapshot_funcoes WHERE nome = ANY (v_legadas) LOOP
      IF to_regprocedure(r.assinatura) IS NULL THEN CONTINUE; END IF;
      IF r.acl IS NULL THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', r.assinatura);       -- ACL padrão original = PUBLIC pode executar
      ELSE
        FOR v_acl IN SELECT unnest(r.acl::aclitem[]) LOOP
          FOR c IN SELECT (aclexplode(ARRAY[v_acl])).* LOOP
            IF c.grantee = 0 THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', r.assinatura);
            ELSIF c.grantee IN ('anon'::regrole::oid, 'authenticated'::regrole::oid) THEN
              EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s', r.assinatura, c.grantee::regrole);
            END IF;
          END LOOP;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- VERIFICAÇÃO: o que NÃO foi explicitamente reaberto tem que estar fechado -------------------------
  IF NOT v_reabrir_rpcs_legadas THEN
    SELECT string_agg(p2.oid::regprocedure::text, '; ') INTO v_ruim FROM pg_proc p2 JOIN pg_namespace n ON n.oid = p2.pronamespace
     WHERE n.nspname = 'public' AND p2.proname = ANY (v_legadas)
       AND (has_function_privilege('anon', p2.oid, 'EXECUTE') OR has_function_privilege('authenticated', p2.oid, 'EXECUTE'));
    IF v_ruim IS NOT NULL THEN RAISE EXCEPTION 'VERIFICAÇÃO FALHOU: RPC legada executável: %', v_ruim; END IF;
  END IF;
  SELECT string_agg(p2.oid::regprocedure::text, '; ') INTO v_ruim FROM pg_proc p2 JOIN pg_namespace n ON n.oid = p2.pronamespace
   WHERE n.nspname = 'public' AND p2.proname = ANY (v_gatilhos)
     AND (has_function_privilege('anon', p2.oid, 'EXECUTE') OR has_function_privilege('authenticated', p2.oid, 'EXECUTE'));
  IF v_ruim IS NOT NULL THEN RAISE EXCEPTION 'VERIFICAÇÃO FALHOU: função de gatilho executável: %', v_ruim; END IF;
  FOR r IN SELECT tabela FROM public.v4_fechamento_snapshot LOOP
    CONTINUE WHEN r.tabela = ANY (v_restaurar);
    IF has_table_privilege('anon', 'public.' || r.tabela, 'INSERT,UPDATE,DELETE,TRUNCATE') OR has_table_privilege('authenticated', 'public.' || r.tabela, 'INSERT,UPDATE,DELETE,TRUNCATE')
       OR (r.tabela = ANY (t_sensiveis) AND has_any_column_privilege('anon', 'public.' || r.tabela, 'SELECT')) THEN
      RAISE EXCEPTION 'VERIFICAÇÃO FALHOU: % não deveria estar aberta', r.tabela; END IF;
  END LOOP;

  RAISE NOTICE 'Rollback aplicado. Tabelas reabertas: %. RPCs legadas reabertas: %. Fora isso, o estado seguro foi reafirmado.',
    COALESCE(NULLIF(array_to_string(v_restaurar, ', '), ''), 'nenhuma'), CASE WHEN v_reabrir_rpcs_legadas THEN 'SIM (nível D)' ELSE 'nenhuma' END;
END
$rb$;
NOTIFY pgrst, 'reload schema';
COMMIT;
