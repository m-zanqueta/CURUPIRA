# Storage (`pets-images`) — upload/remoção só pela Edge Function `imagens-admin`

**Estado: implementado e testado SÓ LOCALMENTE (simulado). Nada foi implantado nem executado no Supabase real, nem no Storage real.**

## Por que uma Edge Function
O Supabase Storage não conhece o token próprio do Curupira. A chave `anon` sozinha não prova quem é o usuário, então "só admin pode enviar imagem" não pode ser
expresso em política de `storage.objects`. A solução: o app envia a imagem + o token de sessão do Curupira para a função; a função (servidor, com a chave `service_role`
que nunca sai do servidor) valida tudo e só então grava/remove no bucket. Depois do fechamento do Storage, ninguém com a chave pública grava ou apaga objetos.

## Fluxo (cada passo está em `functions/imagens-admin/politica.js`, testado)
1. `POST /functions/v1/imagens-admin` (multipart: `token`, `operacao` = `upload`|`remover`, `pasta` = `pets`|`icones-missoes`|`acessorios`, `arquivo`; remoção: `caminho`).
2. Rejeita antes de ler o corpo: método ≠ POST/OPTIONS (405), `content-length` > 2 MB + margem (413), content-type não suportado (415).
3. **Autorização antes de qualquer byte** → RPC `public.storage_autorizar_operacao` (só `service_role` executa): sessão de staff válida (PT401), papel **admin** (PT403), operação/pasta válidas (PT422),
   limite de 60 operações/15 min por admin (PT429) e, na remoção, caminho no formato gerado pelo servidor e **objeto não referenciado** por `pets.icone`, `acessorios.imagem_path` ou `icones_missoes.icone` (PT409).
4. Upload: tipo REAL pelos primeiros bytes (PNG/JPEG/GIF/WEBP; **SVG e qualquer outro recusados**), conteúdo ≤ 2 MB, MIME declarado precisa bater com o conteúdo, nome **gerado no servidor**
   (`<pasta>/<epoch-ms 13 dígitos>-<16 hex>.<ext>`); o cliente nunca escolhe o caminho. Resposta: `{ ok, caminho }`; o app monta a URL pública com `getPublicUrl`.
5. Erros: sempre `{ ok:false, erro:<código curto> }` (`sessao_invalida`, `sem_permissao`, `objeto_em_uso`, `pedido_invalido`, `arquivo_grande`, `tipo_nao_suportado`, `tipo_divergente`, `muitas_tentativas`, `falha_no_servidor`).
   Nenhuma mensagem interna, SQL, token ou chave é devolvida (testado). O token não é registrado em log.
6. Falha ao gravar o registro no banco depois do upload: o **app** chama `remover` para o objeto recém-enviado (ainda sem referência) — `descartarImagemEnviada` em `services/storage.js`. Se essa limpeza falhar, sobra um objeto órfão inofensivo (aviso no console).
   Limite conhecido: não há varredura periódica de órfãos (fora do escopo).

## Variáveis de ambiente da função (NOMES; nenhum valor foi coletado nem está neste repositório)
| Variável | Origem |
|---|---|
| `SUPABASE_URL` | injetada automaticamente pelo runtime das Edge Functions |
| `SUPABASE_SERVICE_ROLE_KEY` | injetada automaticamente pelo runtime; **só existe no servidor**. Não colocar em `.env`, no app, em `EXPO_PUBLIC_*`, em CI público ou neste repositório |
| `IMAGENS_BUCKET` | opcional (padrão `pets-images`) |
O app só precisa de `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` (o `supabase.functions.invoke` usa a URL do projeto). Se a sua CLI/plataforma exigir definir segredos manualmente: `supabase secrets set ...` por quem tem acesso, nunca por arquivo versionado.
`verify_jwt` (padrão do Supabase) pode permanecer ligado: a chave anon é um JWT válido e serve como primeira barreira; a autorização real é a do token do Curupira.

