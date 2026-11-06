-- =============================================================================
-- V4 · FASE 2 — professores sem texto puro  (MANUAL; NÃO é migration; NÃO colocar em supabase/migrations)
--
-- Remove o texto puro de public.professores.senha e IMPEDE que ele volte a ser gravado (gatilhos BEFORE).
-- Executar SOMENTE depois de: (1) migrations até a 20261027 aplicadas; (2) FECHAMENTO V4 aplicado e validado
-- (anon sem acesso à tabela); (3) app novo publicado para TODOS (o app antigo comparava senha em texto puro);
-- (4) backup RESTAURÁVEL externo feito E teste de restauração feito (ver "BACKUP" abaixo).
--
-- O que faz (uma transação: qualquer trava ou verificação que falhar desfaz TUDO):
--   a) pré-requisitos: confirmações explícitas, fechamento aplicado, tabelas/hash disponíveis, nenhuma função
--      executável por anon/authenticated (fora da lista revisada) nem view/política dependente de professores.senha;
--   b) gera hash (bcrypt, custo 10) de quem ainda não tem e VERIFICA que cada hash confere com o texto puro que
--      será apagado (divergência => aborta, informando só a QUANTIDADE, nunca valores);
--   c) permite senha NULL; troca o gatilho AFTER antigo por um par BEFORE+AFTER:
--        BEFORE: calcula o hash, guarda-o só na transação (GUC local) e põe NEW.senha := NULL — o texto puro NUNCA
--                chega a ser gravado (um gatilho AFTER não consegue limpar a linha recém-gravada; por isso BEFORE);
--        AFTER : grava o hash em professores_credenciais e derruba as sessões da conta quando a senha é trocada;
--   d) apaga o texto puro existente (UPDATE ... SET senha = NULL);
--   e) auto-teste dentro de subtransação revertida (troca de senha simulada: hash confere, texto puro nulo,
--      sessões revogadas) e pós-checks. Se o auto-teste não puder rodar, ABORTA.
--
-- BACKUP (por que não há tabela de cópia): esta fase NÃO cria tabela com cópia do texto puro. Faça um backup
-- completo externo (Dashboard > Database > Backups, ou pg_dump) guardado cifrado e com acesso restrito, e TESTE a
-- restauração. Esse backup contém texto puro: descarte-o conforme a política da escola quando deixar de ser necessário.
-- Backups/PITR já existentes continuam com o texto puro até expirarem.
--
-- ROLLBACK: fechamento_manual/V4_FASE_ROLLBACK_gatilhos.sql desfaz a ESTRUTURA (gatilhos), NÃO restaura texto puro.
-- Depois de apagado o texto puro, o procedimento seguro é: manter os hashes (o login continua funcionando) e, se
-- alguém esquecer a senha, redefini-la (admin_definir_senha). Restaurar texto puro só do backup externo, por decisão humana.
--
-- Impacto: sessões abertas continuam válidas (nada é revogado por esta fase); a troca de senha continua derrubando
-- as sessões da conta. O painel já não mostra senhas (V4). Recuperação de conta = redefinição pelo administrador.
-- =============================================================================
BEGIN;

DO $fase$
DECLARE
  -- >>> TODAS as confirmações começam FALSE de propósito. Mude para true só depois de cumprir cada item. <<<
  v_confirmo_backup_restauravel_testado boolean := false;
  v_confirmo_app_novo_publicado         boolean := false;
  v_confirmo_homologacao_aprovada       boolean := false;

  v_n_total bigint; v_n_com_texto bigint; v_n_sem_hash bigint; v_n_diverge bigint; v_n_formato bigint; v_n_sem_credencial bigint;
  v_lista text; v_dep text; v_h text; v_id bigint;
  -- funções que LEGITIMAMENTE tocam em professores.senha (revisadas); qualquer outra executável por anon/authenticated aborta
  v_revisadas text[] := ARRAY['login_staff','staff_alterar_minha_senha','admin_inserir','admin_atualizar','admin_definir_senha','admin_listar','admin_excluir','staff_listar_professores','obter_meu_perfil','sincronizar_credencial_professor','curupira_perfil_atual'];
