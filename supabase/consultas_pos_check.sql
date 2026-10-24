-- PÓS-CHECK (SOMENTE LEITURA). Rode depois da migration. Cada bloco diz o resultado esperado.

-- 1) As 6 RPCs públicas existem, são SECURITY DEFINER e têm search_path vazio (esperado: 6 linhas, definer = true, search_path = {search_path=""})
select p.proname, p.prosecdef as definer, p.proconfig as config
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('login_aluno','logout_aluno','obter_estado_loja','comprar_acessorio','equipar_acessorio','importar_estado_local') order by 1;

-- 2) Quem pode EXECUTAR (esperado: RPCs públicas = anon true; funções internas/gatilho = anon false)
select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_executa, has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_executa
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('login_aluno','logout_aluno','obter_estado_loja','comprar_acessorio','equipar_acessorio','importar_estado_local','_aluno_da_sessao','_saldo_aluno','sincronizar_credencial_aluno','validar_aluno_equipado') order by 1;

-- 3) As 5 tabelas novas: RLS ligado e NENHUM privilégio para anon/authenticated (esperado: rls_ligado = true; todos os privilégios = false)
select c.relname, c.relrowsecurity as rls_ligado,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_select, has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
       has_table_privilege('anon', c.oid, 'UPDATE') as anon_update, has_table_privilege('anon', c.oid, 'DELETE') as anon_delete,
       has_table_privilege('authenticated', c.oid, 'SELECT') as auth_select
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('alunos_sessoes','alunos_login_falhas','alunos_credenciais','alunos_itens','alunos_equipados') order by 1;

-- 4) Gatilhos (esperado: alunos_sincroniza_credencial em alunos; alunos_equipados_validar em alunos_equipados)
select tgrelid::regclass as tabela, tgname, tgenabled from pg_trigger where not tgisinternal and tgname in ('alunos_sincroniza_credencial','alunos_equipados_validar') order by 2;

-- 5) public.alunos NÃO ganhou colunas (esperado: nenhuma coluna chamada senha_hash)
select count(*) as colunas_senha_hash from information_schema.columns where table_schema='public' and table_name='alunos' and column_name='senha_hash';

-- 6) Integridade (esperado: 0 e 0)
select (select count(*) from public.alunos_itens i where not exists (select 1 from public.acessorios a where a.id = i.acessorio_id)) as itens_orfaos,
       (select count(*) from public.alunos_equipados e where not exists (select 1 from public.alunos_itens i where i.aluno_id=e.aluno_id and i.acessorio_id=e.acessorio_id)) as equipados_sem_posse;

-- 7) Saldo por aluno = xp - gasto (informativo; negativo só se o XP caiu depois de compras)
select a.id, a.xp, coalesce(sum(i.preco_pago),0) as gasto, a.xp - coalesce(sum(i.preco_pago),0) as saldo
from public.alunos a left join public.alunos_itens i on i.aluno_id = a.id group by a.id, a.xp having a.xp - coalesce(sum(i.preco_pago),0) < 0;

-- 8) Credenciais: quantos alunos já têm hash (cresce a cada 1º login; a FASE 2 completa o resto)
select (select count(*) from public.alunos where senha is not null and senha <> '') as alunos_com_senha, (select count(*) from public.alunos_credenciais) as com_hash;

-- 9) Sessões ativas e falhas recentes (monitoramento)
select (select count(*) from public.alunos_sessoes where revogado_em is null and expira_em > now()) as sessoes_ativas,
       (select count(*) from public.alunos_login_falhas where ocorrido_em > now() - interval '15 minutes') as falhas_15min;
