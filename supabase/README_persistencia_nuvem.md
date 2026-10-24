# Persistência em nuvem (inventário, saldo, equipados) — V3

**Estado: a migration NÃO foi aplicada em nenhum Supabase (homologação ou produção).** Tudo foi testado em PostgreSQL 16 local
+ um simulador próprio de PostgREST (`testes/shim/shim.js`) + Playwright. **Isso não é o Supabase real nem o PostgREST real.**
A persistência em produção só passa a existir depois de aplicar e validar a migration (seção 4) e publicar o app.

- Commit-base esperado do patch: **`24ded8fb0bfdf16c793a2c254f8de349ec5ec248`** (PR #31, "fix: persistencia do cenario e fluxo de entrada do aluno").
- Dois patches: `persistencia_nuvem_sobre_PR31.patch` (limpo sobre o commit-base) e `persistencia_nuvem_V1_para_V3.patch` (para quem já aplicou a versão anterior).

## 1. Como funciona
- `login_aluno(email, senha)` confere a senha **no servidor** e devolve um token de 256 bits (guardado no app em `curupira_token_aluno`; no banco só o SHA-256).
- Toda operação (`obter_estado_loja`, `comprar_acessorio`, `equipar_acessorio`, `importar_estado_local`, `logout_aluno`) recebe o token; o aluno é descoberto no servidor. **O app nunca envia `aluno_id`, preço ou saldo.**
- Tabelas novas (`alunos_credenciais`, `alunos_sessoes`, `alunos_login_falhas`, `alunos_itens`, `alunos_equipados`): RLS ligado, sem policies e **sem grants** para `anon`/`authenticated`. Funções `SECURITY DEFINER` com `search_path` vazio.
- Saldo = `alunos.xp − Σ preco_pago`. Compra atômica com `SELECT … FOR UPDATE` na linha do aluno (serializa duplo clique, dois aparelhos e o gatilho de XP das missões).
- Migração local→nuvem automática por aluno/aparelho: importa, **concilia com o servidor**, só então move as chaves para `backup_*` (nunca apaga o backup) e grava `migrado_nuvem_<id>`.

### Estados que o app distingue (códigos `e.codigo` / `obterEstadoMigracao`)
| Situação | Comportamento |
|---|---|
| migration ausente no banco (PGRST202/42883) | **modo legado explícito** (login antigo, inventário local); único caso que autoriza o login legado |
| rede / 5xx / timeout | mensagem de conexão; nada é cobrado; sessão e dados locais intactos |
| erro de schema/permissão (ex.: 42501, PGRST1xx) | mensagem de **configuração**; **não** cai no login legado |
| `PT401 sessao_invalida` | token removido, volta ao login (logout continua voltando ao login) |
| `PT429 muitas_tentativas` | mensagem própria no login |
| migração `concluida` / `concluida_com_pendencias` / `pendente_rede` / `pendente_sessao` / `pendente_configuracao` / `pendente_reconciliacao` | banner na Loja; local intacto até a conciliação; itens não migrados ficam em `backup_*` |
| sessão antiga **sem token** | com a nuvem disponível (ou com erro de configuração) exige novo login; sem resposta da rede segue em "modo local" com aviso na Loja; o atalho `loja@gmail.com` é exceção |

## 2. Segurança — o que foi feito e o que NÃO foi
Feito (cada item tem teste, ver seção 6): hash **bcrypt custo 10 com salt** em `alunos_credenciais` (fora de `alunos`); gatilho mantém o hash em dia quando
`alunos.senha` muda (cadastro/painel ADM) e **derruba as sessões abertas** na troca de senha; limite de login por e-mail+IP (5), por e-mail (30) e por IP (60) em 15 min, com
**tentativas do mesmo e-mail serializadas** (advisory lock — corrige burla por requisições paralelas, que passavam 11 em vez de 5); bcrypt sempre calculado (sem enumeração por tempo);
RPCs não devolvem senha/hash; compra/equipar validam sessão, posse, slot do catálogo e pet da turma do aluno.

**NÃO resolvido (pré-existente; exige decisão da equipe — não improvisei):**
1. `public.alunos` é legível e **gravável** pela chave `anon` (o app inteiro usa anon: cadastro, EntrarTurma, painel ADM/professor, missões) e contém `senha` em **texto puro**. `REVOKE` nessa tabela quebraria esses fluxos (`select('*')`, `.eq('senha')`, `update` de turma/XP). Comprovado só no schema simulado; **confirme no real com `consultas_pre_check.sql` (bloco 6)**.
2. **O XP é forjável pela chave anon** (UPDATE direto em `alunos.xp` ou aprovar missão pelo painel, que também é anon). As compras são validadas contra o XP **do servidor**, mas se o XP puder ser forjado o saldo também pode. Só se resolve com autenticação de professor/ADM (RPCs com sessão) — mudança de sistema de autenticação.
3. `professores.senha` continua em texto puro (login de professor direto na tabela).
4. **Senha em texto puro de `alunos`:** a migration principal NÃO a apaga. O passo seguro e reversível é a **FASE 2** (`fase2_manual/FASE2_credenciais_sem_texto_puro.sql`): gera hashes faltantes, copia as senhas para `alunos_senha_legado_backup` (trancada), zera `alunos.senha` e faz o gatilho zerar o texto puro em toda escrita futura. Só aplique depois de: app novo publicado para todos (versões antigas deixam de logar), backup, e ciência de que o painel ADM deixa de mostrar a senha atual. Reversão: `rollbacks/fase2_manual/FASE2_ROLLBACK.sql` (não restaura quem trocou a senha depois — essas contas só entram por `login_aluno`). **Fase 3 (decisão futura):** mover leituras/escritas de `alunos` para RPCs e então `REVOKE` na tabela.
5. IP do limitador vem de `request.headers` (x-forwarded-for / x-real-ip) e pode ser forjado dependendo do proxy; o teto por e-mail (30/15 min) limita isso, mas **um atacante persistente ainda consegue travar um e-mail** (só CAPTCHA/limite de borda resolve). Comportamento real das headers no Supabase: **pendente de teste**.

## 3. Regras de negócio — APROVADAS pela equipe (não são mais decisões pendentes)
- **Saldo negativo: SIM, permitido** (aprovado). Saldo = XP atual − total gasto, calculado no servidor e nunca ajustado. Quando o XP cai depois de uma compra (missão revertida): a compra foi legítima no momento, o item **não** é retirado, e nenhuma compra nova é aceita até `saldo ≥ preço`; a Loja exibe 0 (também no modo legado local, corrigido nesta versão: antes mostraria valor negativo). Não há reembolso automático. Quem pega primeiro o lock da linha do aluno decide: compra antes ⇒ vale com o XP vigente; XP antes (reversão ou aprovação) ⇒ a compra espera e é decidida com o XP novo (testes C1–C10).
- **Item desativado pelo ADM (`ativo=false`): some da Loja e do pet, mas a posse e o registro de equipamento são preservados** (aprovado). Implementação: o catálogo usado para exibição (`listarAcessoriosLoja`) filtra `ativo=true`; `alunos_itens`/`alunos_equipados` (ou as chaves locais) **não são alterados** — a tela só deixa de desenhar o que não está no catálogo e nunca grava `null` por isso. Não pode ser comprado; recompra de item já possuído é idempotente (sem cobrança); importação local de item desativado é rejeitada com motivo `item_desativado` (cópia em `backup_*`). **Reativado**, volta a aparecer nas opções (se possuído) e **equipado** assim que o catálogo é carregado de novo (reabrir/recarregar a tela do pet; o catálogo não é atualizado em tempo real com a tela já aberta). **Excluir** acessório comprado é bloqueado (`ON DELETE RESTRICT`); o painel ADM mostra a mensagem "desative em vez de excluir".
- Conflitos de migração: **a nuvem vence**; itens locais entram em ordem de id até o saldo acabar; o restante é listado em `rejeitados` e fica em backup.
- Sem fila offline: em modo nuvem, sem rede a compra/equipar **falha** (nada é cobrado, a UI volta ao item anterior). Por isso não há operação offline que possa ser sobrescrita depois.

## 4. Pré-requisitos e aplicação (passo a passo — você executa)
1. **Homologação primeiro** (projeto/branch separado do Supabase). Nunca comece pela produção.
2. `supabase/consultas_pre_check.sql` (somente leitura). Confira: bloco 0 (tabelas obrigatórias = `ok`), tipos (bloco 1), `pgcrypto` no schema `extensions` (bloco 2; se for `public`, troque `extensions.` no SQL), e-mails duplicados, `senha` nula/vazia, mais de 1 pet por turma, grants/RLS/policies reais de `alunos` (bloco 6) e conflitos de nome (bloco 8 deve vir vazio). *Erros "relation does not exist" nos blocos seguintes = tabela ausente (o bloco 0 já avisa).*
3. **Backup confirmado e restaurável** (Dashboard → Database → Backups, ou `pg_dump` de `alunos`, `acessorios`, `pets`, `turmas`, `alunos_missoes`). Não prossiga sem conseguir restaurar.
4. SQL Editor → colar `supabase/migrations/20261016_persistencia_inventario_equipados.sql` → Run (ela é uma transação única: falhou = nada fica aplicado; pode ser reexecutada).
5. `supabase/consultas_pos_check.sql` e comparar com os resultados esperados escritos em cada bloco (6 RPCs `definer=true` com `search_path=""`; 5 tabelas com `rls_ligado=true` e todos os privilégios `false`; funções internas/gatilho sem EXECUTE para `anon`; gatilhos presentes; `senha_hash` ausente em `alunos`).
6. Publicar o app (nenhuma variável nova; a chave anon é a mesma). Alunos logados antes precisam entrar de novo uma vez.
7. **Validação manual em homologação** (seção 5). Só depois repita 2–6 em produção.
8. Rollback (se preciso): `supabase/rollbacks/20261016_persistencia_inventario_equipados_ROLLBACK.sql` (apaga só o que a migration criou; **não altera colunas de `alunos`**; recusa rodar se a FASE 2 estiver ativa). Faça backup de `alunos_itens`/`alunos_equipados` antes se já houver compras. O app volta sozinho ao modo legado.

## 5. Validação no Supabase real (PENDENTE — nada disto foi executado)
Login/PT401/PT429 chegando como HTTP 401/429 pelo PostgREST e `supabase-js`; `request.headers` com IP real; compra simultânea em 2 aparelhos reais; equipar em A visível em B;
migração com localStorage real; gatilho real `aplicar_xp_aluno_missao` (aprovar/reverter missão durante uma compra — aqui foi simulado por `UPDATE alunos.xp`); tipos reais de `acessorios.id`/`alunos.xp`; e-mails duplicados reais; `pgcrypto`; grants/RLS reais de `alunos`.
Fumaça com curl (use a anon key do projeto de **homologação**, nunca publique): `POST $URL/rest/v1/rpc/login_aluno` com `{"p_email":"…","p_senha":"…"}` e header `apikey`; esperado 200 com `token`; senha errada ⇒ 200 `null`; 6ª falha ⇒ 429.

## 6. Testes (executados aqui) — `testes/`
Ambiente: PostgreSQL 16 local; `shim.js` (Node, SQL real como role `anon`; **não é PostgREST**); Chromium/Playwright contra o build web do Expo. `rodar_teste_local.sh` roda a parte SQL.
| Suíte | Resultado |
|---|---|
| SQL (migration real, schema simulado): `teste_migration_SIMULADO.sql` | 78/78 |
| Fase 2 + rollback da fase 2: `teste_fase2_SIMULADO.sql` | 12/12 |
| Concorrência (compra×compra, compra×XP em ambos os sentidos): `teste_concorrencia_SIMULADO.sh` | C1–C10 PASS |
| Reaplicação, execução parcial (falha ⇒ nada fica), rollback + reaplicação | OK |
| E2E nuvem (`test_nuvem_e2e.py`) | 46/46 |
| Limite de login paralelo (`test_login_paralelo.py`) | 4/4 |
| Migração local→nuvem (`test_migracao_e2e.py`) | 18/18 |
| Endurecimento (`test_endurecimento_e2e.py`) | 13/13 |
| Modo legado (`test_legado_e2e.py`) | 7/7 |
| Regras aprovadas, nuvem (`test_regras_aprovadas_e2e.py`): saldo negativo, bloqueio e recuperação, recompra idempotente, desativação/reativação (pet, Loja, posse, equipamento, sem reembolso) | 23/23 |
| Regras aprovadas, modo legado/local (`test_desativado_legado_e2e.py`) | 7/7 |
| Regressão com Supabase **mockado** (`test_loja/cenario/entrar_turma/pr_pet`) | 15/15, 17/17, 16/16, OK |
Verificação estática: `expo export --platform web` compila; `git apply --check` no commit-base. Sem eslint no ambiente.
Para rodar o E2E: gerar o build apontando para o shim (`EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:8111 EXPO_PUBLIC_SUPABASE_ANON_KEY=x npx expo export --platform web --clear`, com o `.env` real fora do caminho), subir o shim (`SHIM_PORT=8111 SHIM_DB=t node shim.js`, `npm i pg`) e `WEBOUT=<build> python3 test_nuvem_e2e.py`.

## 7. Riscos remanescentes / decisões pendentes
Itens 1–5 da seção 2; validações da seção 5; as regras da seção 3 já estão aprovadas; logout offline não revoga o token no servidor (expira em 30 dias); item desativado some do pet na tela; o aluno `loja` é só local.
