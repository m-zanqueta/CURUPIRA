-- Claims de papel vêm de app_metadata, definido exclusivamente pela Edge Function.
ALTER TABLE public.alunos ADD COLUMN IF NOT EXISTS moedas bigint NOT NULL DEFAULT 0;
ALTER TABLE public.alunos_missoes ADD COLUMN IF NOT EXISTS moedas_aluno bigint NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.curupira_role()
RETURNS text LANGUAGE sql STABLE
AS $$ SELECT auth.jwt() -> 'app_metadata' ->> 'role' $$;

CREATE OR REPLACE FUNCTION public.curupira_profile_id()
RETURNS bigint LANGUAGE sql STABLE
AS $$ SELECT NULLIF(auth.jwt() -> 'app_metadata' ->> 'profile_id', '')::bigint $$;

CREATE OR REPLACE FUNCTION public.curupira_student_turma_id()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT "turmaId" FROM public.alunos WHERE id = public.curupira_profile_id() AND public.curupira_role() = 'aluno' $$;

CREATE OR REPLACE FUNCTION public.curupira_perfil_atual()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_role text := public.curupira_role(); v_id bigint := public.curupira_profile_id(); v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_role IS NULL THEN RETURN NULL; END IF;
  IF v_role = 'admin' THEN RETURN jsonb_build_object('id', 0, 'nome', 'Administrador', 'email', auth.jwt() ->> 'email', 'tipo', 'admin'); END IF;
  IF v_role = 'professor' THEN
    SELECT (to_jsonb(p) - 'senha') || jsonb_build_object('tipo', 'professor') INTO v_result FROM public.professores p WHERE p.id = v_id;
  ELSIF v_role = 'coordenador' THEN
    SELECT (to_jsonb(c) - 'senha_hash') || jsonb_build_object('tipo', 'coordenador') INTO v_result FROM public.coordenadores c WHERE c.id = v_id;
  ELSIF v_role = 'aluno' THEN
    SELECT to_jsonb(a) - 'senha' INTO v_result FROM public.alunos a WHERE a.id = v_id;
  END IF;
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.email_aluno_ja_existe(p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM public.alunos WHERE lower(email) = lower(trim(p_email))) $$;

REVOKE ALL ON FUNCTION public.curupira_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.curupira_profile_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.curupira_student_turma_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.curupira_perfil_atual() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.curupira_role(), public.curupira_profile_id(), public.curupira_student_turma_id(), public.curupira_perfil_atual() TO authenticated;
REVOKE ALL ON FUNCTION public.email_aluno_ja_existe(text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.email_aluno_ja_existe(text) TO anon;

-- Só sessões Auth podem ler ou alterar tarefas e seus vínculos.
REVOKE ALL ON public.missoes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.missoes TO authenticated;
ALTER TABLE public.missoes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.missoes_turmas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.missoes_turmas TO authenticated;
ALTER TABLE public.missoes_turmas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.alunos_missoes FROM anon;
GRANT SELECT ON public.alunos_missoes TO authenticated;
GRANT INSERT (aluno_id, missao_id, status), UPDATE (status) ON public.alunos_missoes TO authenticated;
ALTER TABLE public.alunos_missoes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('missoes', 'missoes_turmas', 'alunos_missoes')
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename); END LOOP;
END $$;

CREATE POLICY missoes_auth_select ON public.missoes FOR SELECT TO authenticated
USING (
  public.curupira_role() IN ('admin', 'coordenador')
  OR (public.curupira_role() = 'professor' AND (
    "professorId" = public.curupira_profile_id()
    OR EXISTS (SELECT 1 FROM public.missoes_turmas mt JOIN public.turmas t ON t.id = mt.turma_id WHERE mt.missao_id = missoes.id AND t.professor_id = public.curupira_profile_id())
  ))
  OR (public.curupira_role() = 'aluno' AND EXISTS (
    SELECT 1 FROM public.missoes_turmas mt JOIN public.alunos a ON a."turmaId" = mt.turma_id
    WHERE mt.missao_id = missoes.id AND a.id = public.curupira_profile_id() AND mt.ativa = true AND missoes.ativa = true
  ))
);
CREATE POLICY missoes_admin_insert ON public.missoes FOR INSERT TO authenticated WITH CHECK (public.curupira_role() = 'admin');
CREATE POLICY missoes_admin_update ON public.missoes FOR UPDATE TO authenticated USING (public.curupira_role() = 'admin') WITH CHECK (public.curupira_role() = 'admin');
CREATE POLICY missoes_admin_delete ON public.missoes FOR DELETE TO authenticated USING (public.curupira_role() = 'admin');

