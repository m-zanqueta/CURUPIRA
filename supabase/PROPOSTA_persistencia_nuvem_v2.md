# Curupira — Persistência em nuvem de inventário e equipados (proposta v2, para revisão)

Estado: **somente análise e proposta. Nada foi executado no Supabase real, nada foi integrado ao app.**
Base analisada: PR #31 (`24ded8f`, buscado do GitHub) e `origin/dev` (`98c9326`). O PR #31 difere de `dev` só em 4 arquivos
(`App.js`, `screens/EntrarTurma.js`, `screens/PetScreen.js`, `services/storage.js`).
Limite: não tenho acesso ao seu `D:\facul\...` (sessão sem computador vinculado), então **`git status` local, a branch e o arquivo `sets` não foram vistos por mim** (ver seção 8).

## 1. Diagnóstico do código atual

| Assunto | Onde | Situação |
|---|---|---|
| Inventário | `services/storage.js` `listarItensComprados`, `comprarItem` (≈l.594-612) | `AsyncStorage` `itens_comprados_<alunoId>`; por dispositivo; sem validação de saldo no servidor |
| Saldo | `screens/LojaScreen.js` (≈l.136-150) | `aluno.xp − Σ preco(comprados)` calculado no cliente; `aluno.xp` vem do **snapshot do login/sessão salva** (pode estar velho); fallback `?? 1000` |
| Equipados | `storage.js` `listarEquipados`, `atualizarEquipado` (≈l.633-677) | `AsyncStorage` `equipados_<aluno>_<pet\|semturma>` = `{chapeu,colar,fundo}`; por dispositivo |
| Login do aluno | `storage.js` `buscarAluno` (≈l.487); `screens/Login.js` | `SELECT * FROM alunos WHERE email=… AND senha=…` direto da tabela com a anon key. Atalho **mock** `loja@gmail.com` retorna `id:'loja'` (string) |
| Sessão | `storage.js` `salvarSessaoApp`/`obterSessaoApp`; `App.js` | `curupira_sessao_app` guarda o objeto aluno sem senha; **sem token**: qualquer um que escreva esse JSON "é" o aluno |
| Aluno → turma → pet | `alunos."turmaId"` (camelCase), `pets.turma_id`, `buscarTurmaDoAluno` | 1 pet por turma (usa `.maybeSingle()`); `alunos_missoes` referencia `aluno_id/turma_id/pet_id` como `bigint` |
| Catálogo | `acessorios` (`listarAcessoriosLoja`) | slots aceitos hoje: chapeu, colar, fundo (+ legados cabeca/roupa/outro); `preco >= 0` |

## 2. Banco (migrations do repositório) — fatos que condicionam o desenho
- `alunos.id`, `turmas.id`, `pets.id`: **bigint** (via FKs em `20260925`). O tipo de `acessorios.id` **não aparece** em nenhuma migration; `alunos` e `acessorios` não são criadas nas migrations (vieram de fora) → **rodar os pré-checks da seção 7**.
- **Não há Supabase Auth**: `auth.uid()` é sempre `NULL` para o app; ele **não** identifica `alunos.id`. Policies "por usuário" não funcionam.
- Só `coordenadores` tem RLS ligado. `alunos` tem `senha` em **texto puro** e é legível pela anon key (`SELECT *`). `acessorios`/`icones_missoes` aceitam INSERT/UPDATE/DELETE de `anon` com `USING (true)` (`20261002`, `20261013`).
- Padrão do projeto para dado sensível: tabela sem grants + RPC `SECURITY DEFINER` (`login_coordenador`, `salvar_missao_com_turmas` …).
- XP do aluno **muda e pode diminuir**: gatilho `aplicar_xp_aluno_missao` faz `UPDATE alunos SET xp = GREATEST(xp ± delta, 0)` e **reverte** XP ao editar/excluir missão aprovada (`20260925`, `20261004`).
- `pets_acessorios_equipados(pet_id, slot, acessorio_id)`: **não está em nenhuma migration**, a chave é por PET (= turma inteira). Não serve para escolha individual. **Proposta: não reutilizar, não alterar.**

## 3. Problemas da proposta anterior (v1) — a v1 não deve ser executada
1. `p_aluno` vinha do cliente: qualquer um com a anon key compra/equipa/lê inventário **de qualquer aluno** (a própria v1 listava o risco, mas não o resolvia).
2. `comprar_item`: com `ON CONFLICT DO NOTHING`, se o item já existia, **retornava um saldo menor que o real** (como se tivesse cobrado) — bug.
3. `equipar_item` não validava que o item pertence ao **slot** pedido (chapéu em `fundo`), nem que o PET é o da **turma do aluno**, nem `ativo`.
4. `listar_inventario(p_aluno)` era executável por anon para qualquer aluno.
5. FK de `acessorio_id` sem `ON DELETE` definido; como o painel ADM pode apagar acessórios (policy `DELETE USING (true)`), um DELETE poderia apagar o inventário (se fosse CASCADE) ou falhar de forma não planejada.
6. Tipos `bigint/uuid` "a ajustar" — sem verificar; `alunos."turmaId"` não foi considerado.
7. Não tratava XP que diminui (saldo negativo), nem migração de **vários dispositivos** com o mesmo XP.
8. `SET search_path = public` (menos seguro que `''` + nomes qualificados); `REVOKE ... FROM public` sem lista de assinaturas completas.
9. Nenhum plano para o estado local já existente nem testes.

