-- A loja passa a aceitar apenas chapéus e colares.
-- Mantém itens antigos intactos; novas inserções ficam restritas pela política.
ALTER TABLE public.acessorios
  ADD COLUMN IF NOT EXISTS preco integer NOT NULL DEFAULT 0;

UPDATE public.acessorios
SET preco = 0
WHERE preco IS NULL;

ALTER TABLE public.acessorios
  ALTER COLUMN preco SET DEFAULT 0,
  ALTER COLUMN preco SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'acessorios_preco_nao_negativo'
      AND conrelid = 'public.acessorios'::regclass
  ) THEN
    ALTER TABLE public.acessorios
      ADD CONSTRAINT acessorios_preco_nao_negativo CHECK (preco >= 0);
  END IF;
END;
$$;

DROP POLICY IF EXISTS "Cadastro de acessórios pelo app" ON public.acessorios;

CREATE POLICY "Cadastro de acessórios pelo app"
  ON public.acessorios
  AS PERMISSIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    nome IS NOT NULL
    AND btrim(nome) <> ''
    AND slot IN ('chapeu', 'colar')
    AND imagem_path IS NOT NULL
    AND imagem_path LIKE 'acessorios/%'
    AND preco >= 0
    AND ativo = true
  );

-- O painel ADM usa o cliente público do Supabase (sem sessão Auth própria).
-- Estas permissões seguem o mesmo modelo atual do app para permitir editar
-- e remover os cadastros nas abas de gerenciamento.
GRANT UPDATE, DELETE ON public.acessorios, public.icones_missoes TO anon, authenticated;

DROP POLICY IF EXISTS "ADM pode alterar acessórios pelo app" ON public.acessorios;
CREATE POLICY "ADM pode alterar acessórios pelo app"
  ON public.acessorios FOR UPDATE TO anon, authenticated
  USING (true) WITH CHECK (slot IN ('chapeu', 'colar'));

DROP POLICY IF EXISTS "ADM pode remover acessórios pelo app" ON public.acessorios;
CREATE POLICY "ADM pode remover acessórios pelo app"
  ON public.acessorios FOR DELETE TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "ADM pode alterar ícones de missão pelo app" ON public.icones_missoes;
CREATE POLICY "ADM pode alterar ícones de missão pelo app"
  ON public.icones_missoes FOR UPDATE TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ADM pode remover ícones de missão pelo app" ON public.icones_missoes;
CREATE POLICY "ADM pode remover ícones de missão pelo app"
  ON public.icones_missoes FOR DELETE TO anon, authenticated
  USING (true);
