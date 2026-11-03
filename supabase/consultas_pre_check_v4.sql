-- V4 · PRÉ-CHECK (SOMENTE LEITURA — nenhum comando altera dados). Rode no SQL Editor da HOMOLOGAÇÃO (e, com autorização, da produção)
-- ANTES da migration 20261027 e ANTES do fechamento. Guarde a saída: ela é a referência do "estado antes".
-- 1) Ordem das migrations aplicadas (a 20261027 DEVE vir depois da 20261026)
SELECT version, name FROM supabase_migrations.schema_migrations WHERE version >= '20261013' ORDER BY version;
-- 2) login_aluno é a versão V3 (emite token) ou a LEGADA da 20261026? (esperado ANTES da V4: false se a 20261026 foi aplicada)
SELECT pg_get_functiondef('public.login_aluno(text,text)'::regprocedure) LIKE '%alunos_sessoes%' AS login_aluno_e_v3;
-- 3) RLS e privilégios de anon por tabela (o que o fechamento vai mudar)
SELECT c.relname AS tabela, c.relrowsecurity AS rls,
       COALESCE((SELECT string_agg(g.privilege_type, ',' ORDER BY g.privilege_type) FROM information_schema.role_table_grants g
                  WHERE g.table_schema='public' AND g.table_name=c.relname AND g.grantee='anon'), '-') AS privilegios_anon
FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' ORDER BY 1;
-- 4) Privilégios por COLUNA para anon/authenticated (GRANT por coluna não aparece no item 3)
SELECT table_name, column_name, grantee, privilege_type FROM information_schema.role_column_grants
 WHERE table_schema='public' AND grantee IN ('anon','authenticated') ORDER BY 1,2,3,4;
-- 5) Políticas existentes
SELECT tablename, policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname='public' ORDER BY 1,2;
-- 6) Funções de public executáveis por anon (SECURITY DEFINER marcada). Compare com a lista permitida do fechamento.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef AS security_definer, r.rolname AS dono,
       (r.rolsuper OR r.rolbypassrls) AS dono_ignora_rls, p.proconfig AS config
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
WHERE n.nspname='public' AND p.prokind='f' AND has_function_privilege('anon', p.oid, 'EXECUTE') ORDER BY 1;
-- 7) SECURITY DEFINER sem search_path fixo (risco de sequestro de objeto) — informativo
SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosecdef AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%');
-- 8) Credencial padrão do repositório do coordenador ainda ativa? (o fechamento ABORTA se true)
SELECT to_regclass('public.coordenadores') IS NOT NULL AND EXISTS (SELECT 1 FROM public.coordenadores c WHERE c.ativo AND c.senha_hash = extensions.crypt('Coordenador123!', c.senha_hash)) AS coordenador_com_senha_padrao;
-- 9) Dados que podem colidir com regras novas
SELECT lower(email) AS email_duplicado, count(*) FROM public.alunos GROUP BY 1 HAVING count(*) > 1;
SELECT codigo AS codigo_turma_duplicado, count(*) FROM public.turmas GROUP BY 1 HAVING count(*) > 1;
SELECT tipo, count(*) FROM public.professores GROUP BY 1;
SELECT count(*) AS alunos_com_senha_em_texto FROM public.alunos WHERE senha IS NOT NULL AND senha <> '';
SELECT count(*) AS professores_com_senha_em_texto FROM public.professores WHERE senha IS NOT NULL AND senha <> '';
-- 10) Tabelas V4 já existem? (esperado antes: nenhuma)
SELECT t FROM unnest(ARRAY['administradores','professores_credenciais','staff_sessoes','staff_login_falhas','limite_taxa_eventos','v4_fechamento_snapshot']) t WHERE to_regclass('public.'||t) IS NOT NULL;
-- 11) Tarefas com etapas (20261023/24) presentes?
SELECT to_regclass('public.alunos_missoes_etapas') IS NOT NULL AS tem_etapas,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='missoes' AND column_name='etapas') AS missoes_etapas,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alunos' AND column_name='moedas') AS alunos_moedas;
-- 12) Storage: políticas do bucket pets-images (o fechamento NÃO as altera — ver README, risco residual)
SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname='storage' AND tablename='objects' ORDER BY 1;
