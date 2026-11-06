-- Rollback da migration 20261028 (MANUAL). Remove só as 8 RPCs de leitura. RECUSA se o fechamento V4 já removeu as leituras
-- diretas (o app novo dependeria delas): nesse caso desfazer deixaria o app sem leitura.
BEGIN;
DO $$
BEGIN
  -- Dois IFs separados: o plpgsql só valida a tabela do snapshot quando ela existe.
  IF to_regclass('public.v4_fechamento_snapshot') IS NOT NULL THEN
    IF NOT has_table_privilege('anon', 'public.turmas', 'SELECT') THEN
      RAISE EXCEPTION 'ROLLBACK RECUSADO: o fechamento já removeu a leitura direta de turmas/missões; sem as RPCs de leitura o app novo ficaria sem dados. Desfaça antes o fechamento (V4_FECHAMENTO_ROLLBACK com nível B) e republique o app compatível.';
    END IF;
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.staff_listar_turmas(text), public.staff_listar_pets(text), public.staff_listar_missoes(text),
  public.staff_listar_status_missoes(text), public.aluno_minha_turma(text), public.aluno_minhas_missoes(text),
  public.aluno_meu_progresso_geral(text), public.aluno_minhas_conquistas(text);
NOTIFY pgrst, 'reload schema';
COMMIT;
