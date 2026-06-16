// ============================================================
// CURUPIRA — services/conquistasService.js
// Persistência AsyncStorage do módulo de conquistas.
// Padrão idêntico ao usado na feature/dashboard.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { mockConquistas } from '../data/mockConquistas';
import { deveDesbloquear, getProgressoAtual, calcularEstatisticas } from '../utils/conquistasUtils';

const CHAVES = {
  CONQUISTAS:        '@curupira:conquistas',
  CONQUISTAS_CUSTOM: '@curupira:conquistas_professor',
  PROGRESSO:         '@curupira:progresso_usuario',
};

const PROGRESSO_PADRAO = {
  tarefasConcluidas:   0,
  xpTotal:             0,
  streakDias:          0,
  tarefasPorCategoria: {},
  missoesConcluidas:   [],
};

// ── Leitura ───────────────────────────────────────────────────
export const carregarConquistas = async () => {
  try {
    const salvas = await AsyncStorage.getItem(CHAVES.CONQUISTAS);
    if (salvas) return JSON.parse(salvas);
    await AsyncStorage.setItem(CHAVES.CONQUISTAS, JSON.stringify(mockConquistas));
    return mockConquistas;
  } catch (e) {
    console.warn('[conquistasService]', e.message);
    return mockConquistas;
  }
};

export const carregarConquistasCustom = async () => {
  try {
    const salvas = await AsyncStorage.getItem(CHAVES.CONQUISTAS_CUSTOM);
    return salvas ? JSON.parse(salvas) : [];
  } catch {
    return [];
  }
};

export const carregarTodasConquistas = async () => {
  const [base, custom] = await Promise.all([carregarConquistas(), carregarConquistasCustom()]);
  return [...base, ...custom];
};

// ── Conquistas do professor ───────────────────────────────────
export const salvarConquistaProfessor = async (nova) => {
  try {
    const existentes = await carregarConquistasCustom();
    await AsyncStorage.setItem(CHAVES.CONQUISTAS_CUSTOM, JSON.stringify([...existentes, nova]));
    return { sucesso: true, conquista: nova };
  } catch (e) {
    return { sucesso: false, erro: e.message };
  }
};

export const excluirConquistaProfessor = async (id) => {
  try {
    const existentes = await carregarConquistasCustom();
    await AsyncStorage.setItem(
      CHAVES.CONQUISTAS_CUSTOM,
      JSON.stringify(existentes.filter((c) => c.id !== id))
    );
    return { sucesso: true };
  } catch {
    return { sucesso: false };
  }
};

// ── Progresso do aluno ────────────────────────────────────────
export const carregarProgresso = async () => {
  try {
    const salvo = await AsyncStorage.getItem(CHAVES.PROGRESSO);
    return salvo ? { ...PROGRESSO_PADRAO, ...JSON.parse(salvo) } : PROGRESSO_PADRAO;
  } catch {
    return PROGRESSO_PADRAO;
  }
};

export const salvarProgresso = async (progresso) => {
  try {
    await AsyncStorage.setItem(CHAVES.PROGRESSO, JSON.stringify(progresso));
    return { sucesso: true };
  } catch {
    return { sucesso: false };
  }
};

// ── Motor de desbloqueio ──────────────────────────────────────
export const processarDesbloquios = async (estadoUsuario) => {
  try {
    const todas              = await carregarTodasConquistas();
    const novasDesbloqueadas = [];

    const atualizadas = todas.map((c) => {
      if (c.desbloqueada) return c;
      const progressoAtual = getProgressoAtual(c, estadoUsuario);
      const deve           = deveDesbloquear(c, estadoUsuario);
      const atualizada     = { ...c, progresso: progressoAtual };
      if (deve) {
        atualizada.desbloqueada    = true;
        atualizada.dataDesbloqueio = new Date().toISOString().split('T')[0];
        novasDesbloqueadas.push(atualizada);
      }
      return atualizada;
    });

    const base = atualizadas.filter((c) => !c.id.startsWith('custom_'));
    await AsyncStorage.setItem(CHAVES.CONQUISTAS, JSON.stringify(base));
    return { conquistasAtualizadas: atualizadas, novasDesbloqueadas };
  } catch (e) {
    console.warn('[conquistasService] processarDesbloquios:', e.message);
    return { conquistasAtualizadas: [], novasDesbloqueadas: [] };
  }
};

/**
 * Chamado pelas telas de tarefas (Matheus) ao concluir uma tarefa.
 *
 * EXEMPLO DE USO:
 *   import { onTarefaConcluida } from '../services/conquistasService';
 *   const { novasConquistas } = await onTarefaConcluida({ categoria: 'Sustentabilidade', xp: 30 });
 */
export const onTarefaConcluida = async (tarefa) => {
  try {
    const progresso     = await carregarProgresso();
    const novoProgresso = {
      ...progresso,
      tarefasConcluidas: progresso.tarefasConcluidas + 1,
      xpTotal:           progresso.xpTotal + (tarefa.xp || 0),
      tarefasPorCategoria: {
        ...progresso.tarefasPorCategoria,
        [tarefa.categoria]: (progresso.tarefasPorCategoria[tarefa.categoria] || 0) + 1,
      },
      missoesConcluidas: tarefa.missaoId
        ? [...progresso.missoesConcluidas, tarefa.missaoId]
        : progresso.missoesConcluidas,
    };
    await salvarProgresso(novoProgresso);
    const { novasDesbloqueadas } = await processarDesbloquios(novoProgresso);
    return { novasConquistas: novasDesbloqueadas };
  } catch (e) {
    console.warn('[conquistasService] onTarefaConcluida:', e.message);
    return { novasConquistas: [] };
  }
};

export const carregarEstatisticasConquistas = async () => {
  try {
    const todas = await carregarTodasConquistas();
    return calcularEstatisticas(todas);
  } catch {
    return { total: 0, desbloqueadas: 0, bloqueadas: 0, percentual: 0, xpTotal: 0 };
  }
};

export const resetarConquistas = async () => {
  await AsyncStorage.multiRemove(Object.values(CHAVES));
};
