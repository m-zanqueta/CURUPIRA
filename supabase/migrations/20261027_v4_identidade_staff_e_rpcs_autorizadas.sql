-- =============================================================================
-- V4 · ETAPA 1 (ADITIVA) — identidade de professor/coordenador/administrador no
-- servidor + RPCs autorizadas para tudo que hoje é feito direto pela chave anon.
--
-- PROPOSTA — NÃO EXECUTAR EM PRODUÇÃO SEM REVISÃO E SEM VALIDAR NA HOMOLOGAÇÃO.
--
-- O que ESTA migration faz / não faz:
--   * CRIA tabelas (trancadas), gatilho de hash de senha de professores, funções
--     internas e RPCs. NÃO revoga nenhum privilégio existente, NÃO liga RLS em
--     tabelas existentes, NÃO apaga nem altera dados. Por isso é compatível com o
--     app ATUAL (que ainda usa o acesso direto) e com o app NOVO.
--   * A exposição só deixa de existir quando o script de FECHAMENTO
--     (supabase/fechamento_manual/V4_FECHAMENTO_permissoes.sql) for aplicado,
--     DEPOIS de o app novo estar publicado. Habilitar RLS sozinho não resolve:
--     o fechamento também remove privilégios, políticas permissivas e EXECUTE das
--     RPCs antigas que confiam em p_professor_id enviado pelo cliente.
--
-- Pré-requisitos: migrations do repositório (missões, coordenadores…) e a
-- 20261016 (V3: alunos_sessoes, alunos_credenciais, _aluno_da_sessao).
-- Ordem de aplicação: (1) esta migration; (2) provisionar o administrador
-- (fechamento_manual/V4_provisionar_admin.sql); (3) publicar o app novo;
-- (4) fechamento. Nada aqui é aplicado automaticamente pelo Supabase CLI além
-- deste arquivo; os scripts manuais ficam FORA de supabase/migrations.
--
-- Identidade: o app não usa Supabase Auth (auth.uid() é nulo). Token opaco de 256
-- bits emitido por login_staff; só o SHA-256 fica no banco; expira em 12 h e é
-- revogável. O papel e o id vêm SEMPRE da sessão — nunca de parâmetro do cliente.
-- =============================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE v_falta text;
BEGIN
  SELECT string_agg(t, ', ') INTO v_falta
  FROM unnest(ARRAY['alunos','professores','turmas','pets','missoes','missoes_turmas','alunos_missoes',
                    'coordenadores','acessorios','icones_missoes','alunos_sessoes','alunos_credenciais']) AS t
  WHERE to_regclass('public.' || t) IS NULL;
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'ERRO: tabelas ausentes (%). Aplique antes as migrations anteriores e a 20261016 (V3).', v_falta;
  END IF;
  IF to_regprocedure('public._aluno_da_sessao(text)') IS NULL
     OR to_regprocedure('public.salvar_missao_com_turmas(bigint,bigint,text,text,bigint,text,text,boolean,bigint[])') IS NULL
     OR to_regprocedure('public.definir_turmas_missao(bigint,bigint,bigint[])') IS NULL
     OR to_regprocedure('public.definir_ativa_missao_turma(bigint,bigint,bigint,boolean)') IS NULL
     OR to_regprocedure('public.remover_missao_da_turma(bigint,bigint,bigint)') IS NULL THEN
    RAISE EXCEPTION 'ERRO: funções de missão/V3 ausentes. Aplique 20261004 e 20261016 antes desta migration.';
  END IF;
  IF to_regclass('public.alunos_missoes_etapas') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='missoes' AND column_name='etapas')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alunos_missoes' AND column_name='etapa_atual') THEN
    RAISE EXCEPTION 'ERRO: tarefas com etapas ausentes. Aplique 20261023 e 20261024 (origin/dev) antes desta migration.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 0) COMPATIBILIDADE COM origin/dev: a 20261026_restaurar_acesso_anterior.sql sobrescreve public.login_aluno(text,text)
