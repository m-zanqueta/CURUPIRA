import { useState } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  StyleSheet, Modal, Dimensions, TextInput, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';

const { width } = Dimensions.get('window');

const NAV = [
  { id: 'overview',   label: 'Visão Geral',  icon: '📊' },
  { id: 'turmas',     label: 'Turmas',        icon: '👥' },
  { id: 'missoes',    label: 'Missões',       icon: '🏆' },
  { id: 'relatorio',  label: 'Relatórios',    icon: '📈' },
  { id: 'conquistas', label: 'Conquistas',    icon: '🎖️' },
]

const PETS = ['🐉','🦊','🦅','🐺','🦁','🐯','🦋','🐸','🦉','🐻']
const CORES = [colors.green, colors.purple, colors.yellow, '#e74c3c', '#3498db', '#e67e22']

const INITIAL_TURMAS = [
  { id: 1, nome: '2º A', pet: '🐉', estagio: 'Jovem',   xp: 3570, progresso: 57, emocao: '😄', cor: colors.green,  cosmetico: true  },
  { id: 2, nome: '2º B', pet: '🦊', estagio: 'Jovem',   xp: 2570, progresso: 57, emocao: '😐', cor: colors.purple, cosmetico: false },
  { id: 3, nome: '2º C', pet: '🦅', estagio: 'Adulto',  xp: 3150, progresso: 15, emocao: '🤩', cor: colors.yellow, cosmetico: true  },
  { id: 4, nome: '2º D', pet: '🐺', estagio: 'Filhote', xp: 1670, progresso: 67, emocao: '😴', cor: colors.green,  cosmetico: false },
]

const INITIAL_MISSIONS = [
  { id: 1, name: 'Horta Escolar',         turma: 'Todas as turmas', alunos: 92, xp: 150, color: colors.greenLight,  textColor: '#006516', icon: '🌱', active: true,  progress: 68, descricao: 'Cuidar da horta escolar' },
  { id: 2, name: 'Clube de Leitura',      turma: '2º B',            alunos: 18, xp: 100, color: colors.yellowLight, textColor: '#7a5f00', icon: '📖', active: false, progress: 0,  descricao: 'Ler e apresentar um livro' },
  { id: 3, name: 'Coral da Escola',       turma: '2º C',            alunos: 24, xp: 200, color: colors.purpleLight, textColor: colors.purple, icon: '🎵', active: false, progress: 0, descricao: 'Participar do coral' },
  { id: 4, name: 'Atletismo Comunitário', turma: '2º D',            alunos: 15, xp: 120, color: '#fde8e8',          textColor: '#c0392b', icon: '🏃', active: false, progress: 0, descricao: 'Corrida comunitária' },
]

const RANKING = [
  { name: 'Maria Fernanda', turma: '2º A', xp: 980, pct: 100, initials: 'MF', color: colors.green  },
  { name: 'João Pedro',     turma: '2º B', xp: 830, pct: 85,  initials: 'JP', color: colors.purple },
  { name: 'Letícia S.',     turma: '2º C', xp: 710, pct: 72,  initials: 'LS', color: colors.yellow },
  { name: 'Carlos R.',      turma: '2º D', xp: 570, pct: 58,  initials: 'CR', color: '#888'        },
]

const BADGES = [
  { label: 'Guardião da Natureza', color: colors.greenLight,  text: '#006516', icon: '🌿' },
  { label: 'Estrela em Ascensão',  color: colors.yellowLight, text: '#7a5f00', icon: '⭐' },
  { label: 'Artista do Coral',     color: colors.purpleLight, text: colors.purple, icon: '🎵' },
  { label: 'Atleta Comunitário',   color: colors.greenLight,  text: '#006516', icon: '🏃' },
  { label: 'Leitor Voraz',         color: colors.yellowLight, text: '#7a5f00', icon: '📚' },
  { label: 'Primeira Missão',      color: colors.purpleLight, text: colors.purple, icon: '🎖️' },
]

const MEDALS = ['🥇', '🥈', '🥉', '4️⃣']

const RARIDADE_CONFIG = {
  'Comum':    { color: '#888',         bg: '#f0f0f0',         emoji: '⚪' },
  'Raro':     { color: colors.green,   bg: colors.greenLight, emoji: '🟢' },
  'Épico':    { color: colors.purple,  bg: colors.purpleLight,emoji: '🟣' },
  'Lendário': { color: '#c8960a',      bg: colors.yellowLight,emoji: '🌟' },
}

const CRITERIOS = [
  { id: 'primeira_tarefa', label: 'Completar a 1ª missão' },
  { id: 'total_missoes',   label: 'Completar X missões no total' },
  { id: 'acumular_xp',     label: 'Acumular X de XP' },
  { id: 'missao_especifica', label: 'Completar uma missão específica' },
  { id: 'categoria',       label: 'X missões de uma categoria' },
]

const INITIAL_CONQUISTAS = [
  { id: 1, nome: 'Primeira Missão',    emoji: '🎯', raridade: 'Comum',    xp: 50,  criterio: 'primeira_tarefa',  meta: 1,   descricao: 'Complete sua primeira missão extracurricular', desbloqueada: false },
  { id: 2, nome: 'Guardião da Natureza', emoji: '🌿', raridade: 'Raro',  xp: 100, criterio: 'missao_especifica', meta: 1,   descricao: 'Participe da missão Horta Escolar', missaoAlvo: 'Horta Escolar', desbloqueada: false },
  { id: 3, nome: 'Estrela em Ascensão', emoji: '⭐', raridade: 'Raro',   xp: 150, criterio: 'acumular_xp',      meta: 500, descricao: 'Acumule 500 XP', desbloqueada: false },
  { id: 4, nome: 'Artista do Coral',   emoji: '🎵', raridade: 'Épico',   xp: 200, criterio: 'missao_especifica', meta: 1,   descricao: 'Participe do Coral da Escola', missaoAlvo: 'Coral da Escola', desbloqueada: false },
  { id: 5, nome: 'Maratonista',        emoji: '🏃', raridade: 'Épico',   xp: 250, criterio: 'total_missoes',    meta: 3,   descricao: 'Complete 3 missões no total', desbloqueada: false },
  { id: 6, nome: 'Lenda Curupira',     emoji: '🌳', raridade: 'Lendário', xp: 500, criterio: 'acumular_xp',    meta: 1000, descricao: 'Acumule 1000 XP', desbloqueada: false },
]

const STATS_ICONS = [
  { label: 'Alunos ativos',        icon: '👥', bg: colors.greenLight  },
  { label: 'Missões abertas',      icon: '🏆', bg: colors.yellowLight },
  { label: 'Conquistas entregues', icon: '🎖️', bg: colors.purpleLight },
  { label: 'XP distribuído',       icon: '⭐', bg: '#f0f0f0'          },
]

const MISSION_ICONS = ['🌱','📖','🎵','🏃','🎨','🔬','🏀','🎭','🌍','🤝']

const INITIAL_ALUNOS = [
  // 2º A
  { id: 1,  nome: 'Maria Fernanda',  turmaId: 1, xp: 980, initials: 'MF', cor: colors.green  },
  { id: 2,  nome: 'Carlos R.',       turmaId: 1, xp: 570, initials: 'CR', cor: colors.green  },
  { id: 3,  nome: 'Ana Beatriz',     turmaId: 1, xp: 450, initials: 'AB', cor: colors.green  },
  { id: 4,  nome: 'Lucas M.',        turmaId: 1, xp: 390, initials: 'LM', cor: colors.green  },
  { id: 5,  nome: 'Sofia A.',        turmaId: 1, xp: 340, initials: 'SA', cor: colors.green  },
  { id: 6,  nome: 'Gabriel T.',      turmaId: 1, xp: 310, initials: 'GT', cor: colors.green  },
  { id: 7,  nome: 'Isabela C.',      turmaId: 1, xp: 290, initials: 'IC', cor: colors.green  },
  { id: 8,  nome: 'Matheus L.',      turmaId: 1, xp: 270, initials: 'ML', cor: colors.green  },
  { id: 9,  nome: 'Valentina S.',    turmaId: 1, xp: 250, initials: 'VS', cor: colors.green  },
  { id: 10, nome: 'Felipe O.',       turmaId: 1, xp: 220, initials: 'FO', cor: colors.green  },
  { id: 11, nome: 'Laura P.',        turmaId: 1, xp: 200, initials: 'LP', cor: colors.green  },
  { id: 12, nome: 'Davi N.',         turmaId: 1, xp: 180, initials: 'DN', cor: colors.green  },
  { id: 13, nome: 'Alice F.',        turmaId: 1, xp: 160, initials: 'AF', cor: colors.green  },
  { id: 14, nome: 'Enzo B.',         turmaId: 1, xp: 140, initials: 'EB', cor: colors.green  },
  { id: 15, nome: 'Manuela R.',      turmaId: 1, xp: 120, initials: 'MR', cor: colors.green  },
  // 2º B
  { id: 16, nome: 'João Pedro',      turmaId: 2, xp: 830, initials: 'JP', cor: colors.purple },
  { id: 17, nome: 'Ana Lima',        turmaId: 2, xp: 420, initials: 'AL', cor: colors.purple },
  { id: 18, nome: 'Rodrigo S.',      turmaId: 2, xp: 380, initials: 'RS', cor: colors.purple },
  { id: 19, nome: 'Camila F.',       turmaId: 2, xp: 350, initials: 'CF', cor: colors.purple },
  { id: 20, nome: 'Bruno H.',        turmaId: 2, xp: 310, initials: 'BH', cor: colors.purple },
  { id: 21, nome: 'Fernanda T.',     turmaId: 2, xp: 280, initials: 'FT', cor: colors.purple },
  { id: 22, nome: 'Gustavo M.',      turmaId: 2, xp: 250, initials: 'GM', cor: colors.purple },
  { id: 23, nome: 'Juliana P.',      turmaId: 2, xp: 220, initials: 'JP', cor: colors.purple },
  { id: 24, nome: 'Thiago C.',       turmaId: 2, xp: 190, initials: 'TC', cor: colors.purple },
  { id: 25, nome: 'Mariana L.',      turmaId: 2, xp: 160, initials: 'ML', cor: colors.purple },
  { id: 26, nome: 'Leonardo A.',     turmaId: 2, xp: 130, initials: 'LA', cor: colors.purple },
  { id: 27, nome: 'Patrícia N.',     turmaId: 2, xp: 100, initials: 'PN', cor: colors.purple },
  // 2º C
  { id: 28, nome: 'Letícia S.',      turmaId: 3, xp: 710, initials: 'LS', cor: colors.yellow },
  { id: 29, nome: 'Pedro H.',        turmaId: 3, xp: 390, initials: 'PH', cor: colors.yellow },
  { id: 30, nome: 'Renata V.',       turmaId: 3, xp: 360, initials: 'RV', cor: colors.yellow },
  { id: 31, nome: 'Diego M.',        turmaId: 3, xp: 330, initials: 'DM', cor: colors.yellow },
  { id: 32, nome: 'Natália C.',      turmaId: 3, xp: 300, initials: 'NC', cor: colors.yellow },
  { id: 33, nome: 'Vitor R.',        turmaId: 3, xp: 270, initials: 'VR', cor: colors.yellow },
  { id: 34, nome: 'Bianca A.',       turmaId: 3, xp: 240, initials: 'BA', cor: colors.yellow },
  { id: 35, nome: 'Henrique T.',     turmaId: 3, xp: 210, initials: 'HT', cor: colors.yellow },
  { id: 36, nome: 'Larissa O.',      turmaId: 3, xp: 180, initials: 'LO', cor: colors.yellow },
  { id: 37, nome: 'Caio B.',         turmaId: 3, xp: 150, initials: 'CB', cor: colors.yellow },
  { id: 38, nome: 'Aline F.',        turmaId: 3, xp: 120, initials: 'AF', cor: colors.yellow },
  { id: 39, nome: 'Marcos P.',       turmaId: 3, xp: 90,  initials: 'MP', cor: colors.yellow },
  // 2º D
  { id: 40, nome: 'Bruna T.',        turmaId: 4, xp: 310, initials: 'BT', cor: '#888' },
  { id: 41, nome: 'Rafael M.',       turmaId: 4, xp: 200, initials: 'RM', cor: '#888' },
  { id: 42, nome: 'Sabrina L.',      turmaId: 4, xp: 280, initials: 'SL', cor: '#888' },
  { id: 43, nome: 'Alexandre C.',    turmaId: 4, xp: 250, initials: 'AC', cor: '#888' },
  { id: 44, nome: 'Priscila N.',     turmaId: 4, xp: 220, initials: 'PN', cor: '#888' },
  { id: 45, nome: 'Danilo R.',       turmaId: 4, xp: 190, initials: 'DR', cor: '#888' },
  { id: 46, nome: 'Cristina F.',     turmaId: 4, xp: 160, initials: 'CF', cor: '#888' },
  { id: 47, nome: 'Eduardo S.',      turmaId: 4, xp: 130, initials: 'ES', cor: '#888' },
  { id: 48, nome: 'Mônica A.',       turmaId: 4, xp: 100, initials: 'MA', cor: '#888' },
  { id: 49, nome: 'Fábio T.',        turmaId: 4, xp: 80,  initials: 'FT', cor: '#888' },
]

