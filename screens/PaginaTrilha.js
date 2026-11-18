import { useEffect, useRef, useState } from 'react'
import { View, StyleSheet, TouchableOpacity, ScrollView, Image, Platform } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Text, ActivityIndicator } from 'react-native-paper'
import { colors, fonts } from '../theme'
import { enviarFotoEtapaTarefa, concluirMissao } from '../services/storage'
import { mensagemDeErroAluno } from './useDadosAluno'

// Página "Trilha" do aluno (página 1 do paginador do PetScreen).
//
// Mostra as trilhas reais da turma, suas tarefas e o progresso do aluno.
//
// Regras do servidor que esta tela respeita (não as decide):
//   • cada tarefa credita suas moedas após aprovação do professor; o bônus final entra após aprovação da coordenação;
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
//   onAtualizado chamado depois de cada ação para reler tarefas, moedas e progresso

function MiniPet({ uri, emoji = '🌱', style }) {
  return uri
    ? <Image source={{ uri }} style={style} resizeMode="contain" />
    : <Text style={style}>{emoji}</Text>
}

const STATUS_TEXTO = {
  pendente: 'Em andamento',
  entregue: 'Entregue, aguardando a coordenação',
  aprovado: 'Aprovada',
}

function ehUrl(valor) {
  return typeof valor === 'string' && /^https?:\/\//i.test(valor)
}

export function rotuloDeStatus(missao) {
  if (missao.status === 'pendente' && !missao.atualizadoEm && missao.etapaAtual === 0) return 'Não iniciada'
  return STATUS_TEXTO[missao.status] || 'Em andamento'
}