## 4. Arquitetura de identidade recomendada
Como não há Supabase Auth, a identidade tem de ser provada **no servidor**:
1. `login_aluno(email, senha)` (RPC, `SECURITY DEFINER`) verifica a senha no banco e emite um **token aleatório de 256 bits**; só o **SHA-256** do token fica em `alunos_sessoes` (expira em 30 dias, revogável no logout).
2. Toda RPC de loja/equipados recebe `p_token`, resolve `aluno_id` internamente (`_aluno_da_sessao`) e **ignora qualquer id enviado pelo cliente**. Não existe parâmetro `p_aluno`.
3. As tabelas novas têm RLS ligado, **sem policies e sem grants** para `anon`/`authenticated`; funções internas revogadas; só as 6 RPCs públicas têm `EXECUTE`.
4. `service_role` **nunca** vai para o app. Nada nesta proposta usa a chave de serviço.
5. Senha: a migration adiciona `alunos.senha_hash` (bcrypt) e preenche no 1º login; continua aceitando a senha antiga enquanto o hash for nulo. **Não remove `alunos.senha`** — exige mudar o cadastro (`salvarUsuario`) e é decisão da equipe.

Alternativas consideradas: (a) **Supabase Auth** para alunos — o desenho mais correto a longo prazo (`auth.uid()` + RLS por linha), mas muda cadastro/login/professores e a base de alunos existente; (b) JWT próprio via Edge Function — exige guardar segredo do JWT e infra nova. Recomendo o token por RPC agora (compatível com o padrão `login_coordenador`) e (a) como evolução.

## 5. Migration revisada
Arquivo: `supabase/migrations/20261016_persistencia_inventario_equipados.sql` (**não executada**). Resumo:
- Tabelas: `alunos_sessoes`, `alunos_itens` (PK `(aluno_id, acessorio_id)`, `preco_pago` congelado, `origem`), `alunos_equipados` (PK `(aluno_id, pet_id, slot)`, FK composta para o inventário do mesmo aluno).
- Gatilho `validar_aluno_equipado`: slot do item = slot pedido; PET pertence à turma atual do aluno.
- RPCs: `login_aluno`, `logout_aluno`, `obter_estado_loja` (xp, saldo, comprados, equipados — saldo sempre do banco), `comprar_acessorio` (atômica), `equipar_acessorio` (NULL = desequipa), `importar_estado_local`.
- Compra atômica: `SELECT … FOR UPDATE` na linha de `alunos` (serializa duplo clique, dois dispositivos **e** o gatilho de XP). Recompra é idempotente (`ja_possuia:true`, `cobrado:0`).
- `alunos_itens.acessorio_id … ON DELETE RESTRICT`: o painel ADM **não conseguirá apagar** item já comprado (erro de FK). Recomendação: o ADM passa a desativar (`ativo=false`) em vez de excluir — decisão da equipe.
- Aditiva e reexecutável (`IF NOT EXISTS`/`CREATE OR REPLACE`); única alteração em tabela existente: `ALTER TABLE alunos ADD COLUMN senha_hash`.

### Decisões em aberto (precisam de resposta da equipe)
1. **Saldo negativo**: como o XP pode cair (missão revertida), `xp − gasto` pode ficar negativo (testado: −100). Opções: manter (bloqueia compras até recuperar), ou criar ledger de moedas separado do XP. A migration mantém a regra atual e devolve o saldo real (o app deve exibir `max(0, saldo)`).
2. **Aluno sem turma** (`'semturma'` local hoje): na nuvem equipados exige PET; como a PR #30 já redireciona aluno sem pet à tela de código, o caso fica inalcançável. Compras continuam possíveis sem turma.
3. **E-mails duplicados** em `alunos`: `login_aluno` usa `LIMIT 1`. Se não houver `UNIQUE(email)`, é ambíguo → verificar (pré-check).
4. Remoção de `alunos.senha` em texto puro e fechamento do `SELECT` anônimo em `alunos` (problema anterior a esta proposta).
5. Atalho mock `loja@gmail.com` (`id:'loja'`) não pode usar a nuvem (não é bigint nem aluno real) — manter o caminho local só para ele ou removê-lo.

