# V4 — Matriz de acessos (tabela × operação × papel × RPC)

Estado **DEPOIS das migrations 20261027–20261029 e do fechamento** (`V4_FECHAMENTO_permissoes.sql`). "—" = negado (HTTP 401/403, SQLSTATE 42501). Papéis: **anon** = chave pública sem sessão;
**aluno / professor / coord. / admin** = quem apresentou token de sessão válido emitido pelo servidor (`login_aluno` / `login_staff`). Todas as RPCs são
`SECURITY DEFINER`, `search_path=''`, e **o papel e o id vêm da sessão, nunca de parâmetro**. Validado em PostgreSQL local (não no Supabase real).

## 1. Tabelas (acesso DIRETO pela API com a chave anon) — conferido no catálogo de um banco local fechado
Conferência feita com `has_table_privilege` / `pg_policies` / `relrowsecurity` em PostgreSQL local depois de `V4_FECHAMENTO_permissoes.sql` (reproduzível: `consultas_pos_check_v4.sql`; testes `v4_exposicao.sql`, `v4_leituras.sql`, E2E E5a–E5c). **Não** verificado no Supabase real.

| Tabela | SELECT anon | INSERT/UPDATE/DELETE anon | Leitura/escrita pelo app (RPC) |
|---|---|---|---|
| **`acessorios`** (catálogo) | **sim** (1 política `SELECT`; sem dado de aluno) | — | leitura direta em `listarAcessoriosLoja`; escrita: `admin_inserir/atualizar/excluir` (admin) |
| **`icones_missoes`** (catálogo) | **sim** (idem) | — | leitura direta em `listarIconesMissoes`; escrita: `admin_*` (admin) |
| `turmas` | — (nem por coluna) | — | leitura: `staff_listar_turmas` (prof.: as suas; coord./admin: todas), `aluno_minha_turma` (só a do token). Escrita: `staff_criar_turma`, `staff_excluir_turma`, `admin_*` |
| `pets` | — | — | leitura: `staff_listar_pets` (prof.: livres + os das suas turmas; coord./admin: todos), `aluno_minha_turma` (PET da própria turma). Escrita: `staff_criar_turma`, `admin_*`; XP por gatilho |
| `missoes` | — | — | leitura: `staff_listar_missoes` (prof.: as suas + ligadas às suas turmas), `aluno_minhas_missoes` (ativas da própria turma). Escrita: `staff_salvar_missao`, `staff_salvar_tarefa_global`, `staff_excluir_missao` |
| `missoes_turmas` | — | — | leitura: embutida em `staff_listar_missoes` (vínculos). Escrita: `staff_definir_turmas_missao`, `staff_atribuir_tarefa_global`, `staff_definir_ativa_missao_turma`, `staff_remover_missao_da_turma` |
| `alunos_missoes` | — | — | leitura: `staff_listar_status_missoes` (prof.: alunos das suas turmas), `aluno_minhas_missoes` (o próprio). Escrita: `aluno_definir_status_missao`, `aluno_avancar_etapa`, `staff_definir_status_missao` |
| `conquistas` | — | — | leitura: `aluno_minhas_conquistas`, `aluno_meu_progresso_geral` (contagem; só as do token). Escrita: gatilhos do banco |
| `alunos` | — (nem por coluna) | — | `cadastrar_aluno`, `entrar_na_turma`, `obter_meu_perfil`, `staff_listar_alunos`, `staff_atualizar_aluno`, `staff_remover_aluno_da_turma`, `admin_*` |
| `professores` | — | — | `admin_listar/inserir/atualizar/excluir/definir_senha`, `staff_listar_professores` (id/nome/e-mail) |
| `alunos_missoes_etapas` | — | — | `aluno_avancar_etapa` |
| `alunos_credenciais`, `alunos_sessoes`, `alunos_itens`, `alunos_equipados`, `alunos_login_falhas` (V3) | — | — | `login_aluno`, `logout_aluno`, `obter_estado_loja`, `comprar_acessorio`, `equipar_acessorio`, `importar_estado_local` |
| `administradores`, `professores_credenciais`, `staff_sessoes`, `staff_login_falhas`, `limite_taxa_eventos`, `coordenadores`, `v4_fechamento_snapshot`, `v4_fechamento_snapshot_funcoes` | — | — | `login_staff`, `logout_staff`, `staff_alterar_minha_senha`, `admin_definir_senha`, provisionamento manual (as duas tabelas de snapshot só o dono do banco lê) |
| `public.v4_storage_snapshot` (só existe depois do script manual de Storage) | — (sem GRANT, RLS ligado) | — | script manual de Storage |

