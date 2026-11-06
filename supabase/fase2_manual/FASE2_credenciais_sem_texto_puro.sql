-- ATENÇÃO: este arquivo fica FORA de supabase/migrations de propósito (a CLI do Supabase aplicaria tudo que estivesse lá). Aplicação MANUAL.
-- =============================================================================
-- FASE 2 (MANUAL, OPCIONAL, SÓ APÓS HOMOLOGAÇÃO) — remove a senha em TEXTO PURO de public.alunos.
-- NÃO faz parte da migration principal e NÃO deve ser aplicada junto com ela.
--
-- Pré-requisitos (verifique antes):
--   1. A migration 20261016_persistencia_inventario_equipados.sql já está aplicada e validada.
--   2. O app novo (login via RPC login_aluno) está publicado para TODOS os usuários. Versões antigas do app
--      (login direto na tabela: .eq('senha', ...)) deixam de conseguir entrar de aluno depois desta fase.
--   3. Backup do banco confirmado (esta fase também cria um backup interno, ver abaixo).
--   4. Equipe ciente de que o painel ADM deixa de mostrar a senha atual do aluno (campo vazio); digitar uma
--      nova senha continua funcionando (o gatilho grava o hash e zera o texto puro).
--
-- O que faz (tudo numa transação; falhou = nada muda):
--   a) gera o hash de todo aluno que ainda não tem (custo 10: pode levar alguns minutos com muitos alunos);
--   b) copia (id, senha) para public.alunos_senha_legado_backup (RLS ligado, sem grants) — RECUPERAÇÃO;
--   c) permite senha NULL (ALTER ... DROP NOT NULL, reversível);
--   d) zera alunos.senha;
--   e) troca o gatilho para zerar o texto puro em toda escrita futura (cadastro/painel), após gravar o hash.
-- Reversão: fase2_manual/FASE2_ROLLBACK.sql. Depois de validar por alguns dias, descarte o backup com
--   DROP TABLE public.alunos_senha_legado_backup;   (decisão da equipe — leva o texto puro junto)
-- Fora do escopo: public.professores.senha continua em texto puro (login_professor ainda não existe).
-- =============================================================================
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.alunos_credenciais') IS NULL THEN
    RAISE EXCEPTION 'Aplique antes a migration principal (alunos_credenciais não existe)';
  END IF;
  IF to_regclass('public.alunos_senha_legado_backup') IS NOT NULL THEN
    RAISE EXCEPTION 'FASE 2 já aplicada (backup existe)';
  END IF;
END $$;

-- a) hash para quem ainda não tem
INSERT INTO public.alunos_credenciais (aluno_id, senha_hash)
SELECT a.id, extensions.crypt(a.senha, extensions.gen_salt('bf', 10))
FROM public.alunos a
WHERE a.senha IS NOT NULL AND a.senha <> ''
  AND NOT EXISTS (SELECT 1 FROM public.alunos_credenciais c WHERE c.aluno_id = a.id);

-- b) backup trancado
CREATE TABLE public.alunos_senha_legado_backup AS
  SELECT id AS aluno_id, senha, now() AS copiado_em FROM public.alunos WHERE senha IS NOT NULL;
ALTER TABLE public.alunos_senha_legado_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.alunos_senha_legado_backup FROM PUBLIC, anon, authenticated;

-- verificação antes de apagar: toda senha não vazia tem hash
DO $$
DECLARE v_faltam bigint;
BEGIN
  SELECT count(*) INTO v_faltam FROM public.alunos a
  WHERE a.senha IS NOT NULL AND a.senha <> ''
    AND NOT EXISTS (SELECT 1 FROM public.alunos_credenciais c WHERE c.aluno_id = a.id);
  IF v_faltam > 0 THEN RAISE EXCEPTION '% aluno(s) sem credencial; abortando', v_faltam; END IF;
END $$;

-- c) + d)
ALTER TABLE public.alunos ALTER COLUMN senha DROP NOT NULL;
UPDATE public.alunos SET senha = NULL WHERE senha IS NOT NULL;

-- e) gatilho que zera o texto puro depois de gravar o hash
CREATE OR REPLACE FUNCTION public.sincronizar_credencial_aluno()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.senha IS NULL OR NEW.senha = '' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND OLD.senha IS NOT DISTINCT FROM NEW.senha THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' THEN   -- senha trocada: derruba as sessões abertas (token antigo deixa de valer)
    UPDATE public.alunos_sessoes SET revogado_em = now() WHERE aluno_id = NEW.id AND revogado_em IS NULL;
  END IF;
  BEGIN
    INSERT INTO public.alunos_credenciais (aluno_id, senha_hash)
    VALUES (NEW.id, extensions.crypt(NEW.senha, extensions.gen_salt('bf', 10)))
    ON CONFLICT (aluno_id) DO UPDATE
      SET senha_hash = EXCLUDED.senha_hash, atualizado_em = now();
    UPDATE public.alunos SET senha = NULL WHERE id = NEW.id AND senha IS NOT NULL;  -- só após o hash gravado
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'nao foi possivel gravar a credencial (sqlstate %)', SQLSTATE;  -- aqui NÃO há fallback: sem hash não há login
  END;
  RETURN NULL;
END;
$$;

COMMIT;
