-- Evidencias privadas por etapa: envio do aluno, revisao do professor e descarte da foto apos a decisao.
-- Requer as migrations de trilhas/recompensas anteriores.

ALTER TABLE public.alunos_missoes_etapas
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'aprovado',
  ADD COLUMN IF NOT EXISTS evidencia_path text,
  ADD COLUMN IF NOT EXISTS enviada_em timestamptz,
  ADD COLUMN IF NOT EXISTS corrigida_em timestamptz;

ALTER TABLE public.alunos_missoes_etapas
  DROP CONSTRAINT IF EXISTS alunos_missoes_etapas_status_check;
ALTER TABLE public.alunos_missoes_etapas
  ADD CONSTRAINT alunos_missoes_etapas_status_check CHECK (status IN ('enviado','aprovado','recusado'));
CREATE INDEX IF NOT EXISTS alunos_missoes_etapas_envios_pendentes_idx
  ON public.alunos_missoes_etapas (turma_id, missao_id, enviada_em)
  WHERE status = 'enviado';

-- Bucket privado, sem acesso direto pelo cliente. Só a Edge Function usa service_role.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tarefas-envios', 'tarefas-envios', false, 1048576, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 1048576,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];

CREATE TABLE IF NOT EXISTS public.tarefas_evidencias_lixeira (
  caminho text PRIMARY KEY,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tarefas_evidencias_lixeira ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tarefas_evidencias_lixeira FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.tarefas_evidencias_lixeira TO service_role;

-- Ao aprovar, o crédito da moeda é aplicado por UPDATE na linha da etapa. Sincronize também XP em UPDATE.
CREATE OR REPLACE FUNCTION public.aplicar_xp_etapa_tarefa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_delta bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_delta := NEW.xp;
    IF v_delta <> 0 THEN UPDATE public.alunos SET xp = GREATEST(COALESCE(xp,0)+v_delta,0) WHERE id=NEW.aluno_id; END IF;
    IF v_delta <> 0 AND NEW.pet_id IS NOT NULL THEN UPDATE public.pets SET xp=GREATEST(COALESCE(xp,0)+v_delta,0) WHERE id=NEW.pet_id; END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_delta := -OLD.xp;
    IF v_delta <> 0 THEN UPDATE public.alunos SET xp = GREATEST(COALESCE(xp,0)+v_delta,0) WHERE id=OLD.aluno_id; END IF;
    IF v_delta <> 0 AND OLD.pet_id IS NOT NULL THEN UPDATE public.pets SET xp=GREATEST(COALESCE(xp,0)+v_delta,0) WHERE id=OLD.pet_id; END IF;
    RETURN OLD;
  END IF;
  v_delta := NEW.xp - OLD.xp;
  IF v_delta <> 0 THEN UPDATE public.alunos SET xp=GREATEST(COALESCE(xp,0)+v_delta,0) WHERE id=NEW.aluno_id; END IF;
  IF v_delta <> 0 AND NEW.pet_id IS NOT NULL THEN UPDATE public.pets SET xp=GREATEST(COALESCE(xp,0)+v_delta,0) WHERE id=NEW.pet_id; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS alunos_missoes_etapas_aplicar_xp ON public.alunos_missoes_etapas;
CREATE TRIGGER alunos_missoes_etapas_aplicar_xp AFTER INSERT OR UPDATE OR DELETE ON public.alunos_missoes_etapas
FOR EACH ROW EXECUTE FUNCTION public.aplicar_xp_etapa_tarefa();
REVOKE ALL ON FUNCTION public.aplicar_xp_etapa_tarefa() FROM PUBLIC, anon, authenticated;

-- Editar a recompensa só reajusta créditos de etapas que já foram aprovadas.
CREATE OR REPLACE FUNCTION public.sincronizar_moedas_tarefas_editadas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.etapas IS DISTINCT FROM OLD.etapas THEN
    UPDATE public.alunos_missoes_etapas AS e
       SET moedas=COALESCE((NEW.etapas->(e.etapa_ordem-1)->>'moedas')::bigint,0)
     WHERE e.missao_id=NEW.id AND e.status='aprovado'
       AND e.moedas IS DISTINCT FROM COALESCE((NEW.etapas->(e.etapa_ordem-1)->>'moedas')::bigint,0);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sincronizar_moedas_tarefas_editadas() FROM PUBLIC, anon, authenticated;

-- Confere no servidor a identidade, a turma, a tarefa ativa e a etapa seguinte.
CREATE OR REPLACE FUNCTION public._validar_envio_etapa(p_token text, p_missao_id bigint, p_etapa_ordem integer)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_aluno bigint := public._aluno_da_sessao(p_token); v_turma bigint; v_atual integer := 0; v_status text;
BEGIN
  IF p_etapa_ordem IS NULL OR p_etapa_ordem < 1 THEN RAISE EXCEPTION 'pedido_invalido' USING ERRCODE='PT422'; END IF;
  SELECT a."turmaId" INTO v_turma FROM public.alunos a WHERE a.id=v_aluno;
  IF v_turma IS NULL THEN RAISE EXCEPTION 'sem_turma' USING ERRCODE='PT409'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.missoes m JOIN public.missoes_turmas mt ON mt.missao_id=m.id
                 WHERE m.id=p_missao_id AND m.ativa AND mt.turma_id=v_turma AND mt.ativa
                   AND jsonb_typeof(m.etapas)='array' AND p_etapa_ordem<=jsonb_array_length(m.etapas)) THEN
    RAISE EXCEPTION 'tarefa_inativa' USING ERRCODE='PT409';
  END IF;
  SELECT am.etapa_atual, am.status INTO v_atual, v_status FROM public.alunos_missoes am
   WHERE am.aluno_id=v_aluno AND am.missao_id=p_missao_id;
  IF NOT FOUND THEN v_atual:=0; v_status:='pendente'; END IF;
  IF v_status <> 'pendente' OR p_etapa_ordem <> v_atual+1 THEN RAISE EXCEPTION 'etapa_nao_liberada' USING ERRCODE='PT409'; END IF;
  IF EXISTS (SELECT 1 FROM public.alunos_missoes_etapas e WHERE e.aluno_id=v_aluno AND e.missao_id=p_missao_id
             AND e.etapa_ordem=p_etapa_ordem AND e.status='enviado') THEN RAISE EXCEPTION 'envio_aguardando_correcao' USING ERRCODE='PT409'; END IF;
  RETURN v_aluno;