## 6. Plano de migração do inventário local (sem duplicar compras)
No primeiro login com a nova versão, **depois** de `login_aluno` e `obter_estado_loja`:
1. Ler `itens_comprados_<id>` e todos os `equipados_<id>_<pet>` do dispositivo (ignorar `semturma`).
2. Chamar `importar_estado_local(token, itens[], equipados[])`. A função é **idempotente**: ignora o que já está na nuvem (a nuvem vence), importa só item `ativo` dos 3 slots, em ordem de `id`, cobrando o **preço atual** (o preço da época não é conhecido) e **parando quando o saldo acaba** — itens excedentes voltam em `rejeitados` com motivo. Equipados só entram se o item estiver no inventário e o PET for da turma do aluno.
3. Vários dispositivos: cada um calculou o saldo com o mesmo XP, então a soma pode exceder o saldo; o saldo **limita** o total. Ordem de importação não é cronológica (dado inexistente) → mostrar ao aluno a lista de rejeitados; decisão de política para casos de excesso (ex.: o professor/ADM pode ajustar) — equipe.
4. Só após sucesso, gravar a marca `migrado_<alunoId>=1` no dispositivo (**não apagar** as chaves antigas nesta fase; remover numa versão posterior). Falha de rede = tenta de novo no próximo login; repetir é seguro.
5. Compras inconsistentes (id inexistente/desativado, ids duplicados no array, valores não numéricos) são descartadas e relatadas, sem erro fatal.

## 7. Pré-checks (somente leitura) — rodar no SQL Editor **antes** de qualquer execução
```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name in ('alunos','acessorios','pets','turmas','pets_acessorios_equipados')
order by table_name, ordinal_position;
select extname, extnamespace::regnamespace from pg_extension where extname='pgcrypto';
select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' order by 1;
select tablename, policyname, cmd, roles from pg_policies where schemaname='public' order by 1,2;
select lower(email), count(*) from public.alunos group by 1 having count(*)>1;           -- e-mails duplicados
select turma_id, count(*) from public.pets group by 1 having count(*)>1;                  -- >1 pet por turma
select slot, count(*) from public.acessorios group by 1;
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.alunos'::regclass;
```
Se `pgcrypto` estiver em outro schema que não `extensions`, ajustar os prefixos `extensions.` da migration.

## 8. O arquivo `sets`
Não consigo vê-lo (está só na sua máquina; ele não existe no PR #31 nem em `dev`). Para identificar a origem sem alterá-lo, no PowerShell (somente leitura):
`git status --short`, `Get-Item .\sets | Format-List *`, `Get-Content .\sets -TotalCount 30`, `git log --all --oneline -- sets`, `git check-ignore -v sets`.
Não foi tocado, adicionado ou movido por nada que eu fiz.

## 9. Plano de testes
**Simulados / locais (já executados por mim, Postgres 16 local descartável com esquema simulado — NÃO é o Supabase real):**
`teste_migration_SIMULADO.sql` (40 verificações: login, hash, acesso direto negado, token inválido/expirado/revogado, compra, recompra, saldo insuficiente, slots, PET de outra turma, isolamento entre alunos, importação idempotente, saldo negativo, FKs) e `teste_concorrencia_SIMULADO.sh` (duas sessões; a segunda esperou ≈1,3 s pelo lock e falhou com `saldo_insuficiente`; 1 item, gasto 100).
**Limite:** o schema simulado foi reconstruído das migrations; `alunos`, `acessorios`, `pets` reais podem ter colunas/constraints/triggers que não conheço.

**Reais (a fazer, só após aprovação, em projeto Supabase de homologação):**
1. Pré-checks da seção 7 e `EXPLAIN`/dry-run da migration em cópia (branch/projeto de teste).
2. RPCs via PostgREST com a anon key: acesso direto às 3 tabelas retorna 401/403; token inválido → `sessao_invalida`.
3. Duas sessões reais do mesmo aluno (dois navegadores/dispositivos): compra em A aparece em B; compra simultânea do mesmo item/itens com saldo para um → exatamente um sucesso; equipar em A aparece em B após recarregar.
4. Migração: aluno com localStorage real → importação → reimportação sem duplicar; segundo dispositivo com conjunto diferente.
5. Missão aprovada/revertida enquanto compra → saldo coerente.
6. Regressão do app (loja 15 checks, cenário 17 checks, EntrarTurma 16 checks) com o cliente já integrado.
**Sincronização entre dispositivos só será declarada validada após o item 3 em Supabase real.**

## 10. Mapeamento app (a implementar só após aprovação)
`buscarAluno`→`login_aluno` (guardar `token` na sessão, nunca a senha); `listarItensComprados`/saldo→`obter_estado_loja`; `comprarItem`→`comprar_acessorio` (tratar `ja_possuia`, `saldo_insuficiente`); `listarEquipados/atualizarEquipado`→`obter_estado_loja`/`equipar_acessorio`; logout→`logout_aluno`; `sessao_invalida` → limpar sessão e ir ao login. `localStorage` vira cache otimista e fonte da migração.
