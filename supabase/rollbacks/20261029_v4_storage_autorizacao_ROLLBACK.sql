-- Rollback da migration 20261029 (MANUAL): remove a função de autorização do Storage. A Edge Function imagens-admin deixa de funcionar
-- (todo upload/remoção pelo app será recusado). Isto NÃO reabre o upload anônimo: o bucket continua como está.
BEGIN;
DROP FUNCTION IF EXISTS public.storage_autorizar_operacao(text, text, text, text);
NOTIFY pgrst, 'reload schema';
COMMIT;
