-- pets.id identifica o próprio PET e não deve referenciar turmas.id.
-- O vínculo PET–turma é feito por pets.turma_id.
ALTER TABLE public.pets
  DROP CONSTRAINT IF EXISTS pets_id_fkey;
