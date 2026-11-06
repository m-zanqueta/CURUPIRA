BEGIN;

-- Só a coordenação pode trocar o PET. O PET escolhido precisa estar livre
-- ou já vinculado à própria turma; a troca libera o PET anterior atomicamente.
CREATE OR REPLACE FUNCTION public.staff_atribuir_pet_turma(
  p_token text,
  p_turma_id bigint,
  p_pet_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_turma_id bigint;
  v_pet_id bigint;
BEGIN
  PERFORM public._staff_exigir(p_token, ARRAY['coordenador']);

  SELECT t.id INTO v_turma_id
    FROM public.turmas AS t
   WHERE t.id = p_turma_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404';
  END IF;

  SELECT p.id INTO v_pet_id
    FROM public.pets AS p
   WHERE p.id = p_pet_id
     AND (p.turma_id IS NULL OR p.turma_id = p_turma_id)
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pet_indisponivel' USING ERRCODE = 'PT409';
  END IF;

  UPDATE public.pets
     SET turma_id = NULL
   WHERE turma_id = p_turma_id AND id <> v_pet_id;

  UPDATE public.pets
     SET turma_id = p_turma_id
   WHERE id = v_pet_id;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_atribuir_pet_turma(text,bigint,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_atribuir_pet_turma(text,bigint,bigint) TO anon, authenticated;

COMMIT;
