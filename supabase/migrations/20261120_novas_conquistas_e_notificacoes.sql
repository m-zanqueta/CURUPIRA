-- Conquistas de uso da loja e envio/correcao de tarefas, mais notificacoes individuais.
-- Todas as novas conquistas continuam sem XP.

ALTER TABLE public.regras_conquistas DROP CONSTRAINT IF EXISTS regras_conquistas_criterio_check;
ALTER TABLE public.regras_conquistas DROP CONSTRAINT IF EXISTS regras_conquistas_parametros_check;
ALTER TABLE public.regras_conquistas ADD CONSTRAINT regras_conquistas_criterio_check CHECK (criterio IN (
  'primeira_missao','total_missoes','acumular_xp','missao_especifica','xp_total','atividade_total',
  'horta_caseira','primeira_trilha','login_seguidos','pet_jovem','trilhas_total','xp_semana',
  'primeiro_passo','primeira_compra','primeiro_item_equipado','primeira_tarefa_enviada',
  'primeira_tarefa_aprovada','primeiro_chapeu_comprado','primeiro_colar_comprado',
  'primeiro_cenario_comprado','visual_completo','itens_comprados','primeiro_aprovado_turma',
  'turma_completa_tarefa'
));
ALTER TABLE public.regras_conquistas ADD CONSTRAINT regras_conquistas_parametros_check CHECK (
  (criterio IN ('primeira_missao','primeira_trilha','horta_caseira','pet_jovem','primeiro_passo',
    'primeira_compra','primeiro_item_equipado','primeira_tarefa_enviada','primeira_tarefa_aprovada',
    'primeiro_chapeu_comprado','primeiro_colar_comprado','primeiro_cenario_comprado','visual_completo',
    'primeiro_aprovado_turma','turma_completa_tarefa') AND meta IS NULL) OR
  (criterio IN ('total_missoes','acumular_xp','xp_total','atividade_total','login_seguidos','trilhas_total','xp_semana','itens_comprados') AND meta > 0) OR
  (criterio='missao_especifica' AND missao_id IS NOT NULL)
);

INSERT INTO public.regras_conquistas (codigo,titulo,descricao,criterio,meta,raridade,xp,icone,ativa) VALUES
 ('primeiro_passo','Primeiro Passo','Conhecer o seu PET','primeiro_passo',NULL,'Comum',0,'🐾',true),
 ('primeira_compra','Primeira Compra','Comprar o primeiro item','primeira_compra',NULL,'Comum',0,'🛍️',true),
 ('cara_nova','Cara Nova','Equipar o primeiro item','primeiro_item_equipado',NULL,'Comum',0,'🎨',true),
 ('maos_a_obra','Mãos à Obra','Entregar a primeira tarefa','primeira_tarefa_enviada',NULL,'Comum',0,'📸',true),
 ('aprovado_primeira','Aprovado!','Ter a primeira tarefa aprovada','primeira_tarefa_aprovada',NULL,'Comum',0,'✅',true),
 ('estilo_chapeu','Estilo de Chapéu','Comprar o primeiro chapéu','primeiro_chapeu_comprado',NULL,'Comum',0,'🎩',true),
 ('colar_chique','Colar Chique','Comprar o primeiro colar','primeiro_colar_comprado',NULL,'Comum',0,'📿',true),
 ('novo_cenario','Novo Cenário','Comprar o primeiro cenário','primeiro_cenario_comprado',NULL,'Comum',0,'🏞️',true),
 ('visual_completo','Visual Completo','Equipar chapéu, colar e cenário ao mesmo tempo','visual_completo',NULL,'Raro',0,'🌈',true),
 ('colecionador','Colecionador','Ter 5 itens comprados','itens_comprados',5,'Comum',0,'🧺',true),
 ('guarda_roupa_cheio','Guarda-roupa Cheio','Ter 10 itens comprados','itens_comprados',10,'Raro',0,'👕',true),
 ('pioneiro','Pioneiro','Ser o primeiro da turma a ter uma tarefa aprovada','primeiro_aprovado_turma',NULL,'Raro',0,'🥇',true),
 ('equipe_unida','Equipe Unida','A turma inteira conclui uma tarefa','turma_completa_tarefa',NULL,'Raro',0,'👥',true)
