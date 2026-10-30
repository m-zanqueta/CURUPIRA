# Curupira · V4 — autenticação e autorização no servidor (Supabase)

**Estado: PROPOSTA PARA REVISÃO HUMANA. Nada disto foi aplicado em nenhum Supabase (homologação ou produção).** Tudo foi validado em PostgreSQL 16 local
(role `anon` real) + um simulador próprio de PostgREST (`testes/shim`) + Playwright. **Isso não é o Supabase/PostgREST real.**

## 1. O problema (confirmado por teste, ver `v4_exposicao.sql` estado "antes")
Com a chave pública (`anon`) é possível: ler `alunos.senha`/`professores.senha`; trocar senha e XP de qualquer aluno; auto-aprovar tarefas (XP e moedas pelos gatilhos);
criar professores; mudar o dono de turmas; chamar RPCs que confiam em `p_professor_id`; usar o login legado por senha em texto puro sem limite de tentativas.
A `20261026_restaurar_acesso_anterior.sql` (origin/dev) reabre isso (RLS desligado + `GRANT ALL` CRUD a anon) **e** sobrescreve `login_aluno` pela versão legada, o que desfaz a V3.
**Habilitar RLS sozinho não resolve**: o fechamento remove privilégios de tabela e de coluna, TODAS as políticas, e o EXECUTE das RPCs antigas.

## 2. O que a V4 faz
* Identidade no servidor: token opaco de 256 bits, só o SHA-256 no banco; aluno 30 dias, staff (professor/coordenador/admin) 12 h; revogável; senha em bcrypt em tabelas trancadas.
* RPCs `SECURITY DEFINER` (`search_path=''`) para toda escrita sensível **e (nova etapa) para toda leitura de dados de aluno/turma**; papel e id vêm da **sessão**; limite de tentativas persistente. Ver `V4_MATRIZ_ACESSOS.md`.
* Administrador provisionado manualmente (sem senha embutida no app).
* Tarefas globais com etapas/moedas sob autorização (`staff_salvar_tarefa_global`, `staff_atribuir_tarefa_global`, `aluno_avancar_etapa`).
* **Leituras por RPC com escopo (20261028):** o app deixa de ler `turmas/pets/missoes/missoes_turmas/alunos_missoes/conquistas` direto. Só `acessorios` e `icones_missoes` continuam legíveis diretamente (catálogos públicos, justificativa na matriz).
* **Imagens (20261029 + Edge Function `imagens-admin`):** upload/remoção só pelo servidor, com token do Curupira + papel admin + tipo real + 2 MB + nome gerado no servidor + bloqueio de remoção de objeto em uso. Ver `storage/LEIAME_STORAGE.md`.
* **Fase 2 (manual):** remove o texto puro de `professores.senha`/`alunos.senha` com gatilho BEFORE (sem nova tabela com texto puro).
* Fechamento manual atômico com retrato; **rollback seguro por padrão** (não reabre nada sem boolean + frase exata, em níveis B/C/D).

