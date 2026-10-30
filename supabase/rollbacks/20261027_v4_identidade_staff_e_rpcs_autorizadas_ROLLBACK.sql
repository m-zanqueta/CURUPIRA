-- =============================================================================
-- ROLLBACK da migration V4 aditiva (20261027). MANUAL — fora de supabase/migrations.
-- Remove: RPCs V4, funções internas, gatilho/função de credencial de professor e as tabelas novas
-- (administradores, professores_credenciais, staff_sessoes, staff_login_falhas, limite_taxa_eventos).
-- NÃO toca em: professores/alunos/turmas/pets/missoes (dados), V3 (alunos_*), coordenadores, nem em professores.senha.
-- RECUSA rodar se o FECHAMENTO estiver aplicado (public.v4_fechamento_snapshot existe): sem as RPCs e com as
-- tabelas fechadas ninguém conseguiria usar o app. Desfaça antes V4_FECHAMENTO_ROLLBACK.sql.
-- Também RECUSA se a migration 20261029 (Storage) ou 20261028 (leituras) ainda existir (reverta-a antes) ou se a Fase 2 estiver aplicada.
-- ATENÇÃO: apaga as contas de administrador (hash) e as sessões de staff. Para continuar, defina
-- v_confirmo_apagar_admins := true.
-- =============================================================================
BEGIN;
DO $rb$
DECLARE
  v_confirmo_apagar_admins boolean := false;
  f record; v_n int;
BEGIN
  IF to_regclass('public.v4_fechamento_snapshot') IS NOT NULL THEN
    RAISE EXCEPTION 'ROLLBACK RECUSADO: o fechamento de permissões está (ou esteve) aplicado. Rode antes V4_FECHAMENTO_ROLLBACK.sql e confira o app.';
  END IF;
  IF to_regprocedure('public.staff_listar_turmas(text)') IS NOT NULL OR to_regprocedure('public.aluno_minha_turma(text)') IS NOT NULL THEN
    RAISE EXCEPTION 'ROLLBACK RECUSADO: a migration 20261028 (leituras com escopo) depende desta. Rode antes rollbacks/20261028_v4_leituras_com_escopo_ROLLBACK.sql.';
  END IF;
  IF to_regprocedure('public.storage_autorizar_operacao(text,text,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'ROLLBACK RECUSADO: a migration 20261029 (autorização do Storage) depende desta. Rode antes rollbacks/20261029_v4_storage_autorizacao_ROLLBACK.sql.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname LIKE 'v4_fase2%' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'ROLLBACK RECUSADO: a Fase 2 (senhas sem texto puro) está aplicada e seus gatilhos gravam em professores_credenciais/alunos_credenciais. Esta reversão apagaria a única cópia utilizável das senhas dos professores; não é suportada depois da Fase 2.';
  END IF;
  IF to_regclass('public.administradores') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM public.administradores;
    IF v_n > 0 AND NOT v_confirmo_apagar_admins THEN
      RAISE EXCEPTION 'ROLLBACK RECUSADO: existem % administrador(es). Defina v_confirmo_apagar_admins := true para apagá-los (precisará reprovisionar depois).', v_n;
    END IF;
  END IF;

  DROP TRIGGER IF EXISTS professores_sincroniza_credencial ON public.professores;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
              'login_staff','logout_staff','staff_perfil','cadastrar_aluno','email_aluno_existe','entrar_na_turma',
              'staff_listar_alunos','staff_atualizar_aluno','staff_remover_aluno_da_turma','staff_definir_status_missao',
              'aluno_definir_status_missao','staff_salvar_missao','staff_definir_turmas_missao','staff_definir_ativa_missao_turma',
              'staff_remover_missao_da_turma','staff_excluir_missao','staff_criar_turma','staff_excluir_turma',
              'admin_listar','admin_atualizar','admin_inserir','admin_excluir','admin_definir_senha','_admin_colunas',
              'obter_meu_perfil','staff_listar_professores','staff_alterar_minha_senha',
              'staff_atribuir_tarefa_global','staff_salvar_tarefa_global','aluno_avancar_etapa',
              'sincronizar_credencial_professor','_ip_cliente','_limite_taxa','_limite_verificar','_limite_registrar',
              '_staff_sessao','_staff_exigir','_staff_como_professor','_staff_pode_aluno','_senha_forte'])
  LOOP EXECUTE format('DROP FUNCTION %s', f.sig); END LOOP;
  DROP TABLE IF EXISTS public.staff_sessoes, public.staff_login_falhas, public.limite_taxa_eventos,
                       public.professores_credenciais, public.administradores;
  RAISE NOTICE 'V4 aditiva removida. O app NOVO deixa de funcionar (usa estas RPCs); o app antigo volta a ser o único compatível.';
END
$rb$;
NOTIFY pgrst, 'reload schema';
COMMIT;