--    por uma versão LEGADA (compara senha em texto puro, sem token, sem limite de tentativas) e a deixa executável por anon.
--    Isso desfaz a V3 (obter_estado_loja/comprar/equipar exigem o token que só a login_aluno da V3 emite). Esta migration roda
--    DEPOIS da 20261026 e restaura, byte a byte, a definição da V3 (cópia de 20261016_persistencia_inventario_equipados.sql).
--    Se a 20261016 for alterada no futuro, atualize esta cópia (o pós-check compara o corpo da função com a V3).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.login_aluno(p_email text, p_senha text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text := left(lower(trim(COALESCE(p_email, ''))), 254);
  v_senha text := left(COALESCE(p_senha, ''), 1000);
  v_hdr   json;
  v_ip    text;
  v_aluno public.alunos%ROWTYPE;
  v_hash  text;
  v_ok    boolean := false;
  v_gastou boolean := false;   -- já rodou um bcrypt (tempo de resposta uniforme)
  v_token text;
BEGIN
  BEGIN
    v_hdr := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN v_hdr := NULL;
  END;
  v_ip := left(COALESCE(
            NULLIF(trim(split_part(COALESCE(v_hdr->>'x-forwarded-for', ''), ',', 1)), ''),
            NULLIF(trim(COALESCE(v_hdr->>'x-real-ip', '')), ''),
            'desconhecido'), 64);

  -- Serializa as tentativas do MESMO e-mail (lock até o fim da transação). Sem isso, N tentativas em
  -- paralelo leem o contador antes de qualquer falha ser gravada e passam todas do limite (comprovado nos
  -- testes: 30 requisições paralelas => 11 verificações de senha em vez de 5).
  PERFORM pg_advisory_xact_lock(hashtextextended('login_aluno:' || v_email, 0));

  -- Limpeza oportunista (tabelas pequenas, indexadas).
  DELETE FROM public.alunos_login_falhas WHERE ocorrido_em < now() - interval '1 day';
  DELETE FROM public.alunos_sessoes
   WHERE expira_em < now() - interval '30 days' OR revogado_em < now() - interval '30 days';

  IF (SELECT count(*) FROM public.alunos_login_falhas
        WHERE email = v_email AND ip IS NOT DISTINCT FROM v_ip
          AND ocorrido_em > now() - interval '15 minutes') >= 5
     OR (SELECT count(*) FROM public.alunos_login_falhas
           WHERE email = v_email AND ocorrido_em > now() - interval '15 minutes') >= 30
     OR (SELECT count(*) FROM public.alunos_login_falhas
           WHERE ip IS NOT DISTINCT FROM v_ip AND ocorrido_em > now() - interval '15 minutes') >= 60
  THEN
    RAISE EXCEPTION 'muitas_tentativas' USING ERRCODE = 'PT429';
  END IF;

  -- e-mails duplicados (não há UNIQUE garantido): confere cada conta, em ordem de id
  FOR v_aluno IN
    SELECT * FROM public.alunos a WHERE lower(a.email) = v_email ORDER BY a.id LIMIT 5
  LOOP
    IF v_senha <> '' THEN
      SELECT c.senha_hash INTO v_hash FROM public.alunos_credenciais c WHERE c.aluno_id = v_aluno.id;
      IF v_hash IS NOT NULL THEN
        v_ok := v_hash = extensions.crypt(v_senha, v_hash);
        v_gastou := true;
      ELSIF v_aluno.senha IS NOT NULL AND v_aluno.senha <> '' AND v_aluno.senha = v_senha THEN
        v_ok := true;  -- transição: 1º login com senha em texto puro => cria o hash
        v_gastou := true;
        INSERT INTO public.alunos_credenciais (aluno_id, senha_hash)
        VALUES (v_aluno.id, extensions.crypt(v_senha, extensions.gen_salt('bf', 10)))
        ON CONFLICT (aluno_id) DO NOTHING;
      END IF;
    END IF;
    EXIT WHEN v_ok;
  END LOOP;

  IF NOT v_gastou THEN
    PERFORM extensions.crypt(v_senha, extensions.gen_salt('bf', 10));  -- e-mail inexistente / conta em transição: mesmo custo
  END IF;

  IF NOT v_ok THEN
    INSERT INTO public.alunos_login_falhas (email, ip) VALUES (v_email, v_ip);
    RETURN NULL;  -- mesmo retorno para e-mail inexistente e senha errada
  END IF;

  DELETE FROM public.alunos_login_falhas WHERE email = v_email AND ip IS NOT DISTINCT FROM v_ip;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');   -- 256 bits
  INSERT INTO public.alunos_sessoes (aluno_id, token_hash)
  VALUES (v_aluno.id, extensions.digest(v_token, 'sha256'));   -- só o hash fica no banco

  RETURN jsonb_build_object(
    'token', v_token,
    'aluno', to_jsonb(v_aluno) - 'senha' - 'senha_hash'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.login_aluno(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_aluno(text, text) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1) Tabelas novas (RLS ligado, SEM nenhum privilégio para anon/authenticated)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.administradores (
  id         bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nome       text NOT NULL,
  email      text NOT NULL,
  senha_hash text NOT NULL,
  ativo      boolean NOT NULL DEFAULT true,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS administradores_email_uk ON public.administradores (lower(email));

CREATE TABLE IF NOT EXISTS public.professores_credenciais (
  professor_id  bigint PRIMARY KEY REFERENCES public.professores(id) ON DELETE CASCADE,
  senha_hash    text NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_sessoes (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  papel       text   NOT NULL CHECK (papel IN ('professor','coordenador','admin')),
  usuario_id  bigint NOT NULL,
  token_hash  bytea  NOT NULL UNIQUE,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  expira_em   timestamptz NOT NULL DEFAULT now() + interval '12 hours',
  revogado_em timestamptz
);
CREATE INDEX IF NOT EXISTS staff_sessoes_usuario_idx ON public.staff_sessoes (papel, usuario_id);

CREATE TABLE IF NOT EXISTS public.staff_login_falhas (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  email       text NOT NULL,
  ip          text,
  ocorrido_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_login_falhas_idx    ON public.staff_login_falhas (email, ocorrido_em);
CREATE INDEX IF NOT EXISTS staff_login_falhas_ip_idx ON public.staff_login_falhas (ip, ocorrido_em);

-- Eventos genéricos para limite de taxa (cadastro, consulta de e-mail, códigos de turma).
CREATE TABLE IF NOT EXISTS public.limite_taxa_eventos (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  chave       text NOT NULL,
  ocorrido_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS limite_taxa_eventos_idx ON public.limite_taxa_eventos (chave, ocorrido_em);

ALTER TABLE public.administradores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professores_credenciais  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_sessoes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_login_falhas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.limite_taxa_eventos      ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.administradores, public.professores_credenciais, public.staff_sessoes,
  public.staff_login_falhas, public.limite_taxa_eventos FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2) Senha de professor: hash bcrypt (custo 10) mantido por gatilho, em tabela trancada.
--    professores.senha (texto puro) NÃO é apagada aqui; deixa de ser lida pelo login novo
--    e, após o FECHAMENTO, deixa de ser legível pela chave anon. Remoção do texto puro:
--    fechamento_manual/V4_FASE_professores_sem_texto_puro.sql (manual, reversível).
--    Diferente do aluno, NÃO existe comparação com texto puro no login de staff.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sincronizar_credencial_professor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.senha IS NULL OR NEW.senha = '' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND OLD.senha IS NOT DISTINCT FROM NEW.senha THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' THEN
    UPDATE public.staff_sessoes SET revogado_em = now()
     WHERE papel = 'professor' AND usuario_id = NEW.id AND revogado_em IS NULL;
  END IF;
  BEGIN
    INSERT INTO public.professores_credenciais (professor_id, senha_hash)
    VALUES (NEW.id, extensions.crypt(NEW.senha, extensions.gen_salt('bf', 10)))
    ON CONFLICT (professor_id) DO UPDATE SET senha_hash = EXCLUDED.senha_hash, atualizado_em = now();
  EXCEPTION WHEN OTHERS THEN
    DELETE FROM public.professores_credenciais WHERE professor_id = NEW.id;  -- falha fechada: sem hash não há login
    RAISE WARNING 'credencial do professor % nao sincronizada (sqlstate %)', NEW.id, SQLSTATE;
  END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sincronizar_credencial_professor() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS professores_sincroniza_credencial ON public.professores;
CREATE TRIGGER professores_sincroniza_credencial
AFTER INSERT OR UPDATE OF senha ON public.professores
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_credencial_professor();

-- Backfill (idempotente): quem já tem senha ganha hash. Não altera professores.
INSERT INTO public.professores_credenciais (professor_id, senha_hash)
SELECT p.id, extensions.crypt(p.senha, extensions.gen_salt('bf', 10))
FROM public.professores p
WHERE p.senha IS NOT NULL AND p.senha <> ''
ON CONFLICT (professor_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3) Funções internas (nenhuma é exposta à chave anon)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ip_cliente()
RETURNS text
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE v_hdr json;
BEGIN
  BEGIN v_hdr := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN v_hdr := NULL; END;
  RETURN left(COALESCE(
    NULLIF(trim(split_part(COALESCE(v_hdr->>'x-forwarded-for', ''), ',', 1)), ''),
    NULLIF(trim(COALESCE(v_hdr->>'x-real-ip', '')), ''),
    'desconhecido'), 64);
END;
$$;

-- Limite de taxa por chave (janela deslizante), em duas peças. IMPORTANTE: uma função que termina em RAISE EXCEPTION
-- desfaz tudo o que gravou na mesma transação (cada chamada RPC é uma transação). Por isso o registro de uma
-- FALHA só persiste se a função terminar normalmente (retornando NULL/jsonb com "erro"), como login_staff faz.
--   _limite_verificar: estourou => PT429 (não grava nada).      _limite_registrar: grava 1 evento.
CREATE OR REPLACE FUNCTION public._limite_verificar(p_chave text, p_max int, p_janela interval)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('limite:' || p_chave, 0));
  DELETE FROM public.limite_taxa_eventos WHERE ocorrido_em < now() - interval '1 day';
  IF (SELECT count(*) FROM public.limite_taxa_eventos
        WHERE chave = p_chave AND ocorrido_em > now() - p_janela) >= p_max THEN
    RAISE EXCEPTION 'muitas_tentativas' USING ERRCODE = 'PT429';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._limite_registrar(p_chave text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$ INSERT INTO public.limite_taxa_eventos (chave) VALUES (p_chave) $$;

-- Verifica e já registra (para operações em que toda chamada conta, mesmo as bem-sucedidas).
CREATE OR REPLACE FUNCTION public._limite_taxa(p_chave text, p_max int, p_janela interval)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public._limite_verificar(p_chave, p_max, p_janela);
  PERFORM public._limite_registrar(p_chave);
END;
$$;

-- Resolve a sessão de staff. Nunca aceita papel/id do cliente. Conta desativada/removida invalida o token.
CREATE OR REPLACE FUNCTION public._staff_sessao(p_token text)
RETURNS TABLE (papel text, usuario_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_papel text; v_id bigint; v_ok boolean := false;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RAISE EXCEPTION 'sessao_invalida' USING ERRCODE = 'PT401';
  END IF;
  SELECT s.papel, s.usuario_id INTO v_papel, v_id
  FROM public.staff_sessoes s
  WHERE s.token_hash = extensions.digest(p_token, 'sha256')
    AND s.revogado_em IS NULL AND s.expira_em > now();
  IF v_papel = 'professor'   THEN v_ok := EXISTS (SELECT 1 FROM public.professores   x WHERE x.id = v_id);
  ELSIF v_papel = 'coordenador' THEN v_ok := EXISTS (SELECT 1 FROM public.coordenadores x WHERE x.id = v_id AND x.ativo);
  ELSIF v_papel = 'admin'       THEN v_ok := EXISTS (SELECT 1 FROM public.administradores x WHERE x.id = v_id AND x.ativo);
  END IF;
  IF NOT v_ok THEN RAISE EXCEPTION 'sessao_invalida' USING ERRCODE = 'PT401'; END IF;
  RETURN QUERY SELECT v_papel, v_id;
END;
$$;

-- Exige um dos papéis. PT403 se a sessão é válida mas o papel não basta.
CREATE OR REPLACE FUNCTION public._staff_exigir(p_token text, p_papeis text[])
RETURNS TABLE (papel text, usuario_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_papel text; v_id bigint;
BEGIN
  SELECT s.papel, s.usuario_id INTO v_papel, v_id FROM public._staff_sessao(p_token) s;
  IF NOT (v_papel = ANY (p_papeis)) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'PT403';
  END IF;
  RETURN QUERY SELECT v_papel, v_id;
END;
$$;

-- Professor só age em nome de si mesmo; coordenador/admin agem em nome de qualquer professor.
CREATE OR REPLACE FUNCTION public._staff_como_professor(p_token text, p_professor_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_papel text; v_id bigint;
BEGIN
  SELECT s.papel, s.usuario_id INTO v_papel, v_id
  FROM public._staff_exigir(p_token, ARRAY['professor','coordenador','admin']) s;
  IF v_papel = 'professor' AND v_id IS DISTINCT FROM p_professor_id THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'PT403';
  END IF;
END;
$$;

-- O aluno está no escopo do chamador? (professor: só alunos das PRÓPRIAS turmas)
CREATE OR REPLACE FUNCTION public._staff_pode_aluno(p_papel text, p_uid bigint, p_aluno bigint)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN p_papel IN ('coordenador','admin')
              THEN EXISTS (SELECT 1 FROM public.alunos a WHERE a.id = p_aluno)
              ELSE EXISTS (SELECT 1 FROM public.alunos a JOIN public.turmas t ON t.id = a."turmaId"
                           WHERE a.id = p_aluno AND t.professor_id = p_uid) END;
$$;

CREATE OR REPLACE FUNCTION public._senha_forte(p text, p_exigir_simbolo boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT p IS NOT NULL AND length(p) BETWEEN 8 AND 200 AND p ~ '[A-Z]' AND p ~ '[0-9]'
         AND (NOT p_exigir_simbolo OR (p ~ '[a-z]' AND p ~ '[^A-Za-z0-9]'));
$$;

REVOKE ALL ON FUNCTION public._ip_cliente(), public._limite_taxa(text,int,interval), public._limite_verificar(text,int,interval),
  public._limite_registrar(text), public._staff_sessao(text),
  public._staff_exigir(text,text[]), public._staff_como_professor(text,bigint),
  public._staff_pode_aluno(text,bigint,bigint), public._senha_forte(text,boolean)
  FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4) Login / logout / perfil de staff
--    Limite: 5 falhas por (e-mail+IP), 30 por e-mail e 60 por IP em 15 min (PT429).
--    Sempre há ao menos um bcrypt (e-mail inexistente não se distingue pelo tempo).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.login_staff(p_email text, p_senha text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text := left(lower(trim(COALESCE(p_email, ''))), 254);
  v_senha text := left(COALESCE(p_senha, ''), 1000);
  v_ip    text := public._ip_cliente();
  v_papel text; v_id bigint; v_nome text; v_ok boolean := false; v_gastou boolean := false;
  r record; v_token text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('login_staff:' || v_email, 0));
  DELETE FROM public.staff_login_falhas WHERE ocorrido_em < now() - interval '1 day';
  DELETE FROM public.staff_sessoes WHERE expira_em < now() - interval '30 days' OR revogado_em < now() - interval '30 days';

  IF (SELECT count(*) FROM public.staff_login_falhas
        WHERE email = v_email AND ip IS NOT DISTINCT FROM v_ip AND ocorrido_em > now() - interval '15 minutes') >= 5
     OR (SELECT count(*) FROM public.staff_login_falhas
           WHERE email = v_email AND ocorrido_em > now() - interval '15 minutes') >= 30
     OR (SELECT count(*) FROM public.staff_login_falhas
           WHERE ip IS NOT DISTINCT FROM v_ip AND ocorrido_em > now() - interval '15 minutes') >= 60 THEN
    RAISE EXCEPTION 'muitas_tentativas' USING ERRCODE = 'PT429';
  END IF;

  IF v_senha <> '' THEN
    FOR r IN SELECT a.id, a.nome, a.senha_hash AS h FROM public.administradores a
             WHERE lower(a.email) = v_email AND a.ativo LIMIT 1 LOOP
      v_gastou := true;
      IF r.h = extensions.crypt(v_senha, r.h) THEN v_ok := true; v_papel := 'admin'; v_id := r.id; v_nome := r.nome; END IF;
    END LOOP;
    IF NOT v_ok THEN
      FOR r IN SELECT c.id, c.nome, c.senha_hash AS h FROM public.coordenadores c
               WHERE lower(c.email) = v_email AND c.ativo LIMIT 1 LOOP
        v_gastou := true;
        IF r.h = extensions.crypt(v_senha, r.h) THEN v_ok := true; v_papel := 'coordenador'; v_id := r.id; v_nome := r.nome; END IF;
      END LOOP;
    END IF;
    IF NOT v_ok THEN
      FOR r IN SELECT p.id, p.nome, k.senha_hash AS h FROM public.professores p
               JOIN public.professores_credenciais k ON k.professor_id = p.id
               WHERE lower(p.email) = v_email AND COALESCE(p.tipo, 'professor') = 'professor'
               ORDER BY p.id LIMIT 5 LOOP
        v_gastou := true;
        IF r.h = extensions.crypt(v_senha, r.h) THEN v_ok := true; v_papel := 'professor'; v_id := r.id; v_nome := r.nome; EXIT; END IF;
      END LOOP;
    END IF;
  END IF;

  IF NOT v_gastou THEN PERFORM extensions.crypt(v_senha, extensions.gen_salt('bf', 10)); END IF;

  IF NOT v_ok THEN
    INSERT INTO public.staff_login_falhas (email, ip) VALUES (v_email, v_ip);
    RETURN NULL;
  END IF;

  DELETE FROM public.staff_login_falhas WHERE email = v_email AND ip IS NOT DISTINCT FROM v_ip;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.staff_sessoes (papel, usuario_id, token_hash)
  VALUES (v_papel, v_id, extensions.digest(v_token, 'sha256'));
  RETURN jsonb_build_object('token', v_token,
           'usuario', jsonb_build_object('id', v_id, 'nome', v_nome, 'email', v_email, 'tipo', v_papel));
END;
$$;

CREATE OR REPLACE FUNCTION public.logout_staff(p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.staff_sessoes SET revogado_em = now()
  WHERE token_hash = extensions.digest(COALESCE(p_token, ''), 'sha256') AND revogado_em IS NULL;
$$;

-- Restauração de sessão pelo app: devolve o perfil autêntico (ou PT401).
CREATE OR REPLACE FUNCTION public.staff_perfil(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_papel text; v_id bigint; v_r jsonb;
BEGIN
  SELECT s.papel, s.usuario_id INTO v_papel, v_id FROM public._staff_sessao(p_token) s;
  IF v_papel = 'admin' THEN
    SELECT jsonb_build_object('id', x.id, 'nome', x.nome, 'email', lower(x.email), 'tipo', 'admin') INTO v_r FROM public.administradores x WHERE x.id = v_id;
  ELSIF v_papel = 'coordenador' THEN
    SELECT jsonb_build_object('id', x.id, 'nome', x.nome, 'email', lower(x.email), 'tipo', 'coordenador') INTO v_r FROM public.coordenadores x WHERE x.id = v_id;
  ELSE
    SELECT jsonb_build_object('id', x.id, 'nome', x.nome, 'email', lower(x.email), 'tipo', 'professor') INTO v_r FROM public.professores x WHERE x.id = v_id;
  END IF;
  RETURN v_r;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5) ALUNOS — cadastro, e-mail, entrada em turma, listagem/edição por staff
-- -----------------------------------------------------------------------------
-- Cadastro: o servidor valida e define xp = 0 e turma nula. O cliente NUNCA envia xp/turma/id.
CREATE OR REPLACE FUNCTION public.cadastrar_aluno(p_nome text, p_email text, p_senha text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nome  text := left(trim(COALESCE(p_nome, '')), 100);
  v_email text := left(lower(trim(COALESCE(p_email, ''))), 254);
  v_id bigint;
BEGIN
  IF v_nome = '' THEN RAISE EXCEPTION 'nome_invalido' USING ERRCODE = 'PT422'; END IF;
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'email_invalido' USING ERRCODE = 'PT422';
  END IF;
  IF NOT public._senha_forte(p_senha) THEN RAISE EXCEPTION 'senha_fraca' USING ERRCODE = 'PT422'; END IF;
  PERFORM public._limite_taxa('cadastro:' || public._ip_cliente(), 200, interval '1 hour');
  PERFORM pg_advisory_xact_lock(hashtextextended('cadastro_email:' || v_email, 0));
  IF EXISTS (SELECT 1 FROM public.alunos a WHERE lower(a.email) = v_email) THEN
    RETURN jsonb_build_object('erro', 'email_ja_cadastrado');   -- retorno (não exceção): o contador acima persiste
  END IF;
  INSERT INTO public.alunos (nome, email, senha, "turmaId", xp)
  VALUES (v_nome, v_email, p_senha, NULL, 0) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'nome', v_nome, 'email', v_email);
END;
$$;

-- Só diz se o e-mail existe (UX do cadastro). Limitada por IP; é um oráculo de enumeração
-- inevitável nesse fluxo — risco residual documentado.
CREATE OR REPLACE FUNCTION public.email_aluno_existe(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public._limite_taxa('email_existe:' || public._ip_cliente(), 120, interval '15 minutes');
  RETURN EXISTS (SELECT 1 FROM public.alunos a WHERE lower(a.email) = left(lower(trim(COALESCE(p_email, ''))), 254));
END;
$$;

-- O aluno (pelo token) entra na turma pelo código. O servidor decide a turma; o cliente não escolhe id.
CREATE OR REPLACE FUNCTION public.entrar_na_turma(p_token text, p_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_aluno bigint := public._aluno_da_sessao(p_token);
  v_cod   text   := upper(trim(COALESCE(p_codigo, '')));
  v_chave text   := 'turma_falha:' || v_aluno;
  v_turma public.turmas%ROWTYPE;
  v_atual bigint;
BEGIN
  PERFORM public._limite_verificar(v_chave, 20, interval '15 minutes');   -- 20 códigos errados / 15 min por aluno
  IF v_cod = '' OR length(v_cod) > 40 THEN
    PERFORM public._limite_registrar(v_chave);
    RETURN jsonb_build_object('erro', 'codigo_invalido');
  END IF;
  SELECT * INTO v_turma FROM public.turmas t WHERE upper(t.codigo) = v_cod ORDER BY t.id LIMIT 1;
  IF NOT FOUND THEN
    PERFORM public._limite_registrar(v_chave);     -- falha persistida: retorno normal, não exceção
    RETURN jsonb_build_object('erro', 'codigo_invalido');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pets p WHERE p.turma_id = v_turma.id) THEN
    RETURN jsonb_build_object('erro', 'turma_sem_pet');
  END IF;
  SELECT a."turmaId" INTO v_atual FROM public.alunos a WHERE a.id = v_aluno FOR UPDATE;
  IF v_atual IS NOT NULL AND v_atual <> v_turma.id THEN
    RETURN jsonb_build_object('erro', 'ja_em_turma');   -- trocar de turma exige remoção pelo professor/coordenação
  END IF;
  UPDATE public.alunos SET "turmaId" = v_turma.id WHERE id = v_aluno;
  RETURN jsonb_build_object('turma', jsonb_build_object('id', v_turma.id, 'nome', v_turma.nome,
                                                         'codigo', v_turma.codigo, 'professor_id', v_turma.professor_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_listar_alunos(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_papel text; v_id bigint; v_r jsonb;
BEGIN
  SELECT s.papel, s.usuario_id INTO v_papel, v_id FROM public._staff_exigir(p_token, ARRAY['professor','coordenador','admin']) s;
  SELECT COALESCE(jsonb_agg(to_jsonb(a) - 'senha' - 'senha_hash' ORDER BY a.id), '[]'::jsonb) INTO v_r
  FROM public.alunos a
  WHERE v_papel IN ('coordenador','admin')
     OR EXISTS (SELECT 1 FROM public.turmas t WHERE t.id = a."turmaId" AND t.professor_id = v_id);
  RETURN v_r;
END;
$$;

-- Edita só nome/iniciais. XP, senha, e-mail e turma NÃO passam por aqui.
CREATE OR REPLACE FUNCTION public.staff_atualizar_aluno(p_token text, p_aluno_id bigint, p_nome text, p_initials text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_papel text; v_id bigint; v_nome text := left(trim(COALESCE(p_nome, '')), 100);
BEGIN
  SELECT s.papel, s.usuario_id INTO v_papel, v_id FROM public._staff_exigir(p_token, ARRAY['professor','coordenador','admin']) s;
  IF v_nome = '' THEN RAISE EXCEPTION 'nome_invalido' USING ERRCODE = 'PT422'; END IF;
  IF NOT public._staff_pode_aluno(v_papel, v_id, p_aluno_id) THEN RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'PT403'; END IF;
  UPDATE public.alunos SET nome = v_nome, initials = left(upper(trim(COALESCE(p_initials, ''))), 4) WHERE id = p_aluno_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_remover_aluno_da_turma(p_token text, p_aluno_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_papel text; v_id bigint;
BEGIN
  SELECT s.papel, s.usuario_id INTO v_papel, v_id FROM public._staff_exigir(p_token, ARRAY['professor','coordenador','admin']) s;
  IF NOT public._staff_pode_aluno(v_papel, v_id, p_aluno_id) THEN RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'PT403'; END IF;
  UPDATE public.alunos SET "turmaId" = NULL WHERE id = p_aluno_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6) MISSÕES E XP
--    Aprovar (e, portanto, creditar XP via gatilho) é restrito a coordenador/admin — espelha a regra
--    que o app já aplica no cliente (DashboardScreen.ciclarStatus: `if (!isCoordenador) return`).
--    As regras de negócio (missão ativa, turma vinculada, PET) continuam nos gatilhos existentes.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_definir_status_missao(p_token text, p_missao_id bigint, p_aluno_id bigint, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_r jsonb;
BEGIN
  PERFORM 1 FROM public._staff_exigir(p_token, ARRAY['coordenador','admin']);
  IF p_status IS NULL OR p_status NOT IN ('pendente','entregue','aprovado') THEN
    RAISE EXCEPTION 'status_invalido' USING ERRCODE = 'PT422';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.alunos a WHERE a.id = p_aluno_id)
     OR NOT EXISTS (SELECT 1 FROM public.missoes m WHERE m.id = p_missao_id) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404';
  END IF;
  -- UPDATE primeiro: num INSERT ... ON CONFLICT o gatilho BEFORE INSERT (validar_status_tarefa_autenticado, 20261024) vê a linha PROPOSTA
  -- (etapa_atual=0) e recusaria a aprovação de quem já concluiu todas as etapas. Com UPDATE, o gatilho vê a linha real.
  LOOP
    UPDATE public.alunos_missoes AS am SET status = p_status
     WHERE am.aluno_id = p_aluno_id AND am.missao_id = p_missao_id RETURNING to_jsonb(am.*) INTO v_r;
    EXIT WHEN FOUND;
    BEGIN
      INSERT INTO public.alunos_missoes AS am (missao_id, aluno_id, status) VALUES (p_missao_id, p_aluno_id, p_status)
      RETURNING to_jsonb(am.*) INTO v_r;
      EXIT;
    EXCEPTION WHEN unique_violation THEN NULL;   -- outra transação criou a linha agora: repete o UPDATE
    END;
  END LOOP;
  RETURN v_r;
END;
$$;

-- Aluno entrega a própria missão (nunca aprova): só pendente -> entregue, e só o próprio token.
CREATE OR REPLACE FUNCTION public.aluno_definir_status_missao(p_token text, p_missao_id bigint, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_aluno bigint := public._aluno_da_sessao(p_token); v_atual text; v_r jsonb;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('pendente','entregue') THEN
    RAISE EXCEPTION 'status_invalido' USING ERRCODE = 'PT422';
  END IF;
  SELECT status INTO v_atual FROM public.alunos_missoes WHERE aluno_id = v_aluno AND missao_id = p_missao_id FOR UPDATE;
  IF v_atual = 'aprovado' OR (v_atual = 'entregue' AND p_status = 'pendente') THEN
    RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = 'PT409';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.missoes m WHERE m.id = p_missao_id) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404';
  END IF;
  -- UPDATE primeiro: num INSERT ... ON CONFLICT o gatilho BEFORE INSERT (validar_status_tarefa_autenticado, 20261024) vê a linha PROPOSTA
  -- (etapa_atual=0) e recusaria a aprovação de quem já concluiu todas as etapas. Com UPDATE, o gatilho vê a linha real.
  LOOP
    UPDATE public.alunos_missoes AS am SET status = p_status
     WHERE am.aluno_id = v_aluno AND am.missao_id = p_missao_id RETURNING to_jsonb(am.*) INTO v_r;
    EXIT WHEN FOUND;
    BEGIN
      INSERT INTO public.alunos_missoes AS am (missao_id, aluno_id, status) VALUES (p_missao_id, v_aluno, p_status)
      RETURNING to_jsonb(am.*) INTO v_r;
      EXIT;
    EXCEPTION WHEN unique_violation THEN NULL;   -- outra transação criou a linha agora: repete o UPDATE
    END;
  END LOOP;
  RETURN v_r;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_salvar_missao(
  p_token text, p_missao_id bigint, p_professor_id bigint, p_nome text, p_descricao text,
  p_xp bigint, p_dificuldade text, p_icone text, p_ativa boolean, p_turmas_ids bigint[])
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public._staff_como_professor(p_token, p_professor_id);
  RETURN public.salvar_missao_com_turmas(p_missao_id, p_professor_id, p_nome, p_descricao, p_xp,
                                          p_dificuldade, p_icone, p_ativa, p_turmas_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_definir_turmas_missao(p_token text, p_missao_id bigint, p_professor_id bigint, p_turmas_ids bigint[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public._staff_como_professor(p_token, p_professor_id);
  PERFORM public.definir_turmas_missao(p_missao_id, p_professor_id, p_turmas_ids);
END;
$$;

-- Tarefa GLOBAL (missoes."professorId" IS NULL, criada pelo admin): quem pode ligar/desligar/remover o vínculo com uma turma é
-- coordenador/admin (qualquer turma) ou o professor DONO DA TURMA. Tarefa de professor: continua pela função antiga, que confere
-- dono da missão e da turma. O p_professor_id enviado pelo cliente nunca decide permissão no ramo global.
CREATE OR REPLACE FUNCTION public.staff_definir_ativa_missao_turma(p_token text, p_missao_id bigint, p_professor_id bigint, p_turma_id bigint, p_ativa boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_papel text; v_uid bigint; v_dono bigint; v_turma_prof bigint;
BEGIN
  SELECT s.papel, s.usuario_id INTO v_papel, v_uid FROM public._staff_exigir(p_token, ARRAY['professor','coordenador','admin']) s;
  SELECT m."professorId" INTO v_dono FROM public.missoes m WHERE m.id = p_missao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404'; END IF;
  IF v_dono IS NULL THEN
    SELECT t.professor_id INTO v_turma_prof FROM public.turmas t WHERE t.id = p_turma_id;
    IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.missoes_turmas mt WHERE mt.missao_id = p_missao_id AND mt.turma_id = p_turma_id) THEN
      RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404';
    END IF;
    IF v_papel = 'professor' AND v_turma_prof IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'PT403'; END IF;
    UPDATE public.missoes_turmas SET ativa = COALESCE(p_ativa, false) WHERE missao_id = p_missao_id AND turma_id = p_turma_id;
  ELSE
    PERFORM public._staff_como_professor(p_token, p_professor_id);
    PERFORM public.definir_ativa_missao_turma(p_missao_id, p_professor_id, p_turma_id, p_ativa);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_remover_missao_da_turma(p_token text, p_missao_id bigint, p_professor_id bigint, p_turma_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_papel text; v_uid bigint; v_dono bigint; v_turma_prof bigint;
BEGIN
  SELECT s.papel, s.usuario_id INTO v_papel, v_uid FROM public._staff_exigir(p_token, ARRAY['professor','coordenador','admin']) s;
  SELECT m."professorId" INTO v_dono FROM public.missoes m WHERE m.id = p_missao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404'; END IF;
  IF v_dono IS NULL THEN
    SELECT t.professor_id INTO v_turma_prof FROM public.turmas t WHERE t.id = p_turma_id;
    IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.missoes_turmas mt WHERE mt.missao_id = p_missao_id AND mt.turma_id = p_turma_id) THEN
      RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404';
    END IF;
    IF v_papel = 'professor' AND v_turma_prof IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'PT403'; END IF;
    -- Remove o progresso dos alunos da turma (os gatilhos estornam XP/moedas) e o vínculo. Não altera missoes."turmaId".
    DELETE FROM public.alunos_missoes am USING public.alunos a
     WHERE am.missao_id = p_missao_id AND a.id = am.aluno_id AND (am.turma_id = p_turma_id OR a."turmaId" = p_turma_id);
    DELETE FROM public.missoes_turmas WHERE missao_id = p_missao_id AND turma_id = p_turma_id;
  ELSE
    PERFORM public._staff_como_professor(p_token, p_professor_id);
    PERFORM public.remover_missao_da_turma(p_missao_id, p_professor_id, p_turma_id);
  END IF;
END;
$$;

-- Atribui uma tarefa GLOBAL (ou do próprio professor) a uma turma. Professor: só turma sua; coordenador/admin: qualquer.
CREATE OR REPLACE FUNCTION public.staff_atribuir_tarefa_global(p_token text, p_missao_id bigint, p_turma_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_papel text; v_uid bigint; v_dono bigint; v_turma_prof bigint;
BEGIN
  SELECT s.papel, s.usuario_id INTO v_papel, v_uid FROM public._staff_exigir(p_token, ARRAY['professor','coordenador','admin']) s;
  SELECT m."professorId" INTO v_dono FROM public.missoes m WHERE m.id = p_missao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404'; END IF;
  SELECT t.professor_id INTO v_turma_prof FROM public.turmas t WHERE t.id = p_turma_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404'; END IF;
  IF v_papel = 'professor' AND (v_turma_prof IS DISTINCT FROM v_uid OR (v_dono IS NOT NULL AND v_dono <> v_uid)) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'PT403';
  END IF;
  INSERT INTO public.missoes_turmas (missao_id, turma_id, ativa) VALUES (p_missao_id, p_turma_id, true)
  ON CONFLICT DO NOTHING;
END;
$$;

-- Criar/editar tarefa GLOBAL com etapas e moedas (somente administrador). Valida tudo no servidor; o cliente não define dono,
-- xp total, dificuldade nem turma. Só edita tarefas globais (não toma posse de tarefa de professor).
CREATE OR REPLACE FUNCTION public.staff_salvar_tarefa_global(
  p_token text, p_missao_id bigint, p_nome text, p_descricao text, p_etapas jsonb, p_moedas bigint, p_icone text, p_ativa boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_nome text := btrim(COALESCE(p_nome, '')); v_desc text := btrim(COALESCE(p_descricao, ''));
        v_et jsonb := '[]'::jsonb; e jsonb; v_i int := 0; v_xp numeric; v_t text; v_dono bigint; v_r jsonb;
BEGIN
  PERFORM 1 FROM public._staff_exigir(p_token, ARRAY['admin']);
  IF v_nome = '' OR length(v_nome) > 120 OR length(v_desc) > 2000 THEN RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'PT422'; END IF;
  IF p_moedas IS NULL OR p_moedas < 0 OR p_moedas > 100000 THEN RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'PT422'; END IF;
  IF p_icone IS NOT NULL AND length(p_icone) > 1000 THEN RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'PT422'; END IF;
  IF p_etapas IS NULL OR jsonb_typeof(p_etapas) <> 'array' OR jsonb_array_length(p_etapas) NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'PT422';
  END IF;
  FOR e IN SELECT x FROM jsonb_array_elements(p_etapas) AS x LOOP
    IF jsonb_typeof(e) <> 'object' OR jsonb_typeof(e->'titulo') <> 'string' OR jsonb_typeof(e->'xp') <> 'number' THEN
      RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'PT422';
    END IF;
    v_t := btrim(e->>'titulo'); v_xp := (e->>'xp')::numeric;
    IF v_t = '' OR length(v_t) > 200 OR v_xp < 0 OR v_xp > 1000 OR v_xp <> trunc(v_xp) THEN
      RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'PT422';
    END IF;
    v_i := v_i + 1;
    v_et := v_et || jsonb_build_array(jsonb_build_object('titulo', v_t, 'xp', v_xp::bigint, 'ordem', v_i));
  END LOOP;
  IF p_missao_id IS NULL THEN
    INSERT INTO public.missoes (nome, descricao, etapas, moedas, xp, dificuldade, icone, ativa, "professorId", "turmaId")
    VALUES (v_nome, v_desc, v_et, p_moedas, 0, 'media', p_icone, COALESCE(p_ativa, true), NULL, NULL)
    RETURNING to_jsonb(missoes.*) INTO v_r;
  ELSE
    SELECT m."professorId" INTO v_dono FROM public.missoes m WHERE m.id = p_missao_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404'; END IF;
    IF v_dono IS NOT NULL THEN RAISE EXCEPTION 'tarefa_nao_global' USING ERRCODE = 'PT409'; END IF;
    UPDATE public.missoes SET nome = v_nome, descricao = v_desc, etapas = v_et, moedas = p_moedas, xp = 0,
           icone = p_icone, ativa = COALESCE(p_ativa, true)
     WHERE id = p_missao_id RETURNING to_jsonb(missoes.*) INTO v_r;
  END IF;
  RETURN v_r;
END;
$$;

-- Aluno avança UMA etapa da própria tarefa. Port da avancar_etapa_tarefa (20261024), que depende de JWT do Supabase Auth
-- (inexistente neste app): aqui a identidade vem do token de sessão do aluno. Cada avanço grava um registro imutável em
-- alunos_missoes_etapas; o gatilho aplicar_xp_etapa_tarefa credita XP ao aluno e ao PET.
CREATE OR REPLACE FUNCTION public.aluno_avancar_etapa(p_token text, p_missao_id bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_aluno bigint := public._aluno_da_sessao(p_token); v_turma bigint; v_pet bigint;
        v_status text; v_atual integer; v_etapas jsonb; v_xp bigint; v_prox integer;
BEGIN
  SELECT a."turmaId" INTO v_turma FROM public.alunos a WHERE a.id = v_aluno;
  IF v_turma IS NULL THEN RAISE EXCEPTION 'sem_turma' USING ERRCODE = 'PT409'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.missoes_turmas mt WHERE mt.missao_id = p_missao_id AND mt.turma_id = v_turma AND mt.ativa) THEN
    RAISE EXCEPTION 'tarefa_inativa' USING ERRCODE = 'PT409';
  END IF;
  SELECT m.etapas INTO v_etapas FROM public.missoes m WHERE m.id = p_missao_id AND m.ativa;
  IF v_etapas IS NULL OR jsonb_typeof(v_etapas) <> 'array' OR jsonb_array_length(v_etapas) = 0 THEN
    RAISE EXCEPTION 'sem_etapas' USING ERRCODE = 'PT409';
  END IF;
  SELECT p.id INTO v_pet FROM public.pets p WHERE p.turma_id = v_turma ORDER BY p.id LIMIT 1;
  IF v_pet IS NULL THEN RAISE EXCEPTION 'turma_sem_pet' USING ERRCODE = 'PT409'; END IF;
  SELECT am.status, am.etapa_atual INTO v_status, v_atual FROM public.alunos_missoes am
   WHERE am.aluno_id = v_aluno AND am.missao_id = p_missao_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.alunos_missoes (aluno_id, missao_id, status) VALUES (v_aluno, p_missao_id, 'pendente');
    v_atual := 0; v_status := 'pendente';
  END IF;
  IF v_status <> 'pendente' THEN RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = 'PT409'; END IF;
  IF v_atual >= jsonb_array_length(v_etapas) THEN RAISE EXCEPTION 'etapas_concluidas' USING ERRCODE = 'PT409'; END IF;
  v_prox := v_atual + 1;
  v_xp := COALESCE((v_etapas -> v_atual ->> 'xp')::bigint, 0);
  UPDATE public.alunos_missoes SET etapa_atual = v_prox WHERE aluno_id = v_aluno AND missao_id = p_missao_id;
  INSERT INTO public.alunos_missoes_etapas (aluno_id, missao_id, etapa_ordem, turma_id, pet_id, xp)
  VALUES (v_aluno, p_missao_id, v_prox, v_turma, v_pet, v_xp);
  RETURN v_prox;
END;
$$;

-- Exclui a missão (o gatilho de alunos_missoes estorna o XP concedido). Professor: só as próprias.
CREATE OR REPLACE FUNCTION public.staff_excluir_missao(p_token text, p_missao_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_papel text; v_id bigint; v_dono bigint;
BEGIN
  SELECT s.papel, s.usuario_id INTO v_papel, v_id FROM public._staff_exigir(p_token, ARRAY['professor','coordenador','admin']) s;
  SELECT m."professorId" INTO v_dono FROM public.missoes m WHERE m.id = p_missao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404'; END IF;
  IF v_papel = 'professor' AND v_dono IS DISTINCT FROM v_id THEN RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'PT403'; END IF;
  DELETE FROM public.missoes WHERE id = p_missao_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 7) TURMAS (criar: coordenador/admin; excluir: professor dono ou admin)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_criar_turma(p_token text, p_nome text, p_codigo text, p_professor_id bigint, p_cor text, p_pet_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_nome text := left(trim(COALESCE(p_nome, '')), 100); v_cod text := upper(trim(COALESCE(p_codigo, '')));
        v_turma public.turmas%ROWTYPE; v_pet public.pets%ROWTYPE;
BEGIN
  PERFORM 1 FROM public._staff_exigir(p_token, ARRAY['coordenador','admin']);
  IF v_nome = '' THEN RAISE EXCEPTION 'nome_invalido' USING ERRCODE = 'PT422'; END IF;
  IF v_cod !~ '^[A-Z0-9_-]{3,20}$' THEN RAISE EXCEPTION 'codigo_invalido' USING ERRCODE = 'PT422'; END IF;
  IF p_cor IS NOT NULL AND p_cor !~ '^#[0-9A-Fa-f]{6}$' THEN RAISE EXCEPTION 'cor_invalida' USING ERRCODE = 'PT422'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.professores p WHERE p.id = p_professor_id) THEN
    RAISE EXCEPTION 'professor_invalido' USING ERRCODE = 'PT422';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('turma_codigo:' || v_cod, 0));
  IF EXISTS (SELECT 1 FROM public.turmas t WHERE upper(t.codigo) = v_cod) THEN
    RAISE EXCEPTION 'codigo_em_uso' USING ERRCODE = 'PT409';
  END IF;
  SELECT * INTO v_pet FROM public.pets p WHERE p.id = p_pet_id AND p.turma_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pet_indisponivel' USING ERRCODE = 'PT409'; END IF;
  INSERT INTO public.turmas (nome, codigo, professor_id, cor) VALUES (v_nome, v_cod, p_professor_id, COALESCE(p_cor, '#009D25'))
  RETURNING * INTO v_turma;
  UPDATE public.pets SET turma_id = v_turma.id WHERE id = v_pet.id RETURNING * INTO v_pet;
  RETURN to_jsonb(v_turma) || jsonb_build_object('pet', jsonb_build_object('id', v_pet.id, 'nome', v_pet.nome, 'icone', v_pet.icone,
           'estagio', v_pet.estagio, 'xp', v_pet.xp, 'emocao', v_pet.emocao, 'cosmetico', v_pet.cosmetico, 'turma_id', v_pet.turma_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_excluir_turma(p_token text, p_turma_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_papel text; v_id bigint; v_dono bigint;
BEGIN
  SELECT s.papel, s.usuario_id INTO v_papel, v_id FROM public._staff_exigir(p_token, ARRAY['professor','admin']) s;
  SELECT t.professor_id INTO v_dono FROM public.turmas t WHERE t.id = p_turma_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404'; END IF;
  IF v_papel = 'professor' AND v_dono IS DISTINCT FROM v_id THEN RAISE EXCEPTION 'sem_permissao' USING ERRCODE = 'PT403'; END IF;
  DELETE FROM public.turmas WHERE id = p_turma_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 8) ADMINISTRAÇÃO (somente papel admin) — tabelas e colunas em lista fechada.
--    Senha NUNCA é lida; é trocada por admin_definir_senha. Papel/id/xp de aluno não são editáveis.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._admin_colunas(p_tabela text, p_op text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_tabela || ':' || p_op
    WHEN 'professores:upd'     THEN ARRAY['nome','email']
    WHEN 'professores:ins'     THEN ARRAY['nome','email','senha']
    WHEN 'alunos:upd'          THEN ARRAY['nome','email','initials']
    WHEN 'pets:upd'            THEN ARRAY['nome','icone','estagio','xp']
    WHEN 'pets:ins'            THEN ARRAY['nome','icone','estagio','xp','emocao','turma_id']
    WHEN 'icones_missoes:upd'  THEN ARRAY['nome','icone','ativo']
    WHEN 'icones_missoes:ins'  THEN ARRAY['nome','icone','ativo']
    WHEN 'acessorios:upd'      THEN ARRAY['nome','slot','imagem_path','camada','ativo','preco']
    WHEN 'acessorios:ins'      THEN ARRAY['nome','slot','imagem_path','camada','ativo','preco']
    ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.admin_listar(p_token text, p_tabela text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_r jsonb;
BEGIN
  PERFORM 1 FROM public._staff_exigir(p_token, ARRAY['admin']);
  IF p_tabela NOT IN ('professores','alunos','pets','icones_missoes','acessorios') THEN
    RAISE EXCEPTION 'tabela_nao_permitida' USING ERRCODE = 'PT422';
  END IF;
  EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t) - %L - %L ORDER BY t.id), %L::jsonb) FROM public.%I t',
                 'senha', 'senha_hash', '[]', p_tabela) INTO v_r;
  RETURN v_r;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_atualizar(p_token text, p_tabela text, p_id bigint, p_dados jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_cols text[] := public._admin_colunas(p_tabela, 'upd'); k text; v_n int;
BEGIN
  PERFORM 1 FROM public._staff_exigir(p_token, ARRAY['admin']);
  IF v_cols IS NULL THEN RAISE EXCEPTION 'tabela_nao_permitida' USING ERRCODE = 'PT422'; END IF;
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' OR p_dados = '{}'::jsonb THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'PT422';
  END IF;
  FOR k IN SELECT jsonb_object_keys(p_dados) LOOP
    IF NOT (k = ANY (v_cols)) THEN RAISE EXCEPTION 'campo_nao_permitido' USING ERRCODE = 'PT422'; END IF;
  END LOOP;
  IF p_tabela IN ('professores','alunos') AND p_dados ? 'email' THEN
    IF lower(trim(p_dados->>'email')) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      RAISE EXCEPTION 'email_invalido' USING ERRCODE = 'PT422';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('email:' || lower(trim(p_dados->>'email')), 0));
    EXECUTE format('SELECT count(*) FROM public.%I WHERE lower(email) = $1 AND id <> $2', p_tabela)
      INTO v_n USING lower(trim(p_dados->>'email')), p_id;
    IF v_n > 0 THEN RAISE EXCEPTION 'email_ja_cadastrado' USING ERRCODE = 'PT409'; END IF;
  END IF;
  FOR k IN SELECT jsonb_object_keys(p_dados) LOOP
    EXECUTE format('UPDATE public.%1$I x SET %2$I = (jsonb_populate_record(NULL::public.%1$I, $1)).%2$I WHERE x.id = $2', p_tabela, k)
      USING jsonb_build_object(k, CASE WHEN k = 'email' THEN to_jsonb(lower(trim(p_dados->>k))) ELSE p_dados->k END), p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404'; END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_inserir(p_token text, p_tabela text, p_dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_cols text[] := public._admin_colunas(p_tabela, 'ins'); k text; v_lista text[] := '{}'; v_r jsonb;
BEGIN
  PERFORM 1 FROM public._staff_exigir(p_token, ARRAY['admin']);
  IF v_cols IS NULL THEN RAISE EXCEPTION 'tabela_nao_permitida' USING ERRCODE = 'PT422'; END IF;
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' THEN RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'PT422'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_dados) LOOP
    IF NOT (k = ANY (v_cols)) THEN RAISE EXCEPTION 'campo_nao_permitido' USING ERRCODE = 'PT422'; END IF;
    v_lista := v_lista || format('%I', k);
  END LOOP;
  IF p_tabela = 'professores' THEN
    IF trim(COALESCE(p_dados->>'nome', '')) = '' THEN RAISE EXCEPTION 'nome_invalido' USING ERRCODE = 'PT422'; END IF;
    IF lower(trim(COALESCE(p_dados->>'email', ''))) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      RAISE EXCEPTION 'email_invalido' USING ERRCODE = 'PT422';
    END IF;
    IF NOT public._senha_forte(p_dados->>'senha', true) THEN RAISE EXCEPTION 'senha_fraca' USING ERRCODE = 'PT422'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('email:' || lower(trim(p_dados->>'email')), 0));
    IF EXISTS (SELECT 1 FROM public.professores p WHERE lower(p.email) = lower(trim(p_dados->>'email'))) THEN
      RAISE EXCEPTION 'email_ja_cadastrado' USING ERRCODE = 'PT409';
    END IF;
    INSERT INTO public.professores (nome, email, senha, tipo)
    VALUES (trim(p_dados->>'nome'), lower(trim(p_dados->>'email')), p_dados->>'senha', 'professor')
    RETURNING jsonb_build_object('id', id, 'nome', nome, 'email', email) INTO v_r;
    RETURN v_r;
  END IF;
  IF cardinality(v_lista) = 0 THEN RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'PT422'; END IF;
  EXECUTE format('INSERT INTO public.%1$I AS x (%2$s) SELECT %2$s FROM jsonb_populate_record(NULL::public.%1$I, $1) RETURNING to_jsonb(x.*)',
                 p_tabela, array_to_string(v_lista, ', ')) INTO v_r USING p_dados;
  RETURN v_r;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_excluir(p_token text, p_tabela text, p_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_n int;
BEGIN
  PERFORM 1 FROM public._staff_exigir(p_token, ARRAY['admin']);
  IF p_tabela NOT IN ('professores','alunos','pets','icones_missoes','acessorios') THEN
    RAISE EXCEPTION 'tabela_nao_permitida' USING ERRCODE = 'PT422';
  END IF;
  EXECUTE format('DELETE FROM public.%I WHERE id = $1', p_tabela) USING p_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404'; END IF;
END;
$$;

-- Troca de senha por administrador. Gatilhos geram o hash e derrubam as sessões da conta.
CREATE OR REPLACE FUNCTION public.admin_definir_senha(p_token text, p_tabela text, p_id bigint, p_senha text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_n int;
BEGIN
  PERFORM 1 FROM public._staff_exigir(p_token, ARRAY['admin']);
  IF p_tabela NOT IN ('professores','alunos') THEN RAISE EXCEPTION 'tabela_nao_permitida' USING ERRCODE = 'PT422'; END IF;
  IF NOT public._senha_forte(p_senha, true) THEN RAISE EXCEPTION 'senha_fraca' USING ERRCODE = 'PT422'; END IF;
  EXECUTE format('UPDATE public.%I SET senha = $1 WHERE id = $2', p_tabela) USING p_senha, p_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'PT404'; END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 8b) Leituras próprias e troca da PRÓPRIA senha (permitem o fechamento de SELECT em alunos/professores)
-- -----------------------------------------------------------------------------
-- O aluno lê o PRÓPRIO perfil (id vem do token). Sem senha/hash.
CREATE OR REPLACE FUNCTION public.obter_meu_perfil(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_aluno bigint := public._aluno_da_sessao(p_token); v_r jsonb;
BEGIN
  SELECT to_jsonb(a) - 'senha' - 'senha_hash' INTO v_r FROM public.alunos a WHERE a.id = v_aluno;
  RETURN v_r;
END;
$$;

-- Lista (id, nome, e-mail) para a coordenação escolher o professor responsável ao criar turma.
CREATE OR REPLACE FUNCTION public.staff_listar_professores(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_r jsonb;
BEGIN
  PERFORM 1 FROM public._staff_exigir(p_token, ARRAY['coordenador','admin']);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'email', p.email) ORDER BY p.nome), '[]'::jsonb)
    INTO v_r FROM public.professores p WHERE COALESCE(p.tipo, 'professor') = 'professor';
  RETURN v_r;
END;
$$;

-- Troca da PRÓPRIA senha (professor, coordenador ou admin): exige a senha atual; derruba TODAS as sessões da conta
-- (o app volta ao login). A conta vem do token — nunca de parâmetro.
CREATE OR REPLACE FUNCTION public.staff_alterar_minha_senha(p_token text, p_senha_atual text, p_senha_nova text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_papel text; v_id bigint; v_hash text; v_chave text;
BEGIN
  SELECT s.papel, s.usuario_id INTO v_papel, v_id FROM public._staff_sessao(p_token) s;
  v_chave := 'senha_staff_falha:' || v_papel || ':' || v_id;
  PERFORM public._limite_verificar(v_chave, 5, interval '15 minutes');
  IF NOT public._senha_forte(p_senha_nova, true) THEN RAISE EXCEPTION 'senha_fraca' USING ERRCODE = 'PT422'; END IF;
  IF v_papel = 'admin' THEN SELECT a.senha_hash INTO v_hash FROM public.administradores a WHERE a.id = v_id;
  ELSIF v_papel = 'coordenador' THEN SELECT c.senha_hash INTO v_hash FROM public.coordenadores c WHERE c.id = v_id;
  ELSE SELECT k.senha_hash INTO v_hash FROM public.professores_credenciais k WHERE k.professor_id = v_id; END IF;
  IF v_hash IS NULL OR v_hash <> extensions.crypt(COALESCE(p_senha_atual, ''), v_hash) THEN
    PERFORM public._limite_registrar(v_chave);      -- falha persistida (retorno normal)
    RETURN jsonb_build_object('erro', 'senha_atual_incorreta');
  END IF;
  IF v_papel = 'admin' THEN
    UPDATE public.administradores SET senha_hash = extensions.crypt(p_senha_nova, extensions.gen_salt('bf', 10)) WHERE id = v_id;
  ELSIF v_papel = 'coordenador' THEN
    UPDATE public.coordenadores SET senha_hash = extensions.crypt(p_senha_nova, extensions.gen_salt('bf', 10)) WHERE id = v_id;
  ELSE
    UPDATE public.professores SET senha = p_senha_nova WHERE id = v_id;   -- gatilho: hash novo
    UPDATE public.professores_credenciais SET senha_hash = extensions.crypt(p_senha_nova, extensions.gen_salt('bf', 10)),
           atualizado_em = now() WHERE professor_id = v_id;               -- garante o hash mesmo se o gatilho falhar
  END IF;
  UPDATE public.staff_sessoes SET revogado_em = now()
   WHERE papel = v_papel AND usuario_id = v_id AND revogado_em IS NULL;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- -----------------------------------------------------------------------------
-- 9) Privilégios: somente as RPCs públicas são executáveis pela chave anon.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._admin_colunas(text,text) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'login_staff(text,text)', 'logout_staff(text)', 'staff_perfil(text)',
    'cadastrar_aluno(text,text,text)', 'email_aluno_existe(text)', 'entrar_na_turma(text,text)',
    'staff_listar_alunos(text)', 'staff_atualizar_aluno(text,bigint,text,text)', 'staff_remover_aluno_da_turma(text,bigint)',
    'staff_definir_status_missao(text,bigint,bigint,text)', 'aluno_definir_status_missao(text,bigint,text)',
    'staff_salvar_missao(text,bigint,bigint,text,text,bigint,text,text,boolean,bigint[])',
    'staff_definir_turmas_missao(text,bigint,bigint,bigint[])',
    'staff_definir_ativa_missao_turma(text,bigint,bigint,bigint,boolean)',
    'staff_remover_missao_da_turma(text,bigint,bigint,bigint)', 'staff_excluir_missao(text,bigint)',
    'staff_atribuir_tarefa_global(text,bigint,bigint)', 'staff_salvar_tarefa_global(text,bigint,text,text,jsonb,bigint,text,boolean)',
    'aluno_avancar_etapa(text,bigint)',
    'staff_criar_turma(text,text,text,bigint,text,bigint)', 'staff_excluir_turma(text,bigint)',
    'admin_listar(text,text)', 'admin_atualizar(text,text,bigint,jsonb)', 'admin_inserir(text,text,jsonb)',
    'admin_excluir(text,text,bigint)', 'admin_definir_senha(text,text,bigint,text)',
    'obter_meu_perfil(text)', 'staff_listar_professores(text)', 'staff_alterar_minha_senha(text,text,text)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon, authenticated', f);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.sincronizar_credencial_professor() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
