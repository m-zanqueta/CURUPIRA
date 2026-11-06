-- ROLLBACK da migration 20261016_persistencia_inventario_equipados.sql
-- Remove SOMENTE o que ela criou. NÃO altera colunas de alunos (só remove o gatilho
-- alunos_sincroniza_credencial); não toca em acessorios, pets, turmas, missoes nem em
-- pets_acessorios_equipados.
-- ATENÇÃO: apaga o inventário/equipados que já estiverem na nuvem (alunos_itens, alunos_equipados),
-- as sessões e as credenciais (hash). Se já houve compras na nuvem, faça backup antes:
--   create table public.bkp_alunos_itens as select * from public.alunos_itens;  (e alunos_equipados)
-- Os dados locais antigos dos dispositivos continuam nas chaves backup_* do navegador/app.

BEGIN;

-- Trava de segurança: se a FASE 2 (senha em texto puro removida) está ativa, o hash em alunos_credenciais é a
-- ÚNICA forma de login. Reverta a FASE 2 antes (fase2_manual/FASE2_ROLLBACK.sql, que restaura alunos.senha).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.alunos_credenciais c JOIN public.alunos a ON a.id = c.aluno_id
             WHERE a.senha IS NULL OR a.senha = '') THEN
    RAISE EXCEPTION 'Há alunos sem senha em texto puro (FASE 2 ativa): rode antes fase2_manual/FASE2_ROLLBACK.sql';
  END IF;
END $$;

DROP TRIGGER IF EXISTS alunos_sincroniza_credencial ON public.alunos;
DROP FUNCTION IF EXISTS public.sincronizar_credencial_aluno();
DROP FUNCTION IF EXISTS public.importar_estado_local(text, bigint[], jsonb);
DROP FUNCTION IF EXISTS public.equipar_acessorio(text, bigint, text, bigint);
DROP FUNCTION IF EXISTS public.comprar_acessorio(text, bigint);
DROP FUNCTION IF EXISTS public.obter_estado_loja(text);
DROP FUNCTION IF EXISTS public.logout_aluno(text);
DROP FUNCTION IF EXISTS public.login_aluno(text, text);
DROP FUNCTION IF EXISTS public._saldo_aluno(bigint);
DROP FUNCTION IF EXISTS public._aluno_da_sessao(text);
DROP TABLE IF EXISTS public.alunos_equipados;      -- (o gatilho vai junto)
DROP FUNCTION IF EXISTS public.validar_aluno_equipado();
DROP TABLE IF EXISTS public.alunos_itens;
DROP TABLE IF EXISTS public.alunos_sessoes;
DROP TABLE IF EXISTS public.alunos_login_falhas;
DROP TABLE IF EXISTS public.alunos_credenciais;
NOTIFY pgrst, 'reload schema';
COMMIT;