CREATE POLICY missoes_turmas_select ON public.missoes_turmas FOR SELECT TO authenticated
USING (
  public.curupira_role() IN ('admin', 'coordenador')
  OR (public.curupira_role() = 'professor' AND EXISTS (SELECT 1 FROM public.turmas t WHERE t.id = turma_id AND t.professor_id = public.curupira_profile_id()))
  OR (public.curupira_role() = 'aluno' AND turma_id = public.curupira_student_turma_id() AND ativa = true)
);
CREATE POLICY missoes_turmas_coordinator_insert ON public.missoes_turmas FOR INSERT TO authenticated
WITH CHECK (public.curupira_role() IN ('admin', 'coordenador'));
CREATE POLICY missoes_turmas_coordinator_update ON public.missoes_turmas FOR UPDATE TO authenticated
USING (public.curupira_role() IN ('admin', 'coordenador')) WITH CHECK (public.curupira_role() IN ('admin', 'coordenador'));
CREATE POLICY missoes_turmas_coordinator_delete ON public.missoes_turmas FOR DELETE TO authenticated
USING (public.curupira_role() IN ('admin', 'coordenador'));

CREATE POLICY alunos_missoes_read ON public.alunos_missoes FOR SELECT TO authenticated
USING (
  public.curupira_role() IN ('admin', 'coordenador')
  OR (public.curupira_role() = 'aluno' AND aluno_id = public.curupira_profile_id())
  OR (public.curupira_role() = 'professor' AND EXISTS (SELECT 1 FROM public.turmas t WHERE t.id = turma_id AND t.professor_id = public.curupira_profile_id()))
);
CREATE POLICY alunos_missoes_student_insert ON public.alunos_missoes FOR INSERT TO authenticated
WITH CHECK (public.curupira_role() = 'aluno' AND aluno_id = public.curupira_profile_id() AND status IN ('pendente', 'entregue'));
CREATE POLICY alunos_missoes_status_update ON public.alunos_missoes FOR UPDATE TO authenticated
USING ((public.curupira_role() = 'aluno' AND aluno_id = public.curupira_profile_id()) OR public.curupira_role() IN ('admin', 'coordenador'))
WITH CHECK ((public.curupira_role() = 'aluno' AND aluno_id = public.curupira_profile_id() AND status IN ('pendente', 'entregue')) OR public.curupira_role() IN ('admin', 'coordenador'));
GRANT DELETE ON public.alunos_missoes TO authenticated;
CREATE POLICY alunos_missoes_coordinator_delete ON public.alunos_missoes FOR DELETE TO authenticated
USING (public.curupira_role() IN ('admin', 'coordenador'));

CREATE OR REPLACE FUNCTION public.validar_status_tarefa_autenticado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_etapas jsonb;
BEGIN
  IF public.curupira_role() = 'aluno' AND NEW.status = 'aprovado' THEN
    RAISE EXCEPTION 'Aluno não pode aprovar a própria tarefa.';
  END IF;
  IF NEW.status = 'aprovado' THEN
    SELECT etapas INTO v_etapas FROM public.missoes WHERE id = NEW.missao_id;
    IF jsonb_typeof(v_etapas) = 'array' AND jsonb_array_length(v_etapas) > 0
      AND NEW.etapa_atual < jsonb_array_length(v_etapas) THEN
      RAISE EXCEPTION 'Conclua todas as etapas antes de aprovar a tarefa.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS alunos_missoes_validar_auth ON public.alunos_missoes;
CREATE TRIGGER alunos_missoes_validar_auth BEFORE INSERT OR UPDATE ON public.alunos_missoes
FOR EACH ROW EXECUTE FUNCTION public.validar_status_tarefa_autenticado();

CREATE OR REPLACE FUNCTION public.preparar_moedas_tarefa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'aprovado' THEN
    IF TG_OP = 'UPDATE' AND OLD.status = 'aprovado' THEN NEW.moedas_aluno := OLD.moedas_aluno;
    ELSE SELECT COALESCE(moedas, 0) INTO NEW.moedas_aluno FROM public.missoes WHERE id = NEW.missao_id;
    END IF;
  ELSE NEW.moedas_aluno := 0;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS alunos_missoes_preparar_moedas ON public.alunos_missoes;