export default function PaginaTrilha({ width, petImage, alunoId, missoes = [], estado, erro, onRecarregar, onAtualizado, destinoMissao }) {
  const [selecionadaId, setSelecionadaId] = useState(null)
  const [etapaSelecionada, setEtapaSelecionada] = useState(null)
  const [fotoEtapa, setFotoEtapa] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState(null) // { tipo: 'ok' | 'erro', texto }
  const trava = useRef(false)              // evita dois toques seguidos avançarem duas etapas
  const vivo = useRef(true)                // não mexe no estado depois de a página sair da tela
  const destinoAplicado = useRef(null)
  useEffect(() => { vivo.current = true; return () => { vivo.current = false } }, [])

  const missao = missoes.find(m => String(m.id) === String(selecionadaId)) || null

  useEffect(() => { setAviso(null) }, [selecionadaId])
  useEffect(() => {
    if (!destinoMissao?.missaoId || destinoAplicado.current === destinoMissao.chave || !missoes.some(m => String(m.id) === String(destinoMissao.missaoId))) return
    destinoAplicado.current = destinoMissao.chave
    setSelecionadaId(destinoMissao.missaoId)
    setEtapaSelecionada(null)
    setAviso(null)
  }, [destinoMissao?.chave, destinoMissao?.missaoId, missoes])

  async function executar(acao, textoOk, aoConcluir) {
    if (trava.current) return false
    trava.current = true
    setOcupado(true)
    setAviso(null)
    let semSessao = false
    try {
      await acao()
      if (vivo.current) { setAviso({ tipo: 'ok', texto: textoOk }); aoConcluir?.(); }
      return true
    } catch (e) {
      semSessao = e?.codigo === 'sessao_invalida'
      if (vivo.current) setAviso({ tipo: 'erro', texto: mensagemDeErroAluno(e) })
    } finally {
      // Releitura mesmo depois de um erro: o servidor é a fonte da verdade e o estado pode ter mudado.
      if (!semSessao) { try { await onAtualizado?.() } catch { /* a lista continua a anterior */ } }
      trava.current = false
      if (vivo.current) setOcupado(false)
    }
    return false
  }

  async function escolherFoto() {
    try {
      if (Platform.OS !== 'web') {
        const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (!permissao.granted) { setAviso({ tipo: 'erro', texto: 'Permita o acesso às fotos para enviar a tarefa.' }); return }
      }
      const resultado = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.45 })
      if (resultado.canceled) return
      const asset = resultado.assets?.[0]
      if (!asset) return
      if (asset.fileSize && asset.fileSize > 1024 * 1024) {
        setFotoEtapa(null)
        setAviso({ tipo: 'erro', texto: 'A foto ficou maior que 1 MB. Escolha ou tire uma foto menor.' })
        return
      }
      setFotoEtapa(asset)
      setAviso(null)
    } catch (error) {
      setAviso({ tipo: 'erro', texto: error?.message || 'Não foi possível abrir suas fotos.' })
    }
  }

  function enviarFoto() {
    if (!missao || etapaSelecionada === null || !fotoEtapa) {
      setAviso({ tipo: 'erro', texto: 'Escolha uma foto para enviar ao professor.' })
      return
    }
    const moedas = Number(missao.etapas[etapaSelecionada]?.moedas) || 0
    executar(() => enviarFotoEtapaTarefa(missao.id, etapaSelecionada + 1, fotoEtapa), `Foto enviada! O professor vai conferir. Após aprovação: +${moedas} moedas.`, () => { setEtapaSelecionada(null); setFotoEtapa(null) })
  }

  function entregar() {
    if (!missao) return
    executar(() => concluirMissao(alunoId, missao.id), 'Trilha enviada! Aguarde a aprovação para receber suas moedas.')
  }

  const total = missao ? missao.etapas.length : 0
  const feitas = missao ? Math.min(missao.etapaAtual, total) : 0
  const concluiuTodas = !!missao && total > 0 && feitas >= total

  const carregando = (estado === 'ocioso' || estado === 'carregando') && missoes.length === 0

  return (
    <View style={[p.page, { width }]}>
      <View style={p.taskHero}>
        <MiniPet uri={petImage} emoji="🌱" style={p.taskHeroPet} />
        <View style={p.taskHeroText}>
          <Text style={p.taskHeroEyebrow}>TRILHA DO PET</Text>
          <Text style={p.taskHeroTitle} numberOfLines={2}>{missao ? (etapaSelecionada === null ? missao.nome : (missao.etapas[etapaSelecionada]?.titulo || `Tarefa ${etapaSelecionada + 1}`)) : 'Suas trilhas'}</Text>
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
      ) : !missao && missoes.length ? (
        <ScrollView contentContainerStyle={p.taskContent} showsVerticalScrollIndicator={false}>
          {missoes.map(m => {
            const n = (m.etapas || []).length
            const feitasNaTrilha = Math.min(Number(m.etapaAtual) || 0, n)
            return <View key={m.id} style={p.trailCard}>
              <View style={p.trailHeading}>
                {ehUrl(m.icone) ? <Image source={{ uri: m.icone }} style={p.statusIcone} resizeMode="contain" /> : <Text style={p.trailEmoji}>{m.icone || '🌿'}</Text>}
                <View style={p.trailText}><Text style={p.trailTitle}>{m.nome}</Text><Text style={p.trailSub}>{feitasNaTrilha}/{n} tarefas · {rotuloDeStatus(m)}</Text></View>
              </View>
              {!!m.descricao && <Text style={p.trailDescription} numberOfLines={2}>{m.descricao}</Text>}
              <TouchableOpacity onPress={() => { setSelecionadaId(m.id); setEtapaSelecionada(null); setAviso(null) }} activeOpacity={0.85} style={p.accessTrail} accessibilityRole="button"><Text style={p.accessTrailText}>Acessar trilha  ›</Text></TouchableOpacity>
            </View>
          })}
        </ScrollView>
      ) : !missao ? (
        <View style={p.centro}>
          <Text style={p.centroEmoji}>🌿</Text>
          <Text style={p.centroTitulo}>Nenhuma tarefa por enquanto</Text>
          <Text style={p.centroTexto}>Quando o professor liberar tarefas para a sua turma, elas aparecem aqui.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={p.taskContent} showsVerticalScrollIndicator={false}>
          {etapaSelecionada === null ? <>
            <TouchableOpacity onPress={() => setSelecionadaId(null)} style={p.voltar} accessibilityRole="button"><Text style={p.voltarTxt}>‹ Todas as trilhas</Text></TouchableOpacity>
            <View style={p.statusLinha}><Text style={p.statusTxt}>{rotuloDeStatus(missao)}</Text></View>
            {!!missao.descricao && <Text style={p.descricao}>{missao.descricao}</Text>}
            <View style={p.taskProgressCard}>
              <Text style={p.taskProgressTitle}>Sua aventura</Text>
              <View style={p.taskProgressTrack}><View style={[p.taskProgressFill, { width: `${total ? (feitas / total) * 100 : 0}%` }]} /></View>
              <Text style={p.taskProgressSub}>{feitas} de {total} tarefas completas</Text>
            </View>
            {total ? <View style={p.pathList}>
              {missao.etapas.map((etapa, i) => {
                const feita = i < feitas
                const liberada = i <= feitas || missao.status !== 'pendente'
                return <View key={`${missao.id}-${i}`} style={p.pathRow}>
                  <View style={p.pathRail}><View style={[p.pathNode, feita && p.pathNodeDone, !liberada && p.pathNodeLocked]}><Text style={p.pathNodeText}>{feita ? '✓' : i + 1}</Text></View>{i < total - 1 && <View style={[p.pathLine, feita && p.pathLineDone]} />}</View>
                  <TouchableOpacity disabled={!liberada} onPress={() => { setEtapaSelecionada(i); setFotoEtapa(null) }} activeOpacity={0.82} style={[p.pathTask, feita && p.pathTaskDone, !liberada && p.pathTaskLocked]} accessibilityRole="button">
                    <Text style={p.pathTaskTitle}>{etapa.titulo || `Tarefa ${i + 1}`}</Text>
                    <Text style={p.pathTaskSub}>{feita || etapa.statusEnvio === 'aprovado' ? 'Concluída ✓' : etapa.statusEnvio === 'enviado' ? 'Foto enviada · aguardando professor' : etapa.statusEnvio === 'recusado' ? 'Precisa de outra foto' : liberada ? 'Toque para abrir' : 'Complete a tarefa anterior'}</Text>
                    <Text style={p.pathCoins}>🪙 {Number(etapa.moedas) || 0}</Text>
                  </TouchableOpacity>
                </View>
              })}
            </View> : <Text style={p.centroTexto}>Esta trilha ainda não tem tarefas.</Text>}
            {aviso && <View style={[p.aviso, aviso.tipo === 'erro' ? p.avisoErro : p.avisoOk]}><Text style={[p.avisoTxt, aviso.tipo === 'erro' ? p.avisoTxtErro : p.avisoTxtOk]}>{aviso.texto}</Text></View>}
            {missao.status === 'pendente' && total > 0 && concluiuTodas && <View style={p.finalTrilha}>
              <Text style={p.finalEmoji}>🎉</Text>
              <Text style={p.finalTitulo}>Trilha finalizada!</Text>
              <Text style={p.finalTexto}>Envie para a coordenação e ganhe +{Number(missao.moedas) || 0} moedas após a aprovação.</Text>
              <TouchableOpacity onPress={entregar} disabled={ocupado} activeOpacity={0.85} style={[p.botaoEntregar, ocupado && p.botaoDesabilitado]} accessibilityRole="button">
                {ocupado ? <ActivityIndicator color={colors.white} /> : <Text style={p.botaoPrincipalTxt}>✨ ENVIAR TRILHA ✨</Text>}
              </TouchableOpacity>
            </View>}
            {missao.status === 'entregue' && <Text style={p.rodape}>Trilha entregue! Aguarde a avaliação.</Text>}
            {missao.status === 'aprovado' && <Text style={p.rodape}>Trilha aprovada! +{Number(missao.moedas) || 0} moedas de bônus 🎉</Text>}
          </> : <>
            <TouchableOpacity onPress={() => setEtapaSelecionada(null)} style={p.voltar} accessibilityRole="button"><Text style={p.voltarTxt}>‹ Voltar para a trilha</Text></TouchableOpacity>
            <View style={p.instructionCard}>
              <Text style={p.instructionNumber}>TAREFA {etapaSelecionada + 1} DE {total}</Text>
              <Text style={p.instructionTitle}>{missao.etapas[etapaSelecionada]?.titulo || `Tarefa ${etapaSelecionada + 1}`}</Text>
              <Text style={p.instructionDescription}>{missao.etapas[etapaSelecionada]?.descricao || 'Siga as instruções desta tarefa.'}</Text>
              <View style={p.rewardPill}><Text style={p.rewardText}>🪙 {Number(missao.etapas[etapaSelecionada]?.moedas) || 0} moedas</Text></View>
            </View>
            {aviso && <View style={[p.aviso, aviso.tipo === 'erro' ? p.avisoErro : p.avisoOk]}><Text style={[p.avisoTxt, aviso.tipo === 'erro' ? p.avisoTxtErro : p.avisoTxtOk]}>{aviso.texto}</Text></View>}
            {missao.etapas[etapaSelecionada]?.statusEnvio === 'enviado' ? <View style={[p.aviso, p.avisoOk]}><Text style={p.avisoTxtOk}>Foto enviada! Aguarde o professor conferir.</Text></View> : null}
            {missao.status === 'pendente' && etapaSelecionada === feitas && !concluiuTodas && missao.etapas[etapaSelecionada]?.statusEnvio !== 'enviado' ? <>
              <TouchableOpacity onPress={escolherFoto} disabled={ocupado} activeOpacity={0.85} style={p.escolherFoto} accessibilityRole="button"><Text style={p.escolherFotoTexto}>{fotoEtapa ? '📷 Trocar foto' : '📷 Escolher foto'}</Text></TouchableOpacity>
              {fotoEtapa?.uri ? <Image source={{ uri: fotoEtapa.uri }} style={p.previewFoto} resizeMode="cover" /> : null}
              <TouchableOpacity onPress={enviarFoto} disabled={ocupado || !fotoEtapa} activeOpacity={0.85} style={[p.botaoPrincipal, (ocupado || !fotoEtapa) && p.botaoDesabilitado]}>{ocupado ? <ActivityIndicator color={colors.white} /> : <Text style={p.botaoPrincipalTxt}>Enviar para o professor</Text>}</TouchableOpacity>
              <Text style={p.rodape}>Foto de até 1 MB · moedas após aprovação</Text>
            </> : null}
            {etapaSelecionada < feitas && <View style={p.avisoOk}><Text style={p.avisoTxtOk}>Tarefa concluída ✓</Text></View>}
          </>}
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
  trailCard: { backgroundColor: colors.white, borderRadius: 20, padding: 14, marginBottom: 14, borderWidth: 1.5, borderColor: colors.border, borderBottomWidth: 5, borderBottomColor: '#D7D2BE' }, trailHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, trailEmoji: { fontSize: 32 }, trailText: { flex: 1 }, trailTitle: { color: '#20221D', fontSize: 19, fontFamily: fonts.extrabold }, trailSub: { color: colors.muted, fontSize: 12, fontFamily: fonts.semibold, marginTop: 3 }, trailDescription: { color: '#59645A', fontSize: 13, fontFamily: fonts.medium, lineHeight: 18, marginTop: 10 }, accessTrail: { minHeight: 48, backgroundColor: colors.green, borderRadius: 14, borderBottomWidth: 4, borderBottomColor: '#08761F', alignItems: 'center', justifyContent: 'center', marginTop: 12 }, accessTrailText: { color: colors.white, fontSize: 16, fontFamily: fonts.extrabold },
  voltar: { paddingVertical: 6, marginBottom: 6 }, voltarTxt: { color: colors.green, fontSize: 14, fontFamily: fonts.bold },
  escolherFoto: { minHeight: 48, borderRadius: 14, backgroundColor: '#FFF2B2', borderWidth: 1.5, borderColor: '#D9B800', alignItems: 'center', justifyContent: 'center', marginTop: 16 }, escolherFotoTexto: { color: '#735500', fontSize: 16, fontFamily: fonts.extrabold }, previewFoto: { width: '100%', height: 190, borderRadius: 16, marginTop: 10, backgroundColor: colors.border },
  pathList: { paddingTop: 6 }, pathRow: { minHeight: 82, flexDirection: 'row', gap: 10 }, pathRail: { width: 40, alignItems: 'center' }, pathNode: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.yellow, borderWidth: 2, borderColor: '#8B6900', alignItems: 'center', justifyContent: 'center', zIndex: 1 }, pathNodeDone: { backgroundColor: colors.green, borderColor: '#08761F' }, pathNodeLocked: { backgroundColor: '#DDDCCF', borderColor: '#C5C3B7' }, pathNodeText: { color: '#302500', fontSize: 13, fontFamily: fonts.extrabold }, pathLine: { position: 'absolute', top: 31, bottom: -3, width: 5, backgroundColor: '#D9D6C8' }, pathLineDone: { backgroundColor: colors.green }, pathTask: { flex: 1, minHeight: 68, borderRadius: 16, backgroundColor: colors.white, padding: 12, marginBottom: 12, borderWidth: 1.5, borderColor: colors.border, borderBottomWidth: 4, borderBottomColor: '#D7D2BE' }, pathTaskDone: { backgroundColor: colors.greenLight, borderColor: '#B6DDBE' }, pathTaskLocked: { opacity: 0.62 }, pathTaskTitle: { color: '#20221D', fontSize: 15, fontFamily: fonts.extrabold }, pathTaskSub: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium, marginTop: 3 }, pathCoins: { color: '#866400', fontSize: 12, fontFamily: fonts.bold, marginTop: 4 },
  instructionCard: { backgroundColor: colors.white, padding: 18, borderRadius: 20, borderWidth: 2, borderColor: colors.border, borderBottomWidth: 5, borderBottomColor: '#D7D2BE', marginTop: 8 }, instructionNumber: { color: colors.green, fontSize: 12, fontFamily: fonts.extrabold, letterSpacing: 1 }, instructionTitle: { color: '#20221D', fontSize: 23, fontFamily: fonts.extrabold, marginTop: 9 }, instructionDescription: { color: '#59645A', fontSize: 17, fontFamily: fonts.medium, lineHeight: 25, marginTop: 12 }, rewardPill: { alignSelf: 'flex-start', backgroundColor: '#FFF2B2', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, marginTop: 18 }, rewardText: { color: '#735500', fontSize: 15, fontFamily: fonts.extrabold },
  seletor: { gap: 8, paddingBottom: 12 },
  chip: { maxWidth: 200, backgroundColor: colors.white, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1.5, borderColor: colors.border },
  chipAtivo: { backgroundColor: colors.green, borderColor: '#08761F' },
  chipTxt: { color: '#4B4B43', fontSize: 12, fontFamily: fonts.bold },
  chipTxtAtivo: { color: colors.white },
  statusLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  statusIcone: { width: 22, height: 22 },
  statusEmoji: { fontSize: 22 },
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
  stepDescription: { color: colors.muted, fontSize: 12, fontFamily: fonts.regular, lineHeight: 17 },
  stepDate: { color: '#74766D', fontSize: 11, fontFamily: fonts.semibold },
  stepDoneMark: { color: colors.green, fontSize: 18, fontFamily: fonts.extrabold },
  aviso: { borderRadius: 14, padding: 12, marginTop: 6, marginBottom: 6, borderWidth: 1.5 },
  avisoOk: { backgroundColor: colors.greenLight, borderColor: '#B6DDBE' },
  avisoErro: { backgroundColor: colors.red, borderColor: '#f3b4b4' },
  avisoTxt: { fontSize: 12, fontFamily: fonts.bold, lineHeight: 17 },
  avisoTxtOk: { color: colors.green },
  avisoTxtErro: { color: '#a02121' },
  botaoPrincipal: { minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green, borderRadius: 16, borderBottomWidth: 5, borderBottomColor: '#08761F', marginTop: 8, paddingHorizontal: 18 },
  botaoEntregar: { minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.purple, borderRadius: 16, borderBottomWidth: 5, borderBottomColor: '#4D0D75', marginTop: 8, paddingHorizontal: 18 },
  finalTrilha: { alignItems: 'center', backgroundColor: '#FFF7D5', borderColor: colors.yellow, borderWidth: 2, borderRadius: 20, padding: 16, marginTop: 14, marginBottom: 14, gap: 6 },
  finalEmoji: { fontSize: 38 },
  finalTitulo: { color: '#245C2D', fontSize: 20, fontFamily: fonts.extrabold, textAlign: 'center' },
  finalTexto: { color: '#47452E', fontSize: 14, lineHeight: 20, fontFamily: fonts.semibold, textAlign: 'center' },
  botaoDesabilitado: { opacity: 0.6 },
  botaoPrincipalTxt: { color: colors.white, fontSize: 16, fontFamily: fonts.extrabold },
  rodape: { textAlign: 'center', color: '#59645A', fontSize: 12, fontFamily: fonts.semibold, marginTop: 14 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 80, gap: 10 },
  centroEmoji: { fontSize: 44 },
  centroTitulo: { color: '#20221D', fontSize: 16, fontFamily: fonts.extrabold, textAlign: 'center' },
  centroTexto: { color: '#65665F', fontSize: 12, fontFamily: fonts.medium, lineHeight: 18, textAlign: 'center' },
})
