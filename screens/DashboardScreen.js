import { useState, useEffect } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  StyleSheet, Modal, Dimensions, TextInput, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';
import { listarAlunos, atualizarAluno, listarTurmas, listarPetsParaTurma, salvarTurma, removerTurmaStorage, listarMissoes, listarIconesMissoes, listarStatusMissoes, salvarMissao, atualizarMissao, definirTurmasMissao, definirAtivaMissaoTurma, removerMissaoDaTurma as removerMissaoDaTurmaStorage, atualizarStatusAlunoMissao, removerMissaoStorage } from '../services/storage';
import { CORES, MEDALS, RARIDADE_CONFIG, CRITERIOS } from './dashboardConfig';
import DashboardSidebar from './DashboardSidebar';

const { width } = Dimensions.get('window');


export default function DashboardScreen({ professor, onLogout }) {
  const isCoordenador = professor?.tipo === 'coordenador'
  const [activeNav, setActiveNav]     = useState('overview')
  const [menuOpen, setMenuOpen]       = useState(false)
  const [turmas, setTurmas]           = useState([])
  const [petsParaTurma, setPetsParaTurma] = useState([])
  const [carregandoPets, setCarregandoPets] = useState(false)
  const [missions, setMissions]       = useState([])
  const [alunos, setAlunos]           = useState([])
  const [conquistas, setConquistas]   = useState([])

  // Modal de criar turma
  const [modalTurma, setModalTurma]   = useState(false)
  const [novaTurma, setNovaTurma]     = useState({ nome: '', petId: null, cor: colors.green })
  const [errosTurma, setErrosTurma] = useState({})

  // Modal de criar missão
  const [modalMissao, setModalMissao] = useState(false)
  const [novaMissao, setNovaMissao]   = useState({ name: '', descricao: '', turmaIds: [], dificuldade: null, icon: null })
  const [errosMissao, setErrosMissao] = useState({})
  const [iconesMissoes, setIconesMissoes] = useState([])
  const [missaoEditando, setMissaoEditando] = useState(null)

  // Modal de atribuir missão à turma
  const [modalAtribuir, setModalAtribuir] = useState(false)
  const [turmaAtribuir, setTurmaAtribuir] = useState(null)
  const [confirmacaoMissao, setConfirmacaoMissao] = useState(null)
  const [missaoEmAcao, setMissaoEmAcao] = useState(false)

  // Modal de alunos da turma
  const [modalAlunosTurma, setModalAlunosTurma] = useState(false)
  const [modalResumoTurma, setModalResumoTurma] = useState(false)
  const [abaDetalhesTurma, setAbaDetalhesTurma] = useState('resumo')
  const [filtroTarefasTurma, setFiltroTarefasTurma] = useState('todas')

  // Modal de alunos da missão
  const [modalAlunos, setModalAlunos]   = useState(false)
  const [missaoAlunos, setMissaoAlunos] = useState(null)

  // Modal de dar XP
  const [modalXP, setModalXP]     = useState(false)
  const [alunoXP, setAlunoXP]     = useState(null)
  const [xpValor, setXpValor]     = useState('')
  const [erroXP, setErroXP] = useState('')

  // Modal de editar aluno
  const [modalEditAluno, setModalEditAluno] = useState(false)
  const [alunoEditando, setAlunoEditando]   = useState(null)
  const [alunoNomeEdit, setAlunoNomeEdit]   = useState('')
  const [erroAlunoEdit, setErroAlunoEdit] = useState('')

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
  const [errosConquista, setErrosConquista] = useState({})
  const [modalDetConquista, setModalDetConquista] = useState(false)
  const [conquistaSelecionada, setConquistaSelecionada] = useState(null)

  // Busca de aluno
  const [buscaAluno, setBuscaAluno] = useState('')

  useEffect(() => {
    let ativo = true
    async function recarregarDados() {
      const [alunosResult, turmasResult, missoesResult, iconesResult, statusResult] = await Promise.allSettled([
        listarAlunos(),
        listarTurmas(professor.id, isCoordenador),
        listarMissoes(professor.id, isCoordenador),
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
  }, [professor?.id, isCoordenador, activeNav])

  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })

  // Stats dinâmicos em tempo real
  const totalXP = alunos.reduce((acc, a) => acc + a.xp, 0)
  const xpFormatado = totalXP >= 1000 ? (totalXP / 1000).toFixed(1) + 'k' : String(totalXP)
  const stats = [
    { label: 'Alunos ativos',        value: String(alunos.length),                          icon: '👥', bg: colors.greenLight  },
    { label: 'Tarefas ativas nas turmas', value: String(missions.reduce((total, m) => total + (m.turmaIds || []).filter(id => {
      const turma = turmas.find(item => String(item.id) === String(id))
      return turma && missaoAtivaNaTurma(m, turma)
    }).length, 0)), icon: '🏆', bg: colors.yellowLight },
    { label: 'XP distribuído',       value: xpFormatado,                                    icon: '⭐', bg: '#f0f0f0'          },
  ]

  function atribuirMissao(missaoId) {
    const m = missions.find(item => String(item.id) === String(missaoId))
    if (isCoordenador && m && turmaAtribuir && String(m.professorId) === String(turmaAtribuir.professorId)) solicitarVinculoMissao(m, turmaAtribuir)
  }

  function missoesDaTurma(turma) {
    return missions.filter(m => (m.turmaIds || []).some(id => String(id) === String(turma?.id)))
  }

  function alunosDaTurma(turma) {
    return turma ? alunos.filter(a => String(a.turmaId) === String(turma.id)) : []
  }

  function abrirResumoTurma(turma, aba = 'resumo') {
    setTurmaAtribuir(turma)
    setAbaDetalhesTurma(aba)
    setFiltroTarefasTurma('todas')
    setModalResumoTurma(true)
  }

  function turmaTemMissao(turma, missaoId) {
    const m = missions.find(m => String(m.id) === String(missaoId))
    if (!m) return false
    return (m.turmaIds || []).some(id => String(id) === String(turma.id))
  }

  function missaoAtivaNaTurma(missao, turma) {
    if (!missao || !turma) return false
    return missao.turmaAtivas?.[String(turma.id)] ?? true
  }

  function solicitarVinculoMissao(missao, turma) {
    const jaVinculada = turmaTemMissao(turma, missao.id)
    if (jaVinculada) return
    setConfirmacaoMissao({
      titulo: 'Atribuir tarefa à turma?',
      mensagem: `“${missao.name}” será adicionada a “${turma.nome}”. Os alunos dessa turma poderão enviar a tarefa enquanto ela estiver ativa.`,
      textoConfirmar: 'Atribuir tarefa',
      onConfirmar: () => atualizarTurmaMissao(missao, turma.id),
    })
  }

  async function atualizarTurmaMissao(missao, turmaId) {
    if (missaoEmAcao) return
    const atuais = missao.turmaIds || []
    if (atuais.some(id => String(id) === String(turmaId))) return
    const turmasIds = [...atuais, turmaId]
    setMissaoEmAcao(true)
    try {
      await definirTurmasMissao(missao.id, missao.professorId || professor.id, turmasIds)
      const nomeTurmas = turmasIds.map(id => turmas.find(t => String(t.id) === String(id))?.nome).filter(Boolean).join(', ')
      setMissions(prev => prev.map(m => String(m.id) === String(missao.id)
        ? { ...m, turmaIds: turmasIds, turma: nomeTurmas, turmaAtivas: { ...(m.turmaAtivas || {}), [String(turmaId)]: true } }
        : m))
    } catch (error) {
      console.error('Erro ao atualizar turmas da missão:', error)
      Alert.alert('Erro', `Não foi possível atualizar as turmas da missão: ${formatarErroSupabase(error)}`)
    } finally {
      setMissaoEmAcao(false)
    }
  }

  function solicitarRemocaoMissaoTurma(missao, turma) {
    const ativaNestaTurma = missaoAtivaNaTurma(missao, turma)
    setConfirmacaoMissao({
      titulo: 'Remover tarefa desta turma?',
      mensagem: `Ao remover “${missao.name}” de “${turma.nome}”, todos os alunos dessa turma que concluíram a tarefa perderão o XP recebido por ela. O progresso será apagado e ninguém poderá enviar essa tarefa nessa turma. As outras turmas não serão alteradas.${ativaNestaTurma ? ' Se quiser mantê-la vinculada, mas impedir novos envios sem retirar XP, escolha “Desativar e manter XP”.' : ''}`,
      textoConfirmar: 'Remover e estornar XP',
      textoAlternativo: ativaNestaTurma ? 'Desativar e manter XP' : undefined,
      perigoso: true,
      onConfirmar: () => executarRemocaoMissaoTurma(missao, turma),
      onAlternativo: ativaNestaTurma ? () => salvarAtivacaoMissaoTurma(missao, turma, false) : undefined,
    })
  }

  async function executarRemocaoMissaoTurma(missao, turma) {
    if (missaoEmAcao) return
    setMissaoEmAcao(true)
    try {
      await removerMissaoDaTurmaStorage(missao.id, missao.professorId || professor.id, turma.id)
      const turmaIds = (missao.turmaIds || []).filter(id => String(id) !== String(turma.id))
      const turmaAtivas = { ...(missao.turmaAtivas || {}) }
      delete turmaAtivas[String(turma.id)]
      const nomeTurmas = turmaIds.map(id => turmas.find(t => String(t.id) === String(id))?.nome).filter(Boolean).join(', ')
      setMissions(prev => prev.map(item => String(item.id) === String(missao.id) ? { ...item, turmaIds, turmaAtivas, turma: nomeTurmas || 'Nenhuma turma' } : item))
      const resultados = await Promise.allSettled([
        listarAlunos(), listarTurmas(professor.id, isCoordenador), listarStatusMissoes(),
      ])
      if (resultados[0].status === 'fulfilled') setAlunos(resultados[0].value || [])
      if (resultados[1].status === 'fulfilled') setTurmas(resultados[1].value || [])
      if (resultados[2].status === 'fulfilled') setStatusMissao(Object.fromEntries((resultados[2].value || []).map(item => [`${item.missao_id}_${item.aluno_id}`, item.status])))
    } catch (error) {
      Alert.alert('Erro', `Não foi possível remover a tarefa da turma: ${formatarErroSupabase(error)}`)
    } finally {
      setMissaoEmAcao(false)
    }
  }

  function solicitarAlteracaoAtivaMissaoTurma(missao, turma) {
    const ativa = !missaoAtivaNaTurma(missao, turma)
    setConfirmacaoMissao({
      titulo: ativa ? 'Ativar tarefa nesta turma?' : 'Desativar tarefa nesta turma?',
      mensagem: ativa
        ? `“${missao.name}” ficará disponível novamente para os alunos de “${turma.nome}”.`
        : `Em “${turma.nome}”, os alunos que já concluíram “${missao.name}” manterão o XP. Quem ainda não concluiu não poderá enviá-la enquanto estiver desativada. A tarefa continuará vinculada à turma e poderá ser reativada depois.`,
      textoConfirmar: ativa ? 'Ativar tarefa' : 'Desativar e manter XP',
      onConfirmar: () => salvarAtivacaoMissaoTurma(missao, turma, ativa),
    })
  }

  async function salvarAtivacaoMissaoTurma(missao, turma, ativa) {
    if (missaoEmAcao) return
    setMissaoEmAcao(true)
    try {
      await definirAtivaMissaoTurma(missao.id, missao.professorId || professor.id, turma.id, ativa)
      setMissions(prev => prev.map(item => String(item.id) === String(missao.id)
        ? { ...item, turmaAtivas: { ...(item.turmaAtivas || {}), [String(turma.id)]: ativa } }
        : item))
    } catch (error) {
      Alert.alert('Erro', `Não foi possível ${ativa ? 'ativar' : 'desativar'} a tarefa: ${formatarErroSupabase(error)}`)
    } finally {
      setMissaoEmAcao(false)
    }
  }

  async function adicionarTurma() {
    const petSelecionado = petsParaTurma.find(pet => String(pet.id) === String(novaTurma.petId) && pet.disponivel);
    const novosErros = {
      nome: novaTurma.nome.trim() ? '' : 'Preencha o nome da turma.',
      pet: petSelecionado ? '' : petsParaTurma.some(pet => pet.disponivel)
        ? 'Escolha um PET disponível para vincular à turma.'
        : 'Não há PET disponível. Cadastre ou libere um PET antes de criar a turma.',
    };
    setErrosTurma(novosErros);
    if (Object.values(novosErros).some(Boolean)) return;
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
      setPetsParaTurma(prev => prev.map(pet => String(pet.id) === String(petSelecionado.id)
        ? { ...pet, turma_id: turmaSalva.id, turmaNome: nova.nome, disponivel: false }
        : pet));
      setNovaTurma({ nome: '', petId: null, cor: colors.green });
      setErrosTurma({});
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
      setModalResumoTurma(false);
    } catch (error) {
      console.error('Erro ao remover turma:', error);
      Alert.alert('Erro', `Não foi possível excluir a turma: ${formatarErroSupabase(error)}`);
    }
  }

  async function abrirModalTurma() {
    setModalTurma(true);
    setCarregandoPets(true);
    setErrosTurma({});
    setPetsParaTurma([]);
    setNovaTurma(prev => ({ ...prev, petId: null }));

    try {
      const pets = await listarPetsParaTurma();
      setPetsParaTurma(pets);
      const primeiroDisponivel = pets.find(pet => pet.disponivel);
      setNovaTurma(prev => ({ ...prev, petId: primeiroDisponivel?.id || null }));
    } catch (error) {
      console.error('Erro ao carregar PETs disponíveis:', error);
      Alert.alert('Erro', `Não foi possível carregar os PETs: ${formatarErroSupabase(error)}`);
    } finally {
      setCarregandoPets(false);
    }
  }

  function avisarPetJaEscolhido(pet) {
    const nomeTurma = pet.turmaNome || `Turma ${pet.turma_id}`;
    const mensagem = `Este PET já foi escolhido pela turma "${nomeTurma}".`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(mensagem);
      return;
    }
    Alert.alert('PET indisponível', mensagem);
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

  async function adicionarMissao(confirmada = false) {
    const erros = {
      nome: novaMissao.name.trim() ? '' : 'Preencha a missão com um nome.',
      descricao: novaMissao.descricao.trim() ? '' : 'Preencha a descrição da missão.',
      turmas: (missaoEditando || novaMissao.turmaIds.length) ? '' : 'Escolha pelo menos uma turma.',
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
    if (!confirmada) {
      const nomesTurmas = dados.turmasIds.map(id => turmas.find(t => String(t.id) === String(id))?.nome).filter(Boolean).join(', ')
      const turmasAntes = missaoEditando?.turmaIds || []
      const novasTurmas = dados.turmasIds.filter(id => !turmasAntes.some(anterior => String(anterior) === String(id)))
      const turmasRemovidas = turmasAntes.filter(id => !dados.turmasIds.some(novo => String(novo) === String(id)))
      const nomeNovasTurmas = novasTurmas.map(id => turmas.find(t => String(t.id) === String(id))?.nome).filter(Boolean).join(', ')
      const nomeTurmasRemovidas = turmasRemovidas.map(id => turmas.find(t => String(t.id) === String(id))?.nome).filter(Boolean).join(', ')
      const resumoVinculos = !missaoEditando
        ? `A nova missão será vinculada a: ${nomesTurmas}.`
        : novasTurmas.length || turmasRemovidas.length
          ? `Turmas que receberão a missão: ${nomeNovasTurmas || 'nenhuma'}. Turmas das quais será removida: ${nomeTurmasRemovidas || 'nenhuma'}. O XP já ganho continua com os alunos ao remover apenas o vínculo.`
          : `A missão continuará vinculada a: ${nomesTurmas}.`
      setConfirmacaoMissao({
        titulo: missaoEditando ? 'Confirmar alterações?' : 'Criar missão?',
        mensagem: `${resumoVinculos}\n\n${missaoEditando ? 'Salvar as alterações da missão' : 'Criar a missão'} “${dados.nome}” valendo ${dados.xp} XP? Conclusões já aprovadas serão ajustadas para esse valor.`,
        textoConfirmar: missaoEditando ? 'Salvar alterações' : 'Criar missão',
        onConfirmar: () => adicionarMissao(true),
      })
      return
    }
    try {
      const salva = await salvarMissao(dados)
      const turmaIdsSalvas = salva.turmaIds || dados.turmasIds
      const normalizada = { ...salva, name: salva.nome || salva.name, icon: salva.icone || salva.icon, active: salva.ativa ?? salva.active, turmaIds: turmaIdsSalvas, turmaAtivas: salva.turmaAtivas || {}, turma: turmaIdsSalvas.map(id => turmas.find(t => String(t.id) === String(id))?.nome).filter(Boolean).join(', '), color: colors.greenLight, textColor: '#006516', progress: 0 }
      setMissions(prev => missaoEditando ? prev.map(m => String(m.id) === String(salva.id) ? { ...m, ...normalizada } : m) : [normalizada, ...prev])
      setAlunos(await listarAlunos())
      const turmasAtualizadas = await listarTurmas(professor.id, isCoordenador)
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

  async function executarExclusaoMissao(id) {
    try {
      await removerMissaoStorage(id)
      setMissions(prev => prev.filter(m => String(m.id) !== String(id)))
      setStatusMissao(prev => Object.fromEntries(Object.entries(prev).filter(([key]) => !key.startsWith(`${id}_`))))
      setAlunos(await listarAlunos())
      setTurmas(await listarTurmas(professor.id, isCoordenador))
    } catch (error) {
      Alert.alert('Erro', `Não foi possível remover a missão: ${formatarErroSupabase(error)}`)
    }
  }

  function removerMissao(id) {
    const missao = missions.find(item => String(item.id) === String(id))
    if (!missao) return
    setConfirmacaoMissao({
      titulo: 'Excluir missão de todas as turmas?',
      mensagem: `Ao excluir “${missao.name}” do sistema, todos os alunos de todas as turmas vinculadas perderão o XP recebido por ela. Para afetar apenas uma turma, cancele e use a aba Tarefas dentro das especificações daquela turma.`,
      textoConfirmar: 'Excluir e estornar todo o XP',
      perigoso: true,
      onConfirmar: () => executarExclusaoMissao(id),
    })
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
    setErroAlunoEdit('')
    setModalEditAluno(true)
  }

  async function salvarEditAluno() {
    if (!alunoNomeEdit.trim()) { setErroAlunoEdit('Preencha o nome do aluno.'); return }
    const initials = alunoNomeEdit.trim().split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
    const novos = {
      nome: alunoNomeEdit.trim(),
      initials,
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
    if (!isCoordenador) return
    const atual = getStatusAluno(missaoId, alunoId)
    const proximo = atual === 'pendente' ? 'entregue' : atual === 'entregue' ? 'aprovado' : 'pendente'
    const missao = missions.find(m => String(m.id) === String(missaoId))
    const aluno = alunos.find(item => String(item.id) === String(alunoId))
    const turmaAluno = turmas.find(item => String(item.id) === String(aluno?.turmaId))
    const ativaNestaTurma = missao && turmaAluno && missaoAtivaNaTurma(missao, turmaAluno)
    if (!ativaNestaTurma && (proximo !== 'pendente' || atual === 'aprovado')) {
      Alert.alert('Tarefa desativada', 'Nesta turma não é possível enviar, aprovar ou alterar o progresso da tarefa. O XP aprovado permanece como está.');
      return
    }
    try {
      await atualizarStatusAlunoMissao(missaoId, alunoId, proximo)
      setStatusAluno(missaoId, alunoId, proximo)
      setAlunos(await listarAlunos())
      setTurmas(await listarTurmas(professor.id, isCoordenador))
    } catch (error) {
      Alert.alert('Erro', `Não foi possível atualizar a conclusão: ${formatarErroSupabase(error)}`)
    }
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
    if (!val || val <= 0) { setErroXP('Preencha uma quantidade de XP válida, maior que zero.'); return }
    setErroXP('')

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
    const precisaMeta = novaConquista.criterio !== 'primeira_missao' && novaConquista.criterio !== 'missao_especifica'
    const xpTexto = novaConquista.xp.trim()
    const novosErros = {
      nome: novaConquista.nome.trim() ? '' : 'Preencha o nome da conquista.',
      descricao: novaConquista.descricao.trim() ? '' : 'Preencha a descrição da conquista.',
      xp: xpTexto !== '' && Number.isInteger(Number(xpTexto)) && Number(xpTexto) >= 0 ? '' : 'Preencha um valor inteiro de XP igual ou maior que zero.',
      meta: !precisaMeta || (novaConquista.meta.trim() !== '' && Number.isFinite(Number(novaConquista.meta)) && Number(novaConquista.meta) > 0) ? '' : 'Preencha uma meta numérica maior que zero.',
      missaoAlvo: novaConquista.criterio !== 'missao_especifica' || novaConquista.missaoAlvo ? '' : 'Escolha uma missão alvo.',
    }
    setErrosConquista(novosErros)
    if (Object.values(novosErros).some(Boolean)) return
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
    setErrosConquista({})
    setModalConquista(false)
    Alert.alert('✅ Conquista criada!', `"${nova.nome}" foi adicionada.`)
  }

  function atualizarCampoConquista(campo, valor) {
    setNovaConquista(prev => ({ ...prev, [campo]: valor }))
    setErrosConquista(prev => ({ ...prev, [campo]: '' }))
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

  // ─── TELA TURMAS ────────────────────────────────────────
  function renderTurmas() {
    return (
      <View style={{ gap: 14 }}>
        <View style={s.screenHeader}>
          <Text style={s.screenTitle}>👥 Turmas</Text>
          {!isCoordenador && <TouchableOpacity style={s.btnNew} onPress={abrirModalTurma}>
            <Text style={s.btnNewText}>+ Nova Turma</Text>
          </TouchableOpacity>}
        </View>
        {turmas.map(t => {
          const missoesDaTurmaList = missoesDaTurma(t)
          const missoesAtivas = missoesDaTurmaList.filter(m => missaoAtivaNaTurma(m, t))
          const missoesDesativadas = missoesDaTurmaList.length - missoesAtivas.length
          const alunosTurma = alunosDaTurma(t)
          return (
            <View key={t.id} style={s.panel}>
              <TouchableOpacity activeOpacity={0.8} onPress={() => abrirResumoTurma(t)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={[s.petAvatarSmall, { borderColor: t.cor }]}>
                    <PetImage uri={t.pet} width={42} height={42} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.turmaName}>{t.nome}</Text>
                    <Text style={s.turmaEstagio}>{alunosTurma.length} aluno(s) · {missoesAtivas.length} tarefa(s) ativa(s){missoesDesativadas ? ` · ${missoesDesativadas} desativada(s)` : ''}</Text>
                    <Text style={[s.turmaEstagio, { color: t.cor }]}>{t.estagio} · PET com {Number(t.xp) || 0} XP</Text>
                    <Text style={s.turmaEmocao}>{t.emocao || 'Sem emoção definida'} · {Number(t.progresso) || 0}% de progresso do PET</Text>
                  </View>
                  <TouchableOpacity onPress={(event) => { event.stopPropagation?.(); abrirResumoTurma(t, 'informacoes') }} style={[s.btnToggle, { marginTop: 0, padding: 7, backgroundColor: colors.cream }]} accessibilityLabel={`Informações da turma ${t.nome}`}>
                    <Text style={{ fontSize: 17, color: colors.dark, fontFamily: fonts.bold }}>ⓘ</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
              <View style={[s.petXpBgFull, { marginTop: 10 }]}>
                <View style={[s.petXpFillFull, { width: `${Math.max(0, Math.min(100, Number(t.progresso) || 0))}%`, backgroundColor: t.cor }]} />
              </View>

              {/* Alunos da turma */}
              <View style={{ marginTop: 12, gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={s.formLabel}>
                    Alunos ({alunosTurma.length})
                  </Text>
                  <TouchableOpacity
                    style={[s.btnNew, { paddingVertical: 5, paddingHorizontal: 10, backgroundColor: colors.purple }]}
                    onPress={() => { setTurmaAtribuir(t); setModalAlunosTurma(true) }}
                  >
                    <Text style={[s.btnNewText, { fontSize: 11 }]}>👤 Listar alunos</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Gerenciamento das tarefas fica nas especificações da turma */}
              <View style={{ marginTop: 12, gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={s.formLabel}>Tarefas ({missoesDaTurmaList.length})</Text>
                  <TouchableOpacity
                    style={[s.btnNew, { paddingVertical: 5, paddingHorizontal: 10 }]}
                    onPress={() => abrirResumoTurma(t, 'tarefas')}
                  >
                    <Text style={[s.btnNewText, { fontSize: 11 }]}>Gerenciar tarefas</Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ fontSize: 12, color: colors.muted, fontFamily: fonts.regular }}>{missoesAtivas.length} ativa(s) · {missoesDesativadas} desativada(s)</Text>
              </View>
            </View>
          )
        })}
        {turmas.length === 0 && (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>👥</Text>
            <Text style={s.emptyText}>Nenhuma turma cadastrada.</Text>
            <Text style={s.emptySubtext}>{isCoordenador ? 'As turmas aparecerão aqui para acompanhamento.' : 'Clique em "+ Nova Turma" para começar.'}</Text>
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
          <Text style={s.screenTitle}>🏆 Tarefas</Text>
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
                <Text style={s.missionMeta}>{(m.turmaIds || []).length} turma(s) · {qtdAlunosMissao(m)} alunos · +{m.xp} XP</Text>
                {/* As ações de vínculo e ativação ficam nas especificações da turma. */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                  {(m.turmaIds || []).map(id => {
                    const t = turmas.find(item => String(item.id) === String(id))
                    if (!t) return null
                    const atribuida = turmaTemMissao(t, m.id)
                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={[s.turmaPill, atribuida && s.turmaPillActive, { paddingVertical: 3 }]}
                        onPress={() => abrirResumoTurma(t, 'tarefas')}
                      >
                        <Text style={[s.turmaPillText, atribuida && s.turmaPillTextActive]}>
                          {atribuida ? (missaoAtivaNaTurma(m, t) ? '✓ ' : 'Ⅱ ') : ''}{t.nome}{atribuida && !missaoAtivaNaTurma(m, t) ? ' · desativada' : ''}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                  {(m.turmaIds || []).length === 0 && <Text style={s.missionMeta}>Sem turma vinculada. Atribua pela aba Tarefas de uma turma.</Text>}
                </View>
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

            <Text style={[s.missionMeta, { marginTop: 8 }]}>{isCoordenador ? 'Para gerenciar esta tarefa, abra a turma correspondente.' : 'Acompanhamento disponível para consulta. As alterações são feitas pela coordenação.'}</Text>
          </View>
        ))}
        {missions.length === 0 && (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>🏆</Text>
                <Text style={s.emptyText}>Nenhuma tarefa cadastrada.</Text>
            <Text style={s.emptySubtext}>As tarefas cadastradas aparecerão aqui.</Text>
          </View>
        )}
      </View>
    )
  }

  // ─── TELA OVERVIEW ──────────────────────────────────────
  function renderOverview() {
    const missaoDestaque = missions.find(m => m.active && (m.turmaIds || []).some(id => {
      const turma = turmas.find(item => String(item.id) === String(id))
      return turma && missaoAtivaNaTurma(m, turma)
    }))
    const progressoDestaque = missaoDestaque ? progressoRealMissao(missaoDestaque) : 0

    return (
      <>
        {missaoDestaque && (
          <View style={s.hortaBanner}>
            <View style={{ flex: 1 }}>
              <Text style={s.hortaTag}>🏆 TAREFA ATIVA</Text>
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
            <Text style={s.panelTitle}>Tarefas recentes</Text>
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
                value={novaTurma.nome} onChangeText={t => { setNovaTurma(prev => ({ ...prev, nome: t })); setErrosTurma(prev => ({ ...prev, nome: '' })) }} />
              {!!errosTurma.nome && <Text style={s.validationError}>{errosTurma.nome}</Text>}

              <Text style={s.formLabel}>Escolha o pet</Text>
              {carregandoPets ? (
                <Text style={s.emptySubtext}>Carregando PETs disponíveis...</Text>
              ) : petsParaTurma.length > 0 ? (
                <View style={s.petPicker}>
                  {petsParaTurma.map(pet => (
                    <TouchableOpacity
                      key={pet.id}
                      style={[
                        s.petOption,
                        !pet.disponivel && s.petOptionUnavailable,
                        pet.disponivel && String(novaTurma.petId) === String(pet.id) && s.petOptionActive,
                      ]}
                        onPress={() => {
                          if (pet.disponivel) {
                            setNovaTurma(prev => ({ ...prev, petId: pet.id }))
                            setErrosTurma(prev => ({ ...prev, pet: '' }))
                          } else avisarPetJaEscolhido(pet)
                        }}
                      accessibilityLabel={pet.disponivel ? pet.nome : `${pet.nome}, já vinculado à turma ${pet.turmaNome}`}
                    >
                      <Image
                        source={{ uri: pet.icone }}
                        style={[
                          s.petOptionImage,
                          !pet.disponivel && (Platform.OS === 'web' ? s.petOptionImageGrayScale : s.petOptionImageGrayTint),
                        ]}
                        resizeMode="contain"
                      />
                    </TouchableOpacity>
                  ))}
                  <Text style={s.petPickerHint}>PETs em preto e branco já pertencem a outra turma. Toque para ver qual.</Text>
                  {!!errosTurma.pet && <Text style={s.validationError}>{errosTurma.pet}</Text>}
                </View>
              ) : (
                <View style={s.noPetsState}>
                  <Text style={s.noPetsGhost}>👻</Text>
                  <Text style={s.emptySubtext}>Ainda não existem PETs disponíveis. Cadastre ou libere um PET no banco para criar uma turma.</Text>
                  {!!errosTurma.pet && <Text style={s.validationError}>{errosTurma.pet}</Text>}
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
                  style={[s.btnConfirm, carregandoPets && s.btnConfirmDisabled]}
                  onPress={adicionarTurma}
                  disabled={carregandoPets}
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

              {missaoEditando ? (
                <Text style={s.missionMeta}>As turmas desta tarefa são gerenciadas na aba Tarefas dentro das especificações de cada turma.</Text>
              ) : (
                <>
                  <Text style={s.formLabel}>Turmas iniciais</Text>
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
                </>
              )}

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
              onChangeText={valor => { setAlunoNomeEdit(valor); setErroAlunoEdit('') }}
            />
            {!!erroAlunoEdit && <Text style={s.validationError}>{erroAlunoEdit}</Text>}

            <Text style={s.missionMeta}>A turma do aluno não pode ser alterada por aqui. O vínculo é feito pelo código da turma.</Text>

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

      {/* ── Resumo e informações da turma ── */}
      <Modal visible={modalResumoTurma} transparent animationType="slide" onRequestClose={() => setModalResumoTurma(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { maxHeight: '90%' }]}>
            {turmaAtribuir && (() => {
              const turmaAlunos = alunosDaTurma(turmaAtribuir)
              const turmaMissoes = missoesDaTurma(turmaAtribuir)
              const turmaMissoesAtivas = turmaMissoes.filter(m => missaoAtivaNaTurma(m, turmaAtribuir))
              const turmaMissoesDesativadas = turmaMissoes.filter(m => !missaoAtivaNaTurma(m, turmaAtribuir))
              const turmaMissoesVisiveis = filtroTarefasTurma === 'ativas'
                ? turmaMissoesAtivas
                : filtroTarefasTurma === 'inativas' ? turmaMissoesDesativadas : turmaMissoes
              const xpTotalAlunos = turmaAlunos.reduce((total, aluno) => total + (Number(aluno.xp) || 0), 0)
              const mediaXP = turmaAlunos.length ? Math.round(xpTotalAlunos / turmaAlunos.length) : 0
              const totalConclusoes = turmaMissoes.reduce((total, missao) => total + turmaAlunos.filter(aluno => getStatusAluno(missao.id, aluno.id) === 'aprovado').length, 0)
              const totalPossivel = turmaMissoes.length * turmaAlunos.length
              const progressoMissoes = totalPossivel ? Math.round(totalConclusoes / totalPossivel * 100) : 0
              return <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[s.petAvatarSmall, { borderColor: turmaAtribuir.cor }]}><PetImage uri={turmaAtribuir.pet} width={42} height={42} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.modalTitle}>{turmaAtribuir.nome}</Text>
                    <Text style={s.missionMeta}>{turmaAlunos.length} alunos · {turmaMissoes.length} missões</Text>
                  </View>
                  <TouchableOpacity onPress={() => setModalResumoTurma(false)} style={s.btnRemove} accessibilityLabel="Fechar">
                    <Text style={{ fontSize: 20, color: colors.muted }}>×</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={() => setAbaDetalhesTurma('resumo')} style={[s.turmaPill, { flex: 1, alignItems: 'center' }, abaDetalhesTurma === 'resumo' && s.turmaPillActive]}>
                    <Text style={[s.turmaPillText, abaDetalhesTurma === 'resumo' && s.turmaPillTextActive]}>Resumo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setAbaDetalhesTurma('tarefas')} style={[s.turmaPill, { flex: 1, alignItems: 'center' }, abaDetalhesTurma === 'tarefas' && s.turmaPillActive]}>
                    <Text style={[s.turmaPillText, abaDetalhesTurma === 'tarefas' && s.turmaPillTextActive]}>Tarefas</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setAbaDetalhesTurma('informacoes')} style={[s.turmaPill, { flex: 1, alignItems: 'center' }, abaDetalhesTurma === 'informacoes' && s.turmaPillActive]}>
                    <Text style={[s.turmaPillText, abaDetalhesTurma === 'informacoes' && s.turmaPillTextActive]}>ⓘ Info</Text>
                  </TouchableOpacity>
                </View>

                {abaDetalhesTurma === 'informacoes' ? (
                  <ScrollView>
                    <Text style={s.formLabel}>Código para entrada dos alunos</Text>
                    <View style={[s.statCard, { marginTop: 6, marginBottom: 12 }]}>
                      <Text selectable style={[s.statNum, { fontSize: 24, letterSpacing: 2 }]}>{turmaAtribuir.codigo || 'Não definido'}</Text>
                      <Text style={s.statLabel}>Compartilhe este código com os alunos</Text>
                    </View>
                    <Text style={s.formLabel}>PET vinculado</Text>
                    <Text style={[s.missionMeta, { marginTop: 4, marginBottom: 12 }]}>{turmaAtribuir.petNome || 'PET'} · {turmaAtribuir.estagio || 'Estágio não definido'}</Text>
                    {!isCoordenador && <TouchableOpacity style={[s.btnRemove, { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fde8e8', borderRadius: 8, paddingHorizontal: 12 }]} onPress={() => removerTurma(turmaAtribuir.id)}>
                      <Text style={{ color: '#c0392b', fontFamily: fonts.semibold }}>🗑️ Excluir turma</Text>
                    </TouchableOpacity>}
                  </ScrollView>
                ) : abaDetalhesTurma === 'tarefas' ? (
                  <ScrollView style={{ maxHeight: 440 }}>
                    <Text style={[s.missionMeta, { marginBottom: 8 }]}>A ativação é independente por turma. Desativar mantém o XP já ganho; remover apaga o progresso e estorna o XP dos alunos desta turma.</Text>
                    <Text style={s.formLabel}>Mostrar tarefas</Text>
                    <View style={[s.turmaPickerWrap, { marginBottom: 8 }]}>
                      {[
                        { id: 'ativas', label: `Ativas (${turmaMissoesAtivas.length})` },
                        { id: 'inativas', label: `Inativas (${turmaMissoesDesativadas.length})` },
                        { id: 'todas', label: `Todas (${turmaMissoes.length})` },
                      ].map(opcao => (
                        <TouchableOpacity key={opcao.id} onPress={() => setFiltroTarefasTurma(opcao.id)} style={[s.turmaPill, filtroTarefasTurma === opcao.id && s.turmaPillActive]}>
                          <Text style={[s.turmaPillText, filtroTarefasTurma === opcao.id && s.turmaPillTextActive]}>{opcao.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {isCoordenador ? (
                      <TouchableOpacity style={[s.btnNew, { alignSelf: 'flex-start', marginBottom: 8 }]} onPress={() => setModalAtribuir(true)}>
                        <Text style={s.btnNewText}>+ Atribuir tarefa existente</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={[s.missionMeta, { marginBottom: 8 }]}>Você pode consultar tarefas e progresso. A coordenação gerencia os vínculos e a disponibilidade.</Text>
                    )}
                    {turmaMissoes.length === 0 ? (
                      <Text style={[s.missionMeta, { textAlign: 'center', paddingVertical: 20 }]}>Nenhuma tarefa vinculada a esta turma.</Text>
                    ) : turmaMissoesVisiveis.length === 0 ? (
                      <Text style={[s.missionMeta, { textAlign: 'center', paddingVertical: 20 }]}>
                        {filtroTarefasTurma === 'ativas' ? 'Não há tarefas ativas nesta turma.' : 'Não há tarefas inativas nesta turma.'}
                      </Text>
                    ) : turmaMissoesVisiveis.map(m => {
                      const ativaNestaTurma = missaoAtivaNaTurma(m, turmaAtribuir)
                      return (
                        <View key={m.id} style={[s.missionRow, { paddingVertical: 9, flexWrap: 'wrap' }]}>
                          <View style={[s.missionIcon, { backgroundColor: m.color, width: 34, height: 34 }]}>
                            <Image source={{ uri: m.icon }} style={{ width: 26, height: 26 }} resizeMode="contain" />
                          </View>
                          <View style={{ flex: 1, minWidth: 130 }}>
                            <Text style={s.missionName}>{m.name}</Text>
                            <Text style={s.missionMeta}>+{m.xp} XP · {ativaNestaTurma ? 'Disponível aos alunos' : 'Desativada nesta turma'}</Text>
                          </View>
                      {isCoordenador && <>
                        <TouchableOpacity disabled={missaoEmAcao} onPress={() => solicitarAlteracaoAtivaMissaoTurma(m, turmaAtribuir)} style={[s.btnToggle, { marginTop: 0, paddingVertical: 6, backgroundColor: ativaNestaTurma ? colors.yellowLight : colors.greenLight }]}>
                          <Text style={[s.btnToggleText, { color: ativaNestaTurma ? '#7a5f00' : colors.green }]}>{ativaNestaTurma ? 'Desativar' : 'Ativar'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity disabled={missaoEmAcao} onPress={() => solicitarRemocaoMissaoTurma(m, turmaAtribuir)} style={[s.btnToggle, { marginTop: 0, paddingVertical: 6, backgroundColor: '#fde8e8' }]}>
                          <Text style={[s.btnToggleText, { color: '#c0392b' }]}>Remover</Text>
                        </TouchableOpacity>
                      </>}
                        </View>
                      )
                    })}
                  </ScrollView>
                ) : (
                  <ScrollView style={{ flexShrink: 1 }}>
                    <Text style={[s.formLabel, { marginBottom: 6 }]}>Progresso do PET · {turmaAtribuir.estagio || 'Estágio não definido'}</Text>
                    <View style={[s.petXpBgFull, { marginBottom: 6 }]}>
                      <View style={[s.petXpFillFull, { width: `${Math.max(0, Math.min(100, Number(turmaAtribuir.progresso) || 0))}%`, backgroundColor: turmaAtribuir.cor }]} />
                    </View>
                    <Text style={[s.missionMeta, { marginBottom: 10 }]}>{Number(turmaAtribuir.xp) || 0} XP acumulados no PET · {Number(turmaAtribuir.progresso) || 0}% do estágio</Text>

                    <Text style={[s.formLabel, { marginBottom: 6 }]}>Indicadores da turma</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {[
                        { label: 'Alunos', value: turmaAlunos.length },
                        { label: 'XP total dos alunos', value: xpTotalAlunos },
                        { label: 'Média de XP por aluno', value: mediaXP },
                        { label: 'Tarefas ativas', value: turmaMissoesAtivas.length },
                        { label: 'Tarefas desativadas', value: turmaMissoesDesativadas.length },
                        { label: 'Conclusões aprovadas', value: `${totalConclusoes}/${totalPossivel}` },
                        { label: 'Conclusão das missões', value: `${progressoMissoes}%` },
                      ].map(indicador => (
                        <View key={indicador.label} style={[s.statCard, { width: '48%', minWidth: 120, flexGrow: 1 }]}>
                          <Text style={[s.statNum, { fontSize: 19 }]}>{indicador.value}</Text>
                          <Text style={s.statLabel}>{indicador.label}</Text>
                        </View>
                      ))}
                    </View>

                    <Text style={[s.formLabel, { marginTop: 12, marginBottom: 6 }]}>Desempenho por missão</Text>
                    {turmaMissoes.length === 0 ? <Text style={s.missionMeta}>Nenhuma missão atribuída a esta turma.</Text> : turmaMissoes.map(missao => {
                      const aprovados = turmaAlunos.filter(aluno => getStatusAluno(missao.id, aluno.id) === 'aprovado').length
                      const entregues = turmaAlunos.filter(aluno => getStatusAluno(missao.id, aluno.id) === 'entregue').length
                      return <View key={missao.id} style={[s.missionRow, { paddingVertical: 8 }]}>
                        <View style={[s.missionIcon, { backgroundColor: missao.color, width: 32, height: 32 }]}><Image source={{ uri: missao.icon }} style={{ width: 24, height: 24 }} resizeMode="contain" /></View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.missionName}>{missao.name}</Text>
                          <Text style={s.missionMeta}>{aprovados} aprovados · {entregues} entregues · {turmaAlunos.length} alunos</Text>
                        </View>
                        <Text style={[s.missionProgressTxt, { color: missaoAtivaNaTurma(missao, turmaAtribuir) ? colors.green : colors.muted }]}>{missaoAtivaNaTurma(missao, turmaAtribuir) ? 'Ativa' : 'Desativada'}</Text>
                      </View>
                    })}

                    <Text style={[s.formLabel, { marginTop: 12, marginBottom: 6 }]}>XP individual dos alunos</Text>
                    <Text style={[s.missionMeta, { marginBottom: 8 }]}>
                      {turmaAlunos.length ? `XP total: ${xpTotalAlunos} · média: ${mediaXP} XP por aluno` : 'Nenhum aluno entrou nesta turma ainda.'}
                    </Text>
                    <TouchableOpacity style={[s.btnNew, { alignSelf: 'flex-start', backgroundColor: colors.purple }]} onPress={() => { setModalResumoTurma(false); setBuscaAluno(''); setModalAlunosTurma(true) }}>
                      <Text style={s.btnNewText}>👤 Listar alunos e XP individual</Text>
                    </TouchableOpacity>
                  </ScrollView>
                )}
              </>
            })()}
          </View>
        </View>
      </Modal>

      {/* ── Modal Alunos da Turma ── */}
      <Modal visible={modalAlunosTurma} transparent animationType="slide" onRequestClose={() => setModalAlunosTurma(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { maxHeight: '90%' }]}>
            <Text style={s.modalTitle}>👥 Alunos · {turmaAtribuir?.nome}</Text>
            <Text style={[s.formLabel, { marginBottom: 10 }]}>
              {alunosDaTurma(turmaAtribuir).length} aluno(s)
            </Text>

            {/* Busca */}
            <TextInput
              style={[s.formInput, { marginBottom: 10 }]}
              placeholder="🔍 Buscar aluno..."
              placeholderTextColor="#aaa"
              value={buscaAluno}
              onChangeText={setBuscaAluno}
            />

            <ScrollView style={{ maxHeight: 340 }}>
              {alunos
                .filter(a => String(a.turmaId) === String(turmaAtribuir?.id))
                .filter(a => a.nome.toLowerCase().includes(buscaAluno.toLowerCase()))
                .length === 0 ? (
                <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: 'center', paddingVertical: 20 }}>
                  {buscaAluno ? 'Nenhum aluno encontrado.' : 'Nenhum aluno cadastrado nesta turma.'}
                </Text>
              ) : (
                alunos
                  .filter(a => String(a.turmaId) === String(turmaAtribuir?.id))
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
                        {!isCoordenador && <>
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
                              setXpValor('')
                              setErroXP('')
                              setModalAlunosTurma(false)
                              setTimeout(() => setModalXP(true), 300)
                            }}
                          >
                            <Text style={[s.btnToggleText, { color: '#7a5f00' }]}>⭐</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => removerAluno(a.id)} style={[s.btnRemove, { marginLeft: 2 }]}>
                            <Text style={s.btnRemoveText}>🗑️</Text>
                          </TouchableOpacity>
                        </>}
                    </View>
                  ))
              )}
            </ScrollView>

            <TouchableOpacity style={[s.btnConfirm, { marginTop: 12 }]} onPress={() => { setModalAlunosTurma(false); setBuscaAluno('') }}>
              <Text style={s.btnConfirmText}>Concluído</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Modal Atribuir tarefa à turma ── */}
      <Modal visible={modalAtribuir} transparent animationType="slide" onRequestClose={() => setModalAtribuir(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>📋 Atribuir tarefa</Text>
            <Text style={[s.formLabel, { marginBottom: 8 }]}>Turma: {turmaAtribuir?.nome}</Text>
            <Text style={s.missionMeta}>Escolha uma tarefa cadastrada para disponibilizá-la nesta turma. As outras turmas não serão afetadas.</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {missions.filter(m => turmaAtribuir && String(m.professorId) === String(turmaAtribuir.professorId) && !turmaTemMissao(turmaAtribuir, m.id)).map(m => (
                <View key={m.id} style={[s.missionRow, { paddingVertical: 10, alignItems: 'center' }]}>
                  <View style={[s.missionIcon, { backgroundColor: m.color }]}>
                    <Image source={{ uri: m.icon }} style={{ width: 26, height: 26 }} resizeMode="contain" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.missionName}>{m.name}</Text>
                    <Text style={s.missionMeta}>+{m.xp} XP · vinculada a {(m.turmaIds || []).length} turma(s)</Text>
                  </View>
                  <TouchableOpacity disabled={missaoEmAcao} style={[s.btnToggle, { backgroundColor: colors.greenLight, marginTop: 0, paddingHorizontal: 12 }]} onPress={() => atribuirMissao(m.id)}>
                    <Text style={[s.btnToggleText, { color: colors.green }]}>+ Atribuir</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {missions.filter(m => turmaAtribuir && String(m.professorId) === String(turmaAtribuir.professorId)).length === 0 && <Text style={[s.missionMeta, { textAlign: 'center', paddingVertical: 20 }]}>Não há tarefas do professor responsável por esta turma para atribuir.</Text>}
              {missions.filter(m => turmaAtribuir && String(m.professorId) === String(turmaAtribuir.professorId)).length > 0 && turmaAtribuir && missions.filter(m => String(m.professorId) === String(turmaAtribuir.professorId)).every(m => turmaTemMissao(turmaAtribuir, m.id)) && <Text style={[s.missionMeta, { textAlign: 'center', paddingVertical: 20 }]}>Todas as tarefas disponíveis já estão nesta turma.</Text>}
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
                            {isCoordenador ? (
                              <TouchableOpacity
                                style={[s.btnToggle, { marginTop: 0, backgroundColor: statusColor + '30', paddingHorizontal: 8, borderWidth: 1, borderColor: statusColor }]}
                                onPress={() => ciclarStatus(missaoAlunos?.id, a.id)}
                              >
                                <Text style={[s.btnToggleText, { color: statusColor === '#ddd' ? colors.muted : statusColor, fontSize: 11 }]}>{statusLabel}</Text>
                              </TouchableOpacity>
                            ) : (
                              <View style={[s.btnToggle, { marginTop: 0, backgroundColor: statusColor + '30', paddingHorizontal: 8, borderWidth: 1, borderColor: statusColor }]}>
                                <Text style={[s.btnToggleText, { color: statusColor === '#ddd' ? colors.muted : statusColor, fontSize: 11 }]}>{statusLabel}</Text>
                              </View>
                            )}
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
                value={novaConquista.nome} onChangeText={t => atualizarCampoConquista('nome', t)} />
              {!!errosConquista.nome && <Text style={s.validationError}>{errosConquista.nome}</Text>}

              <Text style={s.formLabel}>Descrição</Text>
              <TextInput style={s.formInput} placeholder="Descreva o critério..." placeholderTextColor="#aaa"
                value={novaConquista.descricao} onChangeText={t => atualizarCampoConquista('descricao', t)} />
              {!!errosConquista.descricao && <Text style={s.validationError}>{errosConquista.descricao}</Text>}

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
                  onPress={() => {
                    setNovaConquista(prev => ({ ...prev, criterio: cr.id, missaoAlvo: cr.id === 'missao_especifica' ? prev.missaoAlvo : '' }))
                    setErrosConquista(prev => ({ ...prev, criterio: '', meta: '', missaoAlvo: '' }))
                  }}>
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
                        onPress={() => { atualizarCampoConquista('missaoAlvo', m.name); setNovaConquista(prev => ({ ...prev, missaoAlvo: m.name, meta: '1' })) }}>
                        <Text style={[s.turmaPillText, novaConquista.missaoAlvo === m.name && s.turmaPillTextActive]}>{m.icon} {m.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {!!errosConquista.missaoAlvo && <Text style={s.validationError}>{errosConquista.missaoAlvo}</Text>}
                </>
              )}

              {novaConquista.criterio !== 'primeira_missao' && novaConquista.criterio !== 'missao_especifica' && (
                <>
                  <Text style={s.formLabel}>Meta</Text>
                  <TextInput style={s.formInput} placeholder="Ex: 500" placeholderTextColor="#aaa" keyboardType="numeric"
                    value={String(novaConquista.meta)} onChangeText={t => atualizarCampoConquista('meta', t)} />
                  {!!errosConquista.meta && <Text style={s.validationError}>{errosConquista.meta}</Text>}
                </>
              )}

              <Text style={s.formLabel}>XP da conquista</Text>
              <TextInput style={s.formInput} placeholder="Ex: 100" placeholderTextColor="#aaa" keyboardType="numeric"
                value={novaConquista.xp} onChangeText={t => atualizarCampoConquista('xp', t)} />
              {!!errosConquista.xp && <Text style={s.validationError}>{errosConquista.xp}</Text>}

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
                  onPress={() => { setXpValor(String(v)); setErroXP('') }}
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
              onChangeText={valor => { setXpValor(valor); setErroXP('') }}
            />
            {!!erroXP && <Text style={s.validationError}>{erroXP}</Text>}

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

      {/* Confirmações para criar, vincular, ocultar ou excluir missões */}
      <Modal visible={Boolean(confirmacaoMissao)} transparent animationType="fade" onRequestClose={() => setConfirmacaoMissao(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>{confirmacaoMissao?.titulo}</Text>
            <Text style={[s.missionMeta, { color: colors.dark, fontSize: 13, lineHeight: 19 }]}>{confirmacaoMissao?.mensagem}</Text>
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.btnCancel} onPress={() => setConfirmacaoMissao(null)} disabled={missaoEmAcao}>
                <Text style={s.btnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btnConfirm, confirmacaoMissao?.perigoso && { backgroundColor: '#c0392b' }, missaoEmAcao && s.btnConfirmDisabled]}
                disabled={missaoEmAcao}
                onPress={async () => {
                  const acao = confirmacaoMissao?.onConfirmar
                  setConfirmacaoMissao(null)
                  await acao?.()
                }}
              >
                <Text style={s.btnConfirmText}>{missaoEmAcao ? 'Salvando...' : (confirmacaoMissao?.textoConfirmar || 'Confirmar')}</Text>
              </TouchableOpacity>
            </View>
            {confirmacaoMissao?.onAlternativo && (
              <TouchableOpacity
                style={[s.btnToggle, { marginTop: 0, backgroundColor: colors.greenLight }]}
                disabled={missaoEmAcao}
                onPress={async () => {
                  const acao = confirmacaoMissao?.onAlternativo
                  setConfirmacaoMissao(null)
                  await acao?.()
                }}
              >
                <Text style={[s.btnToggleText, { color: colors.green }]}>{confirmacaoMissao.textoAlternativo}</Text>
              </TouchableOpacity>
            )}
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
  petOptionUnavailable:{ borderColor: '#b9b9b9', backgroundColor: '#ededed' },
  petOptionImage:{ width: 36, height: 36 },
  petOptionImageGrayScale:{ filter: 'grayscale(100%)' },
  petOptionImageGrayTint:{ tintColor: '#777' },
  petOptionActive:{ borderColor: colors.green, backgroundColor: colors.greenLight },
  petPickerHint:{ width: '100%', color: colors.muted, fontSize: 11, fontFamily: fonts.regular },
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