ON CONFLICT (codigo) DO UPDATE SET titulo=EXCLUDED.titulo,descricao=EXCLUDED.descricao,
  criterio=EXCLUDED.criterio,meta=EXCLUDED.meta,missao_id=NULL,raridade=EXCLUDED.raridade,xp=0,icone=EXCLUDED.icone,ativa=true;

-- Acrescenta regras aos já existentes sem alterar nenhum dos critérios anteriores.
CREATE OR REPLACE FUNCTION public._conquista_regra_cumprida(p_aluno_id bigint,p_regra_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.regras_conquistas%ROWTYPE; v_total bigint; v_xp bigint; v_hoje date; v_inicio date; v_streak bigint; v_primeiro bigint; v_turma bigint;
BEGIN
  SELECT * INTO r FROM public.regras_conquistas WHERE id=p_regra_id AND ativa;
  IF NOT FOUND THEN RETURN false; END IF;
  v_hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  IF r.criterio IN ('xp_total','acumular_xp') THEN
    SELECT COALESCE(a.xp,0) INTO v_xp FROM public.alunos a WHERE a.id=p_aluno_id;
    RETURN COALESCE(v_xp,0)>=r.meta;
  ELSIF r.criterio='atividade_total' THEN
    SELECT count(*) INTO v_total FROM public.alunos_missoes_etapas e WHERE e.aluno_id=p_aluno_id;
    RETURN v_total>=r.meta;
  ELSIF r.criterio IN ('trilhas_total','total_missoes') THEN
    SELECT count(*) INTO v_total FROM public.alunos_missoes am JOIN public.missoes m ON m.id=am.missao_id
     WHERE am.aluno_id=p_aluno_id AND jsonb_typeof(m.etapas)='array' AND jsonb_array_length(m.etapas)>0 AND am.etapa_atual>=jsonb_array_length(m.etapas);
    RETURN v_total>=r.meta;
  ELSIF r.criterio IN ('horta_caseira','missao_especifica') THEN
    RETURN EXISTS (SELECT 1 FROM public.alunos_missoes am JOIN public.missoes m ON m.id=am.missao_id
      WHERE am.aluno_id=p_aluno_id AND (lower(btrim(m.nome))='horta caseira' OR (r.criterio='missao_especifica' AND am.missao_id=r.missao_id))
        AND jsonb_typeof(m.etapas)='array' AND jsonb_array_length(m.etapas)>0 AND am.etapa_atual>=jsonb_array_length(m.etapas));
  ELSIF r.criterio='primeira_trilha' THEN
    SELECT am.aluno_id INTO v_primeiro FROM public.alunos_missoes am JOIN public.missoes m ON m.id=am.missao_id
      JOIN LATERAL (SELECT e.concluida_em,e.id FROM public.alunos_missoes_etapas e WHERE e.aluno_id=am.aluno_id AND e.missao_id=am.missao_id ORDER BY e.etapa_ordem DESC LIMIT 1) ultima ON true
     WHERE jsonb_typeof(m.etapas)='array' AND jsonb_array_length(m.etapas)>0 AND am.etapa_atual>=jsonb_array_length(m.etapas)
     ORDER BY ultima.concluida_em,ultima.id LIMIT 1;
    RETURN v_primeiro=p_aluno_id;
  ELSIF r.criterio='login_seguidos' THEN
    WITH RECURSIVE dias(dia) AS (
      SELECT v_hoje WHERE EXISTS(SELECT 1 FROM public.alunos_conquistas_acessos WHERE aluno_id=p_aluno_id AND dia=v_hoje)
      UNION ALL SELECT dias.dia-1 FROM dias WHERE EXISTS(SELECT 1 FROM public.alunos_conquistas_acessos a WHERE a.aluno_id=p_aluno_id AND a.dia=dias.dia-1)
    ) SELECT count(*) INTO v_streak FROM dias;
    RETURN v_streak>=r.meta;
  ELSIF r.criterio='pet_jovem' THEN
    RETURN EXISTS(SELECT 1 FROM public.alunos a JOIN public.pets p ON p.turma_id=a."turmaId" WHERE a.id=p_aluno_id AND COALESCE(p.xp,0)>=500);
  ELSIF r.criterio='xp_semana' THEN
    v_inicio:=date_trunc('week',now() AT TIME ZONE 'America/Sao_Paulo')::date;
    SELECT COALESCE(sum(e.xp),0) INTO v_xp FROM public.alunos_missoes_etapas e WHERE e.aluno_id=p_aluno_id AND (e.concluida_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_inicio AND v_hoje;
    RETURN v_xp>=r.meta;
  ELSIF r.criterio='primeiro_passo' THEN
    RETURN EXISTS(SELECT 1 FROM public.alunos a JOIN public.pets p ON p.turma_id=a."turmaId" WHERE a.id=p_aluno_id);
  ELSIF r.criterio='primeira_compra' THEN
    RETURN EXISTS(SELECT 1 FROM public.alunos_itens i WHERE i.aluno_id=p_aluno_id AND NOT COALESCE(i.estornado,false));
  ELSIF r.criterio='primeiro_item_equipado' THEN
    RETURN EXISTS(SELECT 1 FROM public.alunos_equipados e WHERE e.aluno_id=p_aluno_id);
  ELSIF r.criterio='primeira_tarefa_enviada' THEN
    RETURN EXISTS(SELECT 1 FROM public.alunos_missoes_etapas e WHERE e.aluno_id=p_aluno_id AND e.enviada_em IS NOT NULL);
  ELSIF r.criterio='primeira_tarefa_aprovada' THEN
    RETURN EXISTS(SELECT 1 FROM public.alunos_missoes_etapas e WHERE e.aluno_id=p_aluno_id AND e.status='aprovado' AND e.corrigida_em IS NOT NULL);
  ELSIF r.criterio IN ('primeiro_chapeu_comprado','primeiro_colar_comprado','primeiro_cenario_comprado') THEN
    RETURN EXISTS(SELECT 1 FROM public.alunos_itens i JOIN public.acessorios a ON a.id=i.acessorio_id
      WHERE i.aluno_id=p_aluno_id AND NOT COALESCE(i.estornado,false)
        AND a.slot=CASE r.criterio WHEN 'primeiro_chapeu_comprado' THEN 'chapeu' WHEN 'primeiro_colar_comprado' THEN 'colar' ELSE 'fundo' END);
  ELSIF r.criterio='visual_completo' THEN
    RETURN EXISTS(SELECT 1 FROM public.alunos a JOIN public.pets p ON p.turma_id=a."turmaId"
      JOIN public.alunos_equipados e ON e.aluno_id=a.id AND e.pet_id=p.id
      WHERE a.id=p_aluno_id GROUP BY p.id HAVING count(DISTINCT e.slot) FILTER(WHERE e.slot IN ('chapeu','colar','fundo'))=3);
  ELSIF r.criterio='itens_comprados' THEN
    SELECT count(*) INTO v_total FROM public.alunos_itens i WHERE i.aluno_id=p_aluno_id AND NOT COALESCE(i.estornado,false);
    RETURN v_total>=r.meta;
  ELSIF r.criterio='primeiro_aprovado_turma' THEN
    SELECT a."turmaId" INTO v_turma FROM public.alunos a WHERE a.id=p_aluno_id;
    IF v_turma IS NULL THEN RETURN false; END IF;
    SELECT e.aluno_id INTO v_primeiro FROM public.alunos_missoes_etapas e JOIN public.alunos a ON a.id=e.aluno_id
      WHERE a."turmaId"=v_turma AND e.status='aprovado' AND e.corrigida_em IS NOT NULL
      ORDER BY e.corrigida_em,e.id LIMIT 1;
    RETURN v_primeiro=p_aluno_id;
  ELSIF r.criterio='turma_completa_tarefa' THEN
    SELECT a."turmaId" INTO v_turma FROM public.alunos a WHERE a.id=p_aluno_id;
    IF v_turma IS NULL THEN RETURN false; END IF;
    RETURN EXISTS(SELECT 1 FROM public.missoes_turmas mt JOIN public.missoes m ON m.id=mt.missao_id
      WHERE mt.turma_id=v_turma AND mt.ativa AND m.ativa AND jsonb_typeof(m.etapas)='array' AND jsonb_array_length(m.etapas)>0
        AND EXISTS(SELECT 1 FROM public.alunos ax WHERE ax."turmaId"=v_turma)
        AND NOT EXISTS(SELECT 1 FROM public.alunos ax WHERE ax."turmaId"=v_turma AND NOT EXISTS(
          SELECT 1 FROM public.alunos_missoes am WHERE am.aluno_id=ax.id AND am.missao_id=m.id AND am.etapa_atual>=jsonb_array_length(m.etapas))));
  END IF;
  RETURN false;
END;
$$;

-- Pioneiro é único por turma; a trava serializa duas aprovações simultâneas.
CREATE OR REPLACE FUNCTION public._conquistas_avaliar_aluno(p_aluno_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.regras_conquistas%ROWTYPE; v_professor bigint; v_turma bigint;
BEGIN
  SELECT t.professor_id,a."turmaId" INTO v_professor,v_turma FROM public.alunos a LEFT JOIN public.turmas t ON t.id=a."turmaId" WHERE a.id=p_aluno_id;
  IF NOT FOUND THEN RETURN; END IF;
  FOR r IN SELECT * FROM public.regras_conquistas WHERE ativa LOOP
    IF r.codigo='pe_na_frente' THEN PERFORM pg_advisory_xact_lock(hashtextextended('curupira_primeira_trilha',0)); END IF;
    IF r.codigo='pioneiro' AND v_turma IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('curupira_pioneiro:'||v_turma,0)); END IF;
    IF public._conquista_regra_cumprida(p_aluno_id,r.id) THEN
      INSERT INTO public.conquistas("alunoId","professorId",titulo,descricao,criterio,raridade,xp,icone,desbloqueada,regra_id,conquistada_em,xp_creditado)
      VALUES(p_aluno_id,v_professor,r.titulo,r.descricao,r.criterio,r.raridade,0,r.icone,true,r.id,now(),false)
      ON CONFLICT("alunoId",regra_id) WHERE regra_id IS NOT NULL DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- Cada etapa submetida/aprovada reavalia o aluno e as conquistas coletivas de toda a turma.
CREATE OR REPLACE FUNCTION public._conquistas_apos_etapa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_turma bigint; v_aluno bigint;
BEGIN
  SELECT a."turmaId" INTO v_turma FROM public.alunos a WHERE a.id=NEW.aluno_id;
  IF v_turma IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('curupira_turma_conquistas:'||v_turma,0)); END IF;
  PERFORM public._conquistas_avaliar_aluno(NEW.aluno_id);
  IF NEW.status='aprovado' AND v_turma IS NOT NULL THEN
    FOR v_aluno IN SELECT id FROM public.alunos WHERE "turmaId"=v_turma LOOP PERFORM public._conquistas_avaliar_aluno(v_aluno); END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS alunos_missoes_etapas_zz_conquistas ON public.alunos_missoes_etapas;
CREATE TRIGGER alunos_missoes_etapas_zz_conquistas AFTER INSERT OR UPDATE OF status ON public.alunos_missoes_etapas
FOR EACH ROW EXECUTE FUNCTION public._conquistas_apos_etapa();

CREATE OR REPLACE FUNCTION public._conquistas_apos_compra()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN PERFORM public._conquistas_avaliar_aluno(NEW.aluno_id); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS alunos_itens_zz_conquistas ON public.alunos_itens;
CREATE TRIGGER alunos_itens_zz_conquistas AFTER INSERT ON public.alunos_itens
FOR EACH ROW EXECUTE FUNCTION public._conquistas_apos_compra();

CREATE OR REPLACE FUNCTION public._conquistas_apos_equipar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN PERFORM public._conquistas_avaliar_aluno(NEW.aluno_id); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS alunos_equipados_zz_conquistas ON public.alunos_equipados;
CREATE TRIGGER alunos_equipados_zz_conquistas AFTER INSERT OR UPDATE OF acessorio_id ON public.alunos_equipados
FOR EACH ROW EXECUTE FUNCTION public._conquistas_apos_equipar();

CREATE TABLE IF NOT EXISTS public.alunos_conquistas_notificacoes (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  aluno_id bigint NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  conquista_id bigint NOT NULL REFERENCES public.conquistas(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  exibida_em timestamptz,
  CONSTRAINT alunos_conquistas_notif_unica UNIQUE(aluno_id,conquista_id)
);
CREATE INDEX IF NOT EXISTS alunos_conquistas_notif_pendente_idx ON public.alunos_conquistas_notificacoes(aluno_id,id) WHERE exibida_em IS NULL;
ALTER TABLE public.alunos_conquistas_notificacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.alunos_conquistas_notificacoes FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public._conquistas_criar_notificacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.regra_id IS NOT NULL AND current_setting('curupira.silenciar_conquista_notificacao',true) IS DISTINCT FROM 'true' THEN
    INSERT INTO public.alunos_conquistas_notificacoes(aluno_id,conquista_id) VALUES(NEW."alunoId",NEW.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS conquistas_notificacao_nova ON public.conquistas;
CREATE TRIGGER conquistas_notificacao_nova AFTER INSERT ON public.conquistas
FOR EACH ROW EXECUTE FUNCTION public._conquistas_criar_notificacao();

-- Consultar catálogo pode completar regras antigas sem disparar uma avalanche de avisos históricos.
CREATE OR REPLACE FUNCTION public.aluno_minhas_conquistas(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_aluno bigint:=public._aluno_da_sessao(p_token); v_r jsonb;
BEGIN
  PERFORM set_config('curupira.silenciar_conquista_notificacao','true',true);
  PERFORM public._conquistas_avaliar_aluno(v_aluno);
  PERFORM set_config('curupira.silenciar_conquista_notificacao','false',true);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',r.codigo,'regra_id',r.id,'titulo',r.titulo,'descricao',r.descricao,
    'icone',r.icone,'raridade',r.raridade,'desbloqueada',c.id IS NOT NULL,'conquistada_em',c.conquistada_em) ORDER BY r.id),'[]'::jsonb)
  INTO v_r FROM public.regras_conquistas r LEFT JOIN public.conquistas c ON c.regra_id=r.id AND c."alunoId"=v_aluno WHERE r.ativa;
  RETURN v_r;
END;
$$;

CREATE OR REPLACE FUNCTION public.aluno_notificacoes_conquistas(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_aluno bigint:=public._aluno_da_sessao(p_token); v_r jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',n.id,'conquista_id',n.conquista_id,'titulo',c.titulo,'descricao',c.descricao,'icone',c.icone) ORDER BY n.id),'[]'::jsonb)
  INTO v_r FROM (SELECT * FROM public.alunos_conquistas_notificacoes WHERE aluno_id=v_aluno AND exibida_em IS NULL ORDER BY id LIMIT 10) n
  JOIN public.conquistas c ON c.id=n.conquista_id;
  RETURN v_r;
END;
$$;

CREATE OR REPLACE FUNCTION public.aluno_marcar_notificacao_conquista(p_token text,p_notificacao_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_aluno bigint:=public._aluno_da_sessao(p_token);
BEGIN
  UPDATE public.alunos_conquistas_notificacoes SET exibida_em=now()
  WHERE id=p_notificacao_id AND aluno_id=v_aluno AND exibida_em IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._conquista_regra_cumprida(bigint,bigint),public._conquistas_avaliar_aluno(bigint),
  public._conquistas_apos_etapa(),public._conquistas_apos_compra(),public._conquistas_apos_equipar(),public._conquistas_criar_notificacao(),
  public.aluno_notificacoes_conquistas(text),public.aluno_marcar_notificacao_conquista(text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aluno_notificacoes_conquistas(text),public.aluno_marcar_notificacao_conquista(text,bigint) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
