-- V4 · PÓS-CHECK (SOMENTE LEITURA). Rode DEPOIS do fechamento. Cada linha tem coluna "ok":
--   true  = esperado;  false = NÃO publique;  NULL = NÃO VERIFICADO (conta como pendência, nunca como aprovação).
-- Contrato (após a migration 20261028): só acessorios e icones_missoes têm leitura pública (catálogos). Todas as demais tabelas de dados
-- ficam sem nenhum acesso direto para anon/authenticated; o app usa RPCs que validam o token e derivam o escopo no servidor.
WITH leitura(t) AS (VALUES ('acessorios'),('icones_missoes')),
     fechadas(t) AS (VALUES ('alunos'),('professores'),('alunos_missoes_etapas'),('turmas'),('pets'),('missoes'),('missoes_turmas'),('alunos_missoes'),('conquistas')),
     trancadas(t) AS (VALUES ('alunos_credenciais'),('alunos_sessoes'),('alunos_itens'),('alunos_equipados'),('alunos_login_falhas'),('administradores'),
                      ('professores_credenciais'),('staff_sessoes'),('staff_login_falhas'),('limite_taxa_eventos'),('coordenadores'),
                      ('v4_fechamento_snapshot'),('v4_fechamento_snapshot_funcoes')),
     leitura_rpc(f, papel) AS (VALUES ('staff_listar_turmas','staff'),('staff_listar_pets','staff'),('staff_listar_missoes','staff'),('staff_listar_status_missoes','staff'),
                      ('aluno_minha_turma','aluno'),('aluno_minhas_missoes','aluno'),('aluno_meu_progresso_geral','aluno'),('aluno_minhas_conquistas','aluno'))
SELECT 'catálogo público: só SELECT + RLS + política SELECT-only' AS verificacao, t AS objeto,
       (has_table_privilege('anon','public.'||t,'SELECT') AND NOT has_table_privilege('anon','public.'||t,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        AND NOT has_table_privilege('authenticated','public.'||t,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        AND NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=('public.'||t)::regclass AND a.attnum>0 AND NOT a.attisdropped
                         AND (has_column_privilege('anon','public.'||t,a.attname,'INSERT,UPDATE') OR has_column_privilege('authenticated','public.'||t,a.attname,'INSERT,UPDATE')))
        AND (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||t)::regclass)
        AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND cmd <> 'SELECT')) AS ok FROM leitura
UNION ALL SELECT 'tabela de dados fechada: anon e authenticated sem nenhum acesso (tabela nem coluna), RLS ligado, sem políticas', t,
       (NOT has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        AND NOT has_table_privilege('authenticated','public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        AND NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=('public.'||t)::regclass AND a.attnum>0 AND NOT a.attisdropped
                         AND (has_column_privilege('anon','public.'||t,a.attname,'SELECT,INSERT,UPDATE,REFERENCES') OR has_column_privilege('authenticated','public.'||t,a.attname,'SELECT,INSERT,UPDATE,REFERENCES')))
        AND (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||t)::regclass)
        AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t)) FROM fechadas
UNION ALL SELECT 'tabela interna (V3/V4): anon/authenticated sem acesso de tabela nem de coluna, RLS ligado', t,
       (NOT has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AND NOT has_table_privilege('authenticated','public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        AND NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=('public.'||t)::regclass AND a.attnum>0 AND NOT a.attisdropped
                         AND (has_column_privilege('anon','public.'||t,a.attname,'SELECT,INSERT,UPDATE,REFERENCES') OR has_column_privilege('authenticated','public.'||t,a.attname,'SELECT,INSERT,UPDATE,REFERENCES')))
        AND (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||t)::regclass))
  FROM trancadas WHERE to_regclass('public.'||t) IS NOT NULL
UNION ALL SELECT 'tabela interna esperada existe', t, to_regclass('public.'||t) IS NOT NULL FROM trancadas
UNION ALL SELECT 'nenhuma política permissiva de escrita em tabela de public', tablename||'.'||policyname, false
  FROM pg_policies WHERE schemaname='public' AND cmd <> 'SELECT'
UNION ALL SELECT 'nenhuma tabela de public (qualquer) com escrita/TRUNCATE para anon/authenticated', c.relname, false
  FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p')
   AND (has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') OR has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'))
UNION ALL SELECT 'nenhuma tabela de public (fora os 2 catálogos) legível por anon/authenticated', c.relname, false
  FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p') AND c.relname NOT IN ('acessorios','icones_missoes')
   AND (has_any_column_privilege('anon',c.oid,'SELECT') OR has_any_column_privilege('authenticated',c.oid,'SELECT'))
UNION ALL SELECT 'toda tabela de public com RLS ligado', c.relname, false
  FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p') AND NOT c.relrowsecurity
