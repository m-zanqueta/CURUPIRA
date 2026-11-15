-- Recompensas independentes por tarefa e bônus final da trilha.
-- Tarefa concluída credita moedas imediatamente; aprovação credita o bônus da trilha.

ALTER TABLE public.alunos_missoes_etapas
  ADD COLUMN IF NOT EXISTS moedas bigint NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.alunos_missoes_etapas'::regclass
      AND conname = 'alunos_missoes_etapas_moedas_check'
  ) THEN
    ALTER TABLE public.alunos_missoes_etapas
      ADD CONSTRAINT alunos_missoes_etapas_moedas_check CHECK (moedas >= 0);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.aplicar_moedas_etapa_tarefa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_delta bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_delta := NEW.moedas;
    IF v_delta <> 0 THEN
      UPDATE public.alunos SET moedas = GREATEST(COALESCE(moedas, 0) + v_delta, 0) WHERE id = NEW.aluno_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_delta := -OLD.moedas;
    IF v_delta <> 0 THEN
      UPDATE public.alunos SET moedas = GREATEST(COALESCE(moedas, 0) + v_delta, 0) WHERE id = OLD.aluno_id;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.aluno_id IS DISTINCT FROM NEW.aluno_id THEN
    UPDATE public.alunos SET moedas = GREATEST(COALESCE(moedas, 0) - OLD.moedas, 0) WHERE id = OLD.aluno_id;
    UPDATE public.alunos SET moedas = GREATEST(COALESCE(moedas, 0) + NEW.moedas, 0) WHERE id = NEW.aluno_id;
  ELSE
    v_delta := NEW.moedas - OLD.moedas;
    IF v_delta <> 0 THEN
      UPDATE public.alunos SET moedas = GREATEST(COALESCE(moedas, 0) + v_delta, 0) WHERE id = NEW.aluno_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS alunos_missoes_etapas_aplicar_moedas ON public.alunos_missoes_etapas;
CREATE TRIGGER alunos_missoes_etapas_aplicar_moedas
AFTER INSERT OR UPDATE OR DELETE ON public.alunos_missoes_etapas
FOR EACH ROW EXECUTE FUNCTION public.aplicar_moedas_etapa_tarefa();
REVOKE ALL ON FUNCTION public.aplicar_moedas_etapa_tarefa() FROM PUBLIC, anon, authenticated;

-- Mantém o bônus de trilha sincronizado para alunos que já a concluíram.
CREATE OR REPLACE FUNCTION public.preparar_moedas_tarefa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'aprovado' THEN
    SELECT COALESCE(m.moedas, 0) INTO NEW.moedas_aluno
    FROM public.missoes m WHERE m.id = NEW.missao_id;
  ELSE
    NEW.moedas_aluno := 0;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.preparar_moedas_tarefa() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sincronizar_bonus_trilha_moedas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.moedas IS DISTINCT FROM OLD.moedas THEN
    UPDATE public.alunos_missoes
    SET moedas_aluno = NEW.moedas
    WHERE missao_id = NEW.id AND status = 'aprovado'
      AND moedas_aluno IS DISTINCT FROM NEW.moedas;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sincronizar_bonus_trilha_moedas() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS missoes_sincronizar_bonus_moedas ON public.missoes;
CREATE TRIGGER missoes_sincronizar_bonus_moedas
AFTER UPDATE OF moedas ON public.missoes
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_bonus_trilha_moedas();

-- Recalcula o crédito de tarefas já concluídas quando o ADM altera seus valores.
CREATE OR REPLACE FUNCTION public.sincronizar_moedas_tarefas_editadas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.etapas IS DISTINCT FROM OLD.etapas THEN
    UPDATE public.alunos_missoes_etapas AS e
       SET moedas = COALESCE((NEW.etapas -> (e.etapa_ordem - 1) ->> 'moedas')::bigint, 0)
     WHERE e.missao_id = NEW.id
       AND e.moedas IS DISTINCT FROM COALESCE((NEW.etapas -> (e.etapa_ordem - 1) ->> 'moedas')::bigint, 0);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sincronizar_moedas_tarefas_editadas() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS missoes_sincronizar_moedas_tarefas ON public.missoes;
CREATE TRIGGER missoes_sincronizar_moedas_tarefas
AFTER UPDATE OF etapas ON public.missoes
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_moedas_tarefas_editadas();

