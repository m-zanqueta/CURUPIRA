-- =============================================================================
-- V4 · STORAGE — ROLLBACK (MANUAL). REABRE O UPLOAD/REMOÇÃO ANÔNIMOS do bucket (qualquer pessoa com a chave pública poderá gravar e
-- apagar arquivos). Use só em emergência e por tempo mínimo. Exige DUAS confirmações: o boolean E a frase exata.
-- Restaura as políticas de escrita e os limites do bucket a partir do retrato (public.v4_storage_snapshot). Sem retrato, recusa.
-- =============================================================================
BEGIN;
DO $rb$
DECLARE
  v_confirmo_reabrir boolean := false; v_frase text := '';
  c_frase constant text := 'REABRIR_UPLOAD_ANONIMO';
  r record; v_n int := 0; v_b jsonb;
BEGIN
  IF NOT v_confirmo_reabrir OR v_frase IS DISTINCT FROM c_frase THEN
    RAISE EXCEPTION 'ROLLBACK DO STORAGE RECUSADO: defina v_confirmo_reabrir := true E v_frase := ''%''. Isto reabre o upload anônimo.', c_frase;
  END IF;
  IF to_regclass('public.v4_storage_snapshot') IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK DO STORAGE RECUSADO: não há retrato (v4_storage_snapshot ausente).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.v4_storage_snapshot) THEN
    RAISE EXCEPTION 'ROLLBACK DO STORAGE RECUSADO: retrato vazio.';
  END IF;
  FOR r IN SELECT nome, definicao FROM public.v4_storage_snapshot WHERE tipo = 'politica' ORDER BY id LOOP
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = r.nome) THEN CONTINUE; END IF;
    EXECUTE format('CREATE POLICY %I ON storage.objects AS %s FOR %s TO %s %s %s',
      r.nome, r.definicao->>'permissive', r.definicao->>'cmd',
      (SELECT string_agg(CASE WHEN x = 'public' THEN 'PUBLIC' ELSE quote_ident(x) END, ', ') FROM jsonb_array_elements_text(r.definicao->'roles') x),
      CASE WHEN r.definicao->>'cmd' = 'INSERT' THEN '' ELSE 'USING (' || COALESCE(r.definicao->>'qual', 'true') || ')' END,
      CASE WHEN r.definicao->>'cmd' = 'INSERT' THEN 'WITH CHECK (' || COALESCE(r.definicao->>'with_check', 'true') || ')'
           WHEN r.definicao->>'cmd' IN ('SELECT', 'DELETE') THEN ''
           WHEN r.definicao->>'with_check' IS NOT NULL THEN 'WITH CHECK (' || (r.definicao->>'with_check') || ')' ELSE '' END);
    v_n := v_n + 1;
  END LOOP;
  SELECT definicao INTO v_b FROM public.v4_storage_snapshot WHERE tipo = 'bucket' ORDER BY id LIMIT 1;
  IF v_b IS NOT NULL THEN
    UPDATE storage.buckets SET file_size_limit = NULLIF(v_b->>'file_size_limit', '')::bigint,
           allowed_mime_types = CASE WHEN v_b->'allowed_mime_types' IS NULL OR jsonb_typeof(v_b->'allowed_mime_types') = 'null' THEN NULL
                                     ELSE ARRAY(SELECT jsonb_array_elements_text(v_b->'allowed_mime_types')) END
     WHERE id = 'pets-images';
  END IF;
  RAISE NOTICE 'Storage reaberto: % política(s) restaurada(s). O upload anônimo voltou a funcionar.', v_n;
END
$rb$;
COMMIT;
