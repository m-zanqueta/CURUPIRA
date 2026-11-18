import { useEffect, useMemo, useState } from 'react'
import { View, StyleSheet, TouchableOpacity, ScrollView, Image, Platform } from 'react-native'
import { Text, ActivityIndicator } from 'react-native-paper'
import { colors, fonts } from '../theme'
import { mensagemDeErroAluno, analisarData } from './useDadosAluno'
import { consultarCalendarioCarinho } from '../services/storage'

// Página "Calendário" do aluno (página 0 do paginador do PetScreen).
//
// Dias de tarefa usam a data de aprovação de cada etapa. Assim, rejeições e envios
// ainda aguardando avaliação não aparecem como conclusão no calendário.
//
// Props:
//   width        largura da página
//   petImage     URL do PET (enfeite)
//   missoes      lista vinda de useDadosAluno (compartilhada com a trilha: sem consulta própria)
//   estado       'ocioso' | 'carregando' | 'pronto' | 'erro'
//   erro         erro da última carga
//   onRecarregar tenta carregar de novo

const NOMES_DIA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
function MiniPet({ uri, emoji = '🌿', style }) {
  return uri
    ? <Image source={{ uri }} style={style} resizeMode="contain" />
    : <Text style={style}>{emoji}</Text>
}

// Data local (dia/mês/ano) -> chave estável "2026-11-12" (mês 1..12)
export function chaveDoDia(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`
}

// Única função que decide qual data representa uma conclusão aprovada.
export function dataDaAtividade(etapa) {
  if (etapa?.statusEnvio !== 'aprovado') return null
  const d = analisarData(etapa?.corrigidaEm)
  if (!d) return null
  return { data: d, tipo: 'conclusao' }
}

// Agrupa as tarefas por dia local. Devolve { [chaveDoDia]: [{ missao, data }] }.
export function agruparPorDia(missoes) {
  const mapa = {}
  for (const missao of missoes || []) {
    for (const etapa of missao.etapas || []) {
      const ref = dataDaAtividade(etapa)
      if (!ref) continue
      const k = chaveDoDia(ref.data)
      ;(mapa[k] = mapa[k] || []).push({ missao, etapa, data: ref.data })
    }
  }
  for (const k of Object.keys(mapa)) mapa[k].sort((a, b) => a.data - b.data)
  return mapa
}

// Grade de 42 células (6 semanas, começando na segunda) do mês `ano`/`mes` (mes 0..11).
export function gradeDoMes(ano, mes) {
  const primeiro = new Date(ano, mes, 1)
  const inicio = (primeiro.getDay() + 6) % 7
  return Array.from({ length: 42 }, (_, i) => new Date(ano, mes, i - inicio + 1))
}

function horaCurta(d) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function selecionarProximaTarefa(missoes) {
  const ativas = (missoes || []).filter(m => m.status === 'pendente' && (m.etapas || []).length)
  const precisaRefazer = ativas.find(m => ['recusado', 'enviado'].includes(m.etapas?.[Number(m.etapaAtual) || 0]?.statusEnvio))
  const emCurso = ativas.filter(m => Number(m.etapaAtual) > 0 && Number(m.etapaAtual) < m.etapas.length)
    .sort((a, b) => new Date(b.atualizadoEm || 0) - new Date(a.atualizadoEm || 0))[0]
  const missao = precisaRefazer || emCurso || ativas.find(m => Number(m.etapaAtual) < m.etapas.length)
  if (!missao) return null
  const ordem = Math.max(0, Math.min(Number(missao.etapaAtual) || 0, missao.etapas.length - 1))
  return { missao, etapa: missao.etapas[ordem], aguardando: missao.etapas[ordem]?.statusEnvio === 'enviado' }
}
function dataLonga(d) {
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
}
function maiuscula(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t }

export default function PaginaCalendario({ width, petImage, alunoId, atualizacaoCarinho = 0, missoes = [], estado, erro, onRecarregar }) {
  const hoje = new Date()
  const [mesAtual, setMesAtual] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() })
  const [diaSelecionado, setDiaSelecionado] = useState(chaveDoDia(hoje))
  const [calendarioCarinho, setCalendarioCarinho] = useState(null)
  const [erroCarinho, setErroCarinho] = useState(false)

  useEffect(() => {
    let ativo = true
    if (!alunoId || alunoId === 'loja') return () => { ativo = false }
    consultarCalendarioCarinho(mesAtual.ano, mesAtual.mes + 1)
      .then(dados => { if (ativo) { setCalendarioCarinho(dados); setErroCarinho(false) } })
      .catch(e => { console.warn('Não foi possível carregar o calendário de carinhos:', e?.codigo || e?.message); if (ativo) setErroCarinho(true) })
    return () => { ativo = false }
  }, [alunoId, mesAtual.ano, mesAtual.mes, atualizacaoCarinho])

  const porDia = useMemo(() => agruparPorDia(missoes), [missoes])
  const proximaTarefa = useMemo(() => selecionarProximaTarefa(missoes), [missoes])
  const grade = useMemo(() => gradeDoMes(mesAtual.ano, mesAtual.mes), [mesAtual])
  const chaveHoje = chaveDoDia(hoje)
  const chaveHojeServidor = calendarioCarinho?.hoje || chaveHoje
  const diasComCarinho = useMemo(() => new Set((calendarioCarinho?.dias || []).map(d => d.dia)), [calendarioCarinho])

  const nomeMes = maiuscula(new Date(mesAtual.ano, mesAtual.mes, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))
  const noMes = grade.filter(d => d.getMonth() === mesAtual.mes)
  const totalNoMes = noMes.reduce((soma, d) => soma + (porDia[chaveDoDia(d)]?.length || 0), 0)
  const doDia = porDia[diaSelecionado] || []

  function mudarMes(delta) {
    const d = new Date(mesAtual.ano, mesAtual.mes + delta, 1)
    setMesAtual({ ano: d.getFullYear(), mes: d.getMonth() })
    // Seleciona um dia do mês novo: hoje (se for o mês atual), senão o primeiro dia com atividade, senão o dia 1.
    const dias = gradeDoMes(d.getFullYear(), d.getMonth()).filter(x => x.getMonth() === d.getMonth()).map(chaveDoDia)
    const ehMesAtual = d.getFullYear() === hoje.getFullYear() && d.getMonth() === hoje.getMonth()
    setDiaSelecionado(ehMesAtual ? chaveHoje : (dias.find(k => porDia[k]?.length) || dias[0]))
  }
  function irParaHoje() {
    setMesAtual({ ano: hoje.getFullYear(), mes: hoje.getMonth() })
    setDiaSelecionado(chaveHoje)
  }

  const carregando = (estado === 'ocioso' || estado === 'carregando') && missoes.length === 0
  const falhou = estado === 'erro' && missoes.length === 0

  // data do dia selecionado, só para o título (a chave é "AAAA-MM-DD")
  const [sa, sm, sd] = diaSelecionado.split('-').map(Number)
  const dataSelecionada = new Date(sa, sm - 1, sd)

  return (
    <View style={[p.page, { width }]}>
      <View style={p.calendarHero}>
        <View style={p.calendarHeroRow}>
          <View style={p.calendarHeroText}>
            <Text style={p.calendarTitle}>📅 Calendário</Text>
          </View>
          <MiniPet uri={petImage} emoji="🌿" style={p.calendarPet} />
        </View>
        <View style={p.monthRow}>
          <TouchableOpacity onPress={() => mudarMes(-1)} hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }} accessibilityRole="button" accessibilityLabel="Mês anterior">
            <Text style={p.monthArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={p.monthName}>{nomeMes}</Text>
          <TouchableOpacity onPress={() => mudarMes(1)} hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }} accessibilityRole="button" accessibilityLabel="Próximo mês">
            <Text style={p.monthArrow}>›</Text>
          </TouchableOpacity>
        </View>
        <View style={p.weekdays}>
          {NOMES_DIA.map(d => <Text key={d} style={p.weekday}>{d}</Text>)}
        </View>
      </View>

      <ScrollView contentContainerStyle={p.calendarContent} showsVerticalScrollIndicator={false}>
          <View style={p.calendarCard}>
            {grade.map((data, i) => {
              const k = chaveDoDia(data)
              const mesmoMes = data.getMonth() === mesAtual.mes
              const selecionado = k === diaSelecionado
              const ehHoje = k === chaveHojeServidor
              const qtd = porDia[k]?.length || 0
              const feito = diasComCarinho.has(k)
              const faltou = !!calendarioCarinho?.inicio && k >= calendarioCarinho.inicio && k < chaveHojeServidor && !feito
              return (
                <TouchableOpacity
                  key={`${k}-${i}`}
                  style={p.dayCell}
                  activeOpacity={0.7}
                  onPress={() => {
                    setDiaSelecionado(k)
                    if (!mesmoMes) setMesAtual({ ano: data.getFullYear(), mes: data.getMonth() })
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${data.getDate()} de ${data.toLocaleDateString('pt-BR', { month: 'long' })}${feito ? ', carinho diário feito' : faltou ? ', sem carinho' : ''}${qtd ? `, ${qtd} tarefa${qtd > 1 ? 's' : ''} aprovada${qtd > 1 ? 's' : ''}` : ''}`}
                >
                  <View style={[p.dayCircle, feito && !selecionado && p.dayLogged, faltou && !selecionado && p.dayMissed, ehHoje && !selecionado && p.todayRing, selecionado && p.selectedDay]}>
                    <Text style={[p.dayText, !mesmoMes && p.mutedDay, selecionado && p.selectedDayText]}>{data.getDate()}</Text>
                  </View>
                  <View style={p.dayMarks}>
                    {feito ? <View style={p.careMark} /> : faltou ? <View style={p.missedMark} /> : null}
                    {qtd > 0 ? <View style={p.taskMark} /> : null}
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>

          <View style={p.calendarToday}>
            <Text style={p.calendarTodayEmoji}>📍</Text>
            <Text style={p.calendarTodayText} numberOfLines={1}>{maiuscula(dataLonga(dataSelecionada))}</Text>
          </View>

          {(() => {
            const selecionadoFeito = diasComCarinho.has(diaSelecionado)
            const selecionadoHoje = diaSelecionado === chaveHojeServidor
            const selecionadoPassou = !!calendarioCarinho?.inicio && diaSelecionado >= calendarioCarinho.inicio && diaSelecionado < chaveHojeServidor
            const status = selecionadoFeito ? ['💚', 'Carinho feito!'] : selecionadoHoje ? ['🐾', 'Faça carinho no PET'] : selecionadoPassou ? ['🤍', 'Sem carinho'] : ['✨', 'Dia novo']
            const tarefasNoDia = (porDia[diaSelecionado] || []).length > 0
            return <View style={[p.attendanceCard, selecionadoFeito && p.attendanceCardDone]}><Text style={p.attendanceEmoji}>{erroCarinho ? '…' : status[0]}</Text><Text style={p.attendanceText}>{erroCarinho ? 'Não carregou' : status[1]}</Text>{tarefasNoDia && <Text style={p.taskDoneText}>🌱 Cuidado feito</Text>}</View>
          })()}
          <View style={p.attendanceLegend}><Text style={p.legendDone}>💚 Carinho</Text><Text style={p.legendReward}>🌱 Tarefa</Text><Text style={p.legendMissed}>• Sem carinho</Text></View>

          {totalNoMes === 0 && proximaTarefa ? <View style={p.nextTaskCard}>
            <Text style={p.nextTaskEmoji}>🌱</Text>
            <View style={p.nextTaskCopy}><Text style={p.nextTaskEyebrow}>{proximaTarefa.aguardando ? 'AGUARDANDO O PROFESSOR' : 'PRÓXIMO CUIDADO'}</Text><Text style={p.nextTaskTitle}>{proximaTarefa.etapa?.titulo || proximaTarefa.missao.nome}</Text><Text style={p.nextTaskTrail}>{proximaTarefa.missao.nome}</Text></View>
          </View> : null}

          {carregando ? <View style={p.vazioDia}><ActivityIndicator color={colors.green} /><Text style={p.vazioDiaTxt}>Carregando…</Text></View> : falhou ? <View style={p.vazioDia}><Text style={p.vazioDiaTxt}>{mensagemDeErroAluno(erro)}</Text><TouchableOpacity onPress={onRecarregar} accessibilityRole="button"><Text style={p.linkTxt}>Tentar de novo</Text></TouchableOpacity></View> : doDia.length > 0 ? doDia.map(({ missao, etapa, data }, indice) => (
            <View key={`${missao.id}-${etapa.titulo}-${indice}`} style={p.calendarEvent}>
              <View style={p.calendarEventIcon}><Text style={p.calendarEventEmoji}>{/^https?:\/\//i.test(missao.icone || '') ? '🌱' : (missao.icone || '🌱')}</Text></View>
              <View style={p.calendarEventInfo}>
                <Text style={p.calendarEventTitle}>{etapa.titulo || missao.nome}</Text>
                <Text style={p.calendarEventSub}>✓ Aprovada · {horaCurta(data)}</Text>
              </View>
            </View>
          )) : (
            <View style={p.vazioDia}>
              <Text style={p.vazioDiaTxt}>
                {missoes.length === 0
                  ? 'Você ainda não tem tarefas. Quando o professor liberar, elas aparecem aqui depois que você começar.'
                  : totalNoMes === 0
                    ? (proximaTarefa ? 'Seu próximo cuidado está destacado acima.' : 'Nenhuma atividade neste mês.')
                    : 'Nenhuma atividade neste dia.'}
              </Text>
              {totalNoMes === 0 && (mesAtual.ano !== hoje.getFullYear() || mesAtual.mes !== hoje.getMonth()) ? (
                <TouchableOpacity onPress={irParaHoje} activeOpacity={0.85} accessibilityRole="button">
                  <Text style={p.linkTxt}>Voltar para hoje</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

      </ScrollView>
    </View>
  )
}

const p = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.cream, overflow: 'hidden' },
  calendarHero: { backgroundColor: colors.green, paddingTop: Platform.OS === 'android' ? 34 : 48, paddingHorizontal: 22, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, borderBottomWidth: 5, borderBottomColor: '#08761F' },
  calendarHeroRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calendarHeroText: { flex: 1, gap: 4 },
  calendarTitle: { color: colors.white, fontSize: 22, fontFamily: fonts.extrabold },
  calendarPet: { width: 82, height: 82, fontSize: 54, textAlign: 'center' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingHorizontal: 20 },
  monthArrow: { color: colors.white, fontSize: 28, fontFamily: fonts.medium },
  monthName: { color: colors.white, fontSize: 20, fontFamily: fonts.bold },
  weekdays: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 16 },
  weekday: { width: '14.28%', textAlign: 'center', color: 'rgba(255,255,255,0.8)', fontSize: 10, fontFamily: fonts.semibold },
  calendarContent: { padding: 16, paddingBottom: 74 },
  calendarCard: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.white, borderRadius: 20, paddingVertical: 12, paddingHorizontal: 4, borderWidth: 1, borderColor: colors.border },
  dayCell: { width: '14.28%', height: 44, alignItems: 'center', justifyContent: 'center', gap: 1 },
  dayCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dayLogged: { backgroundColor: colors.greenLight },
  dayMissed: { backgroundColor: '#FFF0EC' },
  todayRing: { borderWidth: 2, borderColor: colors.green },
  selectedDay: { backgroundColor: colors.green },
  dayText: { color: '#4B4B43', fontSize: 13, fontFamily: fonts.bold },
  mutedDay: { color: '#B8B8AD' },
  selectedDayText: { color: colors.white, fontFamily: fonts.bold },
  dayMarks: { height: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  careMark: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.green },
  taskMark: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#E7AF00' },
  missedMark: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#C65A47' },
  calendarToday: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 4, backgroundColor: colors.purple, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderBottomWidth: 4, borderBottomColor: '#4D0D75' },
  calendarTodayEmoji: { fontSize: 22 },
  calendarTodayText: { flex: 1, color: colors.white, fontSize: 15, fontFamily: fonts.extrabold },
  attendanceCard: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16, backgroundColor: colors.yellowLight, borderWidth: 1.5, borderColor: '#EBDDA0', flexWrap: 'wrap' },
  attendanceCardDone: { backgroundColor: colors.greenLight, borderColor: colors.green },
  attendanceEmoji: { fontSize: 19 },
  attendanceText: { flexShrink: 1, color: colors.dark, fontSize: 13, fontFamily: fonts.extrabold, textAlign: 'center' },
  taskDoneText: { color: colors.green, fontSize: 12, fontFamily: fonts.extrabold },
  attendanceLegend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', gap: 5, marginTop: 8, marginBottom: 6 },
  legendDone: { color: colors.green, fontSize: 11, fontFamily: fonts.bold },
  legendMissed: { color: '#A54A3C', fontSize: 11, fontFamily: fonts.bold },
  legendReward: { color: '#856500', fontSize: 11, fontFamily: fonts.bold },
  nextTaskCard: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 9, padding: 12, backgroundColor: '#EAF7E9', borderRadius: 16, borderWidth: 1.5, borderColor: '#A8D5AE' },
  nextTaskEmoji: { fontSize: 32 }, nextTaskCopy: { flex: 1 }, nextTaskEyebrow: { color: colors.green, fontSize: 10, fontFamily: fonts.extrabold, letterSpacing: 0.5 }, nextTaskTitle: { color: '#20221D', fontSize: 16, fontFamily: fonts.extrabold, marginTop: 2 }, nextTaskTrail: { color: '#64685F', fontSize: 11, fontFamily: fonts.semibold, marginTop: 1 },
  calendarEvent: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderRadius: 16, padding: 11, marginTop: 8, borderWidth: 1.5, borderColor: colors.border, borderBottomWidth: 4, borderBottomColor: '#D8D4C1' },
  calendarEventIcon: { width: 54, height: 54, borderRadius: 16, backgroundColor: colors.greenLight, alignItems: 'center', justifyContent: 'center' },
  calendarEventEmoji: { fontSize: 32 },
  calendarEventInfo: { flex: 1, gap: 3 },
  calendarEventTitle: { color: '#20221D', fontSize: 14, fontFamily: fonts.extrabold },
  calendarEventSub: { color: '#77786F', fontSize: 12, fontFamily: fonts.medium },
  vazioDia: { marginTop: 10, backgroundColor: colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border, alignItems: 'center', gap: 8 },
  vazioDiaTxt: { color: '#65665F', fontSize: 12, fontFamily: fonts.medium, lineHeight: 18, textAlign: 'center' },
  linkTxt: { color: colors.green, fontSize: 12, fontFamily: fonts.bold },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 80, gap: 10 },
  centroEmoji: { fontSize: 44 },
  centroTitulo: { color: '#20221D', fontSize: 16, fontFamily: fonts.extrabold, textAlign: 'center' },
  centroTexto: { color: '#65665F', fontSize: 12, fontFamily: fonts.medium, lineHeight: 18, textAlign: 'center' },
  botao: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green, borderRadius: 16, borderBottomWidth: 5, borderBottomColor: '#08761F', marginTop: 8, paddingHorizontal: 18 },
  botaoTxt: { color: colors.white, fontSize: 15, fontFamily: fonts.extrabold },
})
