-- Trilhas configuráveis: título/descrição da trilha e título/descrição em cada tarefa.
-- Tarefas novas deixam de conceder XP. A recompensa é em moedas após aprovação,
-- usando os gatilhos já existentes em alunos_missoes. A loja passa a usar esse saldo.

-- Compras antigas foram pagas com XP. Compensa o histórico no saldo bruto de moedas
-- uma única vez, para elas não consumirem as moedas ganhas nas trilhas.
ALTER TABLE public.alunos_itens
  ADD COLUMN IF NOT EXISTS estornado boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.curupira_migracoes_economia (
  codigo text PRIMARY KEY,
  aplicado_em timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.curupira_migracoes_economia FROM PUBLIC, anon, authenticated;
ALTER TABLE public.curupira_migracoes_economia ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.curupira_migracoes_economia
    WHERE codigo = 'loja_saldo_moedas_v1'
  ) THEN
    UPDATE public.alunos AS a
       SET moedas = COALESCE(a.moedas, 0) + COALESCE((
         SELECT sum(i.preco_pago)
         FROM public.alunos_itens AS i
         WHERE i.aluno_id = a.id AND NOT i.estornado
       ), 0);

    INSERT INTO public.curupira_migracoes_economia (codigo)
    VALUES ('loja_saldo_moedas_v1');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._saldo_aluno(p_aluno bigint)
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT GREATEST(
    COALESCE((SELECT a.moedas FROM public.alunos a WHERE a.id = p_aluno), 0)::bigint
      - COALESCE((SELECT sum(i.preco_pago) FROM public.alunos_itens i
                  WHERE i.aluno_id = p_aluno AND NOT i.estornado), 0)::bigint,
    0
  );
$$;
REVOKE ALL ON FUNCTION public._saldo_aluno(bigint) FROM PUBLIC, anon, authenticated;

UPDATE public.missoes AS m
SET etapas = (
  SELECT COALESCE(
    jsonb_agg(
      e || jsonb_build_object('descricao', COALESCE(e->>'descricao', ''))
      ORDER BY posicao
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(m.etapas) WITH ORDINALITY AS item(e, posicao)
)
WHERE jsonb_typeof(m.etapas) = 'array';

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
  IF p_icone IS NOT NULL AND length(p_icone) > 1000 THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'PT422';
  END IF;
  IF p_etapas IS NULL OR jsonb_typeof(p_etapas) <> 'array'
     OR jsonb_array_length(p_etapas) NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'PT422';
  END IF;

  FOR e IN SELECT value FROM jsonb_array_elements(p_etapas) AS etapa(value) LOOP
    IF jsonb_typeof(e) <> 'object'
       OR jsonb_typeof(e->'titulo') <> 'string'
       OR (e ? 'descricao' AND jsonb_typeof(e->'descricao') <> 'string') THEN
      RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'PT422';
    END IF;

    v_titulo := btrim(e->>'titulo');
    v_desc_tarefa := btrim(COALESCE(e->>'descricao', ''));
    IF v_titulo = '' OR v_desc_tarefa = '' OR length(v_titulo) > 200 OR length(v_desc_tarefa) > 2000 THEN
      RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'PT422';
    END IF;

    v_i := v_i + 1;
    -- xp=0 preserva compatibilidade com clientes antigos; nenhuma tarefa nova credita XP.
    v_et := v_et || jsonb_build_array(jsonb_build_object(
      'titulo', v_titulo,
      'descricao', v_desc_tarefa,
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
    SELECT m."professorId" INTO v_dono
    FROM public.missoes m
    WHERE m.id = p_missao_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404'; END IF;
    IF v_dono IS NOT NULL THEN RAISE EXCEPTION 'tarefa_nao_global' USING ERRCODE = 'PT409'; END IF;

    UPDATE public.missoes
       SET nome = v_nome,
           descricao = v_desc,
           etapas = v_et,
           moedas = p_moedas,
           xp = 0,
           dificuldade = 'media',
           icone = p_icone,
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
BEGIN
  SELECT a."turmaId" INTO v_turma FROM public.alunos a WHERE a.id = v_aluno;
  IF v_turma IS NULL THEN RAISE EXCEPTION 'sem_turma' USING ERRCODE = 'PT409'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.missoes_turmas mt
    WHERE mt.missao_id = p_missao_id AND mt.turma_id = v_turma AND mt.ativa
  ) THEN
    RAISE EXCEPTION 'tarefa_inativa' USING ERRCODE = 'PT409';
  END IF;

  SELECT m.etapas INTO v_etapas
  FROM public.missoes m
  WHERE m.id = p_missao_id AND m.ativa;
  IF v_etapas IS NULL OR jsonb_typeof(v_etapas) <> 'array' OR jsonb_array_length(v_etapas) = 0 THEN
    RAISE EXCEPTION 'sem_etapas' USING ERRCODE = 'PT409';
  END IF;

  SELECT p.id INTO v_pet FROM public.pets p WHERE p.turma_id = v_turma ORDER BY p.id LIMIT 1;
  IF v_pet IS NULL THEN RAISE EXCEPTION 'turma_sem_pet' USING ERRCODE = 'PT409'; END IF;

  SELECT am.status, am.etapa_atual INTO v_status, v_atual
  FROM public.alunos_missoes am
  WHERE am.aluno_id = v_aluno AND am.missao_id = p_missao_id
  FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.alunos_missoes (aluno_id, missao_id, status)
    VALUES (v_aluno, p_missao_id, 'pendente');
    v_atual := 0;
    v_status := 'pendente';
  END IF;
  IF v_status <> 'pendente' THEN RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = 'PT409'; END IF;
  IF v_atual >= jsonb_array_length(v_etapas) THEN RAISE EXCEPTION 'etapas_concluidas' USING ERRCODE = 'PT409'; END IF;

  v_prox := v_atual + 1;
  UPDATE public.alunos_missoes
  SET etapa_atual = v_prox
  WHERE aluno_id = v_aluno AND missao_id = p_missao_id;

  -- XP=0: os registros continuam marcando progresso, sem alterar XP do aluno ou do PET.
  INSERT INTO public.alunos_missoes_etapas (aluno_id, missao_id, etapa_ordem, turma_id, pet_id, xp)
  VALUES (v_aluno, p_missao_id, v_prox, v_turma, v_pet, 0);

  RETURN v_prox;
END;
$$;

NOTIFY pgrst, 'reload schema';
