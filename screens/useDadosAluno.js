import { useCallback, useEffect, useRef, useState } from 'react'
import { listarMissoesDoAluno, consultarProgressoGeral, buscarTurmaDoAluno, temTokenAluno } from '../services/storage'

// Dados reais do aluno compartilhados pelas páginas laterais do PetScreen
// (calendário, trilha, conquistas e perfil). Existe para que as páginas NÃO repitam
// a mesma consulta: a lista de tarefas é buscada uma vez aqui e entregue às duas
// páginas que a usam (trilha e calendário).
//
// Tudo passa pelos serviços de services/storage.js, que usam as RPCs autorizadas com o
// token do próprio aluno (V4). Nada aqui lê tabela direto nem aceita o id de outro aluno.
//
// As consultas são "preguiçosas": só rodam quando o aluno chega na página que precisa delas,
// então abrir a tela do PET não ganha nenhuma chamada nova.
//
// Troca de aluno: quando `aluno.id` muda, TUDO é invalidado (geração nova): respostas de consultas
// que ainda estavam em andamento para o aluno anterior são descartadas e os dados na tela são limpos.
// Dentro da mesma geração, cada tipo de consulta tem a sua própria sequência: uma resposta antiga
// nunca sobrescreve uma mais nova.
//
// Parâmetros:
//   aluno      objeto do aluno logado (id, turmaId...)
//   turma      turma/PET carregados pelo App (id, xp...)
//   progresso  { xp, nome, turmaId, missoesAprovadas, conquistas } vindo do App
//   pagina     índice da página atual do paginador (0 calendário, 1 trilha, 2 PET, 3 conquistas, 4 perfil)

// Texto amigável a partir do erro lançado pelos serviços (e.codigo vem de erroNuvem em storage.js).
// Os erros de regra do servidor (PT409 etc.) chegam como 'configuracao' com e.detalhe = código do PostgREST.
export function mensagemDeErroAluno(e) {
  switch (e?.codigo) {
    case 'sessao_invalida':   return 'Sua sessão expirou. Entre novamente.'
    case 'muitas_tentativas': return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
    case 'rede':              return 'Sem conexão com o servidor. Verifique a internet e tente de novo.'
    case 'migration_ausente': return 'O servidor ainda não foi atualizado para esta versão do app. Avise seu professor.'
    case 'configuracao':
      return e?.detalhe === 'PT409'
        ? 'O servidor não permitiu essa ação agora (a tarefa pode ter mudado). A lista foi atualizada.'
        : 'Erro de configuração do servidor. Avise o administrador do app.'
    default:                  return 'Não foi possível concluir. Tente de novo.'
  }
}

// Converte o texto de data do Supabase em Date, sem deslocar o dia. Uma data "pura" (AAAA-MM-DD, sem hora)
// é interpretada pelo JavaScript como UTC e apareceria um dia antes no Brasil: aqui ela vira meia-noite LOCAL.
// Timestamps com fuso (ex.: 2026-11-05T15:30:00+00:00) já são convertidos corretamente para o horário local.
// Devolve null se não houver data ou se ela for inválida (nunca inventa uma).
export function analisarData(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor
  if (typeof valor !== 'string' && typeof valor !== 'number') return null
  if (typeof valor === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim())
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      return Number.isNaN(d.getTime()) ? null : d
    }
  }
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? null : d
}

