-- Permite cadastrar cenários e mantém compatibilidade com itens antigos.
-- As restrições antigas da tabela ainda aceitam somente 'cabeca', 'roupa' e 'outro'.
ALTER TABLE public.acessorios
  DROP CONSTRAINT IF EXISTS acessorios_slot_check;

ALTER TABLE public.acessorios
  ADD CONSTRAINT acessorios_slot_check
  CHECK (slot IN ('chapeu', 'colar', 'fundo', 'cabeca', 'roupa', 'outro'));

DROP POLICY IF EXISTS "Cadastro de acessórios pelo app" ON public.acessorios;
CREATE POLICY "Cadastro de acessórios pelo app"
  ON public.acessorios
  AS PERMISSIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    nome IS NOT NULL
    AND btrim(nome) <> ''
    AND slot IN ('chapeu', 'colar', 'fundo')
    AND imagem_path IS NOT NULL
    AND imagem_path LIKE 'acessorios/%'
    AND preco >= 0
    AND ativo = true
  );

DROP POLICY IF EXISTS "ADM pode alterar acessórios pelo app" ON public.acessorios;
CREATE POLICY "ADM pode alterar acessórios pelo app"
  ON public.acessorios
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (
    slot IN ('chapeu', 'colar', 'fundo', 'cabeca', 'roupa', 'outro')
  );
