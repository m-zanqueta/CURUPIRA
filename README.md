# 🌳 Curupira — App Mobile + Web

App de gamificação de atividades extracurriculares sustentáveis, em React Native + Expo (versão web e mobile) com backend no Supabase.

Alunos executam missões ambientais, ganham XP e moedas, compram acessórios e evoluem o pet virtual. Professores e coordenadores criam turmas e missões e acompanham o progresso.

ODS relacionados: 4 (Educação de Qualidade), 11, 12 e 13.

---

## Como rodar

Pré-requisitos: [Node.js](https://nodejs.org) 18 ou superior (recomendado 20/22) e npm.

```bash
# 1. instalar as dependências do projeto
npm install

# 2. garantir as versões compatíveis com o Expo
npx expo install babel-preset-expo expo react-native react-native-web @expo/metro-runtime
npx expo install @expo-google-fonts/montserrat
npx expo install react-native-svg

# 3. configurar o ambiente (veja a seção abaixo)
cp .env.example .env        # no Windows (PowerShell): copy .env.example .env

# 4. iniciar o app na web
npx expo start --web
```

Depois de alterar o `.env`, pare o servidor e rode de novo com cache limpo:

```bash
npx expo start --web --clear
```

---

## Configuração do ambiente (`.env`)

Crie o arquivo `.env` na raiz a partir do `.env.example`:

```
EXPO_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<cole-aqui-a-chave-publica>
```

- Use **somente a chave pública** (anon ou `sb_publishable_...`). Ela vai para o app e é pública por natureza.
- **Nunca** coloque a chave `service_role`/secreta no `.env`, no app, no repositório ou em prints. Ela só existe dentro do Supabase (a Edge Function a recebe automaticamente).
- O `.env` **não deve ser versionado** (já está no `.gitignore`). Se ele ainda aparecer no `git status` como rastreado, rode `git rm --cached .env`.
- Use um projeto Supabase de **desenvolvimento/homologação** para testar. Não aponte testes para produção.

---

## Segurança (V4)

O banco é acessado só por funções (RPCs) com sessão própria, sem acesso direto do `anon` às tabelas.

- **Identidade:** tokens de sessão opacos (aluno 30 dias, staff 12 horas); só o hash é guardado no banco.
- **Leituras e escritas** passam por RPCs com escopo da sessão (aluno só vê o que é dele; staff só o que é da sua turma/papel).
- **Tabelas fechadas** (RLS ligado, sem privilégio para `anon`/`authenticated`). Só `acessorios` e `icones_missoes` são públicas para leitura.
- **Limite de tentativas:** 5 logins errados em 15 minutos por e-mail+IP; a 6ª tentativa retorna "Muitas tentativas de login. Aguarde alguns minutos e tente novamente."
- **Storage:** upload e remoção de imagens só pela Edge Function `imagens-admin` (autoriza antes de ler o arquivo; aceita PNG, JPEG, WEBP e GIF até 2 MB; nome do arquivo gerado no servidor). O bucket não aceita mais escrita anônima.

Documentação detalhada em `supabase/`:

| Arquivo | Conteúdo |
|---|---|
| `V4_README.md` | Visão geral e ordem de aplicação |
| `V4_MATRIZ_ACESSOS.md` | Quem pode ler/escrever o quê |
| `storage/LEIAME_STORAGE.md` | Storage e Edge Function |
| `LEIAME_ENV.md` | Chaves e `.env` |
| `consultas_pre_check_v4.sql` / `consultas_pos_check_v4.sql` | Verificações antes e depois |

---

## Aplicar no Supabase (somente após backup, primeiro em homologação)

Nunca rode isso em produção sem antes ter passado por homologação e ter um backup restaurável testado.

1. Faça o backup do banco.
2. Rode `supabase/consultas_pre_check_v4.sql`.
3. Aplique as migrations **em ordem** (as anteriores, até `20261026`, devem estar aplicadas): `20261027` (identidade), `20261028` (leituras com escopo), `20261029` (autorização do Storage). Pelo SQL Editor ou por `supabase db push`.
4. Provisione o administrador com `supabase/fechamento_manual/V4_provisionar_admin.sql` (defina uma senha forte própria).
5. Implante a Edge Function, com **os dois arquivos** (`index.ts` e `politica.js`):
   ```bash
   supabase functions deploy imagens-admin --use-api
   ```
   Se publicar pelo editor do painel, adicione o `politica.js` com **+ Add File**.
6. Teste o app com o banco ainda aberto.
7. Rode `supabase/fechamento_manual/V4_FECHAMENTO_permissoes.sql` (fecha as tabelas) e depois `supabase/storage/V4_STORAGE_fechar_upload_anonimo.sql` (fecha o upload anônimo). Os dois têm variáveis de confirmação no topo que você precisa ler e ajustar conscientemente.
8. Rode `consultas_pos_check_v4.sql` e repita os testes.

Se o fechamento abortar, ele não aplica nada pela metade: leia a mensagem, corrija e rode de novo. Há scripts de rollback em `supabase/` — use apenas com orientação e nunca em produção sem ensaio.

---

## Testes locais (simulados)

A pasta `testes/` tem as suítes automatizadas da V4 (PostgreSQL local + simulação do PostgREST e da Edge Function). **Elas não provam o comportamento do Supabase real**; servem para detectar regressões. Veja `ROTEIRO_TESTES_V4.md` para o passo a passo (Windows 11 + WSL) e `RELATORIO_MODELO_V4.md` para registrar os resultados.

---

## Estado da homologação da V4

Ambiente: projeto Supabase de **desenvolvimento**, sem alunos reais.

**Validado**
- Migrations 20261027, 20261028 e 20261029 aplicadas pelo SQL Editor (por isso a linha do catálogo de migrations no pós-check retorna `NULL`; é esperado nesse caso).
- Admin provisionado; Edge Function `imagens-admin` implantada e usada com sucesso (upload pelo admin).
- Fechamento de permissões e fechamento do upload anônimo do Storage aplicados.
- Fluxo do app com o banco fechado: login de admin e aluno, item de loja com imagem, compra, equipar e persistência após recarregar.
- Testes negativos: anônimo sem acesso à tabela `alunos`; anônimo sem permissão de upload no Storage; limite de login (6ª tentativa recusada e mensagem exibida no app).
- Chaves legadas (JWT) desativadas; o app usa a chave publishable.

**Cuidados encontrados**
- A Edge Function precisa dos dois arquivos (`index.ts` e `politica.js`).
- Em bancos criados pelo painel, o fechamento encontrou a tabela V3 `pets_acessorios_equipados` e a função `public.rls_auto_enable()` expostas; o script atual trata os dois casos. Antes de produção, confirme que nada lê `pets_acessorios_equipados` diretamente.
- `v_aceito_credencial_padrao = true` só é aceitável em desenvolvimento. Em produção, troque a senha do coordenador padrão e mantenha `false`.

**Pendências (não verificadas)**
- Edge Function chamada sem token e com token de aluno; isolamento entre alunos; demais tabelas fechadas e RPCs de staff sem token; troca das senhas de admin/coordenador. Marque como testado só depois de executar.
- Fase 2 (gatilhos que impedem gravar senha em texto puro) e ensaio de rollback: fazer em uma **cópia** do banco antes de produção.
- Produção: backup restaurável testado, janela de manutenção e repetição dos testes negativos.
- O `.env` ainda existe no histórico do git (as chaves legadas já foram desativadas).
- Edge Function, Storage e PostgREST reais dependem de testes no Supabase; os testes locais não os substituem.