export default function useDadosAluno({ aluno, turma, progresso: progressoInicial, pagina }) {
  const alunoId = aluno?.id
  const turmaId = aluno?.turmaId ?? turma?.id ?? null
  const xpDaTurma = turma?.xp

  const [missoes, setMissoes] = useState([])
  const [estadoMissoes, setEstadoMissoes] = useState('ocioso') // 'ocioso' | 'carregando' | 'pronto' | 'erro'
  const [erroMissoes, setErroMissoes] = useState(null)
  const [progresso, setProgresso] = useState(progressoInicial || null)
  const [erroProgresso, setErroProgresso] = useState(null)
  const [xpPet, setXpPet] = useState(null) // null = usa o XP que o App já carregou (turma.xp)

  const vivo = useRef(true)
  const geracao = useRef(0)         // sobe a cada troca de aluno: invalida tudo que estava em andamento
  const seqMissoes = useRef(0)
  const seqProgresso = useRef(0)
  const seqXp = useRef(0)
  const jaCarregou = useRef(false)  // já temos uma lista válida DESTE aluno?

  useEffect(() => {
    vivo.current = true
    return () => { vivo.current = false }
  }, [])

  // Troca de aluno (ou primeiro aluno): descarta consultas em andamento e limpa os dados do aluno anterior.
  // Declarado ANTES dos efeitos de carga para rodar primeiro no mesmo commit.
  useEffect(() => {
    geracao.current += 1
    seqMissoes.current += 1
    seqProgresso.current += 1
    seqXp.current += 1
    jaCarregou.current = false
    setMissoes([])
    setEstadoMissoes('ocioso')
    setErroMissoes(null)
    setErroProgresso(null)
    setXpPet(null)
    setProgresso(progressoInicial || null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alunoId])

  // O App pode atualizar o progresso/turma (reidratação): acompanha. O XP do PET lido por nós perde a
  // validade, para não ficar preso a um valor mais velho que o do App.
  useEffect(() => { if (progressoInicial) setProgresso(progressoInicial) }, [progressoInicial])
  useEffect(() => { setXpPet(null) }, [xpDaTurma])

  const carregarMissoes = useCallback(async (silencioso = false) => {
    if (!alunoId) { setMissoes([]); setEstadoMissoes('pronto'); return }
    const ger = geracao.current
    const minha = ++seqMissoes.current
    if (!silencioso) { setEstadoMissoes('carregando'); setErroMissoes(null) }
    try {
      const lista = await listarMissoesDoAluno(alunoId, { lancarErro: true })
      if (!vivo.current || ger !== geracao.current || minha !== seqMissoes.current) return
      setMissoes(Array.isArray(lista) ? lista : [])
      setErroMissoes(null)
      setEstadoMissoes('pronto')
      jaCarregou.current = true
    } catch (e) {
      if (!vivo.current || ger !== geracao.current || minha !== seqMissoes.current) return
      if (silencioso && jaCarregou.current) return   // atualização em segundo plano falhou: mantém o que já está na tela
      setErroMissoes(e)
      setEstadoMissoes('erro')
    }
  }, [alunoId])

  const recarregarProgresso = useCallback(async () => {
    if (!alunoId) return
    const ger = geracao.current
    const minha = ++seqProgresso.current
    try {
      if (!(await temTokenAluno())) return
      // lancarErro: uma falha NÃO vira o objeto "zerado" (que pareceria um aluno com 0 XP).
      const novo = await consultarProgressoGeral(alunoId, { lancarErro: true })
      if (!vivo.current || ger !== geracao.current || minha !== seqProgresso.current) return
      if (novo) { setProgresso(novo); setErroProgresso(null) }
    } catch (e) {
      if (!vivo.current || ger !== geracao.current || minha !== seqProgresso.current) return
      setErroProgresso(e)   // mantém os números que já estão na tela e avisa que não foi possível atualizar
    }
  }, [alunoId])

  // XP do PET (a barra de estágio da tela principal). O valor inicial já vem do App (turma.xp); aqui só
  // atualizamos depois de o aluno avançar uma etapa.
  const recarregarXpPet = useCallback(async () => {
    if (!turmaId) return
    const ger = geracao.current
    const minha = ++seqXp.current
    try {
      const t = await buscarTurmaDoAluno(turmaId, { lancarErro: true })
      if (!vivo.current || ger !== geracao.current || minha !== seqXp.current) return
      if (t && Number.isFinite(Number(t.xp))) setXpPet(Number(t.xp))
    } catch { /* mantém o valor atual */ }
  }, [turmaId])

  // Chega na trilha (1) ou no calendário (0): busca as tarefas; nas vezes seguintes atualiza em segundo plano.
  // Chega no perfil (4): atualiza XP e contagens.
  useEffect(() => {
    if (pagina === 0 || pagina === 1) carregarMissoes(jaCarregou.current)
    if (pagina === 4) recarregarProgresso()
  }, [pagina, carregarMissoes, recarregarProgresso])

  // Depois de avançar uma etapa / entregar uma tarefa: relê tudo o que o servidor pode ter mudado.
  const aposProgresso = useCallback(async () => {
    await Promise.all([carregarMissoes(true), recarregarProgresso(), recarregarXpPet()])
  }, [carregarMissoes, recarregarProgresso, recarregarXpPet])

  const recarregarMissoes = useCallback(() => carregarMissoes(false), [carregarMissoes])

  return { missoes, estadoMissoes, erroMissoes, recarregarMissoes, aposProgresso, progresso, erroProgresso, recarregarProgresso, xpPet }
}