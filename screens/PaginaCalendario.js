import { useMemo, useState } from 'react'
import { View, StyleSheet, TouchableOpacity, ScrollView, Image, Platform } from 'react-native'
import { Text, ActivityIndicator } from 'react-native-paper'
import { colors, fonts } from '../theme'
import { mensagemDeErroAluno, analisarData } from './useDadosAluno'

// Página "Calendário" do aluno (página 0 do paginador do PetScreen).
//
// IMPORTANTE (versão 1): o backend ainda NÃO tem prazo, data de início nem data de conclusão
// nas tarefas. A única data disponível é `atualizado_em` (aqui `atualizadoEm`): o momento da
// ÚLTIMA ATUALIZAÇÃO do progresso do aluno naquela tarefa (iniciou, avançou etapa, entregou ou foi
// aprovada). NÃO é prazo e NÃO é, necessariamente, a data de conclusão. A tela diz isso ao aluno.
// Tarefas que o aluno ainda não mexeu não têm data e não aparecem em nenhum dia.
//
// Preparada para a evolução: a função `dataDaAtividade` é o único lugar que decide qual data usar.
// Se o Zanq disponibilizar uma data própria da tarefa (ex.: `prazo`, vinda de aluno_minhas_missoes
// e repassada por listarMissoesDoAluno), basta ela devolver { data, tipo: 'prazo' } primeiro.
//
// Props:
//   width        largura da página
//   petImage     URL do PET (enfeite)
//   missoes      lista vinda de useDadosAluno (compartilhada com a trilha: sem consulta própria)
//   estado       'ocioso' | 'carregando' | 'pronto' | 'erro'
//   erro         erro da última carga
//   onRecarregar tenta carregar de novo

const NOMES_DIA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const STATUS_TEXTO = { pendente: 'Em andamento', entregue: 'Entregue, aguardando o professor', aprovado: 'Aprovada' }

function MiniPet({ uri, emoji = '🌿', style }) {
  return uri
    ? <Image source={{ uri }} style={style} resizeMode="contain" />
    : <Text style={style}>{emoji}</Text>
}

