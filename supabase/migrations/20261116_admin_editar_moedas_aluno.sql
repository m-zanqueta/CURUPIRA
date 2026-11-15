-- Permite ao administrador corrigir o saldo de moedas de um aluno.
-- XP e vínculo com turma permanecem somente para leitura no painel.

CREATE OR REPLACE FUNCTION public._admin_colunas(p_tabela text, p_op text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_tabela || ':' || p_op
    WHEN 'professores:upd'     THEN ARRAY['nome','email']
    WHEN 'professores:ins'     THEN ARRAY['nome','email','senha']
    WHEN 'alunos:upd'          THEN ARRAY['nome','email','initials','moedas']
    WHEN 'pets:upd'            THEN ARRAY['nome','icone','estagio','xp']
    WHEN 'pets:ins'            THEN ARRAY['nome','icone','estagio','xp','emocao','turma_id']
    WHEN 'icones_missoes:upd'  THEN ARRAY['nome','icone','ativo']
    WHEN 'icones_missoes:ins'  THEN ARRAY['nome','icone','ativo']
    WHEN 'acessorios:upd'      THEN ARRAY['nome','slot','imagem_path','camada','ativo','preco']
    WHEN 'acessorios:ins'      THEN ARRAY['nome','slot','imagem_path','camada','ativo','preco']
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.admin_atualizar(p_token text, p_tabela text, p_id bigint, p_dados jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cols text[] := public._admin_colunas(p_tabela, 'upd');
  k text;
  v_n int;
  v_moedas numeric;
BEGIN
  PERFORM 1 FROM public._staff_exigir(p_token, ARRAY['admin']);
  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'tabela_nao_permitida' USING ERRCODE = 'PT422';
  END IF;
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' OR p_dados = '{}'::jsonb THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'PT422';
  END IF;

  FOR k IN SELECT jsonb_object_keys(p_dados) LOOP
    IF NOT (k = ANY (v_cols)) THEN
      RAISE EXCEPTION 'campo_nao_permitido' USING ERRCODE = 'PT422';
    END IF;
  END LOOP;

  IF p_tabela = 'alunos' AND p_dados ? 'moedas' THEN
    IF jsonb_typeof(p_dados->'moedas') <> 'number' THEN
      RAISE EXCEPTION 'moedas_invalidas' USING ERRCODE = 'PT422';
    END IF;
    v_moedas := (p_dados->>'moedas')::numeric;
    IF v_moedas < 0 OR v_moedas <> trunc(v_moedas) OR v_moedas > 9223372036854775807 THEN
      RAISE EXCEPTION 'moedas_invalidas' USING ERRCODE = 'PT422';
    END IF;
  END IF;

  IF p_tabela IN ('professores','alunos') AND p_dados ? 'email' THEN
    IF lower(trim(p_dados->>'email')) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      RAISE EXCEPTION 'email_invalido' USING ERRCODE = 'PT422';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('email:' || lower(trim(p_dados->>'email')), 0));
    EXECUTE format('SELECT count(*) FROM public.%I WHERE lower(email) = $1 AND id <> $2', p_tabela)
      INTO v_n USING lower(trim(p_dados->>'email')), p_id;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'email_ja_cadastrado' USING ERRCODE = 'PT409';
    END IF;
  END IF;

  FOR k IN SELECT jsonb_object_keys(p_dados) LOOP
    EXECUTE format(
      'UPDATE public.%1$I x SET %2$I = (jsonb_populate_record(NULL::public.%1$I, $1)).%2$I WHERE x.id = $2',
      p_tabela, k
    ) USING jsonb_build_object(
      k,
      CASE WHEN k = 'email' THEN to_jsonb(lower(trim(p_dados->>k))) ELSE p_dados->k END
    ), p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404';
    END IF;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