Todas as tabelas do `public` têm RLS ligado depois do fechamento. `authenticated` **não é usado pelo app**: também não tem escrita (as políticas de claims da 20261024 são removidas); lê só os dois catálogos.
Após a migration 28 e **antes** do fechamento, as leituras diretas antigas ainda existem (o app novo já não as usa); o fechamento é o que as remove. Contrato do app: leitura direta de tabela só em `acessorios` e `icones_missoes`.

## 2. RPCs executáveis por anon (todas validam o token por dentro)

| RPC | Quem pode (decidido no servidor) | Escopo / regra |
|---|---|---|
| `login_aluno` (V3) | qualquer um | bcrypt, 5 falhas/15 min por e-mail+IP (429), token 256 bits, só SHA-256 no banco, 30 dias |
| `login_staff` | qualquer um | bcrypt, limite em 3 níveis, ordem admin→coordenador→professor (`tipo='professor'`; linha de `professores` com `tipo='coordenador'` **não** vira coordenador), sessão 12 h |
| `logout_aluno`, `logout_staff`, `staff_perfil`, `obter_meu_perfil` | dono do token | revoga/consulta a própria sessão; nunca devolve senha/hash |
| `cadastrar_aluno`, `email_aluno_existe` | anon | xp=0, sem turma, senha forte; cliente não envia xp/turma/id |
| `entrar_na_turma` | aluno | só se ainda sem turma (`ja_em_turma`); 20 códigos errados/15 min |
| `obter_estado_loja`, `comprar_acessorio`, `equipar_acessorio`, `importar_estado_local` (V3) | aluno | só o próprio inventário/saldo; saldo = XP − gasto; compra idempotente e sem gasto duplo |
| `aluno_definir_status_missao` | aluno | só `pendente→entregue` da própria tarefa; **nunca aprova** |
| `aluno_avancar_etapa` | aluno | próprio progresso, turma com PET, tarefa ativa na turma, 1 etapa por vez; XP da etapa uma única vez |
| `staff_listar_alunos` | professor (só suas turmas) / coord. / admin | sem senha |
| `staff_atualizar_aluno` | professor (alunos das suas turmas) / coord. / admin | só nome/iniciais |
| `staff_remover_aluno_da_turma` | professor (suas turmas) / coord. / admin | desvincula |
| `staff_definir_status_missao` | **coord. / admin** | aprova/reverte (gatilhos creditam/estornam XP e moedas; exige todas as etapas) |
| `staff_salvar_missao`, `staff_definir_turmas_missao` | professor (só como ele mesmo) / coord. / admin (em nome de um professor) | missão e turmas do professor |
| `staff_definir_ativa_missao_turma`, `staff_remover_missao_da_turma` | tarefa de professor: dono / coord. / admin. **Tarefa global**: coord., admin ou professor **dono da turma** | `p_professor_id` do cliente nunca decide em tarefa global |
| `staff_atribuir_tarefa_global` | professor (turma sua; tarefa global ou sua) / coord. / admin | idempotente |
| `staff_salvar_tarefa_global` | **admin** | valida nome, 1–30 etapas, xp inteiro 0–1000, moedas 0–100000; só edita tarefas sem dono |
| `staff_excluir_missao` | dono (professor) / coord. / admin | gatilho estorna XP |
| `staff_criar_turma` | coord. / admin | código único, PET livre |
| `staff_excluir_turma` | professor dono / admin | |
| `staff_listar_professores` | coord. / admin | só id/nome/e-mail |
| `staff_alterar_minha_senha` | staff (própria conta) | exige senha atual; revoga sessões |
| `admin_listar/atualizar/inserir/excluir/definir_senha` | **admin** | tabelas e colunas em lista fechada (`_admin_colunas`); `senha` só por `admin_definir_senha` |
| **Leituras com escopo (migration 20261028)** | | |
| `staff_listar_turmas` | professor / coord. / admin | professor: só `professor_id` = ele; coord./admin: todas. Devolve o PET da turma. Sem parâmetro de id |
| `staff_listar_pets` | professor / coord. / admin | professor: PETs livres + os das suas turmas; coord./admin: todos |
| `staff_listar_missoes` | professor / coord. / admin | professor: tarefas dele + as ligadas às suas turmas (com vínculos); coord./admin: todas |
| `staff_listar_status_missoes` | professor / coord. / admin | professor: só alunos das suas turmas; sem nome/e-mail de aluno |
| `aluno_minha_turma`, `aluno_minhas_missoes`, `aluno_meu_progresso_geral`, `aluno_minhas_conquistas` | **aluno** (token de aluno) | o aluno vem do token; **não existe parâmetro de id**. Token de staff é recusado (PT401) e vice-versa |
| **Storage (migration 20261029)** | | |
| `storage_autorizar_operacao` | **só `service_role`** (a Edge Function). NÃO executável por anon/authenticated/PUBLIC | exige sessão de staff com papel **admin** (PT401/PT403), operação/pasta válidas (PT422), limite 60/15 min (PT429) e, na remoção, objeto não referenciado (PT409) |

