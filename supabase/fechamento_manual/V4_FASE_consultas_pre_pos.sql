-- V4 · FASE 2 — consultas SOMENTE LEITURA (rode ANTES e DEPOIS). Não alteram nada e não mostram senhas nem hashes: só contagens.
-- NOTA: ANTES da fase, as linhas "com texto puro ... pós: 0" e "(pós) gatilhos" aparecem ok=false — é o esperado; elas só precisam ser true DEPOIS.
-- Coluna ok: true = condição satisfeita. PRÉ: as linhas marcadas (pré) devem ser true para a fase poder rodar. PÓS: todas true.
SELECT * FROM (
  SELECT 'alunos: total' AS verificacao, count(*)::text AS valor, NULL::boolean AS ok FROM public.alunos
  UNION ALL SELECT 'alunos: com texto puro (pré: informativo; pós: 0)', count(*)::text, (SELECT count(*) = 0 FROM public.alunos WHERE senha IS NOT NULL) FROM public.alunos WHERE senha IS NOT NULL
  UNION ALL SELECT 'alunos: com texto puro e SEM hash (pré: informativo)', count(*)::text, NULL FROM public.alunos a WHERE a.senha IS NOT NULL AND a.senha <> '' AND NOT EXISTS (SELECT 1 FROM public.alunos_credenciais c WHERE c.aluno_id = a.id)
  UNION ALL SELECT 'alunos: hash não confere com o texto puro (pré: 0)', count(*)::text, count(*) = 0 FROM public.alunos a JOIN public.alunos_credenciais c ON c.aluno_id = a.id WHERE a.senha IS NOT NULL AND a.senha <> '' AND c.senha_hash <> extensions.crypt(a.senha, c.senha_hash)
  UNION ALL SELECT 'alunos: hash com formato inválido (pré/pós: 0)', count(*)::text, count(*) = 0 FROM public.alunos_credenciais WHERE senha_hash !~ '^\$2[aby]\$[0-9]{2}\$.{53}$'
  UNION ALL SELECT 'alunos: SEM nenhuma credencial (não conseguem entrar; informativo)', count(*)::text, NULL FROM public.alunos a WHERE NOT EXISTS (SELECT 1 FROM public.alunos_credenciais c WHERE c.aluno_id = a.id)
  UNION ALL SELECT 'professores: total', count(*)::text, NULL FROM public.professores
  UNION ALL SELECT 'professores: com texto puro (pré: informativo; pós: 0)', count(*)::text, (SELECT count(*) = 0 FROM public.professores WHERE senha IS NOT NULL) FROM public.professores WHERE senha IS NOT NULL
  UNION ALL SELECT 'professores: com texto puro e SEM hash (pré: informativo)', count(*)::text, NULL FROM public.professores p WHERE p.senha IS NOT NULL AND p.senha <> '' AND NOT EXISTS (SELECT 1 FROM public.professores_credenciais c WHERE c.professor_id = p.id)
  UNION ALL SELECT 'professores: hash não confere com o texto puro (pré: 0)', count(*)::text, count(*) = 0 FROM public.professores p JOIN public.professores_credenciais c ON c.professor_id = p.id WHERE p.senha IS NOT NULL AND p.senha <> '' AND c.senha_hash <> extensions.crypt(p.senha, c.senha_hash)
  UNION ALL SELECT 'professores: hash com formato inválido (pré/pós: 0)', count(*)::text, count(*) = 0 FROM public.professores_credenciais WHERE senha_hash !~ '^\$2[aby]\$[0-9]{2}\$.{53}$'
  UNION ALL SELECT 'professores: SEM nenhuma credencial (não conseguem entrar; informativo)', count(*)::text, NULL FROM public.professores p WHERE NOT EXISTS (SELECT 1 FROM public.professores_credenciais c WHERE c.professor_id = p.id)
  UNION ALL SELECT '(pré) fechamento V4 aplicado (snapshot existe)', (to_regclass('public.v4_fechamento_snapshot') IS NOT NULL)::text, to_regclass('public.v4_fechamento_snapshot') IS NOT NULL
  UNION ALL SELECT '(pré/pós) anon sem privilégio de tabela/coluna em alunos e professores', 'anon', NOT (has_any_column_privilege('anon','public.alunos','SELECT,INSERT,UPDATE,REFERENCES') OR has_any_column_privilege('anon','public.professores','SELECT,INSERT,UPDATE,REFERENCES'))
  UNION ALL SELECT '(pré/pós) authenticated sem privilégio em alunos e professores', 'authenticated', NOT (has_any_column_privilege('authenticated','public.alunos','SELECT,INSERT,UPDATE,REFERENCES') OR has_any_column_privilege('authenticated','public.professores','SELECT,INSERT,UPDATE,REFERENCES'))
  UNION ALL SELECT '(pré) funções executáveis por anon/authenticated que citam alunos/professores E senha — conferir nomes na lista abaixo',
         count(*)::text, NULL FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prokind = 'f'
         AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
         AND pg_get_functiondef(p.oid) ~* '\m(alunos|professores)\M' AND pg_get_functiondef(p.oid) ~* '\msenha\M'
  UNION ALL SELECT '(pós) gatilhos da fase 2 presentes (4 esperados)', count(*)::text, count(*) = 4 FROM pg_trigger WHERE tgname LIKE 'v4_fase2%' AND NOT tgisinternal
  UNION ALL SELECT '(pós) gatilho AFTER antigo removido (0 esperado)', count(*)::text, count(*) = 0 FROM pg_trigger WHERE tgname IN ('alunos_sincroniza_credencial','professores_sincroniza_credencial') AND NOT tgisinternal
  UNION ALL SELECT 'sessões de aluno ativas (informativo)', count(*)::text, NULL FROM public.alunos_sessoes WHERE revogado_em IS NULL AND expira_em > now()
  UNION ALL SELECT 'sessões de staff ativas (informativo)', count(*)::text, NULL FROM public.staff_sessoes WHERE revogado_em IS NULL AND expira_em > now()
) z;

-- Lista (nomes apenas) das funções do item "(pré) funções executáveis…": cada uma precisa estar na lista revisada do script da fase.
SELECT p.oid::regprocedure::text AS funcao_a_revisar
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prokind = 'f'
   AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
   AND pg_get_functiondef(p.oid) ~* '\m(alunos|professores)\M' AND pg_get_functiondef(p.oid) ~* '\msenha\M'
 ORDER BY 1;
