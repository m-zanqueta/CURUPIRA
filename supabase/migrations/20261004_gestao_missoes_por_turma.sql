-- Ativação por turma e remoção de vínculo com estorno do XP daquela turma.
-- Execute esta migration no SQL Editor do Supabase antes de publicar o app.

ALTER TABLE public.missoes_turmas
  ADD COLUMN IF NOT EXISTS ativa boolean NOT NULL DEFAULT true;

-- Converte pausas globais antigas em pausas por vínculo, sem exibir de novo
-- tarefas que já estavam ocultas antes desta migration.
UPDATE public.missoes_turmas AS mt
SET ativa = false
FROM public.missoes AS m
WHERE m.id = mt.missao_id AND m.ativa IS DISTINCT FROM true;

UPDATE public.missoes
SET ativa = true
WHERE ativa IS DISTINCT FROM true;

-- Só permite aprovar uma missão se ela estiver ativa para a turma do aluno.
CREATE OR REPLACE FUNCTION public.preparar_aluno_missao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_turma_id bigint;
  v_pet_id bigint;
  v_missao_xp bigint;
  v_missao_ativa boolean;
  v_vinculo_ativo boolean;
BEGIN
  IF NEW.status NOT IN ('pendente', 'entregue', 'aprovado') THEN
    RAISE EXCEPTION 'Status de missão inválido: %', NEW.status;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'aprovado' AND NEW.status <> 'aprovado' THEN
    IF EXISTS (
      SELECT 1 FROM public.missoes_turmas AS mt
      WHERE mt.missao_id = OLD.missao_id
        AND mt.turma_id = OLD.turma_id
        AND mt.ativa = false
    ) THEN
      RAISE EXCEPTION 'A tarefa está desativada nesta turma; a conclusão aprovada não pode ser alterada.';
    END IF;
    NEW.xp_aluno := 0;
    NEW.xp_pet := 0;
    NEW.turma_id := OLD.turma_id;
    NEW.pet_id := OLD.pet_id;
    NEW.atualizado_em := now();
    RETURN NEW;
  END IF;

  IF NEW.status = 'aprovado' THEN
    IF TG_OP = 'UPDATE' AND OLD.status = 'aprovado' THEN
      NEW.turma_id := OLD.turma_id;
      NEW.pet_id := OLD.pet_id;
    ELSE
      SELECT m.xp, m.ativa
        INTO v_missao_xp, v_missao_ativa
      FROM public.missoes AS m
      WHERE m.id = NEW.missao_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Missão não encontrada.';
      END IF;
      IF NOT COALESCE(v_missao_ativa, false) THEN
        RAISE EXCEPTION 'Esta missão está desativada.';
      END IF;

      SELECT a."turmaId" INTO v_turma_id
      FROM public.alunos AS a
      WHERE a.id = NEW.aluno_id;

      IF v_turma_id IS NULL THEN
        RAISE EXCEPTION 'O aluno não está associado a uma turma.';
      END IF;

      SELECT mt.ativa INTO v_vinculo_ativo
      FROM public.missoes_turmas AS mt
      WHERE mt.missao_id = NEW.missao_id AND mt.turma_id = v_turma_id;

      IF NOT FOUND OR NOT COALESCE(v_vinculo_ativo, false) THEN
        RAISE EXCEPTION 'Esta missão não está ativa para a turma do aluno.';
      END IF;

      SELECT p.id INTO v_pet_id
      FROM public.pets AS p
      WHERE p.turma_id = v_turma_id
      FOR UPDATE;

      IF v_pet_id IS NULL THEN
        RAISE EXCEPTION 'A turma do aluno não tem um PET vinculado.';
      END IF;

      NEW.turma_id := v_turma_id;
      NEW.pet_id := v_pet_id;
      NEW.xp_aluno := v_missao_xp;
      NEW.xp_pet := v_missao_xp;
    END IF;
  ELSE
    IF TG_OP = 'INSERT' OR OLD.status <> 'aprovado' THEN
      SELECT a."turmaId" INTO NEW.turma_id
      FROM public.alunos AS a
      WHERE a.id = NEW.aluno_id;
    END IF;
    IF NEW.status = 'entregue' AND NOT EXISTS (
      SELECT 1 FROM public.missoes_turmas AS mt
      WHERE mt.missao_id = NEW.missao_id
        AND mt.turma_id = NEW.turma_id
        AND mt.ativa = true
    ) THEN
      RAISE EXCEPTION 'Esta tarefa está desativada ou não vinculada à turma; novos envios estão bloqueados.';
    END IF;
    NEW.pet_id := NULL;
    NEW.xp_aluno := 0;
    NEW.xp_pet := 0;
  END IF;

  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

