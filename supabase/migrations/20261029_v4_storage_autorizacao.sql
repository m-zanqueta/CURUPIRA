-- =============================================================================
-- V4 · AUTORIZAÇÃO DE UPLOAD/REMOÇÃO DE IMAGENS (Storage)  — migration ADITIVA; aplicar DEPOIS de 20261027 e 20261028.
--
-- O Supabase Storage NÃO conhece o token próprio do Curupira: a chave anon sozinha não prova quem é o usuário. Por isso o upload
-- e a remoção das imagens (bucket pets-images) passam por uma Edge Function (supabase/functions/imagens-admin) que roda no
-- servidor com a chave service_role (que nunca vai para o app) e, ANTES de tocar no bucket, chama esta função para validar:
--   * o token de sessão de staff (_staff_exigir: PT401 se inválido/expirado/revogado);
--   * o papel (somente ADMIN: é quem pode inserir pets/acessórios/ícones pelas RPCs admin_*; coordenador/professor => PT403);
--   * a operação, a pasta e o caminho (formato gerado pelo servidor; nada arbitrário);
--   * limite de taxa por administrador;
--   * na remoção: o objeto NÃO pode estar em uso (pets.icone, acessorios.imagem_path, icones_missoes.icone).
-- EXECUTE somente para service_role (a chave pública/anon e usuários autenticados NÃO podem chamá-la).
-- Idempotente. Não altera o bucket nem as políticas de storage.objects (isso é o script manual supabase/storage/).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.storage_autorizar_operacao(p_token text, p_operacao text, p_pasta text, p_caminho text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_papel text; v_id bigint;
BEGIN
  SELECT s.papel, s.usuario_id INTO v_papel, v_id FROM public._staff_exigir(p_token, ARRAY['admin']) s;   -- PT401 / PT403
  IF p_operacao IS NULL OR p_operacao NOT IN ('upload', 'remover') THEN
    RAISE EXCEPTION 'operacao_invalida' USING ERRCODE = 'PT422';
  END IF;
  IF p_pasta IS NULL OR p_pasta NOT IN ('pets', 'icones-missoes', 'acessorios') THEN
    RAISE EXCEPTION 'pasta_invalida' USING ERRCODE = 'PT422';
  END IF;
  PERFORM public._limite_taxa('storage:' || p_operacao || ':' || v_id, 60, interval '15 minutes');   -- PT429
  IF p_operacao = 'remover' THEN
    -- só objetos no formato que o SERVIDOR gera, dentro da pasta pedida (sem "..", sem barras extras, sem coringas)
    IF p_caminho IS NULL OR p_caminho !~ ('^' || p_pasta || '/[0-9]{13}-[a-f0-9]{16}\.(png|jpg|webp|gif)$') THEN
      RAISE EXCEPTION 'caminho_invalido' USING ERRCODE = 'PT422';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pets p WHERE p.icone LIKE '%/' || p_caminho)
       OR EXISTS (SELECT 1 FROM public.acessorios a WHERE a.imagem_path = p_caminho)
       OR EXISTS (SELECT 1 FROM public.icones_missoes i WHERE i.icone LIKE '%/' || p_caminho) THEN
      RAISE EXCEPTION 'objeto_em_uso' USING ERRCODE = 'PT409';
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'papel', v_papel, 'usuario_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.storage_autorizar_operacao(text, text, text, text) FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.storage_autorizar_operacao(text, text, text, text) TO service_role;
  ELSE
    RAISE NOTICE 'role service_role ausente (ambiente fora do Supabase): a função ficou sem nenhum EXECUTE; conceda a service_role onde existir.';
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
