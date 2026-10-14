-- Adiciona o papel de coordenador e cria a conta de teste solicitada.
ALTER TABLE public.professores
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'professor';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'professores_tipo_check'
      AND conrelid = 'public.professores'::regclass
  ) THEN
    ALTER TABLE public.professores
      ADD CONSTRAINT professores_tipo_check
      CHECK (tipo IN ('professor', 'coordenador', 'admin'));
  END IF;
END;
$$;

DO $$
DECLARE
  v_id bigint;
BEGIN
  SELECT id INTO v_id
  FROM public.professores
  WHERE lower(email) = 'coordenador@email.com'
  ORDER BY id
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.professores (nome, email, senha, tipo)
    VALUES ('Coordenador', 'coordenador@email.com', 'Coordenador123!', 'coordenador');
  ELSE
    UPDATE public.professores
    SET nome = 'Coordenador',
        email = 'coordenador@email.com',
        senha = 'Coordenador123!',
        tipo = 'coordenador'
    WHERE id = v_id;
  END IF;
END;
$$;
