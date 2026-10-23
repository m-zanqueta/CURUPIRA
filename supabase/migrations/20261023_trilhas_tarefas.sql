-- Catálogo global de tarefas com etapas e XP por etapa.
-- Execute no SQL Editor do Supabase antes de publicar o aplicativo.

ALTER TABLE public.missoes
  ADD COLUMN IF NOT EXISTS etapas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS moedas integer NOT NULL DEFAULT 0;

-- Tarefas criadas pelo administrador são modelos globais, sem professor dono.
ALTER TABLE public.missoes ALTER COLUMN "professorId" DROP NOT NULL;
ALTER TABLE public.missoes ALTER COLUMN "turmaId" DROP NOT NULL;

-- O XP da tarefa passa a ser a soma do XP das etapas; dificuldade permanece
-- nos dados legados, mas não restringe tarefas com qualquer quantidade de etapas.
ALTER TABLE public.missoes DROP CONSTRAINT IF EXISTS missoes_dificuldade_xp_check;

-- 0 = ainda não iniciou; N = concluiu as N primeiras etapas.
ALTER TABLE public.alunos_missoes
  ADD COLUMN IF NOT EXISTS etapa_atual integer NOT NULL DEFAULT 0;
ALTER TABLE public.alunos_missoes
  DROP CONSTRAINT IF EXISTS alunos_missoes_etapa_atual_check;
ALTER TABLE public.alunos_missoes
  ADD CONSTRAINT alunos_missoes_etapa_atual_check CHECK (etapa_atual >= 0);
CREATE INDEX IF NOT EXISTS alunos_missoes_etapa_idx
  ON public.alunos_missoes (missao_id, etapa_atual);