CREATE TRIGGER alunos_missoes_preparar_moedas BEFORE INSERT OR UPDATE ON public.alunos_missoes
FOR EACH ROW EXECUTE FUNCTION public.preparar_moedas_tarefa();

CREATE OR REPLACE FUNCTION public.aplicar_moedas_tarefa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_delta bigint; v_aluno_id bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN v_delta := NEW.moedas_aluno; v_aluno_id := NEW.aluno_id;
  ELSIF TG_OP = 'DELETE' THEN v_delta := -OLD.moedas_aluno; v_aluno_id := OLD.aluno_id;
  ELSE v_delta := NEW.moedas_aluno - OLD.moedas_aluno; v_aluno_id := NEW.aluno_id;
  END IF;
  IF v_delta <> 0 THEN UPDATE public.alunos SET moedas = GREATEST(COALESCE(moedas, 0) + v_delta, 0) WHERE id = v_aluno_id; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS alunos_missoes_aplicar_moedas ON public.alunos_missoes;
CREATE TRIGGER alunos_missoes_aplicar_moedas AFTER INSERT OR UPDATE OR DELETE ON public.alunos_missoes
FOR EACH ROW EXECUTE FUNCTION public.aplicar_moedas_tarefa();

-- Restringe os cadastros pessoais. O login legado só é verificado pela Edge
-- Function; a coluna de senha não fica mais disponível para clientes anônimos.
REVOKE ALL ON public.professores, public.alunos, public.turmas, public.pets, public.icones_missoes, public.acessorios FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professores, public.alunos, public.turmas, public.pets, public.icones_missoes, public.acessorios TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
REVOKE INSERT ON public.alunos FROM anon;
GRANT INSERT (nome, email, senha, "turmaId") ON public.alunos TO anon;
REVOKE SELECT ON public.professores, public.alunos FROM anon, authenticated;
GRANT SELECT (id, nome, email) ON public.professores TO authenticated;
GRANT SELECT (id, nome, email, "turmaId", xp, moedas) ON public.alunos TO authenticated;
ALTER TABLE public.professores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alunos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turmas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.icones_missoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acessorios ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('professores', 'alunos', 'turmas', 'pets', 'icones_missoes', 'acessorios')
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename); END LOOP;
END $$;

CREATE POLICY professores_read ON public.professores FOR SELECT TO authenticated
USING (public.curupira_role() IN ('admin', 'coordenador') OR (public.curupira_role() = 'professor' AND id = public.curupira_profile_id()));
CREATE POLICY professores_admin_write ON public.professores FOR ALL TO authenticated
USING (public.curupira_role() = 'admin') WITH CHECK (public.curupira_role() = 'admin');

CREATE POLICY alunos_read ON public.alunos FOR SELECT TO authenticated
USING (
  public.curupira_role() IN ('admin', 'coordenador')
  OR (public.curupira_role() = 'aluno' AND id = public.curupira_profile_id())
  OR (public.curupira_role() = 'professor' AND EXISTS (SELECT 1 FROM public.turmas t WHERE t.id = "turmaId" AND t.professor_id = public.curupira_profile_id()))
);
CREATE POLICY alunos_admin_write ON public.alunos FOR ALL TO authenticated
USING (public.curupira_role() = 'admin') WITH CHECK (public.curupira_role() = 'admin');
CREATE POLICY alunos_coordinator_unlink ON public.alunos FOR UPDATE TO authenticated
USING (public.curupira_role() = 'coordenador') WITH CHECK (public.curupira_role() = 'coordenador');
CREATE POLICY alunos_registration ON public.alunos FOR INSERT TO anon WITH CHECK ("turmaId" IS NULL);

CREATE POLICY turmas_read ON public.turmas FOR SELECT TO authenticated
USING (
  public.curupira_role() IN ('admin', 'coordenador')
  OR (public.curupira_role() = 'professor' AND professor_id = public.curupira_profile_id())
  OR (public.curupira_role() = 'aluno' AND id = public.curupira_student_turma_id())
);
CREATE POLICY turmas_coordinator_write ON public.turmas FOR ALL TO authenticated
USING (public.curupira_role() IN ('admin', 'coordenador')) WITH CHECK (public.curupira_role() IN ('admin', 'coordenador'));

