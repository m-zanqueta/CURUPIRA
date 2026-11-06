-- ATENÇÃO: este arquivo fica FORA de supabase/migrations de propósito (a CLI do Supabase aplicaria tudo que estivesse lá). Aplicação MANUAL.
-- Reverte a FASE 2: restaura alunos.senha a partir do backup trancado e volta o gatilho ao comportamento
-- da migration principal (hash sincronizado, texto puro mantido). Não remove hashes.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.alunos_senha_legado_backup') IS NULL THEN
    RAISE EXCEPTION 'Backup inexistente: a FASE 2 não foi aplicada (ou o backup já foi descartado)';
  END IF;
END $$;

-- 1) o gatilho volta a NÃO zerar o texto puro (assim o UPDATE abaixo não é desfeito)
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
  EXCEPTION WHEN OTHERS THEN
    DELETE FROM public.alunos_credenciais WHERE aluno_id = NEW.id;
    RAISE WARNING 'credencial do aluno % nao sincronizada (sqlstate %)', NEW.id, SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

-- 2) restaura só quem ainda está com senha nula E cuja credencial NÃO mudou depois do backup (quem trocou a senha
--    depois da fase 2 manteria a senha antiga; essas contas ficam como estão e são listadas no aviso).
UPDATE public.alunos a SET senha = b.senha
FROM public.alunos_senha_legado_backup b
WHERE a.id = b.aluno_id AND a.senha IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.alunos_credenciais c WHERE c.aluno_id = a.id AND c.atualizado_em > b.copiado_em);
DO $$
DECLARE v_ids text;
BEGIN
  SELECT string_agg(a.id::text, ',') INTO v_ids FROM public.alunos a
  JOIN public.alunos_credenciais c ON c.aluno_id = a.id WHERE a.senha IS NULL;
  IF v_ids IS NOT NULL THEN
    RAISE NOTICE 'Alunos que trocaram a senha depois da FASE 2 (texto puro NÃO restaurado; só entram pelo login_aluno): %', v_ids;
  END IF;
END $$;
-- (NOT NULL NÃO é recolocado automaticamente: confira se há linhas nulas antes de decidir.)
-- O backup é mantido; descarte manualmente quando a equipe decidir: DROP TABLE public.alunos_senha_legado_backup;
COMMIT;
