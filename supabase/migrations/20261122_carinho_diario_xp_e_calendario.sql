-- O carinho diário é o único evento de login que credita 5 XP.
-- A chave única por aluno/data impede duplicidade, inclusive em chamadas simultâneas.
CREATE TABLE IF NOT EXISTS public.curupira_carinho_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  inicio date NOT NULL
);
INSERT INTO public.curupira_carinho_config(singleton,inicio)
VALUES (true,(now() AT TIME ZONE 'America/Sao_Paulo')::date)
ON CONFLICT (singleton) DO NOTHING;
ALTER TABLE public.curupira_carinho_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.curupira_carinho_config FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.alunos_carinho_diario (
  aluno_id bigint NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  dia date NOT NULL,
  carinho_em timestamptz NOT NULL DEFAULT now(),
  xp_ganho integer NOT NULL DEFAULT 5 CHECK (xp_ganho = 5),
  PRIMARY KEY (aluno_id,dia)
);
CREATE INDEX IF NOT EXISTS alunos_carinho_diario_dia_idx ON public.alunos_carinho_diario(dia,aluno_id);
ALTER TABLE public.alunos_carinho_diario ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.alunos_carinho_diario FROM PUBLIC,anon,authenticated;

-- Compatibilidade para versões antigas do app: entrar sozinho já não registra presença.
CREATE OR REPLACE FUNCTION public.aluno_registrar_acesso_diario(p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public._aluno_da_sessao(p_token);
END;
$$;
REVOKE ALL ON FUNCTION public.aluno_registrar_acesso_diario(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.aluno_fazer_carinho_pet(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_aluno bigint := public._aluno_da_sessao(p_token);
  v_turma bigint;
  v_pet bigint;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_id bigint;
  v_xp bigint;
BEGIN
  SELECT a."turmaId" INTO v_turma FROM public.alunos a WHERE a.id=v_aluno FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'aluno_nao_encontrado' USING ERRCODE='PT404'; END IF;

  INSERT INTO public.alunos_carinho_diario(aluno_id,dia) VALUES(v_aluno,v_hoje)
  ON CONFLICT (aluno_id,dia) DO NOTHING RETURNING aluno_id INTO v_id;
  IF v_id IS NULL THEN
    SELECT COALESCE(a.xp,0) INTO v_xp FROM public.alunos a WHERE a.id=v_aluno;
    RETURN jsonb_build_object('concedido',false,'feito_hoje',true,'xp_ganho',0,'xp_aluno',v_xp);
  END IF;

  UPDATE public.alunos SET xp=COALESCE(xp,0)+5 WHERE id=v_aluno RETURNING xp INTO v_xp;
  SELECT p.id INTO v_pet FROM public.pets p WHERE p.turma_id=v_turma ORDER BY p.id LIMIT 1;
  IF v_pet IS NOT NULL THEN UPDATE public.pets SET xp=COALESCE(xp,0)+5 WHERE id=v_pet; END IF;
  INSERT INTO public.alunos_conquistas_acessos(aluno_id,dia) VALUES(v_aluno,v_hoje) ON CONFLICT DO NOTHING;
  PERFORM public._conquistas_avaliar_aluno(v_aluno);
  RETURN jsonb_build_object('concedido',true,'feito_hoje',true,'xp_ganho',5,'xp_aluno',v_xp,'dia',to_char(v_hoje,'YYYY-MM-DD'));
END;
$$;

CREATE OR REPLACE FUNCTION public.aluno_calendario_carinho(p_token text,p_ano integer,p_mes integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_aluno bigint := public._aluno_da_sessao(p_token);
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_inicio date;
  v_dias jsonb;
BEGIN
  IF p_ano NOT BETWEEN 2000 AND 2100 OR p_mes NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'periodo_invalido' USING ERRCODE='PT422';
  END IF;
  SELECT GREATEST(c.inicio,COALESCE((SELECT min((s.criado_em AT TIME ZONE 'America/Sao_Paulo')::date)
    FROM public.alunos_sessoes s WHERE s.aluno_id=v_aluno),c.inicio))
  INTO v_inicio FROM public.curupira_carinho_config c WHERE c.singleton=true;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('dia',to_char(d.dia,'YYYY-MM-DD'),'xp',d.xp_ganho) ORDER BY d.dia),'[]'::jsonb)
  INTO v_dias FROM public.alunos_carinho_diario d
  WHERE d.aluno_id=v_aluno AND d.dia>=v_inicio
    AND d.dia>=make_date(p_ano,p_mes,1) AND d.dia<((make_date(p_ano,p_mes,1)+interval '1 month')::date);
  RETURN jsonb_build_object(
    'inicio',to_char(v_inicio,'YYYY-MM-DD'),
    'hoje',to_char(v_hoje,'YYYY-MM-DD'),
    'feito_hoje',EXISTS(SELECT 1 FROM public.alunos_carinho_diario d WHERE d.aluno_id=v_aluno AND d.dia=v_hoje),
    'dias',v_dias
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aluno_fazer_carinho_pet(text),public.aluno_calendario_carinho(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aluno_fazer_carinho_pet(text),public.aluno_calendario_carinho(text,integer,integer) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
