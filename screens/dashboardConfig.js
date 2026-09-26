import { colors } from '../theme';

// Opções e metadados visuais da interface; registros de negócio vêm do Supabase.
export const NAV = [
  { id: 'overview', label: 'Visão Geral', icon: '📊' },
  { id: 'turmas', label: 'Turmas', icon: '👥' },
  { id: 'missoes', label: 'Missões', icon: '🏆' },
  { id: 'relatorio', label: 'Relatórios', icon: '📈' },
  { id: 'conquistas', label: 'Conquistas', icon: '🎖️' },
];

export const CORES = [colors.green, colors.purple, colors.yellow, '#e74c3c', '#3498db', '#e67e22'];
export const MEDALS = ['🥇', '🥈', '🥉', '4️⃣'];
export const RARIDADE_CONFIG = {
  Comum: { color: '#888', bg: '#f0f0f0', emoji: '⚪' },
  Raro: { color: colors.green, bg: colors.greenLight, emoji: '🟢' },
  Épico: { color: colors.purple, bg: colors.purpleLight, emoji: '🟣' },
  Lendário: { color: '#c8960a', bg: colors.yellowLight, emoji: '🌟' },
};
export const CRITERIOS = [
  { id: 'primeira_tarefa', label: 'Completar a 1ª missão' },
  { id: 'total_missoes', label: 'Completar X missões no total' },
  { id: 'acumular_xp', label: 'Acumular X de XP' },
  { id: 'missao_especifica', label: 'Completar uma missão específica' },
  { id: 'categoria', label: 'X missões de uma categoria' },
];
export const MISSION_ICONS = ['🌱', '📖', '🎵', '🏃', '🎨', '🔬', '🏀', '🎭', '🌍', '🤝'];