-- A edição da lista de turmas remove progresso e reverte XP apenas nas turmas
-- que perderam o vínculo; vínculos mantidos preservam seu status ativo/inativo.
CREATE OR REPLACE FUNCTION public.definir_turmas_missao(
  p_missao_id bigint,
  p_professor_id bigint,
  p_turmas_ids bigint[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_primeira_turma bigint;
  v_turmas_ids bigint[] := COALESCE(p_turmas_ids, ARRAY[]::bigint[]);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.missoes
    WHERE id = p_missao_id AND "professorId" = p_professor_id
  ) THEN
    RAISE EXCEPTION 'Missão não encontrada ou não pertence a este professor.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_turmas_ids) AS escolha(turma_id)
    LEFT JOIN public.turmas AS t
      ON t.id = escolha.turma_id AND t.professor_id = p_professor_id
    WHERE t.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Uma ou mais turmas não pertencem a este professor.';
  END IF;

  DELETE FROM public.alunos_missoes AS am
  USING public.missoes_turmas AS mt
  WHERE mt.missao_id = p_missao_id
    AND am.missao_id = p_missao_id
    AND (
      am.turma_id = mt.turma_id
      OR EXISTS (
        SELECT 1 FROM public.alunos AS a
        WHERE a.id = am.aluno_id AND a."turmaId" = mt.turma_id
      )
    )
    AND NOT (mt.turma_id = ANY(v_turmas_ids));

  DELETE FROM public.missoes_turmas AS mt
  WHERE mt.missao_id = p_missao_id
    AND NOT (mt.turma_id = ANY(v_turmas_ids));

  INSERT INTO public.missoes_turmas (missao_id, turma_id)
  SELECT p_missao_id, escolhas.turma_id
  FROM (SELECT DISTINCT unnest(v_turmas_ids) AS turma_id) AS escolhas
  ON CONFLICT (missao_id, turma_id) DO NOTHING;

  SELECT turma_id INTO v_primeira_turma
  FROM (SELECT DISTINCT unnest(v_turmas_ids) AS turma_id) AS escolhas
  ORDER BY turma_id
  LIMIT 1;

  UPDATE public.missoes
  SET "turmaId" = v_primeira_turma
  WHERE id = p_missao_id AND "professorId" = p_professor_id;
END;
$$;

-- Persiste missão e seus vínculos sem reativar vínculos existentes.
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
  v_turmas_ids bigint[] := COALESCE(p_turmas_ids, ARRAY[]::bigint[]);
BEGIN
  IF NOT (
    (p_dificuldade = 'facil' AND p_xp = 10) OR
    (p_dificuldade = 'media' AND p_xp = 20) OR
    (p_dificuldade = 'dificil' AND p_xp = 40)
  ) THEN
    RAISE EXCEPTION 'Dificuldade e XP não correspondem.';
  END IF;

  IF p_missao_id IS NULL AND cardinality(v_turmas_ids) = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos uma turma para criar a missão.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.icones_missoes
    WHERE icone = p_icone AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Selecione um ícone ativo do catálogo.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_turmas_ids) AS escolha(turma_id)
    LEFT JOIN public.turmas AS t
      ON t.id = escolha.turma_id AND t.professor_id = p_professor_id
    WHERE t.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Uma ou mais turmas não pertencem a este professor.';
  END IF;

  SELECT turma_id INTO v_primeira_turma
  FROM (SELECT DISTINCT unnest(v_turmas_ids) AS turma_id) AS escolhas
  ORDER BY turma_id
  LIMIT 1;

  IF p_missao_id IS NULL THEN
    INSERT INTO public.missoes
      ("professorId", "turmaId", nome, descricao, xp, dificuldade, icone, ativa)
    VALUES
      (p_professor_id, v_primeira_turma, p_nome, p_descricao, p_xp, p_dificuldade, p_icone, COALESCE(p_ativa, true))
    RETURNING id INTO v_missao_id;
  ELSE
    UPDATE public.missoes
    SET "turmaId" = v_primeira_turma,
        nome = p_nome,
        descricao = p_descricao,
        xp = p_xp,
        dificuldade = p_dificuldade,
        icone = p_icone,
        ativa = COALESCE(p_ativa, true)
    WHERE id = p_missao_id AND "professorId" = p_professor_id
    RETURNING id INTO v_missao_id;

    IF v_missao_id IS NULL THEN
      RAISE EXCEPTION 'Missão não encontrada ou não pertence a este professor.';
    END IF;

    DELETE FROM public.alunos_missoes AS am
    USING public.missoes_turmas AS mt
    WHERE mt.missao_id = v_missao_id
      AND am.missao_id = v_missao_id
      AND am.turma_id = mt.turma_id
      AND NOT (mt.turma_id = ANY(v_turmas_ids));

    DELETE FROM public.missoes_turmas AS mt
    WHERE mt.missao_id = v_missao_id
      AND NOT (mt.turma_id = ANY(v_turmas_ids));
  END IF;

  INSERT INTO public.missoes_turmas (missao_id, turma_id)
  SELECT v_missao_id, escolhas.turma_id
  FROM (SELECT DISTINCT unnest(v_turmas_ids) AS turma_id) AS escolhas
  ON CONFLICT (missao_id, turma_id) DO NOTHING;

  RETURN v_missao_id;