## 3. Arquivos (dentro de `supabase/`, exceto onde indicado)
| Arquivo | Tipo | O que é |
|---|---|---|
| `migrations/20261027_v4_identidade_staff_e_rpcs_autorizadas.sql` | migration aditiva | tabelas trancadas, gatilho de hash, RPCs de escrita/identidade, restaura `login_aluno` V3. Não revoga nada nem liga RLS. |
| `migrations/20261028_v4_leituras_com_escopo.sql` | migration aditiva | 8 RPCs de leitura com escopo de sessão. Não revoga nada. |
| `migrations/20261029_v4_storage_autorizacao.sql` | migration aditiva | `storage_autorizar_operacao` (EXECUTE só `service_role`). Não altera bucket nem políticas. |
| `functions/imagens-admin/{politica.js,index.ts,deno.json}` | Edge Function | política testada localmente (`politica.js`) + adaptador Deno (`index.ts`, **nunca executado**). |
| `fechamento_manual/V4_provisionar_admin.sql` | manual | cria/redefine o 1º administrador (só hash gravado) |
| `fechamento_manual/V4_FECHAMENTO_permissoes.sql` | manual | fecha permissões numa transação; retrato; aborta sem deixar nada pela metade |
| `fechamento_manual/V4_FECHAMENTO_ROLLBACK.sql` | manual | seguro por padrão; níveis B/C/D com boolean + frase |
| `fechamento_manual/V4_FASE_{professores,alunos}_sem_texto_puro.sql`, `V4_FASE_ROLLBACK_gatilhos.sql`, `V4_FASE_consultas_pre_pos.sql` | manual | Fase 2 e reversão estrutural |
| `storage/V4_STORAGE_{fechar_upload_anonimo,ROLLBACK,consultas_pre_pos}.sql`, `storage/LEIAME_STORAGE.md` | manual | fecha/reabre upload anônimo no bucket |
| `rollbacks/20261027…, 20261028…, 20261029…_ROLLBACK.sql` | manual | reversões das migrations, com recusa por dependência (ver §5) |
| `consultas_pre_check_v4.sql`, `consultas_pos_check_v4.sql` | leitura | estado antes / verificação depois |
| `V4_MATRIZ_ACESSOS.md`, `LEIAME_ENV.md`, `RESULTADOS_FINAIS_v4.txt` | doc | matriz de acessos; `.env` rastreado; resultados reais |
| app: `services/storage.js`, `App.js`, `screens/{Login,LoginProfessor,CriarPerfil,EntrarTurma}.js`, `components/AdminDataManager.js`, `.env.example`, `.gitignore` | cliente | apenas o necessário para sessão/RPCs/Edge Function |

## 4. Ordem de implantação (homologação PRIMEIRO; nada foi aplicado em nenhum Supabase)
1. Backup restaurável + `consultas_pre_check_v4.sql` (guardar a saída). Trocar a senha padrão do coordenador (o fechamento aborta se ela estiver ativa).
2. Migrations **na ordem**: `…20261026 (origin/dev)` → **20261027 → 20261028 → 20261029**. (28 e 29 dependem da 27.) `NOTIFY pgrst, 'reload schema'` já está nelas.
3. Manual: `V4_provisionar_admin.sql` (senha ≥ 12). Sem admin o fechamento aborta.
4. Implantar a Edge Function `imagens-admin` em homologação (`supabase/storage/LEIAME_STORAGE.md`); testar upload/remoção.
5. Publicar o app novo (build com URL/chave da MESMA instância). O app antigo para de funcionar após o passo 6.
6. Regressão na homologação (login dos 4 papéis, cadastro, turma, tarefas, loja, XP, imagens).
7. **Manual, com autorização:** `V4_FECHAMENTO_permissoes.sql` → `consultas_pos_check_v4.sql` (nenhuma linha `false`; linhas `NULL` = não verificado, resolver na homologação) → repetir a regressão.
8. **Opcional, manual:** Fase 2 (§5) — só com backup externo RESTAURÁVEL e testado, app novo publicado e fechamento validado.
9. **Opcional, manual:** `storage/V4_STORAGE_fechar_upload_anonimo.sql` — só depois da função implantada, testada e do app publicado.
10. `.env`: ver `LEIAME_ENV.md` (remover do versionamento + avaliar rotação).

## 5. Rollbacks — dependências e limites (testados em `v4_fechamento_variacoes.sh`)
Ordem de reversão = inversa da implantação: **Storage fechado → Fase 2 → fechamento → 29 → 28 → 27**.
| Script | Pré-condições (o script recusa se faltar) | Limites |
|---|---|---|
| `V4_STORAGE_ROLLBACK.sql` | boolean + frase `REABRIR_UPLOAD_ANONIMO`; retrato `v4_storage_snapshot` | **reabre** upload/remoção anônimos; restaura por nome as políticas do retrato |
| `V4_FASE_ROLLBACK_gatilhos.sql` | `v_confirmo_rollback` + `v_aceito_voltar_a_gravar_texto_puro` | recria gatilhos antigos; **não** restaura texto puro apagado (só backup externo, decisão humana) |
| `V4_FECHAMENTO_ROLLBACK.sql` | `v_confirmo_reexposicao`; retrato das tabelas (e das funções para o nível D) | padrão: **não reabre nada**. B/C/D exigem boolean + frase própria (`REABRIR_ESCRITA_ANON_EM_TABELAS`, `REABRIR_ALUNOS_PROFESSORES_E_ETAPAS`, `REABRIR_RPCS_LEGADAS_INSEGURAS`). Reversibilidade total não é prometida (roles personalizadas não tratadas) |
| `rollbacks/20261029…` | nenhuma | só `DROP FUNCTION storage_autorizar_operacao`; não toca bucket/políticas (testado: nenhum outro objeto some). A Edge Function passa a recusar tudo |
| `rollbacks/20261028…` | **recusa** se o fechamento já removeu as leituras diretas (o app ficaria sem leitura) | remove as 8 RPCs de leitura |
| `rollbacks/20261027…` | **recusa** se: fechamento aplicado; 29 instalada; 28 instalada; Fase 2 aplicada; existirem administradores sem `v_confirmo_apagar_admins` | remove identidade V4; o app novo deixa de funcionar |
Recuperação de admin: reexecutar o provisionamento com `v_redefinir := true` (revoga as sessões).

