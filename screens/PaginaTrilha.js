import { useEffect, useRef, useState } from 'react'
import { View, StyleSheet, TouchableOpacity, ScrollView, Image, Platform, Alert } from 'react-native'
import { Text, ActivityIndicator } from 'react-native-paper'
import { colors, fonts } from '../theme'
import { avancarEtapaTarefa, iniciarMissao, concluirMissao } from '../services/storage'
import { mensagemDeErroAluno } from './useDadosAluno'

// Página "Trilha" do aluno (página 1 do paginador do PetScreen).
//
// Mostra as tarefas REAIS da turma do aluno e o progresso dele em cada uma, vindos de
// listarMissoesDoAluno() (RPC aluno_minhas_missoes). Nada de XP, etapas ou datas fixas.
//
// Regras do servidor que esta tela respeita (não as decide):
//   • o aluno só avança UMA etapa por vez, na ordem (aluno_avancar_etapa); o XP da etapa é creditado
//     uma única vez pelo servidor;
//   • entregar (pendente -> entregue) é irreversível; aprovar é só do professor.
//
// Props:
//   width        largura da página
//   petImage     URL do PET da turma (enfeite do cabeçalho)
//   alunoId      id do aluno logado (os serviços ignoram o parâmetro e usam o token)
//   missoes      lista vinda de useDadosAluno
//   estado       'ocioso' | 'carregando' | 'pronto' | 'erro'
//   erro         erro da última carga, quando estado === 'erro'
//   onRecarregar tenta carregar de novo (botão do estado de erro)
//   onAtualizado chamado depois de cada ação para reler tarefas, XP e progresso

function MiniPet({ uri, emoji = '🌱', style }) {
  return uri
    ? <Image source={{ uri }} style={style} resizeMode="contain" />
    : <Text style={style}>{emoji}</Text>
}

const STATUS_TEXTO = {
  pendente: 'Em andamento',
  entregue: 'Entregue, aguardando o professor',
  aprovado: 'Aprovada',
}

function ehUrl(valor) {
  return typeof valor === 'string' && /^https?:\/\//i.test(valor)
}

export function xpTotalDaTarefa(missao) {
  if (missao.etapas.length) return missao.etapas.reduce((soma, etapa) => soma + (Number(etapa.xp) || 0), 0)
  return Number(missao.xp) || 0
}

export function xpGanhoNaTarefa(missao) {
  const feitas = Math.min(missao.etapaAtual, missao.etapas.length)
  return missao.etapas.slice(0, feitas).reduce((soma, etapa) => soma + (Number(etapa.xp) || 0), 0)
}

export function rotuloDeStatus(missao) {
  if (missao.status === 'pendente' && !missao.atualizadoEm && missao.etapaAtual === 0) return 'Não iniciada'
  return STATUS_TEXTO[missao.status] || 'Em andamento'
}

// Confirmação antes de entregar (irreversível). Alert.alert não faz nada no navegador: usa window.confirm lá.
function confirmar(titulo, texto, rotuloOk) {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' && typeof window.confirm === 'function'
      ? window.confirm(`${titulo}\n\n${texto}`)
      : true)
  }
  return new Promise(resolve => {
    Alert.alert(titulo, texto, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: rotuloOk, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) })
  })
}

