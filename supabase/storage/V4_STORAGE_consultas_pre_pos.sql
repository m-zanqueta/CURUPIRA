-- V4 · STORAGE — consultas SOMENTE LEITURA (rode ANTES e DEPOIS do script de fechamento). Mostra políticas e configuração do bucket.
-- Depois: "políticas de escrita alcançáveis por anon/authenticated/public para pets-images" deve ser 0.
SELECT 'bucket pets-images: público / limite / tipos' AS item, concat_ws(' / ', public::text, COALESCE(file_size_limit::text, 'sem limite'), COALESCE(array_to_string(allowed_mime_types, ','), 'qualquer tipo')) AS valor, NULL::boolean AS ok
  FROM storage.buckets WHERE id = 'pets-images'
UNION ALL SELECT 'RLS ligado em storage.objects', relrowsecurity::text, relrowsecurity FROM pg_class WHERE oid = 'storage.objects'::regclass
UNION ALL SELECT 'política em storage.objects: ' || policyname, concat_ws(' | ', cmd, array_to_string(roles, ','), left(COALESCE(qual, with_check, ''), 80)), NULL
  FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
UNION ALL SELECT 'políticas de escrita alcançáveis por anon/authenticated/public para pets-images', count(*)::text, count(*) = 0
  FROM pg_policies p WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
   AND (p.roles && ARRAY['public', 'anon', 'authenticated']::name[])
   AND (COALESCE(p.qual, '') || ' ' || COALESCE(p.with_check, '') ~ '\mpets-images\M' OR COALESCE(p.qual, '') || ' ' || COALESCE(p.with_check, '') !~ 'bucket_id')
UNION ALL SELECT 'função storage_autorizar_operacao NÃO executável por anon/authenticated',
  COALESCE((SELECT (NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'))::text FROM pg_proc p WHERE p.proname = 'storage_autorizar_operacao' AND p.pronamespace = 'public'::regnamespace), 'ausente'),
  (SELECT (NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')) FROM pg_proc p WHERE p.proname = 'storage_autorizar_operacao' AND p.pronamespace = 'public'::regnamespace);