## Ordem de implantação
1. Migration `20261029_v4_storage_autorizacao.sql` (depois de 27 e 28).
2. `supabase functions deploy imagens-admin` (em **homologação**). Nada aqui foi executado.
3. Testes de homologação (abaixo). Publicar o app novo.
4. **Só então**, manual e com autorização: `V4_STORAGE_consultas_pre_pos.sql` (guardar) → `V4_STORAGE_fechar_upload_anonimo.sql` → `V4_STORAGE_consultas_pre_pos.sql` (0 políticas de escrita alcançáveis) → repetir o upload/remoção do app.
5. Rollback do fechamento do Storage: `V4_STORAGE_ROLLBACK.sql` (**reabre o upload anônimo**; exige o boolean E a frase `REABRIR_UPLOAD_ANONIMO`; recusa sem o retrato `public.v4_storage_snapshot`). Rollback da migration 29: `rollbacks/20261029_…_ROLLBACK.sql` (a função some; o upload pelo app passa a ser recusado; **não** reabre o bucket).

## O que o script de fechamento faz e NÃO faz
Faz: retrato (políticas de escrita removidas + limites do bucket) → remove políticas INSERT/UPDATE/DELETE/ALL de `storage.objects` para `public/anon/authenticated` que atingem `pets-images` → bucket com `file_size_limit` 2 MB e MIME png/jpeg/webp/gif → verifica e **aborta tudo** se sobrar política de escrita alcançável. Recusa sem as duas confirmações, sem a migration 29, sem o bucket ou com RLS desligado.
Não faz: não mexe em políticas restritas a **outros** buckets; não toca em `SELECT` (as imagens são públicas por URL e a listagem de nomes de arquivo continua possível); não liga RLS.
**Atenção:** uma política genérica (sem `bucket_id`, ex.: `USING (true)`) vale para todos os buckets; ela é removida (precisa ser, para fechar este bucket) e o script avisa por `NOTICE`. Se outro bucket dependia dela, crie política restrita a ele.

## Testes locais (`testes/`) — e o que eles NÃO provam
| Teste | Resultado local | Limite |
|---|---|---|
| `v4_storage_autorizacao.sql` (RPC de autorização, PostgreSQL local; `service_role` é um role criado pelo teste) | 35/35 | não é o PostgREST/JWT real |
| `edge/test_imagens_admin.mjs` (`politica.js` real + RPC real local + **Storage falso em memória**) | 55/55 | não executa `index.ts`, nem o runtime Deno, nem a Storage API real |
| `v4_storage_politicas.sh` (scripts manuais num **schema `storage` simulado**) | 39/39 | o Storage real tem mais políticas/funções; só prova a lógica dos scripts |
| `cliente/test_cliente_servico.cjs` (storage.js real → supabase-js → shim com a função simulada) | 24/24 | idem; `functions.invoke` real contra a função implantada fica pendente |

## PENDENTE DE HOMOLOGAÇÃO (não foi e não pôde ser testado aqui)
- `index.ts` roda no Deno do Supabase (import `npm:@supabase/supabase-js`, `Deno.serve`): **nunca executado**.
- Upload/remoção reais pela Storage API com `service_role`; `contentType`/`upsert:false` e limites do bucket reais.
- `supabase.functions.invoke` com `FormData` em web, iOS e Android (React Native: confirmar que o `Blob` do `fetch(uri)` é aceito no `FormData` em dispositivo).
- Comportamento do CORS/`verify_jwt` com a chave anon do projeto; mapeamento dos códigos `PT401…PT429` pelo PostgREST real (o `error.code` chegar à função como `PTxxx`).
- Efeito real do script de fechamento sobre as políticas existentes no projeto (rodar `V4_STORAGE_consultas_pre_pos.sql` antes e revisar a lista).
- Imagens de pets antigas estão na raiz do bucket (sem pasta): continuam legíveis; **não** são removíveis por esta função (formato de caminho do servidor). Itens novos usam `pets/`.