## 3. Revogadas de anon no fechamento (não use mais)
`login_professor`, `login_coordenador`, `email_aluno_ja_existe` (legados 20261014/24/25/26: senha em texto puro, sem limite), `salvar_missao_com_turmas`,
`definir_turmas_missao`, `definir_ativa_missao_turma`, `remover_missao_da_turma` (confiavam em `p_professor_id`; só são chamadas de dentro das RPCs V4),
`avancar_etapa_tarefa` (depende de JWT do Supabase Auth, inexistente neste app) e as funções de gatilho.

## 4. Mapeamento app → RPC (`services/storage.js`)
login aluno `buscarAluno→login_aluno`; staff `loginStaff→login_staff`; restauração `restaurarSessaoStaff→staff_perfil`, `restaurarPerfilAluno→obter_meu_perfil`;
cadastro `salvarUsuario→cadastrar_aluno`; turma `entrarNaTurma→entrar_na_turma`; missões `salvarMissao/definirTurmasMissao/definirAtivaMissaoTurma/removerMissaoDaTurma/removerMissaoStorage`;
tarefas globais `salvarTarefaAdmin→staff_salvar_tarefa_global`, `atribuirTarefaGlobal→staff_atribuir_tarefa_global`, `avancarEtapaTarefa→aluno_avancar_etapa` (**sem tela chamando ainda**);
alunos `listarAlunos/atualizarAluno`; admin `listarDadosAdmin/atualizarDadoAdmin/excluirDadoAdmin/salvar*Admin`; loja `comprarItem/atualizarEquipado/carregarEstadoLoja` (V3).
Leituras: `listarTurmas→staff_listar_turmas`, `listarPetsParaTurma→staff_listar_pets`, `listarMissoes/listarTarefasAdmin→staff_listar_missoes`, `listarStatusMissoes→staff_listar_status_missoes`,
`buscarTurmaDoAluno→aluno_minha_turma`, `listarMissoesDoAluno/buscarProgressoMissao→aluno_minhas_missoes`, `listarConquistasDoAluno→aluno_minhas_conquistas`, `consultarProgressoGeral→obter_meu_perfil + aluno_meu_progresso_geral`
(os parâmetros `professorId/incluirTodas/turmaId/alunoId` das telas são **ignorados**: o servidor decide pelo token). Sem fallback para leitura direta se a RPC falhar.
Imagens: `salvarPetAdmin/salvarIconeMissao/salvarAcessorioAdmin` → Edge Function `imagens-admin` (ver `storage/LEIAME_STORAGE.md`); o app só chama `getPublicUrl` (montagem de URL, sem política).
**Leituras diretas que permanecem (únicas):** `acessorios` e `icones_missoes` (catálogos públicos: nome, slot, preço, caminho/URL de imagem; sem dado de aluno/professor; já são mostrados a qualquer visitante da loja; sem escrita anônima).

## 5. Senhas em texto puro (Fase 2 — manual, opcional, depois do fechamento)
Antes da Fase 2, `alunos.senha`/`professores.senha` ainda guardam texto puro (inacessível ao anon após o fechamento; visível ao dono do banco e a backups). A Fase 2
(`fechamento_manual/V4_FASE_*_sem_texto_puro.sql`) apaga o texto puro e instala gatilhos BEFORE que impedem a regravação (a senha vai direto para `*_credenciais` como hash). Ver README §5.
Rollback da Fase 2 (`V4_FASE_ROLLBACK_gatilhos.sql`) desfaz só a estrutura e **nunca restaura texto puro**.
