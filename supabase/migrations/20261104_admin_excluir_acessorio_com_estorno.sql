-- Excluir item da loja devolve a cada aluno o preço efetivamente pago,
-- preservando o registro da compra como histórico estornado.

ALTER TABLE public.alunos_itens
  ADD COLUMN IF NOT EXISTS estornado boolean NOT NULL DEFAULT false;

-- O catálogo pode ser apagado sem apagar o histórico dos alunos.
ALTER TABLE public.alunos_itens
  DROP CONSTRAINT IF EXISTS alunos_itens_acessorio_id_fkey;

-- Saldo disponível = XP ganho - compras ainda não estornadas.
CREATE OR REPLACE FUNCTION public._saldo_aluno(p_aluno bigint)
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE((SELECT a.xp FROM public.alunos a WHERE a.id = p_aluno), 0)::bigint
       - COALESCE((SELECT sum(i.preco_pago) FROM public.alunos_itens i
                   WHERE i.aluno_id = p_aluno AND NOT i.estornado), 0)::bigint;
$$;
REVOKE ALL ON FUNCTION public._saldo_aluno(bigint) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_excluir(p_token text, p_tabela text, p_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_n integer;
BEGIN
  PERFORM 1 FROM public._staff_exigir(p_token, ARRAY['admin']);
  IF p_tabela NOT IN ('professores','alunos','pets','icones_missoes','acessorios') THEN
    RAISE EXCEPTION 'tabela_nao_permitida' USING ERRCODE = 'PT422';
  END IF;

  IF p_tabela = 'acessorios' THEN
    PERFORM 1 FROM public.acessorios WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404'; END IF;

    -- Retira o acessório equipado; o inventário comprado fica para auditoria.
    DELETE FROM public.alunos_equipados WHERE acessorio_id = p_id;
    UPDATE public.alunos_itens SET estornado = true
      WHERE acessorio_id = p_id AND estornado = false;
    DELETE FROM public.acessorios WHERE id = p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    EXECUTE format('DELETE FROM public.%I WHERE id = $1', p_tabela) USING p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  IF v_n = 0 THEN RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404'; END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
