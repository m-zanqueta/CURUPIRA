-- Foto privada de perfil e vitrine personalizada de insígnias de trilhas concluídas.
ALTER TABLE public.alunos ADD COLUMN IF NOT EXISTS avatar_path text;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('perfis-alunos','perfis-alunos',false,1048576,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=1048576,
  allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'];

CREATE TABLE IF NOT EXISTS public.alunos_vitrine_trilhas(
  aluno_id bigint NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  missao_id bigint NOT NULL REFERENCES public.missoes(id) ON DELETE CASCADE,
  posicao smallint NOT NULL CHECK(posicao BETWEEN 1 AND 5),
  PRIMARY KEY(aluno_id,missao_id),
  UNIQUE(aluno_id,posicao)
);
ALTER TABLE public.alunos_vitrine_trilhas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.alunos_vitrine_trilhas FROM PUBLIC,anon,authenticated;

-- A Edge Function usa estas RPCs com service_role; nenhum caminho de Storage é aceito direto do app.
CREATE OR REPLACE FUNCTION public.aluno_avatar_autorizar_upload(p_token text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN RETURN public._aluno_da_sessao(p_token)::text; END;
$$;

CREATE OR REPLACE FUNCTION public.aluno_avatar_salvar(p_token text,p_caminho text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_aluno bigint:=public._aluno_da_sessao(p_token); v_antigo text;
BEGIN
  IF p_caminho IS NULL OR p_caminho !~ ('^'||v_aluno::text||'/[0-9]{13}-[a-f0-9]{32}\.(jpg|png|webp)$') THEN
    RAISE EXCEPTION 'caminho_invalido' USING ERRCODE='PT422';
  END IF;
  SELECT a.avatar_path INTO v_antigo FROM public.alunos a WHERE a.id=v_aluno FOR UPDATE;
  UPDATE public.alunos SET avatar_path=p_caminho WHERE id=v_aluno;
  RETURN v_antigo;
END;
$$;

CREATE OR REPLACE FUNCTION public.aluno_avatar_obter(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_aluno bigint:=public._aluno_da_sessao(p_token); v_caminho text;
BEGIN
  SELECT a.avatar_path INTO v_caminho FROM public.alunos a WHERE a.id=v_aluno;
  RETURN jsonb_build_object('aluno_id',v_aluno,'caminho',v_caminho);
END;
$$;

CREATE OR REPLACE FUNCTION public.aluno_vitrine_listar(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_aluno bigint:=public._aluno_da_sessao(p_token); v_resultado jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',m.id,'nome',m.nome,'icone',m.icone,'posicao',v.posicao)
    ORDER BY v.posicao NULLS LAST,m.id),'[]'::jsonb) INTO v_resultado
  FROM public.alunos_missoes am
  JOIN public.missoes m ON m.id=am.missao_id
  LEFT JOIN public.alunos_vitrine_trilhas v ON v.aluno_id=v_aluno AND v.missao_id=m.id
  WHERE am.aluno_id=v_aluno AND am.status='aprovado';
  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.aluno_vitrine_salvar(p_token text,p_missoes_ids bigint[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_aluno bigint:=public._aluno_da_sessao(p_token); v_ids bigint[]:=COALESCE(p_missoes_ids,ARRAY[]::bigint[]);
BEGIN
  IF cardinality(v_ids)>5 OR (SELECT count(DISTINCT u.missao_id) FROM unnest(v_ids) AS u(missao_id))<>cardinality(v_ids) THEN
    RAISE EXCEPTION 'vitrine_invalida' USING ERRCODE='PT422';
  END IF;
  IF EXISTS(SELECT 1 FROM unnest(v_ids) AS u(missao_id) WHERE u.missao_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.alunos_missoes am WHERE am.aluno_id=v_aluno AND am.missao_id=u.missao_id AND am.status='aprovado')) THEN
    RAISE EXCEPTION 'insignia_nao_conquistada' USING ERRCODE='PT403';
  END IF;
  DELETE FROM public.alunos_vitrine_trilhas WHERE aluno_id=v_aluno;
  INSERT INTO public.alunos_vitrine_trilhas(aluno_id,missao_id,posicao)
  SELECT v_aluno,u.missao_id,u.ordem::smallint FROM unnest(v_ids) WITH ORDINALITY AS u(missao_id,ordem);
END;
$$;

REVOKE ALL ON FUNCTION public.aluno_avatar_autorizar_upload(text),public.aluno_avatar_salvar(text,text),public.aluno_avatar_obter(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aluno_avatar_autorizar_upload(text),public.aluno_avatar_salvar(text,text),public.aluno_avatar_obter(text) TO service_role;
REVOKE ALL ON FUNCTION public.aluno_vitrine_listar(text),public.aluno_vitrine_salvar(text,bigint[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aluno_vitrine_listar(text),public.aluno_vitrine_salvar(text,bigint[]) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