CREATE POLICY pets_read ON public.pets FOR SELECT TO authenticated
USING (
  public.curupira_role() IN ('admin', 'coordenador')
  OR (public.curupira_role() = 'professor' AND EXISTS (SELECT 1 FROM public.turmas t WHERE t.id = turma_id AND t.professor_id = public.curupira_profile_id()))
  OR (public.curupira_role() = 'aluno' AND turma_id = public.curupira_student_turma_id())
);
CREATE POLICY pets_admin_insert ON public.pets FOR INSERT TO authenticated WITH CHECK (public.curupira_role() = 'admin');
CREATE POLICY pets_update ON public.pets FOR UPDATE TO authenticated USING (public.curupira_role() IN ('admin', 'coordenador')) WITH CHECK (public.curupira_role() IN ('admin', 'coordenador'));
CREATE POLICY pets_admin_delete ON public.pets FOR DELETE TO authenticated USING (public.curupira_role() = 'admin');

CREATE POLICY icones_missoes_read ON public.icones_missoes FOR SELECT TO authenticated USING (public.curupira_role() IN ('admin', 'coordenador', 'professor', 'aluno'));
CREATE POLICY icones_missoes_admin_write ON public.icones_missoes FOR ALL TO authenticated USING (public.curupira_role() = 'admin') WITH CHECK (public.curupira_role() = 'admin');
CREATE POLICY acessorios_read ON public.acessorios FOR SELECT TO authenticated USING (public.curupira_role() IN ('admin', 'coordenador', 'professor', 'aluno'));
CREATE POLICY acessorios_admin_write ON public.acessorios FOR ALL TO authenticated USING (public.curupira_role() = 'admin') WITH CHECK (public.curupira_role() = 'admin');

-- Coordenadores só podem alterar o vínculo do aluno, sem editar seus outros dados.
CREATE OR REPLACE FUNCTION public.proteger_alteracoes_perfil()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_NAME = 'alunos' AND public.curupira_role() = 'coordenador' THEN
    IF (to_jsonb(NEW) - 'turmaId') IS DISTINCT FROM (to_jsonb(OLD) - 'turmaId') THEN
      RAISE EXCEPTION 'Coordenadores só podem desvincular alunos da turma.';
    END IF;
  ELSIF TG_TABLE_NAME = 'pets' AND public.curupira_role() = 'coordenador' THEN
    IF (to_jsonb(NEW) - 'turma_id') IS DISTINCT FROM (to_jsonb(OLD) - 'turma_id') OR OLD.turma_id IS NOT NULL THEN
      RAISE EXCEPTION 'Coordenadores só podem vincular PETs ainda sem turma.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS alunos_proteger_coordenador ON public.alunos;
CREATE TRIGGER alunos_proteger_coordenador BEFORE UPDATE ON public.alunos FOR EACH ROW EXECUTE FUNCTION public.proteger_alteracoes_perfil();
DROP TRIGGER IF EXISTS pets_proteger_coordenador ON public.pets;
CREATE TRIGGER pets_proteger_coordenador BEFORE UPDATE ON public.pets FOR EACH ROW EXECUTE FUNCTION public.proteger_alteracoes_perfil();

-- Criação de perfil aluno permanece pública; consultar perfil ou senha não.
DO $$
BEGIN
  IF to_regclass('public.alunos_id_seq') IS NOT NULL THEN EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.alunos_id_seq TO anon, authenticated'; END IF;
END $$;

