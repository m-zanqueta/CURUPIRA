-- Permite o INSERT de PET feito pelo app com a chave pública anon.
-- Execute no SQL Editor do mesmo projeto Supabase configurado no app.

DROP POLICY IF EXISTS "app pode cadastrar PET" ON public.pets;
DROP POLICY IF EXISTS "validar cadastro inicial de PET" ON public.pets;

CREATE POLICY "app pode cadastrar PET"
  ON public.pets
  AS PERMISSIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