END;
$$;
REVOKE ALL ON FUNCTION public._validar_envio_etapa(text,bigint,integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.storage_autorizar_envio_tarefa(p_token text,p_missao_id bigint,p_etapa_ordem integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_aluno bigint;
BEGIN
  v_aluno:=public._validar_envio_etapa(p_token,p_missao_id,p_etapa_ordem);
  PERFORM public._limite_taxa('evidencia_upload:'||v_aluno,8,interval '15 minutes');
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.storage_autorizar_envio_tarefa(text,bigint,integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.aluno_registrar_envio_tarefa(p_token text,p_missao_id bigint,p_etapa_ordem integer,p_caminho text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_aluno bigint; v_turma bigint; v_pet bigint; v_etapas jsonb; v_id bigint;
BEGIN
  v_aluno:=public._validar_envio_etapa(p_token,p_missao_id,p_etapa_ordem);
  IF p_caminho IS NULL OR p_caminho !~ '^tarefas-envios/[0-9]{13}-[a-f0-9]{32}\.(jpg|png|webp)$' THEN
    RAISE EXCEPTION 'caminho_invalido' USING ERRCODE='PT422';
  END IF;
  SELECT a."turmaId" INTO v_turma FROM public.alunos a WHERE a.id=v_aluno;
  SELECT p.id INTO v_pet FROM public.pets p WHERE p.turma_id=v_turma ORDER BY p.id LIMIT 1;
  SELECT m.etapas INTO v_etapas FROM public.missoes m WHERE m.id=p_missao_id;
  INSERT INTO public.alunos_missoes (aluno_id,missao_id,status,turma_id,pet_id)
  VALUES (v_aluno,p_missao_id,'pendente',v_turma,v_pet) ON CONFLICT (aluno_id,missao_id) DO NOTHING;
  INSERT INTO public.alunos_missoes_etapas (aluno_id,missao_id,etapa_ordem,turma_id,pet_id,xp,moedas,status,evidencia_path,enviada_em,corrigida_em)
  VALUES (v_aluno,p_missao_id,p_etapa_ordem,v_turma,v_pet,0,0,'enviado',p_caminho,now(),NULL)
  ON CONFLICT (aluno_id,missao_id,etapa_ordem) DO UPDATE
    SET xp=0,moedas=0,status='enviado',evidencia_path=EXCLUDED.evidencia_path,
        enviada_em=COALESCE(alunos_missoes_etapas.enviada_em,EXCLUDED.enviada_em),corrigida_em=NULL
    WHERE alunos_missoes_etapas.status='recusado'
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'envio_duplicado' USING ERRCODE='PT409'; END IF;
  RETURN jsonb_build_object('id',v_id,'status','enviado');
END;
$$;
REVOKE ALL ON FUNCTION public.aluno_registrar_envio_tarefa(text,bigint,integer,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.staff_listar_envios_tarefas(p_token text,p_missao_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_papel text; v_id bigint; v_r jsonb;
BEGIN
  SELECT s.papel,s.usuario_id INTO v_papel,v_id FROM public._staff_exigir(p_token,ARRAY['professor','coordenador','admin']) s;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',e.id,'aluno_id',e.aluno_id,'aluno_nome',a.nome,'turma_id',e.turma_id,
    'turma_nome',t.nome,'missao_id',e.missao_id,'missao_nome',m.nome,'etapa_ordem',e.etapa_ordem,
    'etapa_titulo',m.etapas->(e.etapa_ordem-1)->>'titulo','etapa_descricao',m.etapas->(e.etapa_ordem-1)->>'descricao',
    'moedas',COALESCE((m.etapas->(e.etapa_ordem-1)->>'moedas')::bigint,0),'evidencia_path',e.evidencia_path,'enviada_em',e.enviada_em)
    ORDER BY t.nome,a.nome,e.etapa_ordem),'[]'::jsonb) INTO v_r
  FROM public.alunos_missoes_etapas e JOIN public.alunos a ON a.id=e.aluno_id
  JOIN public.turmas t ON t.id=e.turma_id JOIN public.missoes m ON m.id=e.missao_id
  WHERE e.status='enviado' AND e.missao_id=p_missao_id AND e.evidencia_path IS NOT NULL
    AND (v_papel IN ('coordenador','admin') OR (v_papel='professor' AND t.professor_id=v_id));
  RETURN v_r;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_listar_envios_tarefas(text,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_listar_envios_tarefas(text,bigint) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.staff_autorizar_visualizar_envio(p_token text,p_caminho text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_papel text; v_id bigint;
BEGIN
  SELECT s.papel,s.usuario_id INTO v_papel,v_id FROM public._staff_exigir(p_token,ARRAY['professor','coordenador','admin']) s;
  IF NOT EXISTS (SELECT 1 FROM public.alunos_missoes_etapas e JOIN public.turmas t ON t.id=e.turma_id
    WHERE e.evidencia_path=p_caminho AND e.status='enviado'
      AND (v_papel IN ('coordenador','admin') OR t.professor_id=v_id)) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE='PT403';
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_autorizar_visualizar_envio(text,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.staff_revisar_envio_tarefa(p_token text,p_envio_id bigint,p_aprovado boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_papel text; v_id bigint; v_e public.alunos_missoes_etapas%ROWTYPE; v_valor bigint; v_n integer;
BEGIN
  SELECT s.papel,s.usuario_id INTO v_papel,v_id FROM public._staff_exigir(p_token,ARRAY['professor','admin']) s;
  SELECT e.* INTO v_e FROM public.alunos_missoes_etapas e WHERE e.id=p_envio_id FOR UPDATE;
  IF NOT FOUND OR v_e.status<>'enviado' OR v_e.evidencia_path IS NULL THEN RAISE EXCEPTION 'envio_nao_encontrado' USING ERRCODE='PT404'; END IF;
  IF v_papel='professor' AND NOT EXISTS (SELECT 1 FROM public.turmas t WHERE t.id=v_e.turma_id AND t.professor_id=v_id) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE='PT403';
  END IF;
  IF p_aprovado THEN
    SELECT COALESCE((m.etapas->(v_e.etapa_ordem-1)->>'moedas')::bigint,0) INTO v_valor FROM public.missoes m WHERE m.id=v_e.missao_id;
    UPDATE public.alunos_missoes_etapas SET status='aprovado',moedas=v_valor,evidencia_path=NULL,corrigida_em=now() WHERE id=v_e.id;
    UPDATE public.alunos_missoes SET etapa_atual=v_e.etapa_ordem,atualizado_em=now()
      WHERE aluno_id=v_e.aluno_id AND missao_id=v_e.missao_id AND etapa_atual=v_e.etapa_ordem-1;
    GET DIAGNOSTICS v_n=ROW_COUNT;
    IF v_n=0 THEN RAISE EXCEPTION 'etapa_fora_de_ordem' USING ERRCODE='PT409'; END IF;
  ELSE
    UPDATE public.alunos_missoes_etapas SET status='recusado',evidencia_path=NULL,corrigida_em=now() WHERE id=v_e.id;
  END IF;
  RETURN jsonb_build_object('ok',true,'caminho',v_e.evidencia_path,'status',CASE WHEN p_aprovado THEN 'aprovado' ELSE 'recusado' END);
END;
$$;
REVOKE ALL ON FUNCTION public.staff_revisar_envio_tarefa(text,bigint,boolean) FROM PUBLIC, anon, authenticated;

-- A leitura das tarefas inclui só o status do próprio aluno em cada etapa; caminho privado nunca sai no RPC.
CREATE OR REPLACE FUNCTION public.aluno_minhas_missoes(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_aluno bigint := public._aluno_da_sessao(p_token); v_r jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',m.id,'nome',m.nome,'descricao',m.descricao,'xp',m.xp,
    'dificuldade',m.dificuldade,'icone',m.icone,'etapas',m.etapas,'moedas',m.moedas,
    'status',COALESCE(am.status,'pendente'),'atualizado_em',am.atualizado_em,'xp_aluno',am.xp_aluno,
    'etapa_atual',am.etapa_atual,'etapas_status',COALESCE((SELECT jsonb_agg(jsonb_build_object('etapa_ordem',e.etapa_ordem,'status',e.status)
      ORDER BY e.etapa_ordem) FROM public.alunos_missoes_etapas e WHERE e.aluno_id=v_aluno AND e.missao_id=m.id),'[]'::jsonb)) ORDER BY m.id DESC),'[]'::jsonb)
  INTO v_r FROM public.alunos a JOIN public.missoes_turmas mt ON mt.turma_id=a."turmaId" AND mt.ativa
  JOIN public.missoes m ON m.id=mt.missao_id AND m.ativa LEFT JOIN public.alunos_missoes am ON am.aluno_id=a.id AND am.missao_id=m.id
  WHERE a.id=v_aluno;
  RETURN v_r;
END;
$$;
REVOKE ALL ON FUNCTION public.aluno_minhas_missoes(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aluno_minhas_missoes(text) TO anon, authenticated;

-- Bloqueia o caminho antigo sem foto; etapa só avança pela aprovação do professor.
REVOKE ALL ON FUNCTION public.aluno_avancar_etapa(text,bigint) FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT EXECUTE ON FUNCTION public.storage_autorizar_envio_tarefa(text,bigint,integer),
      public.aluno_registrar_envio_tarefa(text,bigint,integer,text),
      public.staff_autorizar_visualizar_envio(text,text),
      public.staff_revisar_envio_tarefa(text,bigint,boolean) TO service_role;
  END IF;
END $$;

NOTIFY pgrst,'reload schema';