-- Revoga RPCs antigas que podiam ser chamadas sem papel autenticado; as ações
-- de vínculo agora passam pelas políticas RLS acima.
REVOKE ALL ON FUNCTION public.salvar_missao_com_turmas(bigint, bigint, text, text, bigint, text, text, boolean, bigint[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.definir_turmas_missao(bigint, bigint, bigint[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.definir_ativa_missao_turma(bigint, bigint, bigint, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remover_missao_da_turma(bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;

-- XP por etapa: cada avanço sequencial grava um registro imutável de recompensa.
CREATE TABLE IF NOT EXISTS public.alunos_missoes_etapas (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  aluno_id bigint NOT NULL,
  missao_id bigint NOT NULL,
  etapa_ordem integer NOT NULL CHECK (etapa_ordem > 0),
  turma_id bigint REFERENCES public.turmas(id) ON DELETE SET NULL,
  pet_id bigint REFERENCES public.pets(id) ON DELETE SET NULL,
  xp bigint NOT NULL CHECK (xp >= 0),
  concluida_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alunos_missoes_etapas_unica UNIQUE (aluno_id, missao_id, etapa_ordem),
  CONSTRAINT alunos_missoes_etapas_progresso_fk FOREIGN KEY (aluno_id, missao_id)
    REFERENCES public.alunos_missoes(aluno_id, missao_id) ON DELETE CASCADE
);
ALTER TABLE public.alunos_missoes_etapas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.alunos_missoes_etapas FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.aplicar_xp_etapa_tarefa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_delta bigint; v_aluno_id bigint; v_pet_id bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN v_delta := NEW.xp; v_aluno_id := NEW.aluno_id; v_pet_id := NEW.pet_id;
  ELSE v_delta := -OLD.xp; v_aluno_id := OLD.aluno_id; v_pet_id := OLD.pet_id; END IF;
  IF v_delta <> 0 THEN
    UPDATE public.alunos SET xp = GREATEST(COALESCE(xp, 0) + v_delta, 0) WHERE id = v_aluno_id;
    IF v_pet_id IS NOT NULL THEN UPDATE public.pets SET xp = GREATEST(COALESCE(xp, 0) + v_delta, 0) WHERE id = v_pet_id; END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS alunos_missoes_etapas_aplicar_xp ON public.alunos_missoes_etapas;
CREATE TRIGGER alunos_missoes_etapas_aplicar_xp AFTER INSERT OR DELETE ON public.alunos_missoes_etapas
FOR EACH ROW EXECUTE FUNCTION public.aplicar_xp_etapa_tarefa();

CREATE OR REPLACE FUNCTION public.avancar_etapa_tarefa(p_missao_id bigint)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_aluno_id bigint := public.curupira_profile_id(); v_turma_id bigint; v_pet_id bigint;
  v_status text; v_atual integer; v_etapas jsonb; v_xp bigint; v_proxima integer;
BEGIN
  IF public.curupira_role() <> 'aluno' OR auth.uid() IS NULL OR v_aluno_id IS NULL THEN RAISE EXCEPTION 'Apenas o aluno conectado pode avançar sua tarefa.'; END IF;
  SELECT "turmaId" INTO v_turma_id FROM public.alunos WHERE id = v_aluno_id;
  IF v_turma_id IS NULL THEN RAISE EXCEPTION 'Entre em uma turma antes de iniciar tarefas.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.missoes_turmas WHERE missao_id = p_missao_id AND turma_id = v_turma_id AND ativa = true) THEN RAISE EXCEPTION 'A tarefa não está ativa para sua turma.'; END IF;
  SELECT etapas INTO v_etapas FROM public.missoes WHERE id = p_missao_id AND ativa = true;
  IF v_etapas IS NULL OR jsonb_typeof(v_etapas) <> 'array' THEN RAISE EXCEPTION 'A tarefa não tem etapas disponíveis.'; END IF;
  SELECT id INTO v_pet_id FROM public.pets WHERE turma_id = v_turma_id;
  IF v_pet_id IS NULL THEN RAISE EXCEPTION 'A turma não tem PET vinculado.'; END IF;
  SELECT status, etapa_atual INTO v_status, v_atual FROM public.alunos_missoes WHERE aluno_id = v_aluno_id AND missao_id = p_missao_id;
  IF NOT FOUND THEN
    INSERT INTO public.alunos_missoes (aluno_id, missao_id, status) VALUES (v_aluno_id, p_missao_id, 'pendente');
    v_atual := 0; v_status := 'pendente';
  END IF;
  IF v_status <> 'pendente' THEN RAISE EXCEPTION 'Esta tarefa não aceita novos avanços.'; END IF;
  IF v_atual >= jsonb_array_length(v_etapas) THEN RAISE EXCEPTION 'Todas as etapas já foram concluídas.'; END IF;
  v_proxima := v_atual + 1;
  v_xp := COALESCE((v_etapas -> v_atual ->> 'xp')::bigint, 0);
  UPDATE public.alunos_missoes SET etapa_atual = v_proxima WHERE aluno_id = v_aluno_id AND missao_id = p_missao_id;
  INSERT INTO public.alunos_missoes_etapas (aluno_id, missao_id, etapa_ordem, turma_id, pet_id, xp)
  VALUES (v_aluno_id, p_missao_id, v_proxima, v_turma_id, v_pet_id, v_xp);
  RETURN v_proxima;
END $$;
REVOKE ALL ON FUNCTION public.avancar_etapa_tarefa(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.avancar_etapa_tarefa(bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';
