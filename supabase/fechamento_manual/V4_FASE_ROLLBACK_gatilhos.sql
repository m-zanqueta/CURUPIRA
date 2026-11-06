-- =============================================================================
-- V4 · FASE 2 — ROLLBACK ESTRUTURAL (MANUAL; fora de supabase/migrations)
--
-- LEIA: este script NUNCA restaura senhas em texto puro (não há cópia delas no banco — de propósito).
-- Os hashes ficam intactos, então login, cadastro e troca de senha CONTINUAM funcionando depois da Fase 2 e depois
-- deste rollback. Se o problema for um gatilho com defeito, o caminho recomendado é CORRIGIR PARA FRENTE
-- (CREATE OR REPLACE das funções v4_fase2_*), não voltar atrás.
--
-- O que este script faz, e SÓ com as duas confirmações abaixo: remove os gatilhos BEFORE/AFTER da Fase 2 e recria os
-- gatilhos AFTER anteriores (V3/V4), que voltam a GRAVAR o texto puro de novas senhas em <tabela>.senha. Ou seja,
-- ele REINTRODUZ um risco para senhas futuras. Por isso fica recusado por padrão.
-- Não restaura NOT NULL em professores.senha (existem linhas nulas). Restaurar texto puro antigo só a partir do
-- backup externo e por decisão humana, fora deste script.
-- =============================================================================
BEGIN;
DO $rb$
DECLARE
  v_confirmo_rollback                 boolean := false;
  v_aceito_voltar_a_gravar_texto_puro boolean := false;   -- segunda confirmação, deliberada
  v_tabelas text[] := ARRAY['professores','alunos'];      -- apague um item para reverter só uma tabela
  t text;
BEGIN
  IF NOT v_confirmo_rollback THEN
    RAISE EXCEPTION 'ROLLBACK DA FASE 2 RECUSADO: defina v_confirmo_rollback := true se for mesmo necessário (prefira corrigir para frente).';
  END IF;
  IF NOT v_aceito_voltar_a_gravar_texto_puro THEN
    RAISE EXCEPTION 'ROLLBACK DA FASE 2 RECUSADO: reverter os gatilhos faz novas senhas voltarem a ser gravadas em texto puro. Defina v_aceito_voltar_a_gravar_texto_puro := true somente se aceitar isso conscientemente. Nenhum texto puro antigo será restaurado.';
  END IF;
  FOREACH t IN ARRAY v_tabelas LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ('public.' || t)::regclass AND tgname = 'v4_fase2_' || t || '_antes' AND NOT tgisinternal) THEN
      RAISE EXCEPTION 'ROLLBACK RECUSADO: a Fase 2 não está aplicada em % (gatilho ausente).', t;
    END IF;
  END LOOP;
  IF 'professores' = ANY (v_tabelas) THEN
    DROP TRIGGER IF EXISTS v4_fase2_professores_antes  ON public.professores;
    DROP TRIGGER IF EXISTS v4_fase2_professores_depois ON public.professores;
    DROP TRIGGER IF EXISTS professores_sincroniza_credencial ON public.professores;
    CREATE TRIGGER professores_sincroniza_credencial AFTER INSERT OR UPDATE OF senha ON public.professores
      FOR EACH ROW EXECUTE FUNCTION public.sincronizar_credencial_professor();
  END IF;
  IF 'alunos' = ANY (v_tabelas) THEN
    DROP TRIGGER IF EXISTS v4_fase2_alunos_antes  ON public.alunos;
    DROP TRIGGER IF EXISTS v4_fase2_alunos_depois ON public.alunos;
    DROP TRIGGER IF EXISTS alunos_sincroniza_credencial ON public.alunos;
    CREATE TRIGGER alunos_sincroniza_credencial AFTER INSERT OR UPDATE OF senha ON public.alunos
      FOR EACH ROW EXECUTE FUNCTION public.sincronizar_credencial_aluno();
  END IF;
  RAISE NOTICE 'Rollback estrutural aplicado. Texto puro antigo NÃO foi restaurado. Novas senhas voltam a ser gravadas em texto puro até reaplicar a Fase 2.';
END
$rb$;
NOTIFY pgrst, 'reload schema';
COMMIT;