// Data local (dia/mês/ano) -> chave estável "2026-11-12" (mês 1..12)
export function chaveDoDia(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`
}

// Única função que escolhe a data de uma tarefa. Hoje: atualizadoEm. Nunca inventa data.
export function dataDaAtividade(missao) {
  const d = analisarData(missao?.atualizadoEm)
  if (!d) return null
  return { data: d, tipo: 'atualizacao' }
}

// Agrupa as tarefas por dia local. Devolve { [chaveDoDia]: [{ missao, data }] }.
export function agruparPorDia(missoes) {
  const mapa = {}
  for (const missao of missoes || []) {
    const ref = dataDaAtividade(missao)
    if (!ref) continue
    const k = chaveDoDia(ref.data)
    ;(mapa[k] = mapa[k] || []).push({ missao, data: ref.data })
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
function dataLonga(d) {
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
}
function maiuscula(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t }

export default function PaginaCalendario({ width, petImage, missoes = [], estado, erro, onRecarregar }) {
  const hoje = new Date()
  const [mesAtual, setMesAtual] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() })
  const [diaSelecionado, setDiaSelecionado] = useState(chaveDoDia(hoje))

  const porDia = useMemo(() => agruparPorDia(missoes), [missoes])
  const grade = useMemo(() => gradeDoMes(mesAtual.ano, mesAtual.mes), [mesAtual])
  const chaveHoje = chaveDoDia(hoje)

  const nomeMes = maiuscula(new Date(mesAtual.ano, mesAtual.mes, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))
  const noMes = grade.filter(d => d.getMonth() === mesAtual.mes)
  const totalNoMes = noMes.reduce((soma, d) => soma + (porDia[chaveDoDia(d)]?.length || 0), 0)
  const semData = missoes.filter(m => !dataDaAtividade(m)).length
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
            <Text style={p.calendarSubTitle}>Suas atividades por dia</Text>
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

      {carregando ? (
        <View style={p.centro}>
          <ActivityIndicator color={colors.green} />
          <Text style={p.centroTexto}>Carregando suas atividades…</Text>
        </View>
      ) : falhou ? (
        <View style={p.centro}>
          <Text style={p.centroEmoji}>😕</Text>
          <Text style={p.centroTitulo}>Não foi possível carregar</Text>
          <Text style={p.centroTexto}>{mensagemDeErroAluno(erro)}</Text>
          <TouchableOpacity onPress={onRecarregar} activeOpacity={0.85} style={p.botao} accessibilityRole="button">
            <Text style={p.botaoTxt}>Tentar de novo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={p.calendarContent} showsVerticalScrollIndicator={false}>
          <View style={p.calendarCard}>
            {grade.map((data, i) => {
              const k = chaveDoDia(data)
              const mesmoMes = data.getMonth() === mesAtual.mes
              const selecionado = k === diaSelecionado
              const ehHoje = k === chaveHoje
              const qtd = porDia[k]?.length || 0
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
                  accessibilityLabel={`${data.getDate()} de ${data.toLocaleDateString('pt-BR', { month: 'long' })}${qtd ? `, ${qtd} atividade${qtd > 1 ? 's' : ''}` : ''}`}
                >
                  <View style={[p.dayCircle, ehHoje && !selecionado && p.todayRing, selecionado && p.selectedDay]}>
                    <Text style={[p.dayText, !mesmoMes && p.mutedDay, selecionado && p.selectedDayText]}>{data.getDate()}</Text>
                  </View>
                  {qtd > 0 ? <View style={[p.dayMark, selecionado && p.dayMarkSelected]} /> : <View style={p.dayMarkSpace} />}
                </TouchableOpacity>
              )
            })}
          </View>

          <View style={p.calendarToday}>
            <Text style={p.calendarTodayEmoji}>🌿</Text>
            <Text style={p.calendarTodayText} numberOfLines={1}>{maiuscula(dataLonga(dataSelecionada))}</Text>
          </View>

          {doDia.length > 0 ? doDia.map(({ missao, data }) => (
            <View key={missao.id} style={p.calendarEvent}>
              <View style={p.calendarEventIcon}><Text style={p.calendarEventEmoji}>{/^https?:\/\//i.test(missao.icone || '') ? '🌱' : (missao.icone || '🌱')}</Text></View>
              <View style={p.calendarEventInfo}>
                <Text style={p.calendarEventTitle}>{missao.nome}</Text>
                <Text style={p.calendarEventSub}>{STATUS_TEXTO[missao.status] || 'Em andamento'}</Text>
                {missao.etapas?.length ? <Text style={p.calendarEventSub}>{Math.min(missao.etapaAtual, missao.etapas.length)} de {missao.etapas.length} etapas</Text> : null}
                <Text style={p.calendarEventSub}>Última atualização às {horaCurta(data)}</Text>
              </View>
            </View>
          )) : (
            <View style={p.vazioDia}>
              <Text style={p.vazioDiaTxt}>
                {missoes.length === 0
                  ? 'Você ainda não tem tarefas. Quando o professor liberar, elas aparecem aqui depois que você começar.'
                  : totalNoMes === 0
                    ? 'Nenhuma atividade neste mês.'
                    : 'Nenhuma atividade neste dia.'}
              </Text>
              {totalNoMes === 0 && (mesAtual.ano !== hoje.getFullYear() || mesAtual.mes !== hoje.getMonth()) ? (
                <TouchableOpacity onPress={irParaHoje} activeOpacity={0.85} accessibilityRole="button">
                  <Text style={p.linkTxt}>Voltar para hoje</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          <View style={p.nota}>
            <Text style={p.notaTitulo}>Sobre as datas</Text>
            <Text style={p.notaTxt}>
              O dia mostrado é o da última atualização da tarefa (quando você começou, avançou uma etapa ou entregou). Não é prazo de entrega nem, necessariamente, o dia em que você terminou.
              {semData > 0 ? ` ${semData} ${semData === 1 ? 'tarefa ainda não foi iniciada e por isso não aparece' : 'tarefas ainda não foram iniciadas e por isso não aparecem'} no calendário.` : ''}
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  )
}

const p = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.cream, overflow: 'hidden' },
  calendarHero: { backgroundColor: colors.green, paddingTop: Platform.OS === 'android' ? 34 : 48, paddingHorizontal: 22, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, borderBottomWidth: 5, borderBottomColor: '#08761F' },
  calendarHeroRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calendarHeroText: { flex: 1, gap: 4 },
  calendarTitle: { color: colors.white, fontSize: 22, fontFamily: fonts.extrabold },
  calendarSubTitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: fonts.semibold },
  calendarPet: { width: 82, height: 82, fontSize: 54, textAlign: 'center' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingHorizontal: 20 },
  monthArrow: { color: colors.white, fontSize: 28, fontFamily: fonts.medium },
  monthName: { color: colors.white, fontSize: 20, fontFamily: fonts.bold },
  weekdays: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 16 },
  weekday: { width: '14.28%', textAlign: 'center', color: 'rgba(255,255,255,0.8)', fontSize: 10, fontFamily: fonts.semibold },
  calendarContent: { padding: 16, paddingBottom: 74 },
  calendarCard: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.white, borderRadius: 20, paddingVertical: 12, paddingHorizontal: 4, borderWidth: 1, borderColor: colors.border },
  dayCell: { width: '14.28%', height: 42, alignItems: 'center', justifyContent: 'center', gap: 3 },
  dayCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  todayRing: { borderWidth: 2, borderColor: colors.green },
  selectedDay: { backgroundColor: colors.green },
  dayText: { color: '#4B4B43', fontSize: 13, fontFamily: fonts.bold },
  mutedDay: { color: '#B8B8AD' },
  selectedDayText: { color: colors.white, fontFamily: fonts.bold },
  dayMark: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.yellow, position: 'absolute', bottom: 1 },
  dayMarkSelected: { backgroundColor: colors.white },
  dayMarkSpace: { width: 5, height: 5, position: 'absolute', bottom: 1 },
  calendarToday: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 4, backgroundColor: colors.purple, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderBottomWidth: 4, borderBottomColor: '#4D0D75' },
  calendarTodayEmoji: { fontSize: 22 },
  calendarTodayText: { flex: 1, color: colors.white, fontSize: 15, fontFamily: fonts.extrabold },
  calendarEvent: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderRadius: 16, padding: 11, marginTop: 8, borderWidth: 1.5, borderColor: colors.border, borderBottomWidth: 4, borderBottomColor: '#D8D4C1' },
  calendarEventIcon: { width: 54, height: 54, borderRadius: 16, backgroundColor: colors.greenLight, alignItems: 'center', justifyContent: 'center' },
  calendarEventEmoji: { fontSize: 32 },
  calendarEventInfo: { flex: 1, gap: 3 },
  calendarEventTitle: { color: '#20221D', fontSize: 14, fontFamily: fonts.extrabold },
  calendarEventSub: { color: '#77786F', fontSize: 12, fontFamily: fonts.medium },
  vazioDia: { marginTop: 10, backgroundColor: colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border, alignItems: 'center', gap: 8 },
  vazioDiaTxt: { color: '#65665F', fontSize: 12, fontFamily: fonts.medium, lineHeight: 18, textAlign: 'center' },
  linkTxt: { color: colors.green, fontSize: 12, fontFamily: fonts.bold },
  nota: { marginTop: 16, backgroundColor: colors.yellowLight, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#EBDDA0' },
  notaTitulo: { color: '#785A00', fontSize: 12, fontFamily: fonts.extrabold },
  notaTxt: { color: '#59502A', fontSize: 11, fontFamily: fonts.medium, lineHeight: 17, marginTop: 4 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 80, gap: 10 },
  centroEmoji: { fontSize: 44 },
  centroTitulo: { color: '#20221D', fontSize: 16, fontFamily: fonts.extrabold, textAlign: 'center' },
  centroTexto: { color: '#65665F', fontSize: 12, fontFamily: fonts.medium, lineHeight: 18, textAlign: 'center' },
  botao: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green, borderRadius: 16, borderBottomWidth: 5, borderBottomColor: '#08761F', marginTop: 8, paddingHorizontal: 18 },
  botaoTxt: { color: colors.white, fontSize: 15, fontFamily: fonts.extrabold },
})