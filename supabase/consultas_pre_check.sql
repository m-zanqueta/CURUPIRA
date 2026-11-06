-- PRÉ-CHECK (SOMENTE LEITURA). Rode no SQL Editor do projeto de HOMOLOGAÇÃO (e depois no de produção) ANTES da migration.
-- Nada aqui altera dados. Guarde a saída: ela decide se a migration pode ser aplicada como está.

-- 0) Tabelas das quais a migration depende (esperado: existe = true para as 4 primeiras; alunos_missoes/missoes vêm das migrations de missões)
select t.nome, to_regclass('public.'||t.nome) is not null as existe,
       case when to_regclass('public.'||t.nome) is null
            then case when t.obrigatoria then 'ERRO: a migration NÃO pode ser aplicada sem esta tabela' else 'AVISO: ausente; o gatilho de XP das missões não será conferido' end
            else 'ok' end as situacao
from (values ('alunos', true), ('acessorios', true), ('pets', true), ('turmas', true), ('alunos_missoes', false), ('missoes', false)) as t(nome, obrigatoria);

-- 1) Tipos reais das colunas que a migration referencia (esperado: bigint nas chaves; acessorios.id pode ser int4 ou int8)
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public'
  and ((table_name='alunos'     and column_name in ('id','email','senha','turmaId','xp'))
    or (table_name='acessorios' and column_name in ('id','slot','preco','ativo'))
    or (table_name='pets'       and column_name in ('id','turma_id'))
    or (table_name='turmas'     and column_name in ('id')))
order by table_name, column_name;
-- ATENÇÃO: alunos.senha com is_nullable = 'NO' impede a FASE 2 sem DROP NOT NULL (a fase 2 já faz isso, mas confira).

-- 2) pgcrypto: a migration usa extensions.crypt / gen_salt / digest / gen_random_bytes
select e.extname, n.nspname as schema_da_extensao from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgcrypto';
select name, default_version, installed_version from pg_available_extensions where name = 'pgcrypto';
-- Esperado no Supabase: schema_da_extensao = 'extensions'. Se for 'public', troque "extensions." no SQL antes de aplicar.

-- 3) E-mails duplicados (sem UNIQUE o login confere cada conta, mas o ideal é resolver)
select lower(trim(email)) as email, count(*) as contas, array_agg(id order by id) as ids
from public.alunos group by 1 having count(*) > 1;

-- 4) Contas sem senha utilizável (nunca conseguirão logar pelo login_aluno)
select count(*) filter (where senha is null) as senha_nula, count(*) filter (where senha = '') as senha_vazia, count(*) as total from public.alunos;

-- 5) Mais de um PET por turma? (o gatilho de equipados usa pets.turma_id = alunos."turmaId")
select turma_id, count(*) as pets from public.pets where turma_id is not null group by 1 having count(*) > 1;

-- 6) Quem pode fazer o quê em public.alunos HOJE (evidência do estado real; esperado: anon lê e escreve)
select grantee, privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name='alunos' and grantee in ('anon','authenticated','PUBLIC') order by 1,2;
select relname, relrowsecurity as rls_ligado, relforcerowsecurity as rls_forcado from pg_class where oid = to_regclass('public.alunos');  -- 0 linhas = alunos não existe (ver bloco 0)
select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public' and tablename='alunos';
select has_table_privilege('anon', c.oid, 'SELECT') as anon_le, has_table_privilege('anon', c.oid, 'UPDATE') as anon_altera,
       has_column_privilege('anon', c.oid, 'senha', 'SELECT') as anon_le_senha, has_column_privilege('anon', c.oid, 'xp', 'UPDATE') as anon_altera_xp
from pg_class c where c.oid = to_regclass('public.alunos');

-- 7) Gatilhos existentes em alunos (a migration adiciona alunos_sincroniza_credencial) e em alunos_missoes (XP)
select tgrelid::regclass as tabela, tgname, tgenabled from pg_trigger where not tgisinternal and tgrelid in (to_regclass('public.alunos'), to_regclass('public.alunos_missoes')) order by 1,2;

-- 8) Conflito de nomes: já existe algo com os nomes que a migration cria? (esperado: 0 linhas)
select 'tabela' as tipo, tablename as nome from pg_tables where schemaname='public' and tablename in ('alunos_sessoes','alunos_login_falhas','alunos_credenciais','alunos_itens','alunos_equipados','alunos_senha_legado_backup')
union all
select 'funcao', proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and proname in ('login_aluno','logout_aluno','obter_estado_loja','comprar_acessorio','equipar_acessorio','importar_estado_local','_aluno_da_sessao','_saldo_aluno','validar_aluno_equipado','sincronizar_credencial_aluno');

-- 9) Catálogo: slots usados e itens ativos (a loja só aceita chapeu/colar/fundo)
select slot, ativo, count(*) from public.acessorios group by 1,2 order by 1,2;

-- 10) Volume (estimativa do tempo da FASE 2: ~0,1 s de bcrypt por aluno com senha)
select count(*) as alunos_com_senha from public.alunos where senha is not null and senha <> '';