## 6. Resultados dos testes
Ver `RESULTADOS_FINAIS_v4.txt` (gerado pela execução real; cada suíte separada; **PostgreSQL local + simulador PostgREST-like; NÃO é o Supabase real**). Reproduzir:
`testes/rodar_tudo_v4.sh <migrations de origin/dev> <diretório de build web exportado pelo Expo>` (o 2º argumento é o `expo export`; o app é lido de `<pai do build>/dev_v4_2` e o `node_modules` de `<pai>/build_dev_v4/node_modules`, ou por `APP_DIR`/`CLIENT_NM`).

## 7. Limitações e riscos restantes (leia antes de aplicar)
1. **Build:** `screens/LojaScreen.js` de `origin/dev` **não compila** (`comprarItem` declarado duas vezes; **pré-existente**, confirmado: o arquivo na cópia é idêntico ao de `origin/dev`). O build Expo só passou com `LojaScreen.js`/`PetScreen.js` **da V3 como fixture** (cópia fora da entrega). Não afirmamos que o app compila integralmente a partir de `origin/dev`; a reconciliação é de quem cuida da Loja. O contrato de RPC não mudou.
2. **`.env` rastreado** em `origin/dev` e outras 9 refs: **NÃO resolvido** — a entrega traz `.env.example`, `.gitignore` e o passo a passo (`LEIAME_ENV.md`); remover do índice e rotacionar é ação do responsável; o histórico continua com o arquivo.
3. **Storage:** a Edge Function e os scripts foram testados só em simulação (Storage falso/schema simulado). Até o script de fechamento do Storage ser aplicado (manual), o bucket **continua aceitando upload anônimo**. Pendências de homologação em `storage/LEIAME_STORAGE.md`.
4. Texto puro de senhas continua em `alunos.senha`/`professores.senha` até a Fase 2 (manual) e em backups/PITR antigos depois dela.
5. `aluno_avancar_etapa` existe e é testada, mas nenhuma tela a chama (outra frente). Saldo da Loja = XP − gasto (V3).
6. Mudanças de comportamento: o aluno não troca de turma sozinho; sessão local sem token é descartada; parâmetros de id nas leituras são ignorados (o servidor usa o token); imagens de pets antigas (raiz do bucket) não são removíveis pela função.
7. Limite de login por IP depende de `x-forwarded-for`/`x-real-ip` do PostgREST; confirmar na homologação. O simulador mapeia 42501→401 (o PostgREST real pode devolver 401 ou 403).
8. Upstream: as funções JWT da 20261024 (`curupira_*`) continuam executáveis por `authenticated`; o app não as usa (papel vem do token do Curupira).

## 8. Homologação — roteiro mínimo
Passos 1–6 acima; login de cada papel; cadastro + entrar na turma; criar tarefa global e atribuir; admin cria PET/acessório/ícone (Edge Function) e tenta remover imagem em uso (409); professor/aluno tentando o mesmo (403/401); depois do fechamento: com a chave anon, `GET turmas`, `GET alunos?select=senha`, `PATCH alunos`, `POST alunos_missoes` (todos devem falhar) e `GET acessorios` (200); `consultas_pos_check_v4.sql` e `V4_STORAGE_consultas_pre_pos.sql`; rollback de ensaio numa cópia.