BEGIN
  -- a) PRÉ-REQUISITOS ---------------------------------------------------------
  IF NOT (v_confirmo_backup_restauravel_testado AND v_confirmo_app_novo_publicado AND v_confirmo_homologacao_aprovada) THEN
    RAISE EXCEPTION 'FASE 2 RECUSADA: defina as 3 confirmações como true somente após backup restaurável TESTADO, app novo publicado para todos e homologação aprovada.';
  END IF;
  IF to_regclass('public.v4_fechamento_snapshot') IS NULL THEN
    RAISE EXCEPTION 'FASE 2 RECUSADA: o fechamento V4 não foi aplicado (v4_fechamento_snapshot ausente). Aplique e valide o fechamento antes.';
  END IF;
  IF to_regclass('public.professores_credenciais') IS NULL OR to_regclass('public.staff_sessoes') IS NULL THEN
    RAISE EXCEPTION 'FASE 2 RECUSADA: tabelas de credencial/sessão ausentes (aplique a migration 20261027).';
  END IF;
  IF to_regprocedure('extensions.crypt(text,text)') IS NULL THEN
    RAISE EXCEPTION 'FASE 2 RECUSADA: extensions.crypt (pgcrypto) indisponível.';
  END IF;
  -- estado FECHADO: nenhum privilégio de tabela OU de coluna para anon/authenticated em professores
  IF has_any_column_privilege('anon', 'public.professores', 'SELECT,INSERT,UPDATE,REFERENCES')
     OR has_any_column_privilege('authenticated', 'public.professores', 'SELECT,INSERT,UPDATE,REFERENCES')
     OR has_table_privilege('anon', 'public.professores', 'DELETE,TRUNCATE,TRIGGER')
     OR has_table_privilege('authenticated', 'public.professores', 'DELETE,TRUNCATE,TRIGGER') THEN
    RAISE EXCEPTION 'FASE 2 RECUSADA: anon/authenticated ainda têm acesso a public.professores (fechamento ausente ou revertido).';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.professores'::regclass) THEN
    RAISE EXCEPTION 'FASE 2 RECUSADA: RLS desligado em public.professores.';
  END IF;
  -- login_staff compara só o hash (sem ramo de texto puro para staff)
  IF pg_get_functiondef('public.login_staff(text,text)'::regprocedure) ~* 'professores\M[^;]*\msenha\M' THEN
    RAISE EXCEPTION 'FASE 2 RECUSADA: login_staff lê professores.senha (versão inesperada).'; END IF;

  -- nenhuma função executável pelo app (anon/authenticated) que leia/escreva a coluna, fora da lista revisada
  SELECT string_agg(p.oid::regprocedure::text, '; ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind = 'f'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
     AND p.proname <> ALL (v_revisadas)
     AND pg_get_functiondef(p.oid) ~* '\mprofessores\M' AND pg_get_functiondef(p.oid) ~* '\msenha\M';
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'FASE 2 RECUSADA: funções executáveis por anon/authenticated referenciam professores.senha e não foram revisadas: %', v_lista;
  END IF;
  -- views, regras, políticas ou colunas geradas que dependam da coluna
  SELECT string_agg(DISTINCT COALESCE(c.relname, 'política/regra ' || d.objid::text), ', ') INTO v_dep
    FROM pg_depend d
    JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
    LEFT JOIN pg_rewrite rw ON rw.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
    LEFT JOIN pg_class c ON c.oid = rw.ev_class
   WHERE d.refobjid = 'public.professores'::regclass AND a.attname = 'senha' AND d.deptype = 'n'
     AND d.classid IN ('pg_rewrite'::regclass, 'pg_policy'::regclass)
     AND (c.relname IS NULL OR c.relname <> 'professores');
  IF v_dep IS NOT NULL THEN
    RAISE EXCEPTION 'FASE 2 RECUSADA: objetos dependem de professores.senha (views/políticas): %', v_dep;
  END IF;

  -- b) HASHES ----------------------------------------------------------------
  INSERT INTO public.professores_credenciais (professor_id, senha_hash)
  SELECT t.id, extensions.crypt(t.senha, extensions.gen_salt('bf', 10))
    FROM public.professores t
   WHERE t.senha IS NOT NULL AND t.senha <> ''
     AND NOT EXISTS (SELECT 1 FROM public.professores_credenciais c WHERE c.professor_id = t.id);

  SELECT count(*) INTO v_n_total FROM public.professores;
  SELECT count(*) INTO v_n_com_texto FROM public.professores WHERE senha IS NOT NULL AND senha <> '';
  SELECT count(*) INTO v_n_sem_credencial FROM public.professores t
   WHERE NOT EXISTS (SELECT 1 FROM public.professores_credenciais c WHERE c.professor_id = t.id);
  SELECT count(*) INTO v_n_formato FROM public.professores_credenciais WHERE senha_hash !~ '^\$2[aby]\$[0-9]{2}\$.{53}$';
  SELECT count(*) INTO v_n_diverge FROM public.professores t JOIN public.professores_credenciais c ON c.professor_id = t.id
   WHERE t.senha IS NOT NULL AND t.senha <> '' AND c.senha_hash <> extensions.crypt(t.senha, c.senha_hash);
  IF v_n_formato > 0 THEN RAISE EXCEPTION 'FASE 2 ABORTADA: % hash(es) com formato inválido (não é bcrypt).', v_n_formato; END IF;
  IF v_n_diverge > 0 THEN
    RAISE EXCEPTION 'FASE 2 ABORTADA: % conta(s) em que o hash NÃO confere com o texto puro atual (divergência). Investigue (consulta no arquivo de pré/pós-check) e redefina essas senhas antes de repetir.', v_n_diverge;
  END IF;
  IF v_n_com_texto > 0 AND EXISTS (SELECT 1 FROM public.professores t WHERE t.senha IS NOT NULL AND t.senha <> ''
        AND NOT EXISTS (SELECT 1 FROM public.professores_credenciais c WHERE c.professor_id = t.id)) THEN
    RAISE EXCEPTION 'FASE 2 ABORTADA: há conta com texto puro e sem hash após a geração.';
  END IF;
  RAISE NOTICE 'Fase 2 (professores): % linhas; % com texto puro (todas com hash conferido); % sem credencial (já não conseguiam entrar; não alteradas).',
    v_n_total, v_n_com_texto, v_n_sem_credencial;

  -- c) GATILHOS: o texto puro deixa de ser gravável ----------------------------------------
  ALTER TABLE public.professores ALTER COLUMN senha DROP NOT NULL;

  CREATE OR REPLACE FUNCTION public.v4_fase2_professores_antes() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $f$
  DECLARE h text;
  BEGIN
    IF NEW.senha IS NULL OR NEW.senha = '' THEN NEW.senha := NULL; RETURN NEW; END IF;
    IF NEW.id IS NULL THEN RAISE EXCEPTION 'v4_fase2: id ausente'; END IF;
    h := extensions.crypt(NEW.senha, extensions.gen_salt('bf', 10));
    PERFORM set_config('curupira.hash_professores_' || NEW.id::text, h, true);   -- só o hash, só nesta transação
    NEW.senha := NULL;                                                      -- o texto puro nunca é gravado
    RETURN NEW;
  END
  $f$;
  CREATE OR REPLACE FUNCTION public.v4_fase2_professores_depois() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $f$
  DECLARE h text; k text := 'curupira.hash_professores_' || NEW.id::text;
  BEGIN
    h := current_setting(k, true);
    IF h IS NULL OR h = '' THEN RETURN NULL; END IF;
    PERFORM set_config(k, '', true);
    IF TG_OP = 'UPDATE' THEN
      UPDATE public.staff_sessoes SET revogado_em = now() WHERE papel = 'professor' AND usuario_id = NEW.id AND revogado_em IS NULL;
    END IF;
    INSERT INTO public.professores_credenciais (professor_id, senha_hash) VALUES (NEW.id, h)
    ON CONFLICT (professor_id) DO UPDATE SET senha_hash = EXCLUDED.senha_hash, atualizado_em = now();
    RETURN NULL;     -- sem exceção silenciosa: se o hash não puder ser gravado a operação inteira falha (o texto puro nunca existiu)
  END
  $f$;
  REVOKE ALL ON FUNCTION public.v4_fase2_professores_antes(), public.v4_fase2_professores_depois() FROM PUBLIC, anon, authenticated;

  DROP TRIGGER IF EXISTS professores_sincroniza_credencial ON public.professores;      -- AFTER antigo (guardava texto puro)
  DROP TRIGGER IF EXISTS v4_fase2_professores_antes  ON public.professores;
  DROP TRIGGER IF EXISTS v4_fase2_professores_depois ON public.professores;
  CREATE TRIGGER v4_fase2_professores_antes  BEFORE INSERT OR UPDATE OF senha ON public.professores
    FOR EACH ROW EXECUTE FUNCTION public.v4_fase2_professores_antes();
  CREATE TRIGGER v4_fase2_professores_depois AFTER  INSERT OR UPDATE OF senha ON public.professores
    FOR EACH ROW EXECUTE FUNCTION public.v4_fase2_professores_depois();

  -- d) APAGA O TEXTO PURO EXISTENTE (o gatilho BEFORE vê NULL e não faz nada) -----------------
  UPDATE public.professores SET senha = NULL WHERE senha IS NOT NULL;

  -- e) AUTO-TESTE (subtransação revertida) + PÓS-CHECKS -------------------------------------
  SELECT t.id INTO v_id FROM public.professores t ORDER BY t.id LIMIT 1;
  IF v_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.staff_sessoes (papel, usuario_id, token_hash) VALUES ('professor', v_id, extensions.digest('autoteste-fase2-' || clock_timestamp()::text, 'sha256'));
      UPDATE public.professores SET senha = 'Teste#Fase2-Descartavel1' WHERE id = v_id;
      IF (SELECT senha FROM public.professores WHERE id = v_id) IS NOT NULL THEN RAISE EXCEPTION 'AUTOTESTE: texto puro foi gravado'; END IF;
      SELECT senha_hash INTO v_h FROM public.professores_credenciais WHERE professor_id = v_id;
      IF v_h IS NULL OR v_h <> extensions.crypt('Teste#Fase2-Descartavel1', v_h) THEN RAISE EXCEPTION 'AUTOTESTE: hash não confere'; END IF;
      IF EXISTS (SELECT 1 FROM public.staff_sessoes WHERE papel = 'professor' AND usuario_id = v_id AND revogado_em IS NULL) THEN
        RAISE EXCEPTION 'AUTOTESTE: sessão não foi revogada na troca de senha'; END IF;
      RAISE EXCEPTION 'AUTOTESTE_OK';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'AUTOTESTE_OK' THEN RAISE EXCEPTION 'FASE 2 ABORTADA no auto-teste: %', SQLERRM; END IF;
    END;
  ELSE
    RAISE NOTICE 'Tabela professores vazia: auto-teste de gatilho não executado (o teste local cobre este caminho).';
  END IF;

  IF EXISTS (SELECT 1 FROM public.professores WHERE senha IS NOT NULL) THEN RAISE EXCEPTION 'PÓS-CHECK: ainda há texto puro em professores.senha'; END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.professores'::regclass AND tgname IN ('v4_fase2_professores_antes','v4_fase2_professores_depois') AND NOT tgisinternal) <> 2 THEN
    RAISE EXCEPTION 'PÓS-CHECK: gatilhos da fase 2 ausentes'; END IF;
  RAISE NOTICE 'Fase 2 (professores) aplicada. Rode V4_FASE_consultas_pre_pos.sql (seção PÓS) e teste login, cadastro e troca de senha na homologação.';
END
$fase$;

NOTIFY pgrst, 'reload schema';
COMMIT;
