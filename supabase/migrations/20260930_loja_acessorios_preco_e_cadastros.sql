-- Acrescenta preço em moedas ao catálogo de acessórios.
ALTER TABLE public.acessorios
  ADD COLUMN IF NOT EXISTS preco integer NOT NULL DEFAULT 0;

ALTER TABLE public.acessorios
  ALTER COLUMN preco SET DEFAULT 0;

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

-- A listagem pública só permite leitura. O cadastro exige dados válidos;
-- a interface de ADM ainda não usa uma identidade administradora do Supabase.
GRANT SELECT, INSERT ON public.acessorios TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.acessorios_id_seq TO anon, authenticated;

DROP POLICY IF EXISTS "Cadastro de acessórios pelo app" ON public.acessorios;
CREATE POLICY "Cadastro de acessórios pelo app"
  ON public.acessorios
  AS PERMISSIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    nome IS NOT NULL
    AND btrim(nome) <> ''
    AND slot IN ('cabeca', 'roupa', 'outro')
    AND imagem_path IS NOT NULL
    AND imagem_path LIKE 'acessorios/%'
    AND preco >= 0
    AND ativo = true
  );

-- Permite ao formulário de ADM registrar imagens no catálogo de missões.
GRANT INSERT ON public.icones_missoes TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.icones_missoes_id_seq TO anon, authenticated;

DROP POLICY IF EXISTS "Cadastro de ícones de missão pelo app" ON public.icones_missoes;
CREATE POLICY "Cadastro de ícones de missão pelo app"
  ON public.icones_missoes
  AS PERMISSIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    nome IS NOT NULL
    AND btrim(nome) <> ''
    AND icone IS NOT NULL
    AND btrim(icone) <> ''
    AND ativo = true
  );