export default function DashboardScreen({ professor, onLogout }) {
  const [activeNav, setActiveNav]     = useState('overview')
  const [menuOpen, setMenuOpen]       = useState(false)
  const [turmas, setTurmas]           = useState(INITIAL_TURMAS)
  const [missions, setMissions]       = useState(INITIAL_MISSIONS)
  const [alunos, setAlunos]           = useState(INITIAL_ALUNOS)
  const [conquistas, setConquistas]   = useState(INITIAL_CONQUISTAS)

  // Modal de criar turma
  const [modalTurma, setModalTurma]   = useState(false)
  const [novaTurma, setNovaTurma]     = useState({ nome: '', pet: '🐉', cor: colors.green, alunosNomes: '' })

  // Modal de criar missão
  const [modalMissao, setModalMissao] = useState(false)
  const [novaMissao, setNovaMissao]   = useState({ name: '', descricao: '', turma: 'Todas as turmas', xp: '', icon: '🌱', alunos: '' })

  // Modal de atribuir missão à turma
  const [modalAtribuir, setModalAtribuir] = useState(false)
  const [turmaAtribuir, setTurmaAtribuir] = useState(null)

  // Modal de alunos da turma
  const [modalAlunosTurma, setModalAlunosTurma] = useState(false)
  const [novoAlunoNome, setNovoAlunoNome]       = useState('')

  // Modal de alunos da missão
  const [modalAlunos, setModalAlunos]   = useState(false)
  const [missaoAlunos, setMissaoAlunos] = useState(null)

  // Modal de dar XP
  const [modalXP, setModalXP]     = useState(false)
  const [alunoXP, setAlunoXP]     = useState(null)
  const [xpValor, setXpValor]     = useState('')

  // Modal de editar aluno
  const [modalEditAluno, setModalEditAluno] = useState(false)
  const [alunoEditando, setAlunoEditando]   = useState(null)
  const [alunoNomeEdit, setAlunoNomeEdit]   = useState('')
  const [alunoTurmaEdit, setAlunoTurmaEdit] = useState(null)

  // Status de missão por aluno { missaoId_alunoId: 'pendente' | 'entregue' | 'aprovado' }
  const [statusMissao, setStatusMissao] = useState({})

  // Histórico de XP { alunoId: [{xp, missao, data}] }
  const [historicoXP, setHistoricoXP] = useState({})

  // Modal histórico de XP
  const [modalHistorico, setModalHistorico] = useState(false)
  const [alunoHistorico, setAlunoHistorico] = useState(null)

  // Conquistas
  const [modalConquista, setModalConquista] = useState(false)
  const [filtroRaridade, setFiltroRaridade] = useState('Todos')
  const [filtroStatus, setFiltroStatus]     = useState('Todos')
  const [novaConquista, setNovaConquista]   = useState({ nome: '', emoji: '🏆', raridade: 'Comum', xp: '', criterio: 'primeira_tarefa', meta: '', descricao: '', missaoAlvo: '' })
  const [modalDetConquista, setModalDetConquista] = useState(false)
  const [conquistaSelecionada, setConquistaSelecionada] = useState(null)

  // Busca de aluno
  const [buscaAluno, setBuscaAluno] = useState('')

  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })

  // Stats dinâmicos em tempo real
  const totalXP = alunos.reduce((acc, a) => acc + a.xp, 0)
  const xpFormatado = totalXP >= 1000 ? (totalXP / 1000).toFixed(1) + 'k' : String(totalXP)
  const totalConquistas = missions.filter(m => !m.active).length * 12 // missões concluídas geram conquistas

  const stats = [
    { label: 'Alunos ativos',        value: String(alunos.length),                          icon: '👥', bg: colors.greenLight  },
    { label: 'Missões abertas',      value: String(missions.filter(m => m.active).length),  icon: '🏆', bg: colors.yellowLight },
    { label: 'Conquistas entregues', value: String(totalConquistas),                         icon: '🎖️', bg: colors.purpleLight },
    { label: 'XP distribuído',       value: xpFormatado,                                    icon: '⭐', bg: '#f0f0f0'          },
  ]

  function atribuirMissao(missaoId) {
    const turmaName = turmaAtribuir.nome
    setMissions(prev => prev.map(m => {
      if (m.id !== missaoId) return m
      const turmasAtuais = m.turma === 'Todas as turmas' ? [] : m.turma.split(', ')
      if (turmasAtuais.includes(turmaName)) return m // já atribuída
      const novasTurmas = [...turmasAtuais, turmaName]
      return { ...m, turma: novasTurmas.join(', ') }
    }))
  }

  function desatribuirMissao(missaoId) {
    const turmaName = turmaAtribuir.nome
    setMissions(prev => prev.map(m => {
      if (m.id !== missaoId) return m
      const turmasAtuais = m.turma === 'Todas as turmas' ? [] : m.turma.split(', ')
      const novasTurmas = turmasAtuais.filter(t => t !== turmaName)
      return { ...m, turma: novasTurmas.length === 0 ? 'Nenhuma turma' : novasTurmas.join(', ') }
    }))
  }

  function missoesDaTurma(turmaName) {
    return missions.filter(m => m.turma === 'Todas as turmas' || m.turma.split(', ').includes(turmaName))
  }

  function turmaTemMissao(turma, missaoId) {
    const m = missions.find(m => m.id === missaoId)
    if (!m) return false
    return m.turma === 'Todas as turmas' || m.turma.split(', ').includes(turma.nome)
  }

  function adicionarTurma() {
    if (!novaTurma.nome.trim()) { Alert.alert('Atenção', 'Digite o nome da turma!'); return; }
    const novaId = Date.now()
    const nova = { id: novaId, nome: novaTurma.nome, pet: novaTurma.pet, estagio: 'Filhote', xp: 0, progresso: 0, emocao: '😊', cor: novaTurma.cor, cosmetico: false }
    setTurmas(prev => [...prev, nova])

    // Adiciona alunos se foram informados
    if (novaTurma.alunosNomes.trim()) {
      const nomes = novaTurma.alunosNomes.split('\n').map(n => n.trim()).filter(n => n.length > 0)
      const novosAlunos = nomes.map((nome, i) => ({
        id: novaId + i + 1,
        nome,
        turmaId: novaId,
        xp: 0,
        initials: nome.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2),
        cor: novaTurma.cor,
      }))
      setAlunos(prev => [...prev, ...novosAlunos])
    }

    setNovaTurma({ nome: '', pet: '🐉', cor: colors.green, alunosNomes: '' })
    setModalTurma(false)
    Alert.alert('✅ Turma criada!', `A turma "${nova.nome}" foi adicionada com sucesso.`)
  }

  function removerTurma(id) {
    if (Platform.OS === 'web') {
      if (window.confirm('Tem certeza que deseja remover esta turma?')) {
        setTurmas(prev => prev.filter(t => t.id !== id))
      }
    } else {
      Alert.alert('Remover turma', 'Tem certeza?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: () => setTurmas(prev => prev.filter(t => t.id !== id)) }
      ])
    }
  }

  function adicionarMissao() {
    if (!novaMissao.name.trim()) { Alert.alert('Atenção', 'Digite o nome da missão!'); return; }
    if (!novaMissao.xp || isNaN(novaMissao.xp)) { Alert.alert('Atenção', 'Digite um valor de XP válido!'); return; }
    const nova = {
      id: Date.now(), name: novaMissao.name, descricao: novaMissao.descricao,
      turma: novaMissao.turma, alunos: Number(novaMissao.alunos) || 0, xp: Number(novaMissao.xp),
      color: colors.greenLight, textColor: '#006516', icon: novaMissao.icon,
      active: true, progress: 0,
    }
    setMissions([nova, ...missions])
    setNovaMissao({ name: '', descricao: '', turma: 'Todas as turmas', xp: '', icon: '🌱', alunos: '' })
    setModalMissao(false)
    Alert.alert('✅ Missão criada!', `A missão "${nova.name}" foi criada com sucesso.`)
  }

  function removerMissao(id) {
    if (Platform.OS === 'web') {
      if (window.confirm('Tem certeza que deseja remover esta missão?')) {
        setMissions(prev => prev.filter(m => m.id !== id))
      }
    } else {
      Alert.alert('Remover missão', 'Tem certeza?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: () => setMissions(prev => prev.filter(m => m.id !== id)) }
      ])
    }
  }

  function alunosDaMissao(missao) {
    if (!missao) return []
    if (missao.turma === 'Todas as turmas') return alunos
    const turmasNomes = missao.turma.split(', ')
    const turmasIds = turmas.filter(t => turmasNomes.includes(t.nome)).map(t => t.id)
    return alunos.filter(a => turmasIds.includes(a.turmaId))
  }

  function qtdAlunosMissao(missao) {
    return alunosDaMissao(missao).length
  }

  function abrirEditAluno(aluno) {
    setAlunoEditando(aluno)
    setAlunoNomeEdit(aluno.nome)
    setAlunoTurmaEdit(turmas.find(t => t.id === aluno.turmaId) || null)
    setModalEditAluno(true)
  }

  function salvarEditAluno() {
    if (!alunoNomeEdit.trim()) { Alert.alert('Atenção', 'Digite o nome do aluno!'); return }
    const turmaDestino = alunoTurmaEdit
    const initials = alunoNomeEdit.trim().split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
    setAlunos(prev => prev.map(a => a.id === alunoEditando.id ? {
      ...a,
      nome: alunoNomeEdit.trim(),
      initials,
      turmaId: turmaDestino?.id || a.turmaId,
      cor: turmaDestino?.cor || a.cor,
    } : a))
    setModalEditAluno(false)
    setAlunoEditando(null)
  }

  function getStatusAluno(missaoId, alunoId) {
    return statusMissao[`${missaoId}_${alunoId}`] || 'pendente'
  }

  function setStatusAluno(missaoId, alunoId, status) {
    setStatusMissao(prev => ({ ...prev, [`${missaoId}_${alunoId}`]: status }))
  }

  function ciclarStatus(missaoId, alunoId) {
    const atual = getStatusAluno(missaoId, alunoId)
    const proximo = atual === 'pendente' ? 'entregue' : atual === 'entregue' ? 'aprovado' : 'pendente'
    setStatusAluno(missaoId, alunoId, proximo)
  }

  function adicionarAlunoTurma() {
    if (!novoAlunoNome.trim() || !turmaAtribuir) return
    const initials = novoAlunoNome.trim().split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
    const novo = {
      id: Date.now(),
      nome: novoAlunoNome.trim(),
      turmaId: turmaAtribuir.id,
      xp: 0,
      initials,
      cor: turmaAtribuir.cor,
    }
    setAlunos(prev => [...prev, novo])
    setNovoAlunoNome('')
  }

  function removerAluno(alunoId) {
    if (Platform.OS === 'web') {
      if (window.confirm('Remover aluno da turma?')) setAlunos(prev => prev.filter(a => a.id !== alunoId))
    } else {
      Alert.alert('Remover aluno', 'Tem certeza?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: () => setAlunos(prev => prev.filter(a => a.id !== alunoId)) },
      ])
    }
  }

  function removerAlunoMissao(alunoId) {
    if (Platform.OS === 'web') {
      if (window.confirm('Remover aluno da lista?')) setAlunos(prev => prev.filter(a => a.id !== alunoId))
    } else {
      Alert.alert('Remover aluno', 'Tem certeza?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: () => setAlunos(prev => prev.filter(a => a.id !== alunoId)) },
      ])
    }
  }

  function darXP() {
    const val = parseInt(xpValor)
    if (!val || val <= 0) { Alert.alert('Atenção', 'Digite um valor de XP válido!'); return }

    // Limita o XP ao máximo da missão se vier de uma missão
    const limite = missaoAlunos?.xp || Infinity
    const xpJaDado = (historicoXP[alunoXP.id] || [])
      .filter(h => h.missao === (missaoAlunos?.name || ''))
      .reduce((acc, h) => acc + h.xp, 0)
    const restante = missaoAlunos ? Math.max(0, limite - xpJaDado) : Infinity

    if (restante === 0) {
      Alert.alert('⚠️ Limite atingido', `Este aluno já recebeu o máximo de ${limite} XP desta missão.`)
      return
    }

    const xpFinal = Math.min(val, restante)
    if (xpFinal < val && missaoAlunos) {
      Alert.alert('⚠️ XP ajustado', `O aluno pode receber no máximo +${restante} XP desta missão. Atribuindo ${xpFinal} XP.`)
    }

    const dataHora = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    const missaoAtual = missaoAlunos?.name || 'Manual'

    setAlunos(prev => prev.map(a => a.id === alunoXP.id ? { ...a, xp: a.xp + xpFinal } : a))

    setTurmas(prev => prev.map(t => {
      if (t.id !== alunoXP.turmaId) return t
      const novoXP = t.xp + xpFinal
      const estagio = novoXP >= 3000 ? 'Lendário' : novoXP >= 2000 ? 'Adulto' : novoXP >= 1000 ? 'Jovem' : 'Filhote'
      const emocao  = novoXP >= 2000 ? '🤩' : novoXP >= 1000 ? '😄' : novoXP >= 500 ? '😊' : '😐'
      const progresso = Math.min(100, Math.round((novoXP % 1000) / 10))
      return { ...t, xp: novoXP, estagio, emocao, progresso }
    }))

    const novoHistorico = {
      ...historicoXP,
      [alunoXP.id]: [{ xp: xpFinal, missao: missaoAtual, data: dataHora }, ...(historicoXP[alunoXP.id] || [])]
    }
    setHistoricoXP(novoHistorico)

    // Verifica conquistas em tempo real
    const alunoAtualizado = { ...alunoXP, xp: alunoXP.xp + xpFinal }
    const totalMissoesAluno = Object.keys(novoHistorico[alunoXP.id] ? novoHistorico : {})
      .filter(k => parseInt(k) === alunoXP.id).length

    setConquistas(prev => prev.map(c => {
      if (c.desbloqueada) return c
      let desbloqueada = false
      if (c.criterio === 'primeira_tarefa' && (novoHistorico[alunoXP.id] || []).length >= 1) desbloqueada = true
      if (c.criterio === 'acumular_xp' && alunoAtualizado.xp >= c.meta) desbloqueada = true
      if (c.criterio === 'missao_especifica' && c.missaoAlvo === missaoAtual) desbloqueada = true
      return desbloqueada ? { ...c, desbloqueada: true } : c
    }))

    setXpValor('')
    setModalXP(false)
    Alert.alert('✅ XP atribuído!', `+${xpFinal} XP para ${alunoXP.nome}`)
  }

  function adicionarConquista() {
    if (!novaConquista.nome.trim()) { Alert.alert('Atenção', 'Digite o nome da conquista!'); return }
    const precisaMeta = novaConquista.criterio !== 'primeira_tarefa' && novaConquista.criterio !== 'missao_especifica'
    if (precisaMeta && (!novaConquista.meta || isNaN(novaConquista.meta))) {
      Alert.alert('Atenção', 'Digite uma meta válida!'); return
    }
    if (novaConquista.criterio === 'missao_especifica' && !novaConquista.missaoAlvo) {
      Alert.alert('Atenção', 'Selecione a missão alvo!'); return
    }
    const nova = {
      id: Date.now(),
      nome: novaConquista.nome.trim(),
      emoji: novaConquista.emoji,
      raridade: novaConquista.raridade,
      xp: Number(novaConquista.xp) || 0,
      criterio: novaConquista.criterio,
      meta: precisaMeta ? Number(novaConquista.meta) : 1,
      descricao: novaConquista.descricao.trim(),
      missaoAlvo: novaConquista.missaoAlvo.trim(),
      desbloqueada: false,
    }
    setConquistas(prev => [nova, ...prev])
    setNovaConquista({ nome: '', emoji: '🏆', raridade: 'Comum', xp: '', criterio: 'primeira_tarefa', meta: '', descricao: '', missaoAlvo: '' })
    setModalConquista(false)
    Alert.alert('✅ Conquista criada!', `"${nova.nome}" foi adicionada.`)
  }

  function removerConquista(id) {
    if (Platform.OS === 'web') {
      if (window.confirm('Remover conquista?')) setConquistas(prev => prev.filter(c => c.id !== id))
    } else {
      Alert.alert('Remover', 'Tem certeza?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: () => setConquistas(prev => prev.filter(c => c.id !== id)) },
      ])
    }
  }

  function progressoConquista(c) {
    if (c.desbloqueada) return 100
    if (c.criterio === 'acumular_xp') {
      const maxXP = Math.max(...alunos.map(a => a.xp), 0)
      return Math.min(100, Math.round((maxXP / c.meta) * 100))
    }
    if (c.criterio === 'total_missoes') {
      const totalAprovacoes = Object.values(statusMissao).filter(s => s === 'aprovado').length
      return Math.min(100, Math.round((totalAprovacoes / c.meta) * 100))
    }
    if (c.criterio === 'primeira_tarefa') {
      return Object.keys(historicoXP).length > 0 ? 100 : 0
    }
    if (c.criterio === 'missao_especifica') {
      const encontrou = missions.find(m => m.name === c.missaoAlvo && !m.active)
      return encontrou ? 100 : 0
    }
    if (c.criterio === 'categoria') {
      const totalAprovacoes = Object.values(statusMissao).filter(s => s === 'aprovado').length
      return Math.min(100, Math.round((totalAprovacoes / c.meta) * 100))
    }
    return 0
  }

  function progressoRealMissao(missao) {
    const lista = alunosDaMissao(missao)
    if (lista.length === 0) return 0
    const aprovados = lista.filter(a => getStatusAluno(missao.id, a.id) === 'aprovado').length
    return Math.round((aprovados / lista.length) * 100)
  }

  function editarAlunos(id, valor) {
    const num = parseInt(valor) || 0
    setMissions(prev => prev.map(m => m.id === id ? { ...m, alunos: num } : m))
  }

  function toggleMissaoAtiva(id) {
    setMissions(missions.map(m => m.id === id ? { ...m, active: !m.active } : m))
  }

  // ─── TELA TURMAS ────────────────────────────────────────
  function renderTurmas() {
    return (
      <View style={{ gap: 14 }}>
        <View style={s.screenHeader}>
          <Text style={s.screenTitle}>👥 Turmas</Text>
          <TouchableOpacity style={s.btnNew} onPress={() => setModalTurma(true)}>
            <Text style={s.btnNewText}>+ Nova Turma</Text>
          </TouchableOpacity>
        </View>
        {turmas.map(t => {
          const missoesDaTurmaList = missoesDaTurma(t.nome)
          return (
            <View key={t.id} style={s.panel}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[s.petAvatarSmall, { borderColor: t.cor }]}>
                  <Text style={{ fontSize: 28 }}>{t.pet}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.turmaName}>{t.nome}</Text>
                  <Text style={[s.turmaEstagio, { color: t.cor }]}>{t.estagio} · {t.xp} XP</Text>
                  <Text style={s.turmaEmocao}>{t.emocao} {t.progresso}% engajamento</Text>
                </View>
                <TouchableOpacity onPress={() => removerTurma(t.id)} style={s.btnRemove}>
                  <Text style={s.btnRemoveText}>🗑️</Text>
                </TouchableOpacity>
              </View>
              <View style={[s.petXpBgFull, { marginTop: 10 }]}>
                <View style={[s.petXpFillFull, { width: t.progresso + '%', backgroundColor: t.cor }]} />
              </View>

              {/* Alunos da turma */}
              <View style={{ marginTop: 12, gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={s.formLabel}>
                    Alunos ({alunos.filter(a => a.turmaId === t.id).length})
                  </Text>
                  <TouchableOpacity
                    style={[s.btnNew, { paddingVertical: 5, paddingHorizontal: 10, backgroundColor: colors.purple }]}
                    onPress={() => { setTurmaAtribuir(t); setModalAlunosTurma(true) }}
                  >
                    <Text style={[s.btnNewText, { fontSize: 11 }]}>👤 Ver alunos</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {alunos.filter(a => a.turmaId === t.id).slice(0, 5).map(a => (
                    <View key={a.id} style={[s.badge, { backgroundColor: colors.cream }]}>
                      <Text style={[s.badgeText, { color: t.cor }]}>{a.nome.split(' ')[0]}</Text>
                    </View>
                  ))}
                  {alunos.filter(a => a.turmaId === t.id).length > 5 && (
                    <View style={[s.badge, { backgroundColor: colors.cream }]}>
                      <Text style={[s.badgeText, { color: colors.muted }]}>
                        +{alunos.filter(a => a.turmaId === t.id).length - 5} mais
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Missões da turma */}
              <View style={{ marginTop: 12, gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={s.formLabel}>Missões atribuídas ({missoesDaTurmaList.length})</Text>
                  <TouchableOpacity
                    style={[s.btnNew, { paddingVertical: 5, paddingHorizontal: 10 }]}
                    onPress={() => { setTurmaAtribuir(t); setModalAtribuir(true) }}
                  >
                    <Text style={[s.btnNewText, { fontSize: 11 }]}>+ Atribuir missão</Text>
                  </TouchableOpacity>
                </View>
                {missoesDaTurmaList.length === 0 ? (
                  <Text style={{ fontSize: 12, color: colors.muted, fontFamily: fonts.regular }}>Nenhuma missão atribuída.</Text>
                ) : (
                  missoesDaTurmaList.map(m => (
                    <View key={m.id} style={[s.missionRow, { paddingVertical: 6 }]}>
                      <View style={[s.missionIcon, { backgroundColor: m.color, width: 28, height: 28 }]}>
                        <Text style={{ fontSize: 13 }}>{m.icon}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.missionName, { fontSize: 12 }]}>{m.name}</Text>
                        <Text style={[s.missionMeta, { fontSize: 10 }]}>+{m.xp} XP</Text>
                      </View>
                      {m.active && <View style={s.activePill}><Text style={s.activePillText}>ativa</Text></View>}
                    </View>
                  ))
                )}
              </View>
            </View>
          )
        })}
        {turmas.length === 0 && (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>👥</Text>
            <Text style={s.emptyText}>Nenhuma turma cadastrada.</Text>
            <Text style={s.emptySubtext}>Clique em "+ Nova Turma" para começar.</Text>
          </View>
        )}
      </View>
    )
  }

  // ─── TELA MISSÕES ───────────────────────────────────────
  function renderMissoes() {
    return (
      <View style={{ gap: 14 }}>
        <View style={s.screenHeader}>
          <Text style={s.screenTitle}>🏆 Missões</Text>
          <TouchableOpacity style={s.btnNew} onPress={() => setModalMissao(true)}>
            <Text style={s.btnNewText}>+ Nova Missão</Text>
          </TouchableOpacity>
        </View>
        {missions.map(m => (
          <View key={m.id} style={[s.panel, m.active && { borderColor: colors.green, borderWidth: 2 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[s.missionIcon, { backgroundColor: m.color }]}>
                <Text style={{ fontSize: 20 }}>{m.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={s.missionName}>{m.name}</Text>
                  {m.active && <View style={s.activePill}><Text style={s.activePillText}>ativa</Text></View>}
                </View>
                <Text style={s.missionMeta}>{m.turma} · {qtdAlunosMissao(m)} alunos · +{m.xp} XP</Text>
                {/* Atribuir turmas */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                  {turmas.map(t => {
                    const atribuida = turmaTemMissao(t, m.id)
                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={[s.turmaPill, atribuida && s.turmaPillActive, { paddingVertical: 3 }]}
                        onPress={() => {
                          setTurmaAtribuir(t)
                          if (atribuida) {
                            setMissions(prev => prev.map(ms => {
                              if (ms.id !== m.id) return ms
                              const lista = ms.turma === 'Todas as turmas' ? [] : ms.turma.split(', ')
                              const nova = lista.filter(x => x !== t.nome)
                              return { ...ms, turma: nova.length === 0 ? 'Nenhuma turma' : nova.join(', ') }
                            }))
                          } else {
                            setMissions(prev => prev.map(ms => {
                              if (ms.id !== m.id) return ms
                              const lista = ms.turma === 'Todas as turmas' || ms.turma === 'Nenhuma turma' ? [] : ms.turma.split(', ')
                              return { ...ms, turma: [...lista, t.nome].join(', ') }
                            }))
                          }
                        }}
                      >
                        <Text style={[s.turmaPillText, atribuida && s.turmaPillTextActive]}>
                          {atribuida ? '✓ ' : ''}{t.nome}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
              <TouchableOpacity onPress={() => removerMissao(m.id)} style={s.btnRemove}>
                <Text style={s.btnRemoveText}>🗑️</Text>
              </TouchableOpacity>
            </View>
            {m.active && (
              <View style={{ marginTop: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={[s.missionProgressTxt, { color: colors.muted }]}>Progresso real</Text>
                  <Text style={s.missionProgressTxt}>{progressoRealMissao(m)}% aprovados</Text>
                </View>
                <View style={s.missionProgressBgFull}>
                  <View style={[s.missionProgressFillFull, { width: progressoRealMissao(m) + '%' }]} />
                </View>
                <Text style={[s.missionProgressTxt, { marginTop: 4, color: colors.muted, fontSize: 10 }]}>
                  {alunosDaMissao(m).filter(a => getStatusAluno(m.id, a.id) === 'aprovado').length} de {qtdAlunosMissao(m)} alunos aprovados
                </Text>
              </View>
            )}

            {/* Alunos sincronizados com lista real */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, backgroundColor: colors.cream, borderRadius: 8, padding: 10 }}>
              <Text style={{ fontSize: 13, fontFamily: fonts.semibold, color: colors.dark, flex: 1 }}>
                👥 Alunos participando:
              </Text>
              <Text style={{ fontSize: 18, fontFamily: fonts.bold, color: colors.green }}>
                {qtdAlunosMissao(m)}
              </Text>
            </View>

            {/* Ver alunos participantes */}
            <TouchableOpacity
              style={[s.btnToggle, { backgroundColor: colors.purpleLight, marginTop: 6 }]}
              onPress={() => { setMissaoAlunos(m); setModalAlunos(true) }}
            >
              <Text style={[s.btnToggleText, { color: colors.purple }]}>
                👤 Ver alunos participantes ({qtdAlunosMissao(m)})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.btnToggle, { backgroundColor: m.active ? '#fde8e8' : colors.greenLight }]}
              onPress={() => toggleMissaoAtiva(m.id)}
            >
              <Text style={[s.btnToggleText, { color: m.active ? '#c0392b' : colors.green }]}>
                {m.active ? '⏸ Pausar missão' : '▶ Ativar missão'}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
        {missions.length === 0 && (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>🏆</Text>
            <Text style={s.emptyText}>Nenhuma missão cadastrada.</Text>
            <Text style={s.emptySubtext}>Clique em "+ Nova Missão" para começar.</Text>
          </View>
        )}
      </View>
    )
  }

  // ─── TELA OVERVIEW ──────────────────────────────────────
  function renderOverview() {
    return (
      <>
        {/* Horta Banner */}
        <View style={s.hortaBanner}>
          <View style={{ flex: 1 }}>
            <Text style={s.hortaTag}>🌱 MISSÃO DA SEMANA</Text>
            <Text style={s.hortaTitle}>Horta Escolar</Text>
            <Text style={s.hortaDesc}>72 alunos participando · Todas as turmas · Encerra em 3 dias</Text>
            <View style={s.progressRow}>
              <View style={s.progressBg}><View style={[s.progressFill, { width: '68%' }]} /></View>
              <Text style={s.progressLabel}>68%</Text>
            </View>
          </View>
          <View style={s.recompensaCard}>
            <Text style={s.recompensaLabel}>🎁 Recompensa</Text>
            <Image source={require('../assets/chapeu-horta.png')} style={s.recompensaImg} resizeMode="contain" />
            <Text style={s.recompensaNome}>Chapéu Jardineiro #67</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsGrid}>
          {stats.map(stat => (
            <View key={stat.label} style={s.statCard}>
              <View style={[s.statIconWrap, { backgroundColor: stat.bg }]}>
                <Text style={s.statIconEmoji}>{stat.icon}</Text>
              </View>
              <Text style={s.statNum}>{stat.value}</Text>
              <Text style={s.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Pets */}
          {turmas.map(t => (
            <View key={t.id} style={s.petCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={[s.petAvatar, { borderColor: t.cor }]}>
                  <Text style={s.petEmoji}>{t.pet}</Text>
                  {t.cosmetico && (
                    <Image source={require('../assets/chapeu-horta.png')} style={s.petChapeu} resizeMode="contain" />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={s.petTurma}>{t.nome}</Text>
                    <Text style={s.petEmocao}>{t.emocao}</Text>
                  </View>
                  <Text style={[s.petEstagio, { color: t.cor, marginBottom: 6 }]}>{t.estagio}</Text>
                  <View style={s.petXpRow}>
                    <View style={s.petXpBg}>
                      <View style={[s.petXpFill, { width: t.progresso + '%', backgroundColor: t.cor }]} />
                    </View>
                    <Text style={s.petXpNum}>{t.xp} XP</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}

        {/* Missions preview */}
        <View style={s.panel}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={s.panelTitle}>Missões recentes</Text>
            <TouchableOpacity onPress={() => setActiveNav('missoes')}>
              <Text style={{ fontSize: 12, color: colors.green, fontFamily: fonts.semibold }}>Ver todas →</Text>
            </TouchableOpacity>
          </View>
          {missions.slice(0, 4).map(m => (
            <View key={m.id} style={[s.missionRow, m.active && { backgroundColor: colors.greenLight, borderRadius: 8, paddingHorizontal: 8 }]}>
              <View style={[s.missionIcon, { backgroundColor: m.color }]}>
                <Text style={{ fontSize: 16 }}>{m.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={s.missionName}>{m.name}</Text>
                  {m.active && <View style={s.activePill}><Text style={s.activePillText}>ativa</Text></View>}
                </View>
                <Text style={s.missionMeta}>{m.turma} · {qtdAlunosMissao(m)} alunos</Text>
              </View>
              <View style={s.xpBadge}><Text style={s.xpBadgeText}>+{m.xp} XP</Text></View>
            </View>
          ))}
        </View>

        {/* Ranking */}
        <View style={s.panel}>
          <Text style={s.panelTitle}>Ranking da semana</Text>
          {[...alunos]
            .sort((a, b) => b.xp - a.xp)
            .slice(0, 5)
            .map((r, i) => {
              const turmaAluno = turmas.find(t => t.id === r.turmaId)
              const maxXP = alunos.reduce((max, a) => Math.max(max, a.xp), 1)
              return (
                <View key={r.id} style={s.rankRow}>
                  <Text style={s.rankMedal}>{MEDALS[i] || String(i + 1)}</Text>
                  <View style={[s.rankAvatar, { backgroundColor: r.cor }]}>
                    <Text style={s.rankInitials}>{r.initials}</Text>
                  </View>
                  <View style={{ width: 80, flexShrink: 1 }}>
                    <Text style={s.rankName} numberOfLines={1} ellipsizeMode="tail">{r.nome}</Text>
                    <Text style={s.rankClass} numberOfLines={1}>{turmaAluno?.nome}</Text>
                  </View>
                  <View style={s.rankBarBg}>
                    <View style={[s.rankBarFill, { width: (r.xp / maxXP * 100) + '%', backgroundColor: r.cor }]} />
                  </View>
                  <Text style={s.rankXp}>{r.xp}</Text>
                </View>
              )
            })
          }
        </View>

        {/* Badges */}
        <View style={s.panel}>
          <Text style={s.panelTitle}>Conquistas desbloqueadas esta semana</Text>
          <View style={s.badgesWrap}>
            {BADGES.map(b => (
              <View key={b.label} style={[s.badge, { backgroundColor: b.color }]}>
                <Text style={{ fontSize: 12 }}>{b.icon}</Text>
                <Text style={[s.badgeText, { color: b.text }]}>{b.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </>
    )
  }

  return (
    <SafeAreaView style={s.safe}>

      {/* ── Sidebar Modal ── */}
      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setMenuOpen(false)} />
        <View style={s.sidebar}>
          <View style={s.sidebarLogoRow}>
            <Image source={require('../assets/logo.png')} style={s.sidebarLogo} resizeMode="contain" />
            <Text style={s.sidebarLogoText}>CURUPIRA</Text>
          </View>
          {NAV.map(item => (
            <TouchableOpacity key={item.id} style={[s.navItem, activeNav === item.id && s.navActive]}
              onPress={() => { setActiveNav(item.id); setMenuOpen(false); }}>
              <Text style={s.navIcon}>{item.icon}</Text>
              <Text style={[s.navLabel, activeNav === item.id && s.navLabelActive]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
          <View style={s.sidebarBottom}>
            <View style={s.teacherRow}>
              <View style={s.teacherAvatar}><Text style={s.teacherInitials}>{(professor?.nome || 'P')[0]}</Text></View>
              <View>
                <Text style={s.teacherName}>{professor?.nome || 'Professor'}</Text>
                <Text style={s.teacherRole}>Área do Professor</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => { setMenuOpen(false); onLogout && onLogout(); }}>
              <Text style={s.logoutBtn}>← Sair</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Modal Criar Turma ── */}
      <Modal visible={modalTurma} transparent animationType="slide" onRequestClose={() => setModalTurma(false)}>
        <View style={s.modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}>
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>+ Nova Turma</Text>

              <Text style={s.formLabel}>Nome da turma</Text>
              <TextInput style={s.formInput} placeholder="Ex: 3º A, Turma B..." placeholderTextColor="#aaa"
                value={novaTurma.nome} onChangeText={t => setNovaTurma({ ...novaTurma, nome: t })} />

              <Text style={s.formLabel}>Escolha o pet</Text>
              <View style={s.petPicker}>
                {PETS.map(p => (
                  <TouchableOpacity key={p} style={[s.petOption, novaTurma.pet === p && s.petOptionActive]}
                    onPress={() => setNovaTurma({ ...novaTurma, pet: p })}>
                    <Text style={{ fontSize: 22 }}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.formLabel}>Cor da turma</Text>
              <View style={s.colorPicker}>
                {CORES.map(c => (
                  <TouchableOpacity key={c} style={[s.colorOption, { backgroundColor: c }, novaTurma.cor === c && s.colorOptionActive]}
                    onPress={() => setNovaTurma({ ...novaTurma, cor: c })} />
                ))}
              </View>

              <Text style={s.formLabel}>Alunos da turma (um por linha)</Text>
              <Text style={{ fontSize: 11, color: colors.muted, fontFamily: fonts.regular, marginBottom: 6 }}>
                Opcional — você pode adicionar depois
              </Text>
              <TextInput
                style={[s.formInput, { height: 120, textAlignVertical: 'top' }]}
                placeholder={'Ex:\nMaria Fernanda\nJoão Pedro\nLetícia S.'}
                placeholderTextColor="#aaa"
                multiline
                value={novaTurma.alunosNomes}
                onChangeText={t => setNovaTurma({ ...novaTurma, alunosNomes: t })}
              />
              {novaTurma.alunosNomes.trim().length > 0 && (
                <Text style={{ fontSize: 12, color: colors.green, fontFamily: fonts.semibold, marginTop: -8 }}>
                  {novaTurma.alunosNomes.split('\n').filter(n => n.trim()).length} aluno(s) serão adicionados
                </Text>
              )}

              <View style={s.modalBtns}>
                <TouchableOpacity style={s.btnCancel} onPress={() => setModalTurma(false)}>
                  <Text style={s.btnCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnConfirm} onPress={adicionarTurma}>
                  <Text style={s.btnConfirmText}>Criar Turma</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Modal Criar Missão ── */}
      <Modal visible={modalMissao} transparent animationType="slide" onRequestClose={() => setModalMissao(false)}>
        <View style={s.modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}>
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>+ Nova Missão</Text>

              <Text style={s.formLabel}>Nome da missão</Text>
              <TextInput style={s.formInput} placeholder="Ex: Horta Escolar..." placeholderTextColor="#aaa"
                value={novaMissao.name} onChangeText={t => setNovaMissao({ ...novaMissao, name: t })} />

              <Text style={s.formLabel}>Descrição</Text>
              <TextInput style={[s.formInput, { height: 70, textAlignVertical: 'top' }]}
                placeholder="Descreva a atividade..." placeholderTextColor="#aaa" multiline
                value={novaMissao.descricao} onChangeText={t => setNovaMissao({ ...novaMissao, descricao: t })} />

              <Text style={s.formLabel}>Turma</Text>
              <View style={s.turmaPickerWrap}>
                {['Todas as turmas', ...turmas.map(t => t.nome)].map(nome => (
                  <TouchableOpacity key={nome}
                    style={[s.turmaPill, novaMissao.turma === nome && s.turmaPillActive]}
                    onPress={() => setNovaMissao({ ...novaMissao, turma: nome })}>
                    <Text style={[s.turmaPillText, novaMissao.turma === nome && s.turmaPillTextActive]}>{nome}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.formLabel}>Ícone da missão</Text>
              <View style={s.petPicker}>
                {MISSION_ICONS.map(ic => (
                  <TouchableOpacity key={ic} style={[s.petOption, novaMissao.icon === ic && s.petOptionActive]}
                    onPress={() => setNovaMissao({ ...novaMissao, icon: ic })}>
                    <Text style={{ fontSize: 22 }}>{ic}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.formLabel}>XP da missão</Text>
              <TextInput style={s.formInput} placeholder="Ex: 150" placeholderTextColor="#aaa" keyboardType="numeric"
                value={novaMissao.xp} onChangeText={t => setNovaMissao({ ...novaMissao, xp: t })} />

              <Text style={s.formLabel}>Número de alunos participantes</Text>
              <TextInput style={s.formInput} placeholder="Ex: 25" placeholderTextColor="#aaa" keyboardType="numeric"
                value={novaMissao.alunos} onChangeText={t => setNovaMissao({ ...novaMissao, alunos: t })} />

              <View style={s.modalBtns}>
                <TouchableOpacity style={s.btnCancel} onPress={() => setModalMissao(false)}>
                  <Text style={s.btnCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnConfirm} onPress={adicionarMissao}>
                  <Text style={s.btnConfirmText}>Criar Missão</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Modal Histórico XP ── */}
      <Modal visible={modalHistorico} transparent animationType="fade" onRequestClose={() => setModalHistorico(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { maxHeight: '80%' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <View style={[s.rankAvatar, { backgroundColor: alunoHistorico?.cor, width: 44, height: 44, borderRadius: 22 }]}>
                <Text style={[s.rankInitials, { fontSize: 14 }]}>{alunoHistorico?.initials}</Text>
              </View>
              <View>
                <Text style={s.modalTitle}>{alunoHistorico?.nome}</Text>
                <Text style={[s.formLabel, { marginBottom: 0 }]}>Total: {alunoHistorico?.xp} XP</Text>
              </View>
            </View>

            <Text style={[s.panelTitle, { marginBottom: 10 }]}>📋 Histórico de XP</Text>

            <ScrollView style={{ maxHeight: 300 }}>
              {(historicoXP[alunoHistorico?.id] || []).length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 24, gap: 6 }}>
                  <Text style={{ fontSize: 32 }}>⭐</Text>
                  <Text style={{ fontSize: 13, fontFamily: fonts.regular, color: colors.muted, textAlign: 'center' }}>
                    Nenhum XP atribuído ainda.{'\n'}Use o botão ⭐ para dar XP ao aluno.
                  </Text>
                </View>
              ) : (
                (historicoXP[alunoHistorico?.id] || []).map((h, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0edd8' }}>
                    <View style={[s.statIconWrap, { backgroundColor: colors.yellowLight, width: 32, height: 32, borderRadius: 8 }]}>
                      <Text style={{ fontSize: 14 }}>⭐</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rankName}>{h.missao}</Text>
                      <Text style={s.rankClass}>{h.data}</Text>
                    </View>
                    <Text style={{ fontSize: 14, fontFamily: fonts.bold, color: colors.green }}>+{h.xp} XP</Text>
                  </View>
                ))
              )}
            </ScrollView>

            <TouchableOpacity style={[s.btnConfirm, { marginTop: 12 }]} onPress={() => setModalHistorico(false)}>
              <Text style={s.btnConfirmText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Modal Editar Aluno ── */}
      <Modal visible={modalEditAluno} transparent animationType="fade" onRequestClose={() => setModalEditAluno(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>✏️ Editar Aluno</Text>

            <Text style={s.formLabel}>Nome do aluno</Text>
            <TextInput
              style={s.formInput}
              placeholder="Nome completo..."
              placeholderTextColor="#aaa"
              value={alunoNomeEdit}
              onChangeText={setAlunoNomeEdit}
            />

            <Text style={s.formLabel}>Turma</Text>
            <View style={s.turmaPickerWrap}>
              {turmas.map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={[s.turmaPill, alunoTurmaEdit?.id === t.id && s.turmaPillActive]}
                  onPress={() => setAlunoTurmaEdit(t)}
                >
                  <Text style={[s.turmaPillText, alunoTurmaEdit?.id === t.id && s.turmaPillTextActive]}>
                    {t.pet} {t.nome}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {alunoTurmaEdit && alunoEditando && alunoTurmaEdit.id !== alunoEditando.turmaId && (
              <View style={{ backgroundColor: colors.yellowLight, borderRadius: 8, padding: 10, marginTop: 4 }}>
                <Text style={{ fontSize: 12, fontFamily: fonts.semibold, color: '#7a5f00' }}>
                  ⚠️ O aluno será movido para a turma {alunoTurmaEdit.nome}
                </Text>
              </View>
            )}

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.btnCancel} onPress={() => setModalEditAluno(false)}>
                <Text style={s.btnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnConfirm} onPress={salvarEditAluno}>
                <Text style={s.btnConfirmText}>Salvar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal Alunos da Turma ── */}
      <Modal visible={modalAlunosTurma} transparent animationType="slide" onRequestClose={() => setModalAlunosTurma(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { maxHeight: '90%' }]}>
            <Text style={s.modalTitle}>👥 {turmaAtribuir?.nome}</Text>
            <Text style={[s.formLabel, { marginBottom: 10 }]}>
              {alunos.filter(a => a.turmaId === turmaAtribuir?.id).length} aluno(s)
            </Text>

            {/* Busca */}
            <TextInput
              style={[s.formInput, { marginBottom: 10 }]}
              placeholder="🔍 Buscar aluno..."
              placeholderTextColor="#aaa"
              value={buscaAluno}
              onChangeText={setBuscaAluno}
            />

            {/* Adicionar novo aluno */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TextInput
                style={[s.formInput, { flex: 1, marginBottom: 0 }]}
                placeholder="Nome do aluno..."
                placeholderTextColor="#aaa"
                value={novoAlunoNome}
                onChangeText={setNovoAlunoNome}
                onSubmitEditing={adicionarAlunoTurma}
              />
              <TouchableOpacity style={[s.btnConfirm, { paddingHorizontal: 16 }]} onPress={adicionarAlunoTurma}>
                <Text style={s.btnConfirmText}>+</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 340 }}>
              {alunos
                .filter(a => a.turmaId === turmaAtribuir?.id)
                .filter(a => a.nome.toLowerCase().includes(buscaAluno.toLowerCase()))
                .length === 0 ? (
                <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: 'center', paddingVertical: 20 }}>
                  {buscaAluno ? 'Nenhum aluno encontrado.' : 'Nenhum aluno cadastrado nesta turma.'}
                </Text>
              ) : (
                alunos
                  .filter(a => a.turmaId === turmaAtribuir?.id)
                  .filter(a => a.nome.toLowerCase().includes(buscaAluno.toLowerCase()))
                  .sort((a, b) => b.xp - a.xp)
                  .map((a, i) => (
                    <View key={a.id} style={[s.rankRow, { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0edd8' }]}>
                      <Text style={{ fontSize: 12, width: 20, color: colors.muted, fontFamily: fonts.semibold }}>{i + 1}</Text>
                      <View style={[s.rankAvatar, { backgroundColor: a.cor, width: 36, height: 36, borderRadius: 18 }]}>
                        <Text style={[s.rankInitials, { fontSize: 12 }]}>{a.initials}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.rankName}>{a.nome}</Text>
                        <Text style={s.rankClass}>{a.xp} XP · {(historicoXP[a.id] || []).length} recebimentos</Text>
                      </View>
                      <TouchableOpacity
                        style={[s.btnToggle, { marginTop: 0, backgroundColor: '#f0f0f0', paddingHorizontal: 8 }]}
                        onPress={() => {
                          setAlunoHistorico(a)
                          setModalAlunosTurma(false)
                          setTimeout(() => setModalHistorico(true), 300)
                        }}
                      >
                        <Text style={[s.btnToggleText, { color: colors.muted }]}>📋</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.btnToggle, { marginTop: 0, backgroundColor: colors.purpleLight, paddingHorizontal: 8 }]}
                        onPress={() => {
                          setModalAlunosTurma(false)
                          setTimeout(() => abrirEditAluno(a), 300)
                        }}
                      >
                        <Text style={[s.btnToggleText, { color: colors.purple }]}>✏️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.btnToggle, { marginTop: 0, backgroundColor: colors.yellowLight, paddingHorizontal: 8 }]}
                        onPress={() => {
                          setAlunoXP(a)
                          setModalAlunosTurma(false)
                          setTimeout(() => setModalXP(true), 300)
                        }}
                      >
                        <Text style={[s.btnToggleText, { color: '#7a5f00' }]}>⭐</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removerAluno(a.id)} style={[s.btnRemove, { marginLeft: 2 }]}>
                        <Text style={s.btnRemoveText}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  ))
              )}
            </ScrollView>

            <TouchableOpacity style={[s.btnConfirm, { marginTop: 12 }]} onPress={() => { setModalAlunosTurma(false); setNovoAlunoNome(''); setBuscaAluno('') }}>
              <Text style={s.btnConfirmText}>Concluído</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Modal Atribuir Missão ── */}
      <Modal visible={modalAtribuir} transparent animationType="slide" onRequestClose={() => setModalAtribuir(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>📋 Atribuir Missão</Text>
            <Text style={[s.formLabel, { marginBottom: 8 }]}>Turma: {turmaAtribuir?.nome}</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {missions.map(m => {
                const jaAtribuida = turmaAtribuir ? turmaTemMissao(turmaAtribuir, m.id) : false
                return (
                  <View key={m.id} style={[s.missionRow, { paddingVertical: 10, alignItems: 'center' }]}>
                    <View style={[s.missionIcon, { backgroundColor: m.color }]}>
                      <Text style={{ fontSize: 16 }}>{m.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.missionName}>{m.name}</Text>
                      <Text style={s.missionMeta}>+{m.xp} XP</Text>
                    </View>
                    <TouchableOpacity
                      style={[s.btnToggle, {
                        backgroundColor: jaAtribuida ? '#fde8e8' : colors.greenLight,
                        marginTop: 0, paddingHorizontal: 12
                      }]}
                      onPress={() => jaAtribuida ? desatribuirMissao(m.id) : atribuirMissao(m.id)}
                    >
                      <Text style={[s.btnToggleText, { color: jaAtribuida ? '#c0392b' : colors.green }]}>
                        {jaAtribuida ? '✕ Remover' : '+ Atribuir'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )
              })}
            </ScrollView>
            <TouchableOpacity style={[s.btnConfirm, { marginTop: 8 }]} onPress={() => setModalAtribuir(false)}>
              <Text style={s.btnConfirmText}>Concluído</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Modal Alunos da Missão ── */}
      <Modal visible={modalAlunos} transparent animationType="slide" onRequestClose={() => setModalAlunos(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { maxHeight: '85%' }]}>
            <Text style={s.modalTitle}>👥 {missaoAlunos?.name}</Text>

            {alunosDaMissao(missaoAlunos).length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
                <Text style={{ fontSize: 32 }}>👥</Text>
                <Text style={{ fontSize: 14, fontFamily: fonts.semibold, color: colors.dark }}>Nenhum aluno encontrado</Text>
                <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: colors.muted, textAlign: 'center' }}>
                  Atribua esta missão a uma turma para ver os alunos participantes.
                </Text>
                <TouchableOpacity
                  style={[s.btnNew, { marginTop: 8 }]}
                  onPress={() => { setModalAlunos(false); setActiveNav('missoes') }}
                >
                  <Text style={s.btnNewText}>Ir para Missões →</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={[s.formLabel, { marginBottom: 10 }]}>
                  {qtdAlunosMissao(missaoAlunos)} aluno(s) · {missaoAlunos?.turma}
                </Text>

                {/* Busca */}
                <TextInput
                  style={[s.formInput, { marginBottom: 10 }]}
                  placeholder="🔍 Buscar aluno..."
                  placeholderTextColor="#aaa"
                  value={buscaAluno}
                  onChangeText={setBuscaAluno}
                />

                <ScrollView style={{ maxHeight: 360 }}>
                  {alunosDaMissao(missaoAlunos)
                    .filter(a => a.nome.toLowerCase().includes(buscaAluno.toLowerCase()))
                    .sort((a, b) => b.xp - a.xp)
                    .map((a, i) => {
                      const turmaAluno = turmas.find(t => t.id === a.turmaId)
                      const status = getStatusAluno(missaoAlunos?.id, a.id)
                      const statusColor = status === 'aprovado' ? colors.green : status === 'entregue' ? colors.yellow : '#ddd'
                      const statusLabel = status === 'aprovado' ? '✅ Aprovado' : status === 'entregue' ? '📬 Entregue' : '⏳ Pendente'
                      return (
                        <View key={a.id} style={[s.rankRow, { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0edd8', flexWrap: 'wrap', gap: 4 }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                            <Text style={{ fontSize: 12, width: 20, color: colors.muted, fontFamily: fonts.semibold }}>{i + 1}</Text>
                            <View style={[s.rankAvatar, { backgroundColor: a.cor, width: 34, height: 34, borderRadius: 17 }]}>
                              <Text style={[s.rankInitials, { fontSize: 11 }]}>{a.initials}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={s.rankName}>{a.nome}</Text>
                              <Text style={s.rankClass}>{turmaAluno?.nome} · {a.xp} XP</Text>
                            </View>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 6, marginLeft: 28 }}>
                            <TouchableOpacity
                              style={[s.btnToggle, { marginTop: 0, backgroundColor: '#f0f0f0', paddingHorizontal: 8 }]}
                              onPress={() => {
                                setAlunoHistorico(a)
                                setModalAlunos(false)
                                setTimeout(() => setModalHistorico(true), 300)
                              }}
                            >
                              <Text style={[s.btnToggleText, { color: colors.muted }]}>📋</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[s.btnToggle, { marginTop: 0, backgroundColor: statusColor + '30', paddingHorizontal: 8, borderWidth: 1, borderColor: statusColor }]}
                              onPress={() => ciclarStatus(missaoAlunos?.id, a.id)}
                            >
                              <Text style={[s.btnToggleText, { color: statusColor === '#ddd' ? colors.muted : statusColor, fontSize: 11 }]}>{statusLabel}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[s.btnToggle, { marginTop: 0, backgroundColor: colors.yellowLight, paddingHorizontal: 8 }]}
                              onPress={() => {
                                setAlunoXP(a)
                                setModalAlunos(false)
                                setTimeout(() => setModalXP(true), 300)
                              }}
                            >
                              <Text style={[s.btnToggleText, { color: '#7a5f00' }]}>⭐ +XP</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )
                    })
                  }
                </ScrollView>
              </>
            )}

            <TouchableOpacity style={[s.btnConfirm, { marginTop: 12 }]} onPress={() => { setModalAlunos(false); setBuscaAluno('') }}>
              <Text style={s.btnConfirmText}>Concluído</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Modal Criar Conquista ── */}
      <Modal visible={modalConquista} transparent animationType="slide" onRequestClose={() => setModalConquista(false)}>
        <View style={s.modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}>
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>🎖️ Nova Conquista</Text>

              <Text style={s.formLabel}>Emoji</Text>
              <View style={s.petPicker}>
                {['🏆','🌟','🎯','🌿','⭐','🎵','🏃','🎨','🔬','🤝','📚','🌍'].map(e => (
                  <TouchableOpacity key={e}
                    style={[s.petOption, novaConquista.emoji === e && s.petOptionActive]}
                    onPress={() => setNovaConquista({ ...novaConquista, emoji: e })}>
                    <Text style={{ fontSize: 22 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.formLabel}>Nome</Text>
              <TextInput style={s.formInput} placeholder="Ex: Guardião da Natureza" placeholderTextColor="#aaa"
                value={novaConquista.nome} onChangeText={t => setNovaConquista({ ...novaConquista, nome: t })} />

              <Text style={s.formLabel}>Descrição</Text>
              <TextInput style={s.formInput} placeholder="Descreva o critério..." placeholderTextColor="#aaa"
                value={novaConquista.descricao} onChangeText={t => setNovaConquista({ ...novaConquista, descricao: t })} />

              <Text style={s.formLabel}>Raridade</Text>
              <View style={s.turmaPickerWrap}>
                {['Comum','Raro','Épico','Lendário'].map(r => (
                  <TouchableOpacity key={r}
                    style={[s.turmaPill, novaConquista.raridade === r && s.turmaPillActive]}
                    onPress={() => setNovaConquista({ ...novaConquista, raridade: r })}>
                    <Text style={[s.turmaPillText, novaConquista.raridade === r && s.turmaPillTextActive]}>
                      {RARIDADE_CONFIG[r].emoji} {r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.formLabel}>Critério de desbloqueio</Text>
              {CRITERIOS.map(cr => (
                <TouchableOpacity key={cr.id}
                  style={[s.turmaPill, { marginBottom: 6, width: '100%' }, novaConquista.criterio === cr.id && s.turmaPillActive]}
                  onPress={() => setNovaConquista({ ...novaConquista, criterio: cr.id })}>
                  <Text style={[s.turmaPillText, novaConquista.criterio === cr.id && s.turmaPillTextActive]}>{cr.label}</Text>
                </TouchableOpacity>
              ))}

              {novaConquista.criterio === 'missao_especifica' && (
                <>
                  <Text style={s.formLabel}>Missão alvo</Text>
                  <View style={s.turmaPickerWrap}>
                    {missions.map(m => (
                      <TouchableOpacity key={m.id}
                        style={[s.turmaPill, novaConquista.missaoAlvo === m.name && s.turmaPillActive]}
                        onPress={() => setNovaConquista({ ...novaConquista, missaoAlvo: m.name, meta: 1 })}>
                        <Text style={[s.turmaPillText, novaConquista.missaoAlvo === m.name && s.turmaPillTextActive]}>{m.icon} {m.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {novaConquista.criterio !== 'primeira_tarefa' && novaConquista.criterio !== 'missao_especifica' && (
                <>
                  <Text style={s.formLabel}>Meta</Text>
                  <TextInput style={s.formInput} placeholder="Ex: 500" placeholderTextColor="#aaa" keyboardType="numeric"
                    value={novaConquista.meta} onChangeText={t => setNovaConquista({ ...novaConquista, meta: t })} />
                </>
              )}

              <Text style={s.formLabel}>XP da conquista</Text>
              <TextInput style={s.formInput} placeholder="Ex: 100" placeholderTextColor="#aaa" keyboardType="numeric"
                value={novaConquista.xp} onChangeText={t => setNovaConquista({ ...novaConquista, xp: t })} />

              <View style={s.modalBtns}>
                <TouchableOpacity style={s.btnCancel} onPress={() => setModalConquista(false)}>
                  <Text style={s.btnCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnConfirm} onPress={adicionarConquista}>
                  <Text style={s.btnConfirmText}>Criar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Modal Detalhe Conquista ── */}
      <Modal visible={modalDetConquista} transparent animationType="fade" onRequestClose={() => setModalDetConquista(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            {conquistaSelecionada && (() => {
              const cfg = RARIDADE_CONFIG[conquistaSelecionada.raridade]
              const prog = progressoConquista(conquistaSelecionada)
              return (
                <>
                  <View style={{ alignItems: 'center', marginBottom: 12 }}>
                    <View style={[s.statIconWrap, { backgroundColor: cfg.bg, width: 70, height: 70, borderRadius: 16, opacity: conquistaSelecionada.desbloqueada ? 1 : 0.5 }]}>
                      <Text style={{ fontSize: 38 }}>{conquistaSelecionada.emoji}</Text>
                    </View>
                    <Text style={[s.modalTitle, { textAlign: 'center', marginTop: 8 }]}>{conquistaSelecionada.nome}</Text>
                    <View style={[s.activePill, { backgroundColor: cfg.bg, marginTop: 6 }]}>
                      <Text style={[s.activePillText, { color: cfg.color }]}>{cfg.emoji} {conquistaSelecionada.raridade}</Text>
                    </View>
                  </View>
                  <Text style={[s.missionMeta, { textAlign: 'center', marginBottom: 12 }]}>{conquistaSelecionada.descricao}</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                    <View style={[s.statCard, { flex: 1, marginRight: 6 }]}>
                      <Text style={s.statNum}>+{conquistaSelecionada.xp}</Text>
                      <Text style={s.statLabel}>XP</Text>
                    </View>
                    <View style={[s.statCard, { flex: 1, marginLeft: 6 }]}>
                      <Text style={[s.statNum, { color: conquistaSelecionada.desbloqueada ? colors.green : colors.muted }]}>
                        {conquistaSelecionada.desbloqueada ? '✅' : '🔒'}
                      </Text>
                      <Text style={s.statLabel}>{conquistaSelecionada.desbloqueada ? 'Desbloqueada' : 'Bloqueada'}</Text>
                    </View>
                  </View>
                  <Text style={[s.formLabel, { marginBottom: 6 }]}>Progresso: {prog}%</Text>
                  <View style={s.missionProgressBgFull}>
                    <View style={[s.missionProgressFillFull, { width: prog + '%', backgroundColor: conquistaSelecionada.desbloqueada ? colors.green : cfg.color }]} />
                  </View>
                  <Text style={[s.missionMeta, { marginTop: 6 }]}>
                    Critério: {CRITERIOS.find(cr => cr.id === conquistaSelecionada.criterio)?.label}
                    {conquistaSelecionada.missaoAlvo ? ` — ${conquistaSelecionada.missaoAlvo}` : ''}
                    {conquistaSelecionada.criterio !== 'primeira_tarefa' && conquistaSelecionada.criterio !== 'missao_especifica' ? ` (meta: ${conquistaSelecionada.meta})` : ''}
                  </Text>
                </>
              )
            })()}
            <TouchableOpacity style={[s.btnConfirm, { marginTop: 16 }]} onPress={() => setModalDetConquista(false)}>
              <Text style={s.btnConfirmText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Modal Dar XP ── */}
      <Modal visible={modalXP} transparent animationType="fade" onRequestClose={() => setModalXP(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>⭐ Dar XP</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <View style={[s.rankAvatar, { backgroundColor: alunoXP?.cor || colors.green, width: 44, height: 44, borderRadius: 22 }]}>
                <Text style={[s.rankInitials, { fontSize: 14 }]}>{alunoXP?.initials}</Text>
              </View>
              <View>
                <Text style={s.turmaName}>{alunoXP?.nome}</Text>
                <Text style={s.turmaEstagio}>XP atual: {alunoXP?.xp}</Text>
              </View>
            </View>

            {missaoAlunos && (() => {
              const xpJaDado = (historicoXP[alunoXP?.id] || [])
                .filter(h => h.missao === missaoAlunos.name)
                .reduce((acc, h) => acc + h.xp, 0)
              const restante = Math.max(0, missaoAlunos.xp - xpJaDado)
              return (
                <View style={{ backgroundColor: restante === 0 ? '#fde8e8' : colors.yellowLight, borderRadius: 8, padding: 10, marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, fontFamily: fonts.semibold, color: restante === 0 ? '#c0392b' : '#7a5f00' }}>
                    {restante === 0
                      ? `⚠️ Limite atingido! Esta missão vale ${missaoAlunos.xp} XP.`
                      : `📋 Missão: ${missaoAlunos.name} · Limite: ${missaoAlunos.xp} XP · Restante: ${restante} XP`
                    }
                  </Text>
                </View>
              )
            })()}

            <Text style={s.formLabel}>Quantidade de XP a atribuir</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              {[10, 25, 50, 100].map(v => (
                <TouchableOpacity
                  key={v}
                  style={[s.turmaPill, xpValor === String(v) && s.turmaPillActive]}
                  onPress={() => setXpValor(String(v))}
                >
                  <Text style={[s.turmaPillText, xpValor === String(v) && s.turmaPillTextActive]}>+{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={s.formInput}
              placeholder="Ou digite um valor personalizado..."
              placeholderTextColor="#aaa"
              keyboardType="numeric"
              value={xpValor}
              onChangeText={setXpValor}
            />

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.btnCancel} onPress={() => { setModalXP(false); setXpValor('') }}>
                <Text style={s.btnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnConfirm} onPress={darXP}>
                <Text style={s.btnConfirmText}>Confirmar XP</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Main ── */}
      <ScrollView style={s.main} contentContainerStyle={s.mainContent} showsVerticalScrollIndicator={false}>
        <View style={s.topBar}>
          <View style={s.topBarLeft}>
            <TouchableOpacity onPress={() => setMenuOpen(true)} style={s.hamburger}>
              <View style={s.hLine} /><View style={s.hLine} /><View style={s.hLine} />
            </TouchableOpacity>
            <Image source={require('../assets/logo.png')} style={s.topLogo} resizeMode="contain" />
            <View>
              <Text style={s.pageTitle}>Seja bem-vindo(a), {professor?.nome || 'Professor(a)'}! 👋</Text>
              <Text style={s.pageSub}>{turmas.length} turmas · {alunos.length} alunos · Semana de {today}</Text>
            </View>
          </View>
          {activeNav === 'overview' && (
            <TouchableOpacity style={s.btnNew} onPress={() => setActiveNav('missoes')}>
              <Text style={s.btnNewText}>+ Nova Missão</Text>
            </TouchableOpacity>
          )}
        </View>

        {activeNav === 'overview'   && renderOverview()}
        {activeNav === 'turmas'     && renderTurmas()}
        {activeNav === 'missoes'    && renderMissoes()}
        {activeNav === 'relatorio'  && (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>📈</Text>
            <Text style={s.emptyText}>Relatórios em breve!</Text>
            <Text style={s.emptySubtext}>Esta funcionalidade será disponibilizada na próxima versão.</Text>
          </View>
        )}
        {activeNav === 'conquistas' && (() => {
          const conquistasFiltradas = conquistas
            .filter(c => filtroRaridade === 'Todos' || c.raridade === filtroRaridade)
            .filter(c => filtroStatus === 'Todos' || (filtroStatus === 'Desbloqueada' ? c.desbloqueada : !c.desbloqueada))
          return (
            <View style={{ gap: 14 }}>
              <View style={s.screenHeader}>
                <Text style={s.screenTitle}>🎖️ Conquistas</Text>
                <TouchableOpacity style={s.btnNew} onPress={() => setModalConquista(true)}>
                  <Text style={s.btnNewText}>+ Nova</Text>
                </TouchableOpacity>
              </View>

              {/* Filtros */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 4 }}>
                  {['Todos', 'Comum', 'Raro', 'Épico', 'Lendário'].map(r => (
                    <TouchableOpacity key={r}
                      style={[s.turmaPill, filtroRaridade === r && s.turmaPillActive]}
                      onPress={() => setFiltroRaridade(r)}>
                      <Text style={[s.turmaPillText, filtroRaridade === r && s.turmaPillTextActive]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                  <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: 4 }} />
                  {['Todos', 'Desbloqueada', 'Bloqueada'].map(st => (
                    <TouchableOpacity key={st}
                      style={[s.turmaPill, filtroStatus === st && s.turmaPillActive]}
                      onPress={() => setFiltroStatus(st)}>
                      <Text style={[s.turmaPillText, filtroStatus === st && s.turmaPillTextActive]}>{st}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {/* Stats rápidos */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={[s.statCard, { flex: 1 }]}>
                  <Text style={s.statNum}>{conquistas.filter(c => c.desbloqueada).length}</Text>
                  <Text style={s.statLabel}>Desbloqueadas</Text>
                </View>
                <View style={[s.statCard, { flex: 1 }]}>
                  <Text style={s.statNum}>{conquistas.filter(c => !c.desbloqueada).length}</Text>
                  <Text style={s.statLabel}>Bloqueadas</Text>
                </View>
                <View style={[s.statCard, { flex: 1 }]}>
                  <Text style={s.statNum}>{conquistas.reduce((acc, c) => c.desbloqueada ? acc + c.xp : acc, 0)}</Text>
                  <Text style={s.statLabel}>XP total</Text>
                </View>
              </View>

              {conquistasFiltradas.length === 0 ? (
                <View style={s.emptyState}>
                  <Text style={s.emptyIcon}>🎖️</Text>
                  <Text style={s.emptyText}>Nenhuma conquista encontrada.</Text>
                </View>
              ) : (
                conquistasFiltradas.map(c => {
                  const cfg = RARIDADE_CONFIG[c.raridade]
                  const prog = progressoConquista(c)
                  return (
                    <TouchableOpacity key={c.id} style={[s.panel, c.desbloqueada && { borderColor: cfg.color, borderWidth: 2 }]}
                      onPress={() => { setConquistaSelecionada(c); setModalDetConquista(true) }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={[s.statIconWrap, { backgroundColor: cfg.bg, width: 50, height: 50, borderRadius: 12, opacity: c.desbloqueada ? 1 : 0.5 }]}>
                          <Text style={{ fontSize: 26 }}>{c.emoji}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={[s.missionName, { color: c.desbloqueada ? colors.dark : colors.muted }]}>{c.nome}</Text>
                            <View style={[s.activePill, { backgroundColor: cfg.bg }]}>
                              <Text style={[s.activePillText, { color: cfg.color }]}>{cfg.emoji} {c.raridade}</Text>
                            </View>
                            {c.desbloqueada && <View style={[s.activePill, { backgroundColor: colors.greenLight }]}>
                              <Text style={[s.activePillText, { color: colors.green }]}>✅ Desbloqueada</Text>
                            </View>}
                          </View>
                          <Text style={s.missionMeta}>{c.descricao}</Text>
                          <Text style={[s.missionMeta, { color: colors.yellow, marginTop: 2 }]}>+{c.xp} XP</Text>
                        </View>
                        <TouchableOpacity onPress={() => removerConquista(c.id)} style={s.btnRemove}>
                          <Text style={s.btnRemoveText}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                      {/* Barra de progresso */}
                      <View style={{ marginTop: 10 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={[s.missionMeta, { fontSize: 10 }]}>
                            {CRITERIOS.find(cr => cr.id === c.criterio)?.label}
                            {c.missaoAlvo ? ` — ${c.missaoAlvo}` : ''}
                            {c.criterio !== 'primeira_tarefa' && c.criterio !== 'missao_especifica' ? ` (meta: ${c.meta})` : ''}
                          </Text>
                          <Text style={[s.missionProgressTxt, { color: c.desbloqueada ? colors.green : cfg.color }]}>{prog}%</Text>
                        </View>
                        <View style={s.missionProgressBgFull}>
                          <View style={[s.missionProgressFillFull, { width: prog + '%', backgroundColor: c.desbloqueada ? colors.green : cfg.color }]} />
                        </View>
                      </View>
                    </TouchableOpacity>
                  )
                })
              )}
            </View>
          )
        })()}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: colors.cream },
  main:        { flex: 1 },
  mainContent: { padding: 14, gap: 14 },
  overlay:     { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10 },
  sidebar:     { position: 'absolute', top: 0, left: 0, bottom: 0, width: 240, backgroundColor: colors.dark, paddingTop: 50, paddingBottom: 24, zIndex: 20 },
  sidebarLogoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', marginBottom: 12 },
  sidebarLogo:    { width: 36, height: 36 },
  sidebarLogoText:{ fontSize: 14, fontFamily: fonts.extrabold, color: '#fff', letterSpacing: 2 },
  navItem:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 20, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  navActive:      { borderLeftColor: colors.green, backgroundColor: 'rgba(255,255,255,0.07)' },
  navIcon:        { fontSize: 16, width: 22, textAlign: 'center' },
  navLabel:       { fontSize: 13, fontFamily: fonts.medium, color: 'rgba(255,255,255,0.5)' },
  navLabelActive: { color: '#fff' },
  sidebarBottom:  { marginTop: 'auto', paddingHorizontal: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', gap: 12 },
  teacherRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  teacherAvatar:  { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  teacherInitials:{ fontSize: 12, fontFamily: fonts.bold, color: '#fff' },
  teacherName:    { fontSize: 13, fontFamily: fonts.semibold, color: '#fff' },
  teacherRole:    { fontSize: 11, fontFamily: fonts.regular, color: 'rgba(255,255,255,0.4)' },
  logoutBtn:      { fontSize: 12, fontFamily: fonts.semibold, color: 'rgba(255,100,100,0.8)' },
  topBar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  topBarLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  hamburger:   { padding: 6, gap: 5 },
  hLine:       { width: 22, height: 2, backgroundColor: colors.dark, borderRadius: 2 },
  topLogo:     { width: 40, height: 40 },
  pageTitle:   { fontSize: 14, fontFamily: fonts.bold, color: colors.dark },
  pageSub:     { fontSize: 11, fontFamily: fonts.regular, color: colors.muted },
  btnNew:      { backgroundColor: colors.green, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 14 },
  btnNewText:  { color: '#fff', fontSize: 12, fontFamily: fonts.bold },
  hortaBanner: { backgroundColor: colors.dark, borderRadius: 12, padding: 16, borderWidth: 2, borderColor: colors.green, flexDirection: 'row', gap: 12, alignItems: 'center' },
  hortaTag:    { fontSize: 10, fontFamily: fonts.bold, color: colors.green, letterSpacing: 1, marginBottom: 4 },
  hortaTitle:  { fontSize: 18, fontFamily: fonts.extrabold, color: '#fff', marginBottom: 4 },
  hortaDesc:   { fontSize: 11, fontFamily: fonts.regular, color: 'rgba(255,255,255,0.5)', marginBottom: 12 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressBg:  { flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' },
  progressFill:{ height: '100%', backgroundColor: colors.green, borderRadius: 4 },
  progressLabel:{ fontSize: 12, fontFamily: fonts.bold, color: colors.green },
  recompensaCard:{ alignItems: 'center', gap: 4, minWidth: 90 },
  recompensaLabel:{ fontSize: 11, fontFamily: fonts.semibold, color: colors.yellow },
  recompensaImg:{ width: 64, height: 64 },
  recompensaNome:{ fontSize: 10, fontFamily: fonts.semibold, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  statsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard:    { backgroundColor: colors.white, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: colors.border, width: (width - 42) / 2 },
  statIconWrap:{ width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statIconEmoji:{ fontSize: 17 },
  statNum:     { fontSize: 22, fontFamily: fonts.bold, color: colors.dark },
  statLabel:   { fontSize: 11, fontFamily: fonts.medium, color: '#999', marginTop: 2 },
  panel:       { backgroundColor: colors.white, borderRadius: 10, padding: 16, borderWidth: 1, borderColor: colors.border },
  panelTitle:  { fontSize: 14, fontFamily: fonts.bold, color: colors.dark, marginBottom: 12 },
  petsGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  petsGrid:    { flexDirection: 'column', gap: 10 },
  petCard:     { width: '100%', borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, gap: 6, backgroundColor: colors.cream },
  petTurma:    { fontSize: 12, fontFamily: fonts.bold, color: colors.dark },
  petEmocao:   { fontSize: 16 },
  petAvatar:   { width: 72, height: 72, borderRadius: 36, borderWidth: 3, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  petEmoji:    { fontSize: 34 },
  petChapeu:   { position: 'absolute', top: -20, width: 56, height: 40 },
  petEstagio:  { fontSize: 12, fontFamily: fonts.bold },
  petXpRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, width: '100%' },
  petXpBg:     { flex: 1, height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  petXpFill:   { height: '100%', borderRadius: 3 },
  petXpNum:    { fontSize: 10, fontFamily: fonts.bold, color: colors.muted },
  missionRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0edd8' },
  missionIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  missionName: { fontSize: 13, fontFamily: fonts.semibold, color: colors.dark },
  missionMeta: { fontSize: 11, fontFamily: fonts.regular, color: '#999', marginTop: 2 },
  missionDesc: { fontSize: 11, fontFamily: fonts.regular, color: colors.muted, marginTop: 2, fontStyle: 'italic' },
  activePill:  { backgroundColor: colors.green, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  activePillText:{ fontSize: 10, fontFamily: fonts.bold, color: '#fff', textTransform: 'uppercase' },
  xpBadge:     { backgroundColor: colors.yellowLight, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  xpBadgeText: { fontSize: 12, fontFamily: fonts.bold, color: '#7a5f00' },
  rankRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f0edd8', flexWrap: 'nowrap' },
  rankMedal:   { fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 },
  rankAvatar:  { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rankInitials:{ fontSize: 10, fontFamily: fonts.bold, color: '#fff', textAlign: 'center' },
  rankName:    { fontSize: 12, fontFamily: fonts.semibold, color: colors.dark, flexShrink: 1 },
  rankClass:   { fontSize: 10, fontFamily: fonts.regular, color: '#999' },
  rankBarBg:   { flex: 1, height: 6, backgroundColor: '#f0edd8', borderRadius: 3, overflow: 'hidden', minWidth: 30 },
  rankBarFill: { height: '100%', borderRadius: 3 },
  rankXp:      { fontSize: 11, fontFamily: fonts.bold, color: colors.dark, minWidth: 30, textAlign: 'right', flexShrink: 0 },
  badgesWrap:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  badgeText:   { fontSize: 12, fontFamily: fonts.semibold },

  // Turmas screen
  screenHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  screenTitle:    { fontSize: 18, fontFamily: fonts.bold, color: colors.dark },
  petAvatarSmall: { width: 56, height: 56, borderRadius: 28, borderWidth: 3, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  turmaName:      { fontSize: 15, fontFamily: fonts.bold, color: colors.dark },
  turmaEstagio:   { fontSize: 12, fontFamily: fonts.semibold, marginTop: 2 },
  turmaEmocao:    { fontSize: 11, fontFamily: fonts.regular, color: colors.muted, marginTop: 2 },
  petXpBgFull:    { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  petXpFillFull:  { height: '100%', borderRadius: 3 },
  btnRemove:      { padding: 8 },
  btnRemoveText:  { fontSize: 18 },

  // Missoes screen
  missionProgressBgFull:  { height: 6, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 3, overflow: 'hidden' },
  missionProgressFillFull:{ height: '100%', backgroundColor: colors.green, borderRadius: 3 },
  missionProgressTxt:     { fontSize: 11, fontFamily: fonts.bold, color: colors.green },
  btnToggle:     { marginTop: 10, borderRadius: 8, padding: 8, alignItems: 'center', flexShrink: 0 },
  btnToggleText: { fontSize: 12, fontFamily: fonts.semibold, flexShrink: 1 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalBox:     { backgroundColor: colors.white, borderRadius: 16, padding: 20, gap: 12 },
  modalTitle:   { fontSize: 18, fontFamily: fonts.bold, color: colors.dark, marginBottom: 4 },
  formLabel:    { fontSize: 12, fontFamily: fonts.semibold, color: '#444' },
  formInput:    { borderWidth: 1.5, borderColor: colors.border, borderRadius: 8, padding: 11, fontSize: 14, fontFamily: fonts.regular, color: colors.dark, backgroundColor: colors.cream },
  petPicker:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  petOption:    { width: 44, height: 44, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream },
  petOptionActive:{ borderColor: colors.green, backgroundColor: colors.greenLight },
  colorPicker:  { flexDirection: 'row', gap: 10 },
  colorOption:  { width: 32, height: 32, borderRadius: 16 },
  colorOptionActive:{ borderWidth: 3, borderColor: colors.dark },
  turmaPickerWrap:{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  turmaPill:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.cream },
  turmaPillActive:{ borderColor: colors.green, backgroundColor: colors.greenLight },
  turmaPillText:{ fontSize: 12, fontFamily: fonts.medium, color: colors.muted },
  turmaPillTextActive:{ color: colors.green, fontFamily: fonts.semibold },
  modalBtns:    { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnCancel:    { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' },
  btnCancelText:{ fontSize: 14, fontFamily: fonts.semibold, color: colors.muted },
  btnConfirm:   { flex: 1, padding: 12, borderRadius: 8, backgroundColor: colors.green, alignItems: 'center' },
  btnConfirmText:{ fontSize: 14, fontFamily: fonts.semibold, color: '#fff' },

  // Empty state
  emptyState:  { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyIcon:   { fontSize: 48 },
  emptyText:   { fontSize: 16, fontFamily: fonts.bold, color: colors.dark },
  emptySubtext:{ fontSize: 13, fontFamily: fonts.regular, color: colors.muted, textAlign: 'center' },
})