export default function PaginaTrilha({ width, petImage, alunoId, missoes = [], estado, erro, onRecarregar, onAtualizado }) {
  const [selecionadaId, setSelecionadaId] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState(null) // { tipo: 'ok' | 'erro', texto }
  const trava = useRef(false)              // evita dois toques seguidos avançarem duas etapas
  const vivo = useRef(true)                // não mexe no estado depois de a página sair da tela
  useEffect(() => { vivo.current = true; return () => { vivo.current = false } }, [])

  // Mantém a tarefa escolhida quando a lista é atualizada; senão, abre a primeira que ainda não foi aprovada.
  const missao = missoes.find(m => String(m.id) === String(selecionadaId))
    || missoes.find(m => m.status !== 'aprovado')
    || missoes[0]
    || null

  useEffect(() => { setAviso(null) }, [selecionadaId])

  async function executar(acao, textoOk) {
    if (trava.current) return
    trava.current = true
    setOcupado(true)
    setAviso(null)
    let semSessao = false
    try {
      await acao()
      if (vivo.current) setAviso({ tipo: 'ok', texto: textoOk })
    } catch (e) {
      semSessao = e?.codigo === 'sessao_invalida'
      if (vivo.current) setAviso({ tipo: 'erro', texto: mensagemDeErroAluno(e) })
    } finally {
      // Releitura mesmo depois de um erro: o servidor é a fonte da verdade e o estado pode ter mudado.
      if (!semSessao) { try { await onAtualizado?.() } catch { /* a lista continua a anterior */ } }
      trava.current = false
      if (vivo.current) setOcupado(false)
    }
  }

  function avancar() {
    if (!missao) return
    const etapa = missao.etapas[missao.etapaAtual]
    const xp = Number(etapa?.xp) || 0
    executar(() => avancarEtapaTarefa(missao.id), `Etapa concluída! +${xp} XP`)
  }

  function iniciar() {
    if (!missao) return
    executar(() => iniciarMissao(alunoId, missao.id), 'Tarefa iniciada.')
  }

  async function entregar() {
    if (!missao) return
    const ok = await confirmar('Entregar tarefa?', 'Depois de entregar, não dá para voltar atrás. O professor vai avaliar.', 'Entregar')
    if (!ok) return
    executar(() => concluirMissao(alunoId, missao.id), 'Tarefa entregue! Agora é com o professor.')
  }

  const total = missao ? missao.etapas.length : 0
  const feitas = missao ? Math.min(missao.etapaAtual, total) : 0
  const concluiuTodas = !!missao && total > 0 && feitas >= total
  const xpTotal = missao ? xpTotalDaTarefa(missao) : 0
  const xpGanho = missao ? xpGanhoNaTarefa(missao) : 0

  const carregando = (estado === 'ocioso' || estado === 'carregando') && missoes.length === 0

  return (
    <View style={[p.page, { width }]}>
      <View style={p.taskHero}>
        <MiniPet uri={petImage} emoji="🌱" style={p.taskHeroPet} />
        <View style={p.taskHeroText}>
          <Text style={p.taskHeroEyebrow}>TRILHA DO PET</Text>
          <Text style={p.taskHeroTitle} numberOfLines={2}>{missao ? missao.nome : 'Suas tarefas'}</Text>
        </View>
        {missao && total > 0 ? (
          <View style={p.taskCount}><Text style={p.taskCountText}>{feitas}/{total}</Text></View>
        ) : null}
      </View>

      {carregando ? (
        <View style={p.centro}>
          <ActivityIndicator color={colors.green} />
          <Text style={p.centroTexto}>Carregando suas tarefas…</Text>
        </View>
      ) : estado === 'erro' && missoes.length === 0 ? (
        <View style={p.centro}>
          <Text style={p.centroEmoji}>😕</Text>
          <Text style={p.centroTitulo}>Não foi possível carregar</Text>
          <Text style={p.centroTexto}>{mensagemDeErroAluno(erro)}</Text>
          <TouchableOpacity onPress={onRecarregar} activeOpacity={0.85} style={p.botaoPrincipal} accessibilityRole="button">
            <Text style={p.botaoPrincipalTxt}>Tentar de novo</Text>
          </TouchableOpacity>
        </View>
      ) : !missao ? (
        <View style={p.centro}>
          <Text style={p.centroEmoji}>🌿</Text>
          <Text style={p.centroTitulo}>Nenhuma tarefa por enquanto</Text>
          <Text style={p.centroTexto}>Quando o professor liberar tarefas para a sua turma, elas aparecem aqui.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={p.taskContent} showsVerticalScrollIndicator={false}>
          {missoes.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={p.seletor}>
              {missoes.map(m => {
                const ativa = String(m.id) === String(missao.id)
                return (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() => setSelecionadaId(m.id)}
                    activeOpacity={0.85}
                    style={[p.chip, ativa && p.chipAtivo]}
                    accessibilityRole="button"
                  >
                    <Text style={[p.chipTxt, ativa && p.chipTxtAtivo]} numberOfLines={1}>
                      {m.status === 'aprovado' ? '✓ ' : ''}{m.nome}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          ) : null}

          <View style={p.statusLinha}>
            {ehUrl(missao.icone) ? <Image source={{ uri: missao.icone }} style={p.statusIcone} resizeMode="contain" /> : null}
            <Text style={p.statusTxt}>{rotuloDeStatus(missao)}</Text>
          </View>

          {missao.descricao ? <Text style={p.descricao}>{missao.descricao}</Text> : null}

          {total > 0 ? (
            <View style={p.taskProgressCard}>
              <Text style={p.taskProgressTitle}>Sua trilha</Text>
              <View style={p.taskProgressTrack}>
                <View style={[p.taskProgressFill, { width: `${(feitas / total) * 100}%` }]} />
              </View>
              <Text style={p.taskProgressSub}>{feitas} de {total} etapas prontas · {xpGanho} de {xpTotal} XP</Text>
            </View>
          ) : (
            <View style={p.taskProgressCard}>
              <Text style={p.taskProgressTitle}>Esta tarefa não tem etapas</Text>
              <Text style={p.taskProgressSub}>{xpTotal > 0 ? `Vale ${xpTotal} XP quando o professor aprovar.` : 'Entregue quando terminar.'}</Text>
            </View>
          )}

          {total > 0 ? (
            <View style={p.stepsList}>
              {missao.etapas.map((etapa, i) => {
                const feita = i < feitas
                const proxima = i === feitas && missao.status === 'pendente'
                return (
                  <View key={`${missao.id}-${i}`} style={p.stepRow}>
                    <View style={p.stepRail}>
                      <View style={[p.stepNumber, feita && p.stepDone]}>
                        <Text style={[p.stepNumberText, feita && p.stepDoneText]}>{feita ? '✓' : i + 1}</Text>
                      </View>
                      {i < total - 1 ? <View style={[p.stepLine, feita && p.stepLineDone]} /> : null}
                    </View>
                    <View style={[p.stepCard, feita && p.stepCardDone]}>
                      <View style={p.stepInfo}>
                        <Text style={p.stepTitle}>{etapa.titulo || `Etapa ${i + 1}`}</Text>
                        <Text style={p.stepDate}>{feita ? 'Etapa concluída' : proxima ? 'Próxima etapa' : 'Fica livre ao concluir a anterior'}</Text>
                      </View>
                      <View style={p.stepXp}><Text style={p.stepXpText}>+{Number(etapa.xp) || 0} XP</Text></View>
                    </View>
                  </View>
                )
              })}
            </View>
          ) : null}

          {aviso ? (
            <View style={[p.aviso, aviso.tipo === 'erro' ? p.avisoErro : p.avisoOk]}>
              <Text style={[p.avisoTxt, aviso.tipo === 'erro' ? p.avisoTxtErro : p.avisoTxtOk]}>{aviso.texto}</Text>
            </View>
          ) : null}

          {missao.status === 'pendente' && total > 0 && !concluiuTodas ? (
            <TouchableOpacity onPress={avancar} disabled={ocupado} activeOpacity={0.85} accessibilityRole="button"
              style={[p.botaoPrincipal, ocupado && p.botaoDesabilitado]}>
              {ocupado ? <ActivityIndicator color={colors.white} /> : <Text style={p.botaoPrincipalTxt}>Concluir etapa {feitas + 1}</Text>}
            </TouchableOpacity>
          ) : null}

          {missao.status === 'pendente' && total === 0 && !missao.atualizadoEm ? (
            <TouchableOpacity onPress={iniciar} disabled={ocupado} activeOpacity={0.85} accessibilityRole="button"
              style={[p.botaoPrincipal, ocupado && p.botaoDesabilitado]}>
              {ocupado ? <ActivityIndicator color={colors.white} /> : <Text style={p.botaoPrincipalTxt}>Iniciar tarefa</Text>}
            </TouchableOpacity>
          ) : null}

          {missao.status === 'pendente' && (concluiuTodas || (total === 0 && !!missao.atualizadoEm)) ? (
            <TouchableOpacity onPress={entregar} disabled={ocupado} activeOpacity={0.85} accessibilityRole="button"
              style={[p.botaoEntregar, ocupado && p.botaoDesabilitado]}>
              {ocupado ? <ActivityIndicator color={colors.white} /> : <Text style={p.botaoPrincipalTxt}>Entregar para avaliação</Text>}
            </TouchableOpacity>
          ) : null}

          {missao.status === 'entregue' ? (
            <Text style={p.rodape}>Você já entregou esta tarefa. O professor vai avaliar.</Text>
          ) : null}
          {missao.status === 'aprovado' ? (
            <Text style={p.rodape}>Tarefa aprovada pelo professor. Parabéns!</Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  )
}

const p = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.cream, overflow: 'hidden' },
  taskHero: { minHeight: 104, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: Platform.OS === 'android' ? 24 : 18, gap: 9, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, borderBottomWidth: 5, borderBottomColor: '#08761F' },
  taskHeroPet: { width: 68, height: 68, fontSize: 48, textAlign: 'center' },
  taskHeroText: { flex: 1, gap: 4 },
  taskHeroEyebrow: { color: 'rgba(255,255,255,0.78)', fontSize: 9, fontFamily: fonts.bold, letterSpacing: 1 },
  taskHeroTitle: { color: colors.white, fontSize: 19, fontFamily: fonts.extrabold },
  taskCount: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.yellow, borderWidth: 3, borderColor: '#835F00', alignItems: 'center', justifyContent: 'center' },
  taskCountText: { color: '#171914', fontSize: 14, fontFamily: fonts.extrabold },
  taskContent: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 84 },
  seletor: { gap: 8, paddingBottom: 12 },
  chip: { maxWidth: 200, backgroundColor: colors.white, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1.5, borderColor: colors.border },
  chipAtivo: { backgroundColor: colors.green, borderColor: '#08761F' },
  chipTxt: { color: '#4B4B43', fontSize: 12, fontFamily: fonts.bold },
  chipTxtAtivo: { color: colors.white },
  statusLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  statusIcone: { width: 22, height: 22 },
  statusTxt: { color: colors.green, fontSize: 12, fontFamily: fonts.bold },
  descricao: { color: '#59645A', fontSize: 12, fontFamily: fonts.medium, lineHeight: 18, marginBottom: 12 },
  taskProgressCard: { backgroundColor: colors.purple, borderRadius: 18, padding: 14, borderBottomWidth: 5, borderBottomColor: '#4D0D75', marginBottom: 14 },
  taskProgressTitle: { color: colors.white, fontSize: 17, fontFamily: fonts.extrabold },
  taskProgressTrack: { height: 14, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden', marginTop: 10 },
  taskProgressFill: { height: '100%', borderRadius: 8, backgroundColor: '#7CE82B' },
  taskProgressSub: { color: '#F3E8FF', fontSize: 12, fontFamily: fonts.bold, marginTop: 7 },
  stepsList: { gap: 0 },
  stepRow: { minHeight: 72, flexDirection: 'row', alignItems: 'stretch', gap: 9 },
  stepRail: { width: 32, alignItems: 'center' },
  stepNumber: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.yellow, borderWidth: 2, borderColor: '#8B6900', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  stepDone: { backgroundColor: colors.green, borderColor: '#08761F' },
  stepNumberText: { color: '#302500', fontSize: 12, fontFamily: fonts.extrabold },
  stepDoneText: { color: colors.white, fontSize: 15 },
  stepLine: { position: 'absolute', top: 28, bottom: -2, width: 4, backgroundColor: '#D9D6C8' },
  stepLineDone: { backgroundColor: colors.green },
  stepCard: { flex: 1, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: 15, paddingHorizontal: 11, paddingVertical: 7, borderWidth: 1.5, borderColor: colors.border, borderBottomWidth: 4, borderBottomColor: '#D7D2BE', marginBottom: 10 },
  stepCardDone: { backgroundColor: colors.greenLight, borderColor: '#B6DDBE', borderBottomColor: '#8CC796' },
  stepInfo: { flex: 1, gap: 3 },
  stepTitle: { color: '#20221D', fontSize: 14, fontFamily: fonts.extrabold },
  stepDate: { color: '#74766D', fontSize: 11, fontFamily: fonts.semibold },
  stepXp: { backgroundColor: colors.yellowLight, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 7 },
  stepXpText: { color: '#785A00', fontSize: 11, fontFamily: fonts.extrabold },
  aviso: { borderRadius: 14, padding: 12, marginTop: 6, marginBottom: 6, borderWidth: 1.5 },
  avisoOk: { backgroundColor: colors.greenLight, borderColor: '#B6DDBE' },
  avisoErro: { backgroundColor: colors.red, borderColor: '#f3b4b4' },
  avisoTxt: { fontSize: 12, fontFamily: fonts.bold, lineHeight: 17 },
  avisoTxtOk: { color: colors.green },
  avisoTxtErro: { color: '#a02121' },
  botaoPrincipal: { minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green, borderRadius: 16, borderBottomWidth: 5, borderBottomColor: '#08761F', marginTop: 8, paddingHorizontal: 18 },
  botaoEntregar: { minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.purple, borderRadius: 16, borderBottomWidth: 5, borderBottomColor: '#4D0D75', marginTop: 8, paddingHorizontal: 18 },
  botaoDesabilitado: { opacity: 0.6 },
  botaoPrincipalTxt: { color: colors.white, fontSize: 16, fontFamily: fonts.extrabold },
  rodape: { textAlign: 'center', color: '#59645A', fontSize: 12, fontFamily: fonts.semibold, marginTop: 14 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 80, gap: 10 },
  centroEmoji: { fontSize: 44 },
  centroTitulo: { color: '#20221D', fontSize: 16, fontFamily: fonts.extrabold, textAlign: 'center' },
  centroTexto: { color: '#65665F', fontSize: 12, fontFamily: fonts.medium, lineHeight: 18, textAlign: 'center' },
})