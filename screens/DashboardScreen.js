import { useState, useEffect } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  StyleSheet, Modal, Dimensions, TextInput, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';
import { listarAlunos, atualizarAluno, listarTurmas, listarPetsDisponiveis, salvarTurma, removerTurmaStorage, listarMissoes, listarIconesMissoes, listarStatusMissoes, salvarMissao, atualizarMissao, definirTurmasMissao, atualizarStatusAlunoMissao, removerMissaoStorage } from '../services/storage';
import { CORES, MEDALS, RARIDADE_CONFIG, CRITERIOS } from './dashboardConfig';
import DashboardSidebar from './DashboardSidebar';

const { width } = Dimensions.get('window');


export default function DashboardScreen({ professor, onLogout }) {
  const [activeNav, setActiveNav]     = useState('overview')
  const [menuOpen, setMenuOpen]       = useState(false)
  const [turmas, setTurmas]           = useState([])
  const [petsDisponiveis, setPetsDisponiveis] = useState([])
  const [carregandoPets, setCarregandoPets] = useState(false)
  const [missions, setMissions]       = useState([])
  const [alunos, setAlunos]           = useState([])
  const [conquistas, setConquistas]   = useState([])

  // Modal de criar turma
  const [modalTurma, setModalTurma]   = useState(false)
  const [novaTurma, setNovaTurma]     = useState({ nome: '', petId: null, cor: colors.green, alunosNomes: '' })

  // Modal de criar missão
  const [modalMissao, setModalMissao] = useState(false)
  const [novaMissao, setNovaMissao]   = useState({ name: '', descricao: '', turmaIds: [], dificuldade: null, icon: null })
  const [errosMissao, setErrosMissao] = useState({})
  const [iconesMissoes, setIconesMissoes] = useState([])
  const [missaoEditando, setMissaoEditando] = useState(null)

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
  const [novaConquista, setNovaConquista]   = useState({ nome: '', emoji: '🏆', raridade: 'Comum', xp: '', criterio: 'primeira_missao', meta: '', descricao: '', missaoAlvo: '' })
  const [modalDetConquista, setModalDetConquista] = useState(false)
  const [conquistaSelecionada, setConquistaSelecionada] = useState(null)

  // Busca de aluno
  const [buscaAluno, setBuscaAluno] = useState('')

  useEffect(() => {
    let ativo = true
    async function recarregarDados() {
      const [alunosResult, turmasResult, missoesResult, iconesResult, statusResult] = await Promise.allSettled([
        listarAlunos(),
        listarTurmas(professor.id),
        listarMissoes(professor.id),
        listarIconesMissoes(),
        listarStatusMissoes(),
      ])
      if (!ativo) return

      if (alunosResult.status === 'fulfilled') setAlunos(alunosResult.value || [])
      const turmasCarregadas = turmasResult.status === 'fulfilled' ? turmasResult.value : []
      if (turmasResult.status === 'fulfilled') setTurmas(turmasCarregadas)
      if (iconesResult.status === 'fulfilled') setIconesMissoes(iconesResult.value || [])
      if (statusResult.status === 'fulfilled') {
        setStatusMissao(Object.fromEntries(statusResult.value.map(item => [`${item.missao_id}_${item.aluno_id}`, item.status])))
      }

      if (missoesResult.status === 'rejected') {
        Alert.alert('Erro', `Não foi possível carregar as missões: ${missoesResult.reason?.message || 'verifique sua conexão.'}`)
      } else {
        setMissions((missoesResult.value || []).map(m => ({
          ...m,
          name: m.name || '',
          descricao: m.descricao || '',
          turma: (m.turmaIds || []).map(id => turmasCarregadas.find(t => String(t.id) === String(id))?.nome).filter(Boolean).join(', ') || 'Nenhuma turma',
          xp: Number(m.xp) || 0,
          icon: m.icone,
          color: m.color || colors.greenLight,
          textColor: m.textColor || '#006516',
          active: m.ativa ?? true,
          progress: Number(m.progress) || 0,
        })))
      }
    }
    if (professor?.id) recarregarDados()
    else { setMissions([]); setTurmas([]); setAlunos([]) }
    return () => { ativo = false }
  }, [professor?.id, activeNav])

  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })

  // Stats dinâmicos em tempo real
  const totalXP = alunos.reduce((acc, a) => acc + a.xp, 0)
  const xpFormatado = totalXP >= 1000 ? (totalXP / 1000).toFixed(1) + 'k' : String(totalXP)
  const stats = [
    { label: 'Alunos ativos',        value: String(alunos.length),                          icon: '👥', bg: colors.greenLight  },
    { label: 'Missões abertas',      value: String(missions.filter(m => m.active).length),  icon: '🏆', bg: colors.yellowLight },
    { label: 'XP distribuído',       value: xpFormatado,                                    icon: '⭐', bg: '#f0f0f0'          },
  ]

  async function atribuirMissao(missaoId) {
    const m = missions.find(item => String(item.id) === String(missaoId))
    if (m && turmaAtribuir) await atualizarTurmaMissao(m, turmaAtribuir.id)
  }

  async function desatribuirMissao(missaoId) {
    const m = missions.find(item => String(item.id) === String(missaoId))
    if (m && turmaAtribuir) await atualizarTurmaMissao(m, turmaAtribuir.id)
  }

  function missoesDaTurma(turmaName) {
    const turma = turmas.find(t => t.nome === turmaName)
    return missions.filter(m => (m.turmaIds || []).some(id => String(id) === String(turma?.id)))
  }

  function turmaTemMissao(turma, missaoId) {
    const m = missions.find(m => m.id === missaoId)
    if (!m) return false
    return (m.turmaIds || []).some(id => String(id) === String(turma.id))
  }

  async function adicionarTurma() {
    if (!novaTurma.nome.trim()) { Alert.alert('Atenção', 'Digite o nome da turma!'); return; }
    const petSelecionado = petsDisponiveis.find(pet => String(pet.id) === String(novaTurma.petId));
    if (!petSelecionado) {
      Alert.alert('Atenção', 'Não há PET disponível para vincular. Atualize a lista ou cadastre um PET no banco.');
      return;
    }
    if (!professor?.id) {
      Alert.alert('Erro', 'Não foi possível identificar o professor conectado. Entre novamente e tente criar a turma.');
      return;
    }

    const alfabetoCodigo = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const codigo = Array.from({ length: 5 }, () =>
      alfabetoCodigo[Math.floor(Math.random() * alfabetoCodigo.length)]
    ).join('');
    const dadosNovaTurma = {
      nome: novaTurma.nome.trim(),
      codigo,
      professorId: professor.id,
      petId: petSelecionado.id,
      cor: novaTurma.cor,
    };

    try {
      const turmaSalva = await salvarTurma(dadosNovaTurma);
      const nova = {
        ...turmaSalva,
        professorId: turmaSalva.professor_id,
        petId: turmaSalva.pet.id,
        pet: turmaSalva.pet.icone,
        petNome: turmaSalva.pet.nome,
        estagio: turmaSalva.pet.estagio || 'infantil',
        xp: Number(turmaSalva.pet.xp) || 0,
        progresso: Number(turmaSalva.pet.progresso) || 0,
        emocao: turmaSalva.pet.emocao ?? null,
        cor: turmaSalva.cor || dadosNovaTurma.cor,
        cosmetico: Boolean(turmaSalva.pet.cosmetico),
      };
      setTurmas(prev => [...prev, nova]);
      setPetsDisponiveis(prev => prev.filter(pet => String(pet.id) !== String(petSelecionado.id)));
      setNovaTurma({ nome: '', petId: null, cor: colors.green, alunosNomes: '' });
      setModalTurma(false);
      Alert.alert('✅ Turma criada!', `A turma "${nova.nome}" foi salva com sucesso.`);
    } catch (error) {
      console.error('Erro ao criar turma:', error);
      Alert.alert('Erro', `Não foi possível salvar a turma: ${formatarErroSupabase(error)}`);
    }
  }

  async function confirmarRemocaoTurma(id) {
    try {
      await removerTurmaStorage(id, professor?.id);
      setTurmas(prev => prev.filter(t => t.id !== id));
    } catch (error) {
      console.error('Erro ao remover turma:', error);
      Alert.alert('Erro', `Não foi possível excluir a turma: ${formatarErroSupabase(error)}`);
    }
  }

  async function abrirModalTurma() {
    setModalTurma(true);
    setCarregandoPets(true);
    setPetsDisponiveis([]);
    setNovaTurma(prev => ({ ...prev, petId: null }));

    try {
      const disponiveis = await listarPetsDisponiveis();
      setPetsDisponiveis(disponiveis);
      setNovaTurma(prev => ({ ...prev, petId: disponiveis[0]?.id || null }));
    } catch (error) {
      console.error('Erro ao carregar PETs disponíveis:', error);
      Alert.alert('Erro', `Não foi possível carregar os PETs: ${formatarErroSupabase(error)}`);
    } finally {
      setCarregandoPets(false);
    }
  }

  function removerTurma(id) {
    if (Platform.OS === 'web') {
      if (window.confirm('Tem certeza que deseja remover esta turma?')) {
        confirmarRemocaoTurma(id);
      }
    } else {
      Alert.alert('Remover turma', 'Tem certeza?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: () => confirmarRemocaoTurma(id) }
      ])
    }
  }

  async function adicionarMissao() {
    const erros = {
      nome: novaMissao.name.trim() ? '' : 'Preencha a missão com um nome.',
      descricao: novaMissao.descricao.trim() ? '' : 'Preencha a descrição da missão.',
      turmas: novaMissao.turmaIds.length ? '' : 'Escolha pelo menos uma turma.',
      icone: novaMissao.icon ? '' : (iconesMissoes.length ? 'Escolha um ícone para a missão.' : 'Não há ícones cadastrados para escolher.'),
      dificuldade: ['facil', 'media', 'dificil'].includes(novaMissao.dificuldade) ? '' : 'Escolha uma dificuldade para a missão.',
    }
    setErrosMissao(erros)
    if (Object.values(erros).some(Boolean)) {
      return
    }
    const xpPorDificuldade = { facil: 10, media: 20, dificil: 40 }
    const dados = {
      id: missaoEditando?.id,
      nome: novaMissao.name.trim(), descricao: novaMissao.descricao.trim(),
      turmasIds: novaMissao.turmaIds,
      dificuldade: novaMissao.dificuldade, xp: xpPorDificuldade[novaMissao.dificuldade],
      icone: novaMissao.icon, ativa: missaoEditando?.active ?? true, professorId: professor.id,
    }
    try {
      const salva = await salvarMissao(dados)
      const normalizada = { ...salva, name: salva.nome || salva.name, icon: salva.icone || salva.icon, active: salva.ativa ?? salva.active, turmaIds: dados.turmasIds, turma: dados.turmasIds.map(id => turmas.find(t => String(t.id) === String(id))?.nome).filter(Boolean).join(', '), color: colors.greenLight, textColor: '#006516', progress: 0 }
      setMissions(prev => missaoEditando ? prev.map(m => String(m.id) === String(salva.id) ? { ...m, ...normalizada } : m) : [normalizada, ...prev])
      setAlunos(await listarAlunos())
      const turmasAtualizadas = await listarTurmas(professor.id)
      setTurmas(turmasAtualizadas)
    } catch (error) {
      console.error('Erro ao criar/atualizar missão:', error)
      Alert.alert('Erro', `Não foi possível salvar a missão: ${formatarErroSupabase(error)}`)
      return
    }
    const nomeMissao = dados.nome
    setNovaMissao({ name: '', descricao: '', turmaIds: [], dificuldade: null, icon: null })
    setErrosMissao({})
    setMissaoEditando(null)
    setModalMissao(false)
    Alert.alert('✅ Missão salva!', `A missão "${nomeMissao}" foi salva com sucesso.`)
  }

  function editarMissao(missao) {
    setMissaoEditando(missao)
    setNovaMissao({ name: missao.name, descricao: missao.descricao || '', turmaIds: missao.turmaIds || [], dificuldade: missao.dificuldade || (missao.xp <= 10 ? 'facil' : missao.xp <= 20 ? 'media' : 'dificil'), icon: missao.icon || null })
    setErrosMissao({})
    setModalMissao(true)
  }

  function abrirNovaMissao() {
    setMissaoEditando(null)
    setNovaMissao({ name: '', descricao: '', turmaIds: [], dificuldade: null, icon: null })
    setErrosMissao({})
    setModalMissao(true)
  }

  function atualizarCampoMissao(campo, valor) {
    setNovaMissao(prev => ({ ...prev, [campo]: valor }))
    const campoErro = campo === 'name' ? 'nome' : campo === 'turmaIds' ? 'turmas' : campo
    setErrosMissao(prev => ({ ...prev, [campoErro]: '' }))
  }

  function alternarTodasTurmasMissao() {
    const todasSelecionadas = turmas.length > 0 && turmas.every(t => novaMissao.turmaIds.some(id => String(id) === String(t.id)))
    setNovaMissao(prev => ({ ...prev, turmaIds: todasSelecionadas ? [] : turmas.map(t => t.id) }))
    setErrosMissao(prev => ({ ...prev, turmas: '' }))
  }

  async function atualizarTurmaMissao(missao, turmaId) {
    const atuais = missao.turmaIds || []
    const turmasIds = atuais.some(id => String(id) === String(turmaId))
      ? atuais.filter(id => String(id) !== String(turmaId))
      : [...atuais, turmaId]
    if (!turmasIds.length) { Alert.alert('Atenção', 'A missão precisa estar atribuída a pelo menos uma turma.'); return }
    try {
      await definirTurmasMissao(missao.id, professor.id, turmasIds)
      const nomeTurmas = turmasIds.map(id => turmas.find(t => String(t.id) === String(id))?.nome).filter(Boolean).join(', ')
      setMissions(prev => prev.map(m => m.id === missao.id ? { ...m, turmaIds, turma: nomeTurmas } : m))
    } catch (error) {
      Alert.alert('Erro', `Não foi possível atualizar a turma da missão: ${error.message || 'tente novamente.'}`)
    }
  }

  function removerMissao(id) {
    const confirmarRemocao = async () => {
      try {
        await removerMissaoStorage(id)
        setMissions(prev => prev.filter(m => m.id !== id))
        setAlunos(await listarAlunos())
        setTurmas(await listarTurmas(professor.id))
      } catch (error) {
        Alert.alert('Erro', `Não foi possível remover a missão: ${error.message || 'tente novamente.'}`)
      }
    }
    if (Platform.OS === 'web') {
      if (window.confirm('Tem certeza que deseja remover esta missão?')) {
        confirmarRemocao()
      }
    } else {
      Alert.alert('Remover missão', 'Tem certeza?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: confirmarRemocao }
      ])
    }
  }

  function alunosDaMissao(missao) {
    if (!missao) return []
    return alunos.filter(a => (missao.turmaIds || []).some(id => String(id) === String(a.turmaId)))
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

  async function salvarEditAluno() {
    if (!alunoNomeEdit.trim()) { Alert.alert('Atenção', 'Digite o nome do aluno!'); return }
    const turmaDestino = alunoTurmaEdit
    const initials = alunoNomeEdit.trim().split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
    const novos = {
      nome: alunoNomeEdit.trim(),
      initials,
      turmaId: turmaDestino?.id || null,
      cor: turmaDestino?.cor || '#888',
    }
    setAlunos(prev => prev.map(a => a.id === alunoEditando.id ? { ...a, ...novos } : a))
    await atualizarAluno(alunoEditando.id, novos)
    setModalEditAluno(false)
    setAlunoEditando(null)
  }

  function getStatusAluno(missaoId, alunoId) {
    return statusMissao[`${missaoId}_${alunoId}`] || 'pendente'
  }

  function setStatusAluno(missaoId, alunoId, status) {
    setStatusMissao(prev => ({ ...prev, [`${missaoId}_${alunoId}`]: status }))
  }

  async function ciclarStatus(missaoId, alunoId) {
    const atual = getStatusAluno(missaoId, alunoId)
    const proximo = atual === 'pendente' ? 'entregue' : atual === 'entregue' ? 'aprovado' : 'pendente'
    const missao = missions.find(m => String(m.id) === String(missaoId))
    if (proximo === 'aprovado' && !missao?.active) { Alert.alert('Missão desativada', 'Não é possível aprovar novas conclusões enquanto a missão estiver desativada.'); return }
    try {
      await atualizarStatusAlunoMissao(missaoId, alunoId, proximo)
      setStatusAluno(missaoId, alunoId, proximo)
      setAlunos(await listarAlunos())
      setTurmas(await listarTurmas(professor.id))
    } catch (error) {
      Alert.alert('Erro', `Não foi possível atualizar a conclusão: ${formatarErroSupabase(error)}`)
    }
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
    const remover = async () => {
      setAlunos(prev => prev.map(a => a.id === alunoId ? { ...a, turmaId: null } : a))
      await atualizarAluno(alunoId, { turmaId: null })
    }
    if (Platform.OS === 'web') {
      if (window.confirm('Remover aluno da turma?')) remover()
    } else {
      Alert.alert('Remover da turma', 'Tem certeza?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: remover },
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
      if (c.criterio === 'primeira_missao' && (novoHistorico[alunoXP.id] || []).length >= 1) desbloqueada = true
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
    const precisaMeta = novaConquista.criterio !== 'primeira_missao' && novaConquista.criterio !== 'missao_especifica'
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
    setNovaConquista({ nome: '', emoji: '🏆', raridade: 'Comum', xp: '', criterio: 'primeira_missao', meta: '', descricao: '', missaoAlvo: '' })
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
    if (c.criterio === 'primeira_missao') {
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

  async function toggleMissaoAtiva(id) {
    const missao = missions.find(m => m.id === id)
    if (!missao) return
    const ativa = !missao.active
    try {
      await atualizarMissao(id, { ativa })
      setMissions(prev => prev.map(m => m.id === id ? { ...m, active: ativa, ativa } : m))
    } catch (error) {
      Alert.alert('Erro', `Não foi possível atualizar a missão: ${error.message || 'tente novamente.'}`)
    }
  }

  // ─── TELA TURMAS ────────────────────────────────────────
  function renderTurmas() {
    return (
      <View style={{ gap: 14 }}>
        <View style={s.screenHeader}>
          <Text style={s.screenTitle}>👥 Turmas</Text>
          <TouchableOpacity style={s.btnNew} onPress={abrirModalTurma}>
            <Text style={s.btnNewText}>+ Nova Turma</Text>
          </TouchableOpacity>
        </View>
        {turmas.map(t => {
          const missoesDaTurmaList = missoesDaTurma(t.nome)
          return (
            <View key={t.id} style={s.panel}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[s.petAvatarSmall, { borderColor: t.cor }]}>
                  <PetImage uri={t.pet} width={42} height={42} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.turmaName}>{t.nome}</Text>
                  <Text style={s.turmaEmocao}>Código da turma: {t.codigo}</Text>
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
                        <Image source={{ uri: m.icon }} style={{ width: 22, height: 22 }} resizeMode="contain" />
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
          <TouchableOpacity style={s.btnNew} onPress={abrirNovaMissao}>
            <Text style={s.btnNewText}>+ Nova Missão</Text>
          </TouchableOpacity>
        </View>
        {missions.map(m => (
          <View key={m.id} style={[s.panel, m.active && { borderColor: colors.green, borderWidth: 2 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[s.missionIcon, { backgroundColor: m.color }]}>
                <Image source={{ uri: m.icon }} style={{ width: 30, height: 30 }} resizeMode="contain" />
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
                        onPress={() => atualizarTurmaMissao(m, t.id)}
                      >
                        <Text style={[s.turmaPillText, atribuida && s.turmaPillTextActive]}>
                          {atribuida ? '✓ ' : ''}{t.nome}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity onPress={() => editarMissao(m)} style={[s.btnToggle, { marginTop: 0, paddingHorizontal: 8, backgroundColor: colors.purpleLight }]}>
                  <Text style={[s.btnToggleText, { color: colors.purple }]}>✏️</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removerMissao(m.id)} style={s.btnRemove}>
                  <Text style={s.btnRemoveText}>🗑️</Text>
                </TouchableOpacity>
              </View>
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
    const missaoDestaque = missions.find(m => m.active)
    const progressoDestaque = missaoDestaque ? progressoRealMissao(missaoDestaque) : 0

    return (
      <>
        {missaoDestaque && (
          <View style={s.hortaBanner}>
            <View style={{ flex: 1 }}>
              <Text style={s.hortaTag}>🏆 MISSÃO ATIVA</Text>
              <Text style={s.hortaTitle}>{missaoDestaque.name}</Text>
              <Text style={s.hortaDesc}>
                {qtdAlunosMissao(missaoDestaque)} alunos participando · {missaoDestaque.turma}
              </Text>
              <View style={s.progressRow}>
                <View style={s.progressBg}>
                  <View style={[s.progressFill, { width: `${progressoDestaque}%` }]} />
                </View>
                <Text style={s.progressLabel}>{progressoDestaque}%</Text>
              </View>
            </View>
          </View>
        )}

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
                  <PetImage uri={t.pet} width={120} height={120} />
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
                <Image source={{ uri: m.icon }} style={{ width: 26, height: 26 }} resizeMode="contain" />
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

      </>
    )
  }

  return (
    <SafeAreaView style={s.safe}>

      <DashboardSidebar
        visible={menuOpen}
        activeNav={activeNav}
        professor={professor}
        onNavigate={(section) => { setActiveNav(section); setMenuOpen(false); }}
        onClose={() => setMenuOpen(false)}
        onLogout={() => { setMenuOpen(false); onLogout && onLogout(); }}
      />

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
              {carregandoPets ? (
                <Text style={s.emptySubtext}>Carregando PETs disponíveis...</Text>
              ) : petsDisponiveis.length > 0 ? (
                <View style={s.petPicker}>
                  {petsDisponiveis.map(pet => (
                    <TouchableOpacity
                      key={pet.id}
                      style={[s.petOption, String(novaTurma.petId) === String(pet.id) && s.petOptionActive]}
                      onPress={() => setNovaTurma(prev => ({ ...prev, petId: pet.id }))}
                    >
                      <Image source={{ uri: pet.icone }} style={s.petOptionImage} resizeMode="contain" />
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={s.noPetsState}>
                  <Text style={s.noPetsGhost}>👻</Text>
                  <Text style={s.emptySubtext}>Ainda não existem PETs disponíveis. Cadastre ou libere um PET no banco para criar uma turma.</Text>
                </View>
              )}

              <Text style={s.formLabel}>Cor da turma</Text>
              <View style={s.colorPicker}>
                {CORES.map(c => (
                  <TouchableOpacity key={c} style={[s.colorOption, { backgroundColor: c }, novaTurma.cor === c && s.colorOptionActive]}
                    onPress={() => setNovaTurma({ ...novaTurma, cor: c })} />
                ))}
              </View>

              <View style={s.modalBtns}>
                <TouchableOpacity style={s.btnCancel} onPress={() => setModalTurma(false)}>
                  <Text style={s.btnCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.btnConfirm, (carregandoPets || !petsDisponiveis.length || !novaTurma.petId) && s.btnConfirmDisabled]}
                  onPress={adicionarTurma}
                  disabled={carregandoPets || !petsDisponiveis.length || !novaTurma.petId}
                >
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
              <Text style={s.modalTitle}>{missaoEditando ? 'Editar Missão' : '+ Nova Missão'}</Text>

              <Text style={s.formLabel}>Nome da missão</Text>
              <TextInput style={s.formInput} placeholder="Ex: Horta Escolar..." placeholderTextColor="#aaa"
                value={novaMissao.name} onChangeText={t => atualizarCampoMissao('name', t)} />
              {!!errosMissao.nome && <Text style={s.validationError}>{errosMissao.nome}</Text>}

              <Text style={s.formLabel}>Descrição</Text>
              <TextInput style={[s.formInput, { height: 70, textAlignVertical: 'top' }]}
                placeholder="Descreva a atividade..." placeholderTextColor="#aaa" multiline
                value={novaMissao.descricao} onChangeText={t => atualizarCampoMissao('descricao', t)} />
              {!!errosMissao.descricao && <Text style={s.validationError}>{errosMissao.descricao}</Text>}

              <Text style={s.formLabel}>Turmas</Text>
              <View style={s.turmaPickerWrap}>
                <TouchableOpacity
                  style={[s.turmaPill, turmas.length > 0 && turmas.every(t => novaMissao.turmaIds.some(id => String(id) === String(t.id))) && s.turmaPillActive]}
                  onPress={alternarTodasTurmasMissao}
                  disabled={turmas.length === 0}
                >
                  <Text style={[s.turmaPillText, turmas.length > 0 && turmas.every(t => novaMissao.turmaIds.some(id => String(id) === String(t.id))) && s.turmaPillTextActive]}>
                    {turmas.length > 0 && turmas.every(t => novaMissao.turmaIds.some(id => String(id) === String(t.id))) ? '✓ ' : ''}Todas as turmas
                  </Text>
                </TouchableOpacity>
                {turmas.map(t => {
                  const selecionada = novaMissao.turmaIds.some(id => String(id) === String(t.id))
                  return <TouchableOpacity key={t.id}
                    style={[s.turmaPill, selecionada && s.turmaPillActive]}
                    onPress={() => atualizarCampoMissao('turmaIds', selecionada ? novaMissao.turmaIds.filter(id => String(id) !== String(t.id)) : [...novaMissao.turmaIds, t.id])}>
                    <Text style={[s.turmaPillText, selecionada && s.turmaPillTextActive]}>{selecionada ? '✓ ' : ''}{t.nome}</Text>
                  </TouchableOpacity>
                })}
              </View>
              {!!errosMissao.turmas && <Text style={s.validationError}>{errosMissao.turmas}</Text>}

              <Text style={s.formLabel}>Ícone da missão</Text>
              <View style={s.petPicker}>
                {iconesMissoes.map(ic => (
                  <TouchableOpacity key={ic.id} style={[s.petOption, novaMissao.icon === ic.icone && s.petOptionActive]}
                    onPress={() => { setNovaMissao(prev => ({ ...prev, icon: ic.icone })); setErrosMissao(prev => ({ ...prev, icone: '' })) }}>
                    <Image source={{ uri: ic.icone }} style={s.petOptionImage} resizeMode="contain" />
                  </TouchableOpacity>
                ))}
              </View>
              {iconesMissoes.length === 0 && <Text style={s.emptySubtext}>Ainda não há imagens de missão cadastradas no banco.</Text>}
              {!!errosMissao.icone && <Text style={s.validationError}>{errosMissao.icone}</Text>}

              <Text style={s.formLabel}>Dificuldade e XP da missão</Text>
              <View style={s.turmaPickerWrap}>
                {[['facil', 'Fácil · 10 XP'], ['media', 'Média · 20 XP'], ['dificil', 'Difícil · 40 XP']].map(([id, label]) => (
                  <TouchableOpacity key={id} style={[s.turmaPill, novaMissao.dificuldade === id && s.turmaPillActive]} onPress={() => atualizarCampoMissao('dificuldade', id)}>
                    <Text style={[s.turmaPillText, novaMissao.dificuldade === id && s.turmaPillTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {!!errosMissao.dificuldade && <Text style={s.validationError}>{errosMissao.dificuldade}</Text>}

              <Text style={s.formLabel}>Alunos participantes: {alunos.filter(a => novaMissao.turmaIds.some(id => String(id) === String(a.turmaId))).length}</Text>

              <View style={s.modalBtns}>
                <TouchableOpacity style={s.btnCancel} onPress={() => setModalMissao(false)}>
                  <Text style={s.btnCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnConfirm} onPress={adicionarMissao}>
                  <Text style={s.btnConfirmText}>{missaoEditando ? 'Salvar alterações' : 'Criar Missão'}</Text>
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <PetImage uri={t.pet} width={20} height={20} />
                    <Text style={[s.turmaPillText, alunoTurmaEdit?.id === t.id && s.turmaPillTextActive]}>{t.nome}</Text>
                  </View>
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

            {/* Designar alunos sem turma */}
            {alunos.filter(a => !a.turmaId).length > 0 && (
              <View style={{ marginBottom: 12 }}>
                <Text style={[s.formLabel, { marginBottom: 6 }]}>Designar para esta turma:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {alunos.filter(a => !a.turmaId).map(a => (
                      <TouchableOpacity
                        key={a.id}
                        style={[s.turmaPill, { borderColor: turmaAtribuir?.cor }]}
                        onPress={async () => {
                          const novos = { turmaId: turmaAtribuir.id, cor: turmaAtribuir.cor }
                          setAlunos(prev => prev.map(al => al.id === a.id ? { ...al, ...novos } : al))
                          await atualizarAluno(a.id, novos)
                        }}
                      >
                        <Text style={s.turmaPillText}>{a.nome}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

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
                <Image source={{ uri: m.icon }} style={{ width: 26, height: 26 }} resizeMode="contain" />
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

              {novaConquista.criterio !== 'primeira_missao' && novaConquista.criterio !== 'missao_especifica' && (
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
                    {conquistaSelecionada.criterio !== 'primeira_missao' && conquistaSelecionada.criterio !== 'missao_especifica' ? ` (meta: ${conquistaSelecionada.meta})` : ''}
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
        {activeNav === 'conquistas' && (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>🎖️</Text>
            <Text style={s.emptyText}>Conquistas sem dados cadastrados.</Text>
            <Text style={s.emptySubtext}>Esta área será exibida quando houver conquistas salvas no Supabase.</Text>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function formatarErroSupabase(error) {
  const mensagem = error?.message || 'tente novamente.';
  const detalhe = error?.details || error?.hint;
  return detalhe ? `${mensagem} (${detalhe})` : mensagem;
}

function PetImage({ uri, width, height }) {
  const [imagemFalhou, setImagemFalhou] = useState(false);

  useEffect(() => setImagemFalhou(false), [uri]);

  if (!uri || imagemFalhou) {
    return <Text style={{ fontSize: Math.min(width, height) * 0.65 }}>🐾</Text>;
  }

  return (
    <Image
      source={{ uri }}
      style={{ width, height }}
      resizeMode="contain"
      onError={() => setImagemFalhou(true)}
    />
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: colors.cream },
  main:        { flex: 1 },
  mainContent: { padding: 14, gap: 14 },
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
  validationError:{ fontSize: 12, fontFamily: fonts.semibold, color: '#c62828', marginTop: -7 },
  formInput:    { borderWidth: 1.5, borderColor: colors.border, borderRadius: 8, padding: 11, fontSize: 14, fontFamily: fonts.regular, color: colors.dark, backgroundColor: colors.cream },
  petPicker:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  petOption:    { width: 44, height: 44, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream },
  petOptionImage:{ width: 36, height: 36 },
  petOptionActive:{ borderColor: colors.green, backgroundColor: colors.greenLight },
  noPetsState:  { alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  noPetsGhost:  { fontSize: 32 },
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
  btnConfirmDisabled:{ opacity: 0.5 },
  btnConfirmText:{ fontSize: 14, fontFamily: fonts.semibold, color: '#fff' },

  // Empty state
  emptyState:  { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyIcon:   { fontSize: 48 },
  emptyText:   { fontSize: 16, fontFamily: fonts.bold, color: colors.dark },
  emptySubtext:{ fontSize: 13, fontFamily: fonts.regular, color: colors.muted, textAlign: 'center' },
})
