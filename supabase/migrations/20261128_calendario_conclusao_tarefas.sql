BEGIN;

-- O calendário usa a data real em que o professor aprovou cada cuidado.
CREATE OR REPLACE FUNCTION public.aluno_minhas_missoes(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_aluno bigint := public._aluno_da_sessao(p_token); v_r jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',m.id,'nome',m.nome,'descricao',m.descricao,'xp',m.xp,
    'dificuldade',m.dificuldade,'icone',m.icone,'imagens_estagio',m.imagens_estagio,
    'etapas',m.etapas,'moedas',m.moedas,
    'status',COALESCE(am.status,'pendente'),'atualizado_em',am.atualizado_em,'xp_aluno',am.xp_aluno,
    'etapa_atual',am.etapa_atual,'etapas_status',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'etapa_ordem',e.etapa_ordem,'status',e.status,'corrigida_em',e.corrigida_em
    ) ORDER BY e.etapa_ordem) FROM public.alunos_missoes_etapas e
      WHERE e.aluno_id=v_aluno AND e.missao_id=m.id),'[]'::jsonb)
  ) ORDER BY m.id DESC),'[]'::jsonb)
  INTO v_r FROM public.alunos a
  JOIN public.missoes_turmas mt ON mt.turma_id=a."turmaId" AND mt.ativa
  JOIN public.missoes m ON m.id=mt.missao_id AND m.ativa
  LEFT JOIN public.alunos_missoes am ON am.aluno_id=a.id AND am.missao_id=m.id
  WHERE a.id=v_aluno;
  RETURN v_r;
END;
$$;

REVOKE ALL ON FUNCTION public.aluno_minhas_missoes(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aluno_minhas_missoes(text) TO anon, authenticated;

COMMIT;
