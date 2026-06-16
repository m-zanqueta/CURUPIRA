// ============================================================
// CURUPIRA — utils/conquistasUtils.js
// Usa colors e fonts de ./theme.js (padrão da feature/dashboard)
// ============================================================

import { colors } from '../theme';
import { RARIDADE, CRITERIOS } from '../data/mockConquistas';

// ── Cor por raridade ─────────────────────────────────────────
export const getCorRaridade = (raridade) => {
  switch (raridade) {
    case RARIDADE.COMUM:    return colors.green;
    case RARIDADE.RARO:     return '#0288D1';
    case RARIDADE.EPICO:    return colors.purple;
    case RARIDADE.LENDARIO: return colors.yellow;
    default:                return colors.muted;
  }
};

export const getFundoRaridade = (raridade) => {
  switch (raridade) {
    case RARIDADE.COMUM:    return colors.greenLight;
    case RARIDADE.RARO:     return '#E1F5FE';
    case RARIDADE.EPICO:    return colors.purpleLight;
    case RARIDADE.LENDARIO: return colors.yellowLight;
    default:                return '#F5F5F5';
  }
};

export const getEstrelasRaridade = (raridade) => {
  switch (raridade) {
    case RARIDADE.COMUM:    return '★☆☆☆';
    case RARIDADE.RARO:     return '★★☆☆';
    case RARIDADE.EPICO:    return '★★★☆';
    case RARIDADE.LENDARIO: return '★★★★';
    default:                return '☆☆☆☆';
  }
};

// ── Progresso ────────────────────────────────────────────────
export const calcularPorcentagem = (progresso, meta) => {
  if (!meta || meta <= 0) return 0;
  return Math.min(Math.round((progresso / meta) * 100), 100);
};

export const getTextoProgresso = (conquista) => {
  if (conquista.desbloqueada) return 'Conquista desbloqueada! 🎉';
  switch (conquista.criterio) {
    case CRITERIOS.TAREFAS_CONCLUIDAS:
      return `${conquista.progresso} de ${conquista.meta} tarefas concluídas`;
    case CRITERIOS.XP_ACUMULADO:
      return `${conquista.progresso} de ${conquista.meta} XP acumulados`;
    case CRITERIOS.STREAK_DIAS:
      return `${conquista.progresso} de ${conquista.meta} dias consecutivos`;
    case CRITERIOS.CATEGORIA_TAREFAS:
      return `${conquista.progresso} de ${conquista.meta} missões completadas`;
    case CRITERIOS.PRIMEIRA_TAREFA:
      return conquista.progresso >= 1 ? 'Concluída!' : 'Complete sua primeira tarefa';
    case CRITERIOS.MISSAO_ESPECIFICA:
      return `${conquista.progresso} de ${conquista.meta} missão(ões) completada(s)`;
    default:
      return `${conquista.progresso} / ${conquista.meta}`;
  }
};

// ── Verificar desbloqueio ────────────────────────────────────
export const deveDesbloquear = (conquista, estadoUsuario) => {
  if (conquista.desbloqueada) return true;
  const {
    tarefasConcluidas = 0, xpTotal = 0, streakDias = 0,
    tarefasPorCategoria = {}, missoesConcluidas = [],
  } = estadoUsuario;

  switch (conquista.criterio) {
    case CRITERIOS.PRIMEIRA_TAREFA:    return tarefasConcluidas >= 1;
    case CRITERIOS.TAREFAS_CONCLUIDAS: return tarefasConcluidas >= conquista.meta;
    case CRITERIOS.XP_ACUMULADO:       return xpTotal >= conquista.meta;
    case CRITERIOS.STREAK_DIAS:        return streakDias >= conquista.meta;
    case CRITERIOS.CATEGORIA_TAREFAS:
      return (tarefasPorCategoria[conquista.categoriaTarefa] || 0) >= conquista.meta;
    case CRITERIOS.MISSAO_ESPECIFICA:
      if (conquista.missaoId) return missoesConcluidas.includes(conquista.missaoId);
      return false;
    default: return false;
  }
};

export const getProgressoAtual = (conquista, estadoUsuario) => {
  const {
    tarefasConcluidas = 0, xpTotal = 0, streakDias = 0,
    tarefasPorCategoria = {}, missoesConcluidas = [],
  } = estadoUsuario;
  switch (conquista.criterio) {
    case CRITERIOS.PRIMEIRA_TAREFA:    return Math.min(tarefasConcluidas, 1);
    case CRITERIOS.TAREFAS_CONCLUIDAS: return tarefasConcluidas;
    case CRITERIOS.XP_ACUMULADO:       return xpTotal;
    case CRITERIOS.STREAK_DIAS:        return streakDias;
    case CRITERIOS.CATEGORIA_TAREFAS:
      return tarefasPorCategoria[conquista.categoriaTarefa] || 0;
    case CRITERIOS.MISSAO_ESPECIFICA:
      if (conquista.missaoId) return missoesConcluidas.includes(conquista.missaoId) ? 1 : 0;
      return 0;
    default: return 0;
  }
};

// ── Ordenação ─────────────────────────────────────────────────
const ORDEM = { [RARIDADE.LENDARIO]: 4, [RARIDADE.EPICO]: 3, [RARIDADE.RARO]: 2, [RARIDADE.COMUM]: 1 };

export const ordenarConquistas = (lista, ordem = 'padrao') => {
  const c = [...lista];
  if (ordem === 'raridade') return c.sort((a, b) => ORDEM[b.raridade] - ORDEM[a.raridade]);
  if (ordem === 'xp')       return c.sort((a, b) => b.xp - a.xp);
  if (ordem === 'progresso')
    return c.sort((a, b) =>
      calcularPorcentagem(b.progresso, b.meta) - calcularPorcentagem(a.progresso, a.meta)
    );
  // padrão: desbloqueadas primeiro
  return c.sort((a, b) => {
    if (a.desbloqueada !== b.desbloqueada) return a.desbloqueada ? -1 : 1;
    return ORDEM[b.raridade] - ORDEM[a.raridade];
  });
};

// ── Estatísticas ─────────────────────────────────────────────
export const calcularEstatisticas = (conquistas) => {
  const total         = conquistas.length;
  const desbloqueadas = conquistas.filter((c) => c.desbloqueada).length;
  const xpTotal       = conquistas.filter((c) => c.desbloqueada).reduce((s, c) => s + c.xp, 0);
  const percentual    = total > 0 ? Math.round((desbloqueadas / total) * 100) : 0;
  const porRaridade   = {};
  Object.values(RARIDADE).forEach((r) => {
    porRaridade[r] = {
      total:         conquistas.filter((c) => c.raridade === r).length,
      desbloqueadas: conquistas.filter((c) => c.raridade === r && c.desbloqueada).length,
    };
  });
  return { total, desbloqueadas, bloqueadas: total - desbloqueadas, percentual, xpTotal, porRaridade };
};

// ── Formatar data ─────────────────────────────────────────────
export const formatarData = (dataStr) => {
  if (!dataStr) return null;
  const d = new Date(dataStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
};
