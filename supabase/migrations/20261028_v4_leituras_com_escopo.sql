-- =============================================================================
-- V4 · LEITURAS COM ESCOPO DE SESSÃO  (migration ADITIVA; aplicar DEPOIS de 20261027_v4_identidade_staff_e_rpcs_autorizadas)
--
-- Substitui as leituras diretas do app em turmas, pets, missoes, missoes_turmas, alunos_missoes e conquistas por RPCs que
-- derivam identidade e escopo do TOKEN (nunca de ids enviados pelo cliente) e devolvem só o que aquele papel pode ver:
--   professor     -> as próprias turmas, as tarefas dessas turmas/suas, o progresso dos alunos dessas turmas;
--   coordenador/admin -> tudo;   aluno -> a própria turma/PET, as tarefas ativas da própria turma e o próprio progresso.
-- NÃO é um proxy: cada função filtra no servidor. Esta migration não revoga nada: quem fecha as leituras diretas é o
-- fechamento manual (V4_FECHAMENTO_permissoes.sql), depois que o app novo estiver publicado.
-- Continuam públicas (justificativa no README/matriz): acessorios e icones_missoes (catálogos sem dado de aluno).
-- Idempotente (CREATE OR REPLACE). SECURITY DEFINER com search_path vazio.
-- =============================================================================

-- Turmas do staff (com o PET de cada uma). O código da turma só sai para quem é dono dela ou coordenação/admin.
CREATE OR REPLACE FUNCTION public.staff_listar_turmas(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_papel text; v_id bigint; v_r jsonb;
BEGIN
  SELECT s.papel, s.usuario_id INTO v_papel, v_id FROM public._staff_exigir(p_token, ARRAY['professor','coordenador','admin']) s;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', t.id, 'nome', t.nome, 'codigo', t.codigo, 'professor_id', t.professor_id, 'cor', t.cor,
           'pet', (SELECT jsonb_build_object('id', p.id, 'nome', p.nome, 'icone', p.icone, 'estagio', p.estagio, 'xp', p.xp,
                                             'emocao', p.emocao, 'cosmetico', p.cosmetico, 'turma_id', p.turma_id)
                     FROM public.pets p WHERE p.turma_id = t.id ORDER BY p.id LIMIT 1)
         ) ORDER BY t.id), '[]'::jsonb)
    INTO v_r FROM public.turmas t
   WHERE v_papel IN ('coordenador','admin') OR t.professor_id = v_id;
  RETURN v_r;
END; $$;

-- PETs para escolher ao criar turma: coordenação/admin veem todos; professor vê os livres e os das próprias turmas.
CREATE OR REPLACE FUNCTION public.staff_listar_pets(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_papel text; v_id bigint; v_r jsonb;
BEGIN
  SELECT s.papel, s.usuario_id INTO v_papel, v_id FROM public._staff_exigir(p_token, ARRAY['professor','coordenador','admin']) s;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id, 'nome', p.nome, 'icone', p.icone, 'estagio', p.estagio, 'xp', p.xp, 'emocao', p.emocao,
           'cosmetico', p.cosmetico, 'turma_id', p.turma_id, 'turma_nome', t.nome) ORDER BY p.id), '[]'::jsonb)
    INTO v_r FROM public.pets p LEFT JOIN public.turmas t ON t.id = p.turma_id
   WHERE v_papel IN ('coordenador','admin') OR p.turma_id IS NULL OR t.professor_id = v_id;
  RETURN v_r;
END; $$;

-- Tarefas visíveis ao staff + vínculos com turmas (professor: as suas e as ligadas às suas turmas).
CREATE OR REPLACE FUNCTION public.staff_listar_missoes(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_papel text; v_id bigint; v_r jsonb;
BEGIN
  SELECT s.papel, s.usuario_id INTO v_papel, v_id FROM public._staff_exigir(p_token, ARRAY['professor','coordenador','admin']) s;
  SELECT COALESCE(jsonb_agg(to_jsonb(m) || jsonb_build_object('vinculos',
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('turma_id', mt.turma_id, 'ativa', mt.ativa) ORDER BY mt.turma_id), '[]'::jsonb)
              FROM public.missoes_turmas mt WHERE mt.missao_id = m.id)) ORDER BY m.id DESC), '[]'::jsonb)
    INTO v_r FROM public.missoes m
   WHERE v_papel IN ('coordenador','admin')
      OR m."professorId" = v_id
      OR EXISTS (SELECT 1 FROM public.missoes_turmas mt JOIN public.turmas t ON t.id = mt.turma_id
                  WHERE mt.missao_id = m.id AND t.professor_id = v_id);
  RETURN v_r;
END; $$;

