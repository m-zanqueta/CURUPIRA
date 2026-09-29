-- Executar no SQL Editor do Supabase antes de remover pets.cor.
-- Armazena o nome do PET e move a cor para a tabela turmas.

ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS nome text;

ALTER TABLE public.turmas
  ADD COLUMN IF NOT EXISTS cor text DEFAULT '#009D25';

-- Preserva as cores atuais das turmas, se pets.cor ainda existir.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pets'
      AND column_name = 'cor'
  ) THEN
    EXECUTE $copy$
      UPDATE public.turmas AS t
      SET cor = p.cor
      FROM public.pets AS p
      WHERE p.turma_id = t.id
        AND p.cor IS NOT NULL
    $copy$;
  END IF;
END;
$$;

UPDATE public.pets SET xp = 0 WHERE xp IS NULL;
UPDATE public.pets
SET estagio = CASE lower(coalesce(estagio, ''))
  WHEN 'jovem' THEN 'jovem'
  WHEN 'adulto' THEN 'adulto'
  WHEN 'adult' THEN 'adulto'
  WHEN 'lendário' THEN 'adulto'
  WHEN 'lendario' THEN 'adulto'
  ELSE 'infantil'
END;

ALTER TABLE public.pets
  ALTER COLUMN xp SET DEFAULT 0,
  ALTER COLUMN estagio SET DEFAULT 'infantil',
  ALTER COLUMN estagio SET NOT NULL,
  ALTER COLUMN emocao DROP DEFAULT;

ALTER TABLE public.pets
  DROP CONSTRAINT IF EXISTS pets_estagio_allowed_check,
  ADD CONSTRAINT pets_estagio_allowed_check
    CHECK (estagio IN ('infantil', 'jovem', 'adulto'));

ALTER TABLE public.turmas
  ALTER COLUMN cor SET DEFAULT '#009D25',
  ALTER COLUMN cor SET NOT NULL;

-- Bucket público para que as URLs das imagens possam ser exibidas no app.
INSERT INTO storage.buckets (id, name, public)
VALUES ('pets-images', 'pets-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- A política de escrita para anon foi autorizada pelo usuário para este fluxo.
DROP POLICY IF EXISTS "Permitir upload público de imagens PET" ON storage.objects;
CREATE POLICY "Permitir upload público de imagens PET"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'pets-images');