END;
$$;

-- Desvincular apaga o histórico daquela turma. O gatilho de alunos_missoes
-- subtrai automaticamente XP do aluno e do PET que recebeu essa recompensa.
CREATE OR REPLACE FUNCTION public.remover_missao_da_turma(
  p_missao_id bigint,
  p_professor_id bigint,
  p_turma_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proxima_turma bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.missoes AS m
    JOIN public.missoes_turmas AS mt ON mt.missao_id = m.id
    JOIN public.turmas AS t ON t.id = mt.turma_id
    WHERE m.id = p_missao_id
      AND m."professorId" = p_professor_id
      AND mt.turma_id = p_turma_id
      AND t.professor_id = p_professor_id
  ) THEN
    RAISE EXCEPTION 'Esta missão não está vinculada a uma turma deste professor.';
  END IF;

  DELETE FROM public.alunos_missoes AS am
  USING public.alunos AS a
  WHERE am.missao_id = p_missao_id
    AND a.id = am.aluno_id
    AND (am.turma_id = p_turma_id OR a."turmaId" = p_turma_id);

  DELETE FROM public.missoes_turmas
  WHERE missao_id = p_missao_id AND turma_id = p_turma_id;

  SELECT turma_id INTO v_proxima_turma
  FROM public.missoes_turmas
  WHERE missao_id = p_missao_id
  ORDER BY turma_id
  LIMIT 1;

  UPDATE public.missoes
  SET "turmaId" = v_proxima_turma
  WHERE id = p_missao_id AND "professorId" = p_professor_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.definir_ativa_missao_turma(
  p_missao_id bigint,
  p_professor_id bigint,
  p_turma_id bigint,
  p_ativa boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.missoes_turmas AS mt
  SET ativa = p_ativa
  FROM public.missoes AS m, public.turmas AS t
  WHERE mt.missao_id = p_missao_id
    AND mt.turma_id = p_turma_id
    AND m.id = mt.missao_id
    AND m."professorId" = p_professor_id
    AND t.id = mt.turma_id
    AND t.professor_id = p_professor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta missão não está vinculada a uma turma deste professor.';
  END IF;
END;
$$;