CREATE OR REPLACE FUNCTION public.staff_salvar_tarefa_global(
  p_token text,
  p_missao_id bigint,
  p_nome text,
  p_descricao text,
  p_etapas jsonb,
  p_moedas bigint,
  p_icone text,
  p_ativa boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nome text := btrim(COALESCE(p_nome, ''));
  v_desc text := btrim(COALESCE(p_descricao, ''));
  v_et jsonb := '[]'::jsonb;
  e jsonb;
  v_i int := 0;
  v_titulo text;
  v_desc_tarefa text;
  v_moedas_tarefa numeric;
  v_dono bigint;
  v_r jsonb;
BEGIN
  PERFORM 1 FROM public._staff_exigir(p_token, ARRAY['admin']);
  IF v_nome = '' OR v_desc = '' OR length(v_nome) > 120 OR length(v_desc) > 2000 THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'PT422';
  END IF;
  IF p_moedas IS NULL OR p_moedas < 0 OR p_moedas > 100000 THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'PT422';
  END IF;
  IF p_icone IS NULL OR btrim(p_icone) = '' OR length(p_icone) > 1000 THEN
    RAISE EXCEPTION 'icone_invalido' USING ERRCODE = 'PT422';
  END IF;
  IF p_etapas IS NULL OR jsonb_typeof(p_etapas) <> 'array'
     OR jsonb_array_length(p_etapas) NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'PT422';
  END IF;

  FOR e IN SELECT value FROM jsonb_array_elements(p_etapas) AS etapa(value) LOOP
    IF jsonb_typeof(e) <> 'object'
       OR jsonb_typeof(e->'titulo') <> 'string'
       OR jsonb_typeof(e->'descricao') <> 'string'
       OR jsonb_typeof(e->'moedas') <> 'number' THEN
      RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'PT422';
    END IF;
    v_titulo := btrim(e->>'titulo');
    v_desc_tarefa := btrim(e->>'descricao');
    v_moedas_tarefa := (e->>'moedas')::numeric;
    IF v_titulo = '' OR v_desc_tarefa = '' OR length(v_titulo) > 200
       OR length(v_desc_tarefa) > 2000 OR v_moedas_tarefa < 0
       OR v_moedas_tarefa > 100000 OR v_moedas_tarefa <> trunc(v_moedas_tarefa) THEN
      RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'PT422';
    END IF;
    v_i := v_i + 1;
    v_et := v_et || jsonb_build_array(jsonb_build_object(
      'titulo', v_titulo,
      'descricao', v_desc_tarefa,
      'moedas', v_moedas_tarefa::bigint,
      'xp', 0,
      'ordem', v_i
    ));
  END LOOP;

  IF p_missao_id IS NULL THEN
    INSERT INTO public.missoes
      (nome, descricao, etapas, moedas, xp, dificuldade, icone, ativa, "professorId", "turmaId")
    VALUES
      (v_nome, v_desc, v_et, p_moedas, 0, 'media', p_icone, COALESCE(p_ativa, true), NULL, NULL)
    RETURNING to_jsonb(missoes.*) INTO v_r;
  ELSE
    SELECT m."professorId" INTO v_dono FROM public.missoes m WHERE m.id = p_missao_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404'; END IF;
    IF v_dono IS NOT NULL THEN RAISE EXCEPTION 'tarefa_nao_global' USING ERRCODE = 'PT409'; END IF;
    UPDATE public.missoes
       SET nome = v_nome, descricao = v_desc, etapas = v_et,
           moedas = p_moedas, xp = 0, dificuldade = 'media', icone = p_icone,
           ativa = COALESCE(p_ativa, true)
     WHERE id = p_missao_id
     RETURNING to_jsonb(missoes.*) INTO v_r;
  END IF;
  RETURN v_r;
END;
$$;

CREATE OR REPLACE FUNCTION public.aluno_avancar_etapa(p_token text, p_missao_id bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_aluno bigint := public._aluno_da_sessao(p_token);
  v_turma bigint;
  v_pet bigint;
  v_status text;
  v_atual integer;
  v_etapas jsonb;
  v_prox integer;
  v_moedas bigint;
BEGIN
  SELECT a."turmaId" INTO v_turma FROM public.alunos a WHERE a.id = v_aluno;
  IF v_turma IS NULL THEN RAISE EXCEPTION 'sem_turma' USING ERRCODE = 'PT409'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.missoes_turmas mt
                 WHERE mt.missao_id = p_missao_id AND mt.turma_id = v_turma AND mt.ativa) THEN
    RAISE EXCEPTION 'tarefa_inativa' USING ERRCODE = 'PT409';
  END IF;
  SELECT m.etapas INTO v_etapas FROM public.missoes m WHERE m.id = p_missao_id AND m.ativa;
  IF v_etapas IS NULL OR jsonb_typeof(v_etapas) <> 'array' OR jsonb_array_length(v_etapas) = 0 THEN
    RAISE EXCEPTION 'sem_etapas' USING ERRCODE = 'PT409';
  END IF;
  SELECT p.id INTO v_pet FROM public.pets p WHERE p.turma_id = v_turma ORDER BY p.id LIMIT 1;
  IF v_pet IS NULL THEN RAISE EXCEPTION 'turma_sem_pet' USING ERRCODE = 'PT409'; END IF;

  SELECT am.status, am.etapa_atual INTO v_status, v_atual
  FROM public.alunos_missoes am
  WHERE am.aluno_id = v_aluno AND am.missao_id = p_missao_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.alunos_missoes (aluno_id, missao_id, status)
    VALUES (v_aluno, p_missao_id, 'pendente');
    v_atual := 0;
    v_status := 'pendente';
  END IF;
  IF v_status <> 'pendente' THEN RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = 'PT409'; END IF;
  IF v_atual >= jsonb_array_length(v_etapas) THEN RAISE EXCEPTION 'etapas_concluidas' USING ERRCODE = 'PT409'; END IF;

  v_prox := v_atual + 1;
  v_moedas := COALESCE((v_etapas -> v_atual ->> 'moedas')::bigint, 0);
  UPDATE public.alunos_missoes SET etapa_atual = v_prox
  WHERE aluno_id = v_aluno AND missao_id = p_missao_id;
  INSERT INTO public.alunos_missoes_etapas (aluno_id, missao_id, etapa_ordem, turma_id, pet_id, xp, moedas)
  VALUES (v_aluno, p_missao_id, v_prox, v_turma, v_pet, 0, v_moedas);
  RETURN v_prox;
END;
$$;

NOTIFY pgrst, 'reload schema';
