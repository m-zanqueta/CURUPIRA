-- Permite remover com segurança uma insígnia antiga após ela ser substituída.
-- A imagem continua protegida enquanto estiver ligada a qualquer trilha ou catálogo.
CREATE OR REPLACE FUNCTION public.storage_autorizar_operacao(
  p_token text,
  p_operacao text,
  p_pasta text,
  p_caminho text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_papel text; v_id bigint;
BEGIN
  SELECT s.papel, s.usuario_id INTO v_papel, v_id
  FROM public._staff_exigir(p_token, ARRAY['admin']) s;

  IF p_operacao IS NULL OR p_operacao NOT IN ('upload', 'remover') THEN
    RAISE EXCEPTION 'operacao_invalida' USING ERRCODE = 'PT422';
  END IF;
  IF p_pasta IS NULL OR p_pasta NOT IN ('pets', 'icones-missoes', 'acessorios') THEN
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
       OR EXISTS (SELECT 1 FROM public.missoes m WHERE m.icone LIKE '%/' || p_caminho) THEN
      RAISE EXCEPTION 'objeto_em_uso' USING ERRCODE = 'PT409';
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'papel', v_papel, 'usuario_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.storage_autorizar_operacao(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storage_autorizar_operacao(text, text, text, text) TO service_role;
NOTIFY pgrst, 'reload schema';