UNION ALL SELECT 'função EXECUTÁVEL por anon fora da lista permitida', p.oid::regprocedure::text, false
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind='f' AND has_function_privilege('anon',p.oid,'EXECUTE')
   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
   AND p.proname <> ALL (ARRAY['login_aluno','logout_aluno','obter_estado_loja','comprar_acessorio','equipar_acessorio','importar_estado_local',
    'login_staff','logout_staff','staff_perfil','cadastrar_aluno','email_aluno_existe','entrar_na_turma','staff_listar_alunos','staff_atualizar_aluno',
    'staff_remover_aluno_da_turma','staff_definir_status_missao','aluno_definir_status_missao','staff_salvar_missao','staff_definir_turmas_missao',
    'staff_definir_ativa_missao_turma','staff_remover_missao_da_turma','staff_excluir_missao','staff_criar_turma','staff_excluir_turma','admin_listar',
    'admin_atualizar','admin_inserir','admin_excluir','admin_definir_senha','obter_meu_perfil','staff_listar_professores','staff_alterar_minha_senha',
    'staff_atribuir_tarefa_global','staff_salvar_tarefa_global','aluno_avancar_etapa',
    'staff_listar_turmas','staff_listar_pets','staff_listar_missoes','staff_listar_status_missoes','aluno_minha_turma','aluno_minhas_missoes',
    'aluno_meu_progresso_geral','aluno_minhas_conquistas'])
UNION ALL SELECT 'RPC antiga/legada NÃO executável por anon nem authenticated', f, NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname=f AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE')))
  FROM unnest(ARRAY['login_coordenador','login_professor','email_aluno_ja_existe','salvar_missao_com_turmas','definir_turmas_missao','definir_ativa_missao_turma',
                    'remover_missao_da_turma','avancar_etapa_tarefa']) f
UNION ALL SELECT 'funções de gatilho de XP/moedas NÃO executáveis por anon nem authenticated', p.oid::regprocedure::text, false
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('preparar_aluno_missao','aplicar_xp_aluno_missao','sincronizar_xp_missao_editada','validar_status_tarefa_autenticado',
       'preparar_moedas_tarefa','aplicar_moedas_tarefa','aplicar_xp_etapa_tarefa','proteger_alteracoes_perfil')
   AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))
UNION ALL SELECT 'SECURITY DEFINER do app com search_path fixo e dono que ignora RLS', p.oid::regprocedure::text,
       (EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%') AND (r.rolsuper OR r.rolbypassrls))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
 WHERE n.nspname='public' AND p.prosecdef AND has_function_privilege('anon',p.oid,'EXECUTE')
UNION ALL SELECT 'RPC de leitura protegida existe, é SECURITY DEFINER, recebe SÓ o token, valida a sessão no servidor (staff: _staff_exigir / aluno: _aluno_da_sessao)', f,
       EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname=f AND p.prosecdef AND p.pronargs=1 AND p.proargnames = ARRAY['p_token']
                  AND pg_get_functiondef(p.oid) LIKE CASE papel WHEN 'staff' THEN '%_staff_exigir(p_token%' ELSE '%_aluno_da_sessao(p_token%' END)
  FROM leitura_rpc
UNION ALL SELECT 'login_aluno é a versão V3 (token de sessão)', 'login_aluno', pg_get_functiondef('public.login_aluno(text,text)'::regprocedure) LIKE '%alunos_sessoes%'
UNION ALL SELECT 'existe administrador ativo', 'administradores', EXISTS (SELECT 1 FROM public.administradores WHERE ativo)
UNION ALL SELECT 'snapshot das tabelas gravado (base do rollback)', 'v4_fechamento_snapshot', (SELECT count(*) >= 11 FROM public.v4_fechamento_snapshot)
UNION ALL SELECT 'snapshot das funções gravado (nível D do rollback)', 'v4_fechamento_snapshot_funcoes', (SELECT count(*) > 0 FROM public.v4_fechamento_snapshot_funcoes)
UNION ALL SELECT 'coordenador sem a senha padrão do repositório', 'coordenadores', NOT EXISTS (SELECT 1 FROM public.coordenadores c WHERE c.ativo AND c.senha_hash = extensions.crypt('Coordenador123!', c.senha_hash))
UNION ALL SELECT 'hash de senha de professores em tabela trancada (todos com senha têm hash)', 'professores_credenciais',
       NOT EXISTS (SELECT 1 FROM public.professores p WHERE p.senha IS NOT NULL AND p.senha <> '' AND NOT EXISTS (SELECT 1 FROM public.professores_credenciais c WHERE c.professor_id=p.id))
UNION ALL SELECT 'storage_autorizar_operacao existe e NÃO é executável por anon/authenticated/PUBLIC (só service_role)', 'storage_autorizar_operacao',
       COALESCE((SELECT NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE') AND NOT has_function_privilege('public', p.oid, 'EXECUTE')
                   AND p.prosecdef AND p.proconfig @> ARRAY['search_path=""'] FROM pg_proc p WHERE p.proname = 'storage_autorizar_operacao' AND p.pronamespace = 'public'::regnamespace), false)
UNION ALL SELECT 'migrations 20261027, 20261028 e 20261029 registradas no catálogo do Supabase (NULL = catálogo ausente: NÃO VERIFICADO)', 'supabase_migrations.schema_migrations',
       CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN NULL
            ELSE (xpath('/row/c/text()', query_to_xml('select count(*) c from supabase_migrations.schema_migrations where version in (''20261027'',''20261028'',''20261029'') or name like ''20261027%'' or name like ''20261028%'' or name like ''20261029%''', false, true, '')))[1]::text::int >= 3 END
ORDER BY 1, 2;
-- Itens que este pós-check NÃO cobre (ver README): políticas/bucket do Storage (use supabase/storage/V4_STORAGE_consultas_pre_pos.sql), texto puro em alunos.senha/professores.senha
-- (Fase 2: fechamento_manual/V4_FASE_*), validação no Supabase/PostgREST REAL (este arquivo só inspeciona o catálogo do PostgreSQL).
