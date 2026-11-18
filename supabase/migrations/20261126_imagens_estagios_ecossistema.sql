BEGIN;

-- Cinco imagens configuráveis pelo administrador para mostrar a recuperação do bioma.
ALTER TABLE public.missoes
  ADD COLUMN IF NOT EXISTS imagens_estagio jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Não mantém a assinatura antiga: toda edição administrativa passa a salvar também
-- as cinco imagens obrigatórias, sem permitir gravação direta pelo cliente.
DROP FUNCTION IF EXISTS public.staff_salvar_tarefa_global(text,bigint,text,text,jsonb,bigint,text,boolean);
CREATE OR REPLACE FUNCTION public.staff_salvar_tarefa_global(
  p_token text,
  p_missao_id bigint,
  p_nome text,
  p_descricao text,
  p_etapas jsonb,
  p_moedas bigint,
  p_icone text,
  p_ativa boolean,
  p_imagens_estagio jsonb
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
  IF p_imagens_estagio IS NULL OR jsonb_typeof(p_imagens_estagio) <> 'array'
     OR jsonb_array_length(p_imagens_estagio) <> 5 THEN
    RAISE EXCEPTION 'imagens_estagio_invalidas' USING ERRCODE = 'PT422';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_imagens_estagio) AS item(value)
    WHERE jsonb_typeof(item.value) <> 'string'
       OR btrim(item.value #>> '{}') !~ '^https://[^/]+/storage/v1/object/public/pets-images/estagios-missoes/[0-9]{13}-[a-f0-9]{16}\.(png|jpg|webp|gif)$'
  ) THEN
    RAISE EXCEPTION 'imagens_estagio_invalidas' USING ERRCODE = 'PT422';
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
      'titulo', v_titulo, 'descricao', v_desc_tarefa,
      'moedas', v_moedas_tarefa::bigint, 'xp', 0, 'ordem', v_i
    ));
  END LOOP;

  IF p_missao_id IS NULL THEN
    INSERT INTO public.missoes
      (nome, descricao, etapas, moedas, xp, dificuldade, icone, ativa, "professorId", "turmaId", imagens_estagio)
    VALUES
      (v_nome, v_desc, v_et, p_moedas, 0, 'media', p_icone, COALESCE(p_ativa, true), NULL, NULL, p_imagens_estagio)
    RETURNING to_jsonb(missoes.*) INTO v_r;
  ELSE
    SELECT m."professorId" INTO v_dono FROM public.missoes m WHERE m.id = p_missao_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404'; END IF;
    IF v_dono IS NOT NULL THEN RAISE EXCEPTION 'tarefa_nao_global' USING ERRCODE = 'PT409'; END IF;
    UPDATE public.missoes
       SET nome = v_nome, descricao = v_desc, etapas = v_et,
           moedas = p_moedas, xp = 0, dificuldade = 'media', icone = p_icone,
           ativa = COALESCE(p_ativa, true), imagens_estagio = p_imagens_estagio
     WHERE id = p_missao_id
     RETURNING to_jsonb(missoes.*) INTO v_r;
  END IF;
  RETURN v_r;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_salvar_tarefa_global(text,bigint,text,text,jsonb,bigint,text,boolean,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_salvar_tarefa_global(text,bigint,text,text,jsonb,bigint,text,boolean,jsonb) TO anon, authenticated;

-- O aluno recebe só as URLs públicas das imagens, nunca os caminhos privados das evidências.
CREATE OR REPLACE FUNCTION public.aluno_minhas_missoes(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_aluno bigint := public._aluno_da_sessao(p_token); v_r jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',m.id,'nome',m.nome,'descricao',m.descricao,'xp',m.xp,
    'dificuldade',m.dificuldade,'icone',m.icone,'imagens_estagio',m.imagens_estagio,
    'etapas',m.etapas,'moedas',m.moedas,
    'status',COALESCE(am.status,'pendente'),'atualizado_em',am.atualizado_em,'xp_aluno',am.xp_aluno,
    'etapa_atual',am.etapa_atual,'etapas_status',COALESCE((SELECT jsonb_agg(jsonb_build_object('etapa_ordem',e.etapa_ordem,'status',e.status)
      ORDER BY e.etapa_ordem) FROM public.alunos_missoes_etapas e WHERE e.aluno_id=v_aluno AND e.missao_id=m.id),'[]'::jsonb)
  ) ORDER BY m.id DESC),'[]'::jsonb)
  INTO v_r FROM public.alunos a JOIN public.missoes_turmas mt ON mt.turma_id=a."turmaId" AND mt.ativa
  JOIN public.missoes m ON m.id=mt.missao_id AND m.ativa LEFT JOIN public.alunos_missoes am ON am.aluno_id=a.id AND am.missao_id=m.id
  WHERE a.id=v_aluno;
  RETURN v_r;
END;
$$;
REVOKE ALL ON FUNCTION public.aluno_minhas_missoes(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aluno_minhas_missoes(text) TO anon, authenticated;

-- Autoriza só o novo diretório de imagens e impede apagar arquivos ainda ligados a uma atividade.
CREATE OR REPLACE FUNCTION public.storage_autorizar_operacao(
  p_token text, p_operacao text, p_pasta text, p_caminho text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_papel text; v_id bigint;
BEGIN
  SELECT s.papel, s.usuario_id INTO v_papel, v_id
    FROM public._staff_exigir(p_token, ARRAY['admin']) s;
  IF p_operacao IS NULL OR p_operacao NOT IN ('upload','remover') THEN
    RAISE EXCEPTION 'operacao_invalida' USING ERRCODE = 'PT422';
  END IF;
  IF p_pasta IS NULL OR p_pasta NOT IN ('pets','icones-missoes','estagios-missoes','acessorios') THEN
    RAISE EXCEPTION 'pasta_invalida' USING ERRCODE = 'PT422';
  END IF;
  PERFORM public._limite_taxa('storage:' || p_operacao || ':' || v_id, 60, interval '15 minutes');
  IF p_operacao = 'remover' THEN
    IF p_caminho IS NULL OR p_caminho !~ ('^' || p_pasta || '/[0-9]{13}-[a-f0-9]{16}\.(png|jpg|webp|gif)$') THEN
      RAISE EXCEPTION 'caminho_invalido' USING ERRCODE = 'PT422';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pets p WHERE p.icone LIKE '%/' || p_caminho)
       OR EXISTS (SELECT 1 FROM public.acessorios a WHERE a.imagem_path = p_caminho)
       OR EXISTS (SELECT 1 FROM public.icones_missoes i WHERE i.icone LIKE '%/' || p_caminho)
       OR EXISTS (SELECT 1 FROM public.missoes m WHERE m.icone LIKE '%/' || p_caminho)
       OR EXISTS (
         SELECT 1 FROM public.missoes m,
           jsonb_array_elements_text(CASE WHEN jsonb_typeof(m.imagens_estagio) = 'array' THEN m.imagens_estagio ELSE '[]'::jsonb END) AS img(url)
         WHERE img.url LIKE '%/' || p_caminho
       ) THEN
      RAISE EXCEPTION 'objeto_em_uso' USING ERRCODE = 'PT409';
    END IF;
  END IF;
  RETURN jsonb_build_object('ok',true,'papel',v_papel,'usuario_id',v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.storage_autorizar_operacao(text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storage_autorizar_operacao(text,text,text,text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
