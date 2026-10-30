# `.env` rastreado no Git — como tirar do repositório (sem expor o conteúdo)

**Situação confirmada** (só a lista de arquivos foi consultada; o conteúdo do `.env` **nunca** foi lido, impresso, copiado, compactado nem incluído em patch, ZIP, log ou checksum):
o arquivo `.env` está **rastreado** em `origin/dev` e também em `origin/main`, `origin/pr30`, `origin/pr31`, `origin/feature/banco`,
`origin/feature/dev/banco-aluno`, `origin/feature/pet`, `origin/teste/persistencia-nuvem-local` e `origin/teste/semana42-final`.
O `.gitignore` já lista `.env`, mas **ignorar não vale para arquivo que já está no índice** — por isso o arquivo continua sendo versionado.

## O que esta entrega faz
- Adiciona `.env.example` (somente **nomes** das variáveis e placeholders): `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` — os dois nomes lidos em `services/supabase.js`.
- Reforça o `.gitignore` (`.env.*` e `!.env.example`).
- **Não** inclui no patch a exclusão do `.env` (um patch de exclusão carregaria o conteúdo do arquivo). A remoção do índice é feita por quem tem o repositório, com o comando abaixo.

## Passo a passo (responsável pelo repositório)
```bash
git checkout dev && git pull
git rm --cached .env                 # tira do índice, MANTÉM o arquivo local
git apply curupira_v4_seguranca.patch   # traz .env.example e o .gitignore reforçado (ou aplique só esses dois arquivos)
git status                            # confira: ".env" aparece como "deleted" no índice e NÃO como untracked
git commit -m "chore: parar de versionar .env; adicionar .env.example"
```
Repita o `git rm --cached .env` em cada branch que ainda rastreia o arquivo (lista acima) — ou faça merge de `dev` nelas depois.
Quem já tem o arquivo local: ao puxar a branch o Git pode removê-lo do disco; guarde uma cópia **fora** do repositório antes de atualizar.

## O que isto NÃO resolve
- **O histórico continua com o arquivo.** `git rm --cached` só impede novos commits; todo commit antigo (e qualquer clone/fork) ainda contém o `.env`.
  Reescrever o histórico (`git filter-repo`/BFG + push forçado + todos re-clonando) é decisão **do responsável pelo repositório** e não foi feito aqui.
- **Rotação de credenciais:** o responsável deve **abrir o `.env` por conta própria**, avaliar o que existe nele e **rotacionar** o que for secreto.
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY` é pública por desenho (vai no pacote do app); rotacionar é opcional e depende da política do projeto.
  - Se houver qualquer outra coisa (chave `service_role`, senha do banco, tokens de terceiros), trate-a como **vazada** e rotacione **agora** no painel do Supabase/provedor — remover do Git não desfaz a exposição.
  - Depois de rotacionar, atualize o `.env` local e as variáveis de ambiente de deploy (Vercel etc.).
- Não há garantia de que o `.env` não esteja em caches, forks ou cópias de CI.
