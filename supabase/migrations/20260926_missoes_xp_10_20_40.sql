-- Atualiza o XP das missões para Fácil=10, Média=20 e Difícil=40.
-- Execute uma vez no SQL Editor do Supabase depois da migration inicial.
-- A atualização de missoes.xp aciona o trigger existente e ajusta os saldos
-- de alunos e PETs que já receberam XP por missões aprovadas.

ALTER TABLE public.missoes
  DROP CONSTRAINT IF EXISTS missoes_dificuldade_xp_check;

UPDATE public.missoes
SET xp = CASE dificuldade
  WHEN 'facil' THEN 10
  WHEN 'media' THEN 20
  WHEN 'dificil' THEN 40
  ELSE 20
END;

ALTER TABLE public.missoes
  ALTER COLUMN xp SET DEFAULT 20,
  ALTER COLUMN xp SET NOT NULL,
  ADD CONSTRAINT missoes_dificuldade_xp_check
    CHECK (
      (dificuldade = 'facil' AND xp = 10) OR
      (dificuldade = 'media' AND xp = 20) OR
      (dificuldade = 'dificil' AND xp = 40)
    );

CREATE OR REPLACE FUNCTION public.salvar_missao_com_turmas(
  p_missao_id bigint,
  p_professor_id bigint,
  p_nome text,
  p_descricao text,
  p_xp bigint,
  p_dificuldade text,
  p_icone text,
  p_ativa boolean,
  p_turmas_ids bigint[]
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_missao_id bigint;
  v_primeira_turma bigint;
BEGIN
  IF NOT (
    (p_dificuldade = 'facil' AND p_xp = 10) OR
    (p_dificuldade = 'media' AND p_xp = 20) OR
    (p_dificuldade = 'dificil' AND p_xp = 40)
  ) THEN
    RAISE EXCEPTION 'Dificuldade e XP não correspondem.';
  END IF;

  IF p_turmas_ids IS NULL OR cardinality(p_turmas_ids) = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos uma turma.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.icones_missoes
    WHERE icone = p_icone AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Selecione um ícone ativo do catálogo.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(p_turmas_ids) AS escolha(turma_id)
    LEFT JOIN public.turmas AS t
      ON t.id = escolha.turma_id AND t.professor_id = p_professor_id
    WHERE t.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Uma ou mais turmas não pertencem a este professor.';
  END IF;

  SELECT escolha.turma_id INTO v_primeira_turma
  FROM (SELECT DISTINCT unnest(p_turmas_ids) AS turma_id) AS escolha
  ORDER BY escolha.turma_id
  LIMIT 1;

  IF p_missao_id IS NULL THEN
    INSERT INTO public.missoes
      ("professorId", "turmaId", nome, descricao, xp, dificuldade, icone, ativa)
    VALUES
      (p_professor_id, v_primeira_turma, p_nome, p_descricao, p_xp, p_dificuldade, p_icone, p_ativa)
    RETURNING id INTO v_missao_id;
  ELSE
    UPDATE public.missoes
    SET "turmaId" = v_primeira_turma,
        nome = p_nome,
        descricao = p_descricao,
        xp = p_xp,
        dificuldade = p_dificuldade,
        icone = p_icone,
        ativa = p_ativa
    WHERE id = p_missao_id AND "professorId" = p_professor_id
    RETURNING id INTO v_missao_id;

    IF v_missao_id IS NULL THEN
      RAISE EXCEPTION 'Missão não encontrada ou não pertence a este professor.';
    END IF;

    DELETE FROM public.missoes_turmas WHERE missao_id = v_missao_id;
  END IF;

  INSERT INTO public.missoes_turmas (missao_id, turma_id)
  SELECT v_missao_id, escolhas.turma_id
  FROM (SELECT DISTINCT unnest(p_turmas_ids) AS turma_id) AS escolhas;

  RETURN v_missao_id;
END;
$$;