-- Progresso por aluno/tarefa: professor só dos alunos das próprias turmas; coordenação/admin de todos.
CREATE OR REPLACE FUNCTION public.staff_listar_status_missoes(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_papel text; v_id bigint; v_r jsonb;
BEGIN
  SELECT s.papel, s.usuario_id INTO v_papel, v_id FROM public._staff_exigir(p_token, ARRAY['professor','coordenador','admin']) s;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('aluno_id', am.aluno_id, 'missao_id', am.missao_id, 'status', am.status,
           'etapa_atual', am.etapa_atual) ORDER BY am.id), '[]'::jsonb)
    INTO v_r FROM public.alunos_missoes am
   WHERE v_papel IN ('coordenador','admin')
      OR EXISTS (SELECT 1 FROM public.alunos a JOIN public.turmas t ON t.id = a."turmaId"
                  WHERE a.id = am.aluno_id AND t.professor_id = v_id);
  RETURN v_r;
END; $$;

-- Aluno: a PRÓPRIA turma e o PET dela (o aluno vem do token; não existe parâmetro de id).
CREATE OR REPLACE FUNCTION public.aluno_minha_turma(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_aluno bigint := public._aluno_da_sessao(p_token); v_r jsonb;
BEGIN
  SELECT jsonb_build_object(
           'turma', jsonb_build_object('id', t.id, 'nome', t.nome, 'codigo', t.codigo, 'professor_id', t.professor_id),
           'pet', (SELECT jsonb_build_object('id', p.id, 'nome', p.nome, 'icone', p.icone, 'estagio', p.estagio, 'xp', p.xp,
                                             'emocao', p.emocao, 'cosmetico', p.cosmetico)
                     FROM public.pets p WHERE p.turma_id = t.id ORDER BY p.id LIMIT 1))
    INTO v_r FROM public.alunos a JOIN public.turmas t ON t.id = a."turmaId" WHERE a.id = v_aluno;
  RETURN v_r;    -- NULL se o aluno ainda não tem turma
END; $$;

-- Aluno: tarefas ATIVAS da própria turma + o PRÓPRIO progresso em cada uma.
CREATE OR REPLACE FUNCTION public.aluno_minhas_missoes(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_aluno bigint := public._aluno_da_sessao(p_token); v_r jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', m.id, 'nome', m.nome, 'descricao', m.descricao, 'xp', m.xp, 'dificuldade', m.dificuldade, 'icone', m.icone,
           'etapas', m.etapas, 'moedas', m.moedas,
           'status', COALESCE(am.status, 'pendente'), 'atualizado_em', am.atualizado_em,
           'xp_aluno', am.xp_aluno, 'etapa_atual', am.etapa_atual) ORDER BY m.id DESC), '[]'::jsonb)
    INTO v_r
    FROM public.alunos a
    JOIN public.missoes_turmas mt ON mt.turma_id = a."turmaId" AND mt.ativa
    JOIN public.missoes m ON m.id = mt.missao_id AND m.ativa
    LEFT JOIN public.alunos_missoes am ON am.aluno_id = a.id AND am.missao_id = m.id
   WHERE a.id = v_aluno;
  RETURN v_r;
END; $$;

-- Aluno: contagens do PRÓPRIO progresso.
CREATE OR REPLACE FUNCTION public.aluno_meu_progresso_geral(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_aluno bigint := public._aluno_da_sessao(p_token);
BEGIN
  RETURN jsonb_build_object(
    'missoesAprovadas', (SELECT count(*) FROM public.alunos_missoes am WHERE am.aluno_id = v_aluno AND am.status = 'aprovado'),
    'conquistas',       (SELECT count(*) FROM public.conquistas c WHERE c."alunoId" = v_aluno));
END; $$;

-- Aluno: as PRÓPRIAS conquistas.
CREATE OR REPLACE FUNCTION public.aluno_minhas_conquistas(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_aluno bigint := public._aluno_da_sessao(p_token);
BEGIN
  RETURN (SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.id DESC), '[]'::jsonb) FROM public.conquistas c WHERE c."alunoId" = v_aluno);
END; $$;

-- Privilégios: executáveis pela chave pública (o token é validado dentro de cada função).
REVOKE ALL ON FUNCTION public.staff_listar_turmas(text), public.staff_listar_pets(text), public.staff_listar_missoes(text),
  public.staff_listar_status_missoes(text), public.aluno_minha_turma(text), public.aluno_minhas_missoes(text),
  public.aluno_meu_progresso_geral(text), public.aluno_minhas_conquistas(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_listar_turmas(text), public.staff_listar_pets(text), public.staff_listar_missoes(text),
  public.staff_listar_status_missoes(text), public.aluno_minha_turma(text), public.aluno_minhas_missoes(text),
  public.aluno_meu_progresso_geral(text), public.aluno_minhas_conquistas(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
