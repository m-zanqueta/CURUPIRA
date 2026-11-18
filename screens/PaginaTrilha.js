import { useEffect, useRef, useState } from 'react'
import { View, StyleSheet, TouchableOpacity, ScrollView, Image, Platform } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Text, ActivityIndicator } from 'react-native-paper'
import { colors, fonts } from '../theme'
import { enviarFotoEtapaTarefa, concluirMissao } from '../services/storage'
import { mensagemDeErroAluno } from './useDadosAluno'

// Área de atividades ambientais do aluno (página 1 do paginador do PetScreen).
//
// Mostra atividades da turma, tarefas e a regeneração visual do bioma.
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

const STATUS_TEXTO = {
  pendente: 'Em cuidado',
  entregue: 'Enviado, aguardando avaliação',
  aprovado: 'Aprovado',
}

function ehUrl(valor) {
  return typeof valor === 'string' && /^https?:\/\//i.test(valor)
}

function nomeBioma(missao, indice = 0) {
  const texto = `${missao?.nome || ''} ${missao?.descricao || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (texto.includes('cerrado')) return 'Cerrado'
  if (texto.includes('pantanal')) return 'Pantanal'
  if (texto.includes('mata atlantica') || texto.includes('horta') || texto.includes('compost')) return 'Mata Atlântica'
  if (texto.includes('amazonia') || texto.includes('amazon')) return 'Amazônia'
  return ['Amazônia', 'Cerrado', 'Mata Atlântica', 'Pantanal'][Math.abs(Number(indice) || 0) % 4]
}

function primeiraEtapaPendente(missao) {
  const total = Array.isArray(missao?.etapas) ? missao.etapas.length : 0
  if (!total || missao?.status !== 'pendente') return null
  const feitas = Math.max(0, Number(missao?.etapaAtual) || 0)
  return feitas < total ? feitas : null
}

function escolherAtividadeAtual(missoes) {
  const pendentes = (missoes || []).filter(m => m.status === 'pendente' && (m.etapas || []).length)
  const aguardandoOuRecusada = pendentes.find(m => ['enviado', 'recusado'].includes(m.etapas?.[Number(m.etapaAtual) || 0]?.statusEnvio))
  const emAndamento = pendentes
    .filter(m => Number(m.etapaAtual) > 0 && Number(m.etapaAtual) < m.etapas.length)
    .sort((a, b) => new Date(b.atualizadoEm || 0) - new Date(a.atualizadoEm || 0))
  return aguardandoOuRecusada
    || emAndamento[0]
    || pendentes.find(m => Number(m.etapaAtual) < m.etapas.length)
    || pendentes.find(m => Number(m.etapaAtual) >= m.etapas.length)
    || null
}

function CenaBioma({ missao, feitas, indice = 0, compacta = false, destaque = false }) {
  const bioma = nomeBioma(missao, indice)
  const total = Array.isArray(missao?.etapas) ? missao.etapas.length : 0
  const percentual = total ? Math.round(Math.max(0, Math.min(feitas, total)) / total * 100) : 0
  const indiceImagem = Math.min(4, Math.floor(percentual / 25))
  const imagemEstagio = Array.isArray(missao?.imagensEstagio) ? missao.imagensEstagio[indiceImagem] : null
  const temImagemEstagio = typeof imagemEstagio === 'string' && /^https?:\/\//i.test(imagemEstagio)
  const rotulosEstagio = ['Terreno para cuidar', 'Semente plantada', 'Primeiros brotos', 'Árvore jovem', 'Floresta imensa']
  return (
    <View style={[p.ecoCard, compacta && p.ecoCardCompact]}>
      <View style={p.ecoTopline}>
        <View style={p.ecoTitleWrap}>
          <Text style={p.ecoEyebrow}>{bioma.toUpperCase()}</Text>
          <Text style={p.ecoStage}>{temImagemEstagio ? rotulosEstagio[indiceImagem] : 'Imagem de cultivo não cadastrada'}</Text>
        </View>
        {!!missao?.icone && <View style={p.ecoBadge}>{ehUrl(missao.icone) ? <Image source={{ uri: missao.icone }} style={p.ecoBadgeImage} resizeMode="contain" /> : <Text style={p.ecoBadgeEmoji}>{missao.icone}</Text>}</View>}
        <View style={p.ecoCounter}><Text style={p.ecoCounterText}>{percentual}%</Text></View>
      </View>
      <View style={[p.ecoScene, compacta && p.ecoSceneCompact, destaque && p.ecoSceneFocus]}>
        {temImagemEstagio
          ? <Image source={{ uri: imagemEstagio }} style={p.ecoStageImage} resizeMode={destaque ? 'contain' : 'cover'} accessibilityLabel={`Imagem do bioma ${bioma} em ${percentual}% de progresso`} />
          : <View style={p.ecoImageMissing}><Text style={p.ecoImageMissingText}>O administrador precisa adicionar as imagens de crescimento deste ambiente.</Text></View>}
      </View>
      {!compacta && <View style={p.ecoFooter}><Text style={p.ecoFooterText}>{percentual}% do bioma restaurado · {feitas} de {total} tarefas concluídas</Text></View>}
    </View>
  )
}

function InsigniaRecompensa({ missao }) {
  const icone = missao?.icone
  return <View style={p.missionReward}>
    <View style={p.missionRewardIcon}>
      {ehUrl(icone) ? <Image source={{ uri: icone }} style={p.missionRewardImage} resizeMode="contain" /> : <Text style={p.missionRewardEmoji}>{icone || '🏅'}</Text>}
    </View>
    <View style={p.missionRewardCopy}>
      <Text style={p.missionRewardLabel}>🏅 INSÍGNIA DA TRILHA</Text>
      <Text style={p.missionRewardText}>Prêmio por completar todas as tarefas!</Text>
    </View>
  </View>
}

export function rotuloDeStatus(missao) {
  if (missao.status === 'pendente' && !missao.atualizadoEm && missao.etapaAtual === 0) return 'Ainda não começou'
  return STATUS_TEXTO[missao.status] || 'Em andamento'
}

export default function PaginaTrilha({ width, petImage, alunoId, missoes = [], estado, erro, onRecarregar, onAtualizado, destinoMissao, ativa }) {
  const [selecionadaId, setSelecionadaId] = useState(null)
  const [etapaSelecionada, setEtapaSelecionada] = useState(null)
  const [listaManual, setListaManual] = useState(false)
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
    if (ativa) return
    // Ao sair por swipe, descarte a navegação manual. Ao voltar, abrimos novamente
    // a atividade e a tarefa que estão em andamento.
    setListaManual(false)
    setSelecionadaId(null)
    setEtapaSelecionada(null)
    setFotoEtapa(null)
  }, [ativa])
  useEffect(() => {
    if (listaManual || selecionadaId !== null || !missoes.length) return
    const atual = escolherAtividadeAtual(missoes)
    if (!atual) return
    setSelecionadaId(atual.id)
    setEtapaSelecionada(primeiraEtapaPendente(atual))
  }, [missoes, listaManual, selecionadaId])
  useEffect(() => {
    const destino = missoes.find(m => String(m.id) === String(destinoMissao?.missaoId))
    if (!destinoMissao?.missaoId || destinoAplicado.current === destinoMissao.chave || !destino) return
    destinoAplicado.current = destinoMissao.chave
    setListaManual(false)
    setSelecionadaId(destino.id)
    setEtapaSelecionada(primeiraEtapaPendente(destino))
    setAviso(null)
  }, [destinoMissao?.chave, destinoMissao?.missaoId, missoes])

  function abrirMissao(item) {
    setListaManual(false)
    setSelecionadaId(item.id)
    setEtapaSelecionada(primeiraEtapaPendente(item))
    setFotoEtapa(null)
    setAviso(null)
  }

  function voltarAosAmbientes() {
    setListaManual(true)
    setSelecionadaId(null)
    setEtapaSelecionada(null)
    setFotoEtapa(null)
    setAviso(null)
  }

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
    executar(() => enviarFotoEtapaTarefa(missao.id, etapaSelecionada + 1, fotoEtapa), `Foto enviada! O professor vai conferir. Após aprovação: +${moedas} moedas.`, () => setFotoEtapa(null))
  }

  function entregar() {
    if (!missao) return
    executar(() => concluirMissao(alunoId, missao.id), 'Seu cuidado foi enviado! Aguarde a aprovação para receber suas moedas.')
  }

  const total = missao ? missao.etapas.length : 0
  const feitas = missao ? Math.min(missao.etapaAtual, total) : 0
  const concluiuTodas = !!missao && total > 0 && feitas >= total

  const carregando = (estado === 'ocioso' || estado === 'carregando') && missoes.length === 0

  return (
    <View style={[p.page, { width }]}>
      <View style={p.taskHero}>
        {petImage ? <Image source={{ uri: petImage }} style={p.taskHeroPet} resizeMode="contain" /> : <Text style={p.taskHeroPet}>🌿</Text>}
        <View style={p.taskHeroText}>
          <Text style={p.taskHeroEyebrow}>CUIDADO COM A NATUREZA</Text>
          <Text style={p.taskHeroTitle} numberOfLines={2}>{missao ? (etapaSelecionada === null ? missao.nome : (missao.etapas[etapaSelecionada]?.titulo || `Tarefa ${etapaSelecionada + 1}`)) : 'Seus ambientes'}</Text>
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
          {missoes.map((m, indice) => {
            const n = (m.etapas || []).length
            const feitasNaTrilha = Math.max(0, Math.min(Number(m.etapaAtual) || 0, n))
            return <View key={m.id} style={p.ambienteCard}>
              <CenaBioma missao={m} feitas={feitasNaTrilha} indice={indice} compacta />
              <View style={p.ambienteInfo}>
                <Text style={p.ambienteTitle}>{m.nome}</Text>
                <Text style={p.ambienteSub}>{feitasNaTrilha}/{n} tarefas · {rotuloDeStatus(m)}</Text>
                {!!m.descricao && <Text style={p.ambienteDescription} numberOfLines={2}>{m.descricao}</Text>}
                <TouchableOpacity onPress={() => abrirMissao(m)} activeOpacity={0.85} style={p.accessEnvironment} accessibilityRole="button"><Text style={p.accessEnvironmentText}>Cuidar deste lugar</Text></TouchableOpacity>
              </View>
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
            <TouchableOpacity onPress={voltarAosAmbientes} style={p.voltar} accessibilityRole="button"><Text style={p.voltarTxt}>‹ Todas as trilhas</Text></TouchableOpacity>
            <View style={p.statusLinha}><Text style={p.statusTxt}>{rotuloDeStatus(missao)}</Text></View>
            {!!missao.descricao && <Text style={p.descricao}>{missao.descricao}</Text>}
            <CenaBioma missao={missao} feitas={feitas} indice={missoes.findIndex(m => String(m.id) === String(missao.id))} />
            <InsigniaRecompensa missao={missao} />
            <View style={p.tasksHeading}><Text style={p.tasksHeadingTitle}>Ajude a natureza</Text><Text style={p.tasksHeadingSub}>{feitas} de {total} cuidados feitos</Text></View>
            {total ? <View style={p.taskGrid}>
              {missao.etapas.map((etapa, i) => {
                const feita = i < feitas
                const liberada = i <= feitas || missao.status !== 'pendente'
                return <TouchableOpacity key={`${missao.id}-${i}`} onPress={() => { setEtapaSelecionada(i); setFotoEtapa(null) }} activeOpacity={0.82} style={[p.careTask, feita && p.careTaskDone, !liberada && p.careTaskLocked]} accessibilityRole="button">
                    <View style={p.careTaskHeader}><Text style={[p.careTaskNumber, feita && p.careTaskNumberDone]}>{feita ? '✓' : i + 1}</Text><Text style={p.careTaskCoins}>🪙 {Number(etapa.moedas) || 0}</Text></View>
                    <Text style={p.careTaskTitle}>{etapa.titulo || `Cuidado ${i + 1}`}</Text>
                    <Text style={p.careTaskSub}>{feita || etapa.statusEnvio === 'aprovado' ? 'Pronto! ✓' : etapa.statusEnvio === 'enviado' ? 'Foto enviada · em avaliação' : etapa.statusEnvio === 'recusado' ? 'Envie outra foto' : liberada ? 'Toque para ajudar' : 'Faça o cuidado anterior primeiro'}</Text>
                  </TouchableOpacity>
              })}
            </View> : <Text style={p.centroTexto}>Este ambiente ainda não tem cuidados cadastrados.</Text>}
            {total > 0 && <TouchableOpacity onPress={() => { setEtapaSelecionada(primeiraEtapaPendente(missao) ?? 0); setFotoEtapa(null) }} activeOpacity={0.85} style={p.continueTaskButton} accessibilityRole="button">
              <Text style={p.continueTaskText}>🌱 Continuar cuidado</Text>
            </TouchableOpacity>}
            {aviso && <View style={[p.aviso, aviso.tipo === 'erro' ? p.avisoErro : p.avisoOk]}><Text style={[p.avisoTxt, aviso.tipo === 'erro' ? p.avisoTxtErro : p.avisoTxtOk]}>{aviso.texto}</Text></View>}
            {missao.status === 'pendente' && total > 0 && concluiuTodas && <View style={p.finalTrilha}>
              <Text style={p.finalEmoji}>🌳</Text>
              <Text style={p.finalTitulo}>Natureza renovada!</Text>
              <Text style={p.finalTexto}>Seu cuidado fez diferença! Envie para a coordenação e ganhe +{Number(missao.moedas) || 0} moedas após a aprovação.</Text>
              <TouchableOpacity onPress={entregar} disabled={ocupado} activeOpacity={0.85} style={[p.botaoEntregar, ocupado && p.botaoDesabilitado]} accessibilityRole="button">
                {ocupado ? <ActivityIndicator color={colors.white} /> : <Text style={p.botaoPrincipalTxt}>🌿 ENVIAR MEU CUIDADO 🌿</Text>}
              </TouchableOpacity>
            </View>}
            {missao.status === 'entregue' && <Text style={p.rodape}>Cuidado enviado! Aguarde a avaliação. 🌱</Text>}
            {missao.status === 'aprovado' && <Text style={p.rodape}>Cuidado aprovado! +{Number(missao.moedas) || 0} moedas de bônus 🎉</Text>}
          </> : <>
            <TouchableOpacity onPress={voltarAosAmbientes} style={p.voltar} accessibilityRole="button"><Text style={p.voltarTxt}>‹ Todas as trilhas</Text></TouchableOpacity>
            <CenaBioma missao={missao} feitas={feitas} indice={missoes.findIndex(m => String(m.id) === String(missao.id))} destaque />
            <InsigniaRecompensa missao={missao} />
            <View style={p.instructionCard}>
              <Text style={p.instructionNumber}>CUIDADO {etapaSelecionada + 1} DE {total}</Text>
              <Text style={p.instructionTitle}>{missao.etapas[etapaSelecionada]?.titulo || `Tarefa ${etapaSelecionada + 1}`}</Text>
              <Text style={p.instructionDescription}>{missao.etapas[etapaSelecionada]?.descricao || 'Siga as instruções deste cuidado com a natureza.'}</Text>
              <View style={p.rewardPill}><Text style={p.rewardText}>🪙 {Number(missao.etapas[etapaSelecionada]?.moedas) || 0} moedas</Text></View>
            </View>
            {aviso && <View style={[p.aviso, aviso.tipo === 'erro' ? p.avisoErro : p.avisoOk]}><Text style={[p.avisoTxt, aviso.tipo === 'erro' ? p.avisoTxtErro : p.avisoTxtOk]}>{aviso.texto}</Text></View>}
            {missao.etapas[etapaSelecionada]?.statusEnvio === 'enviado' ? <View style={[p.aviso, p.avisoOk]}><Text style={p.avisoTxtOk}>Foto enviada! Aguarde o professor conferir.</Text></View> : null}
            {etapaSelecionada > feitas && missao.status === 'pendente' && <View style={[p.aviso, p.avisoErro]}><Text style={p.avisoTxtErro}>Finalize a tarefa atual para liberar esta etapa.</Text></View>}
            {etapaSelecionada < feitas && <View style={[p.aviso, p.avisoOk]}><Text style={p.avisoTxtOk}>Tarefa concluída ✓</Text></View>}
            <TouchableOpacity onPress={() => { setEtapaSelecionada(null); setFotoEtapa(null) }} activeOpacity={0.82} style={p.allTasksButton} accessibilityRole="button">
              <Text style={p.allTasksButtonText}>📋 Ver todas as tarefas</Text>
            </TouchableOpacity>
            {missao.status === 'pendente' && etapaSelecionada === feitas && !concluiuTodas && missao.etapas[etapaSelecionada]?.statusEnvio !== 'enviado' ? <>
              <TouchableOpacity onPress={escolherFoto} disabled={ocupado} activeOpacity={0.85} style={p.escolherFoto} accessibilityRole="button"><Text style={p.escolherFotoTexto}>{fotoEtapa ? '📷 Trocar foto' : '📷 Escolher foto'}</Text></TouchableOpacity>
              {fotoEtapa?.uri ? <Image source={{ uri: fotoEtapa.uri }} style={p.previewFoto} resizeMode="cover" /> : null}
              <TouchableOpacity onPress={enviarFoto} disabled={ocupado || !fotoEtapa} activeOpacity={0.85} style={[p.botaoPrincipal, (ocupado || !fotoEtapa) && p.botaoDesabilitado]}>{ocupado ? <ActivityIndicator color={colors.white} /> : <Text style={p.botaoPrincipalTxt}>Enviar para o professor</Text>}</TouchableOpacity>
              <Text style={p.rodape}>Foto de até 1 MB · moedas após aprovação do professor</Text>
            </> : null}
          </>}
        </ScrollView>
      )}
    </View>
  )
}

const p = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.cream, overflow: 'hidden' },
  taskHero: { minHeight: 96, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: Platform.OS === 'android' ? 22 : 16, gap: 10, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, borderBottomWidth: 5, borderBottomColor: '#08761F' },
  taskHeroPet: { width: 62, height: 62, fontSize: 48, textAlign: 'center', textAlignVertical: 'center' },
  taskHeroText: { flex: 1, gap: 4 }, taskHeroEyebrow: { color: 'rgba(255,255,255,0.78)', fontSize: 9, fontFamily: fonts.bold, letterSpacing: 1 }, taskHeroTitle: { color: colors.white, fontSize: 19, fontFamily: fonts.extrabold },
  taskCount: { minWidth: 54, height: 48, borderRadius: 24, backgroundColor: colors.yellow, borderWidth: 3, borderColor: '#835F00', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }, taskCountText: { color: '#171914', fontSize: 12, fontFamily: fonts.extrabold },
  taskContent: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 84 },
  ambienteCard: { backgroundColor: colors.white, borderRadius: 22, padding: 10, marginBottom: 16, borderWidth: 1.5, borderColor: colors.border, borderBottomWidth: 5, borderBottomColor: '#D7D2BE' },
  ambienteInfo: { paddingHorizontal: 5, paddingTop: 10, paddingBottom: 3 }, ambienteTitle: { color: '#20221D', fontSize: 19, fontFamily: fonts.extrabold }, ambienteSub: { color: colors.green, fontSize: 12, fontFamily: fonts.bold, marginTop: 3 }, ambienteDescription: { color: '#59645A', fontSize: 13, fontFamily: fonts.medium, lineHeight: 18, marginTop: 7 },
  accessEnvironment: { minHeight: 50, backgroundColor: colors.green, borderRadius: 15, borderBottomWidth: 4, borderBottomColor: '#08761F', alignItems: 'center', justifyContent: 'center', marginTop: 12 }, accessEnvironmentText: { color: colors.white, fontSize: 16, fontFamily: fonts.extrabold },
  ecoCard: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1.5, borderColor: '#DCE5D6', overflow: 'hidden', marginBottom: 12 }, ecoCardCompact: { borderWidth: 0, borderRadius: 15, marginBottom: 0 },
  ecoTopline: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, paddingVertical: 8 }, ecoTitleWrap: { flex: 1 }, ecoEyebrow: { color: colors.green, fontSize: 10, fontFamily: fonts.extrabold, letterSpacing: 0.8 }, ecoStage: { color: '#263A27', fontSize: 15, fontFamily: fonts.extrabold, marginTop: 2 }, ecoBadge: { width: 35, height: 35, borderRadius: 18, backgroundColor: '#F2F6E7', alignItems: 'center', justifyContent: 'center', marginLeft: 5 }, ecoBadgeImage: { width: 26, height: 26 }, ecoBadgeEmoji: { fontSize: 22 }, ecoCounter: { backgroundColor: '#FFF3B5', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7, marginLeft: 6 }, ecoCounterText: { color: '#765900', fontSize: 11, fontFamily: fonts.extrabold },
  ecoScene: { height: 205, backgroundColor: '#E9F1E5', overflow: 'hidden' }, ecoSceneCompact: { height: 142, borderRadius: 15 }, ecoSceneFocus: { height: 310 }, ecoStageImage: { width: '100%', height: '100%' }, ecoImageMissing: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, backgroundColor: '#E9F1E5' }, ecoImageMissingText: { color: '#536454', fontSize: 14, lineHeight: 20, fontFamily: fonts.semibold, textAlign: 'center' },
  ecoFooter: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#F3F8E8' }, ecoFooterText: { color: '#365B35', fontSize: 12, fontFamily: fonts.bold },
  missionReward: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9, marginTop: 10, backgroundColor: '#FFF0B3', borderWidth: 1.5, borderColor: '#E2B800', borderRadius: 16 }, missionRewardIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFF9DC', alignItems: 'center', justifyContent: 'center' }, missionRewardImage: { width: 36, height: 36 }, missionRewardEmoji: { fontSize: 29 }, missionRewardCopy: { flex: 1 }, missionRewardLabel: { color: '#735500', fontSize: 10, fontFamily: fonts.extrabold, letterSpacing: 0.5 }, missionRewardText: { color: '#302600', fontSize: 13, fontFamily: fonts.extrabold, marginTop: 3 },
  voltar: { paddingVertical: 6, marginBottom: 6 }, voltarTxt: { color: colors.green, fontSize: 14, fontFamily: fonts.bold }, statusLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }, statusTxt: { color: colors.green, fontSize: 12, fontFamily: fonts.bold }, descricao: { color: '#59645A', fontSize: 13, fontFamily: fonts.medium, lineHeight: 19, marginBottom: 12 },
  tasksHeading: { marginTop: 5, marginBottom: 10 }, tasksHeadingTitle: { color: '#20221D', fontSize: 19, fontFamily: fonts.extrabold }, tasksHeadingSub: { color: colors.muted, fontSize: 12, fontFamily: fonts.semibold, marginTop: 2 }, taskGrid: { gap: 10 },
  allTasksButton: { minHeight: 48, borderRadius: 15, paddingHorizontal: 14, marginTop: 14, backgroundColor: '#FFF0B3', borderWidth: 1.5, borderColor: '#E2B800', alignItems: 'center', justifyContent: 'center' }, allTasksButtonText: { color: '#5A4600', fontSize: 15, fontFamily: fonts.extrabold }, continueTaskButton: { minHeight: 48, borderRadius: 15, paddingHorizontal: 14, marginTop: 12, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }, continueTaskText: { color: colors.white, fontSize: 15, fontFamily: fonts.extrabold },
  careTask: { minHeight: 92, borderRadius: 16, backgroundColor: colors.white, padding: 12, borderWidth: 1.5, borderColor: colors.border, borderBottomWidth: 4, borderBottomColor: '#D7D2BE' }, careTaskDone: { backgroundColor: '#EAF7E9', borderColor: '#B6DDBE', borderBottomColor: '#8CC796' }, careTaskLocked: { opacity: 0.58 }, careTaskHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, careTaskNumber: { width: 27, height: 27, borderRadius: 14, backgroundColor: '#FFF0AE', color: '#6B5300', fontSize: 13, textAlign: 'center', textAlignVertical: 'center', overflow: 'hidden', fontFamily: fonts.extrabold, paddingTop: 4 }, careTaskNumberDone: { backgroundColor: colors.green, color: colors.white }, careTaskCoins: { color: '#866400', fontSize: 12, fontFamily: fonts.bold }, careTaskTitle: { color: '#20221D', fontSize: 16, fontFamily: fonts.extrabold, marginTop: 6 }, careTaskSub: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium, marginTop: 3 },
  escolherFoto: { minHeight: 48, borderRadius: 14, backgroundColor: '#FFF2B2', borderWidth: 1.5, borderColor: '#D9B800', alignItems: 'center', justifyContent: 'center', marginTop: 16 }, escolherFotoTexto: { color: '#735500', fontSize: 16, fontFamily: fonts.extrabold }, previewFoto: { width: '100%', height: 190, borderRadius: 16, marginTop: 10, backgroundColor: colors.border },
  instructionCard: { backgroundColor: colors.white, padding: 18, borderRadius: 20, borderWidth: 2, borderColor: colors.border, borderBottomWidth: 5, borderBottomColor: '#D7D2BE', marginTop: 8 }, instructionNumber: { color: colors.green, fontSize: 12, fontFamily: fonts.extrabold, letterSpacing: 1 }, instructionTitle: { color: '#20221D', fontSize: 23, fontFamily: fonts.extrabold, marginTop: 9 }, instructionDescription: { color: '#59645A', fontSize: 17, fontFamily: fonts.medium, lineHeight: 25, marginTop: 12 }, rewardPill: { alignSelf: 'flex-start', backgroundColor: '#FFF2B2', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, marginTop: 18 }, rewardText: { color: '#735500', fontSize: 15, fontFamily: fonts.extrabold },
  aviso: { borderRadius: 14, padding: 12, marginTop: 6, marginBottom: 6, borderWidth: 1.5 }, avisoOk: { backgroundColor: colors.greenLight, borderColor: '#B6DDBE' }, avisoErro: { backgroundColor: colors.red, borderColor: '#f3b4b4' }, avisoTxt: { fontSize: 12, fontFamily: fonts.bold, lineHeight: 17 }, avisoTxtOk: { color: colors.green }, avisoTxtErro: { color: '#a02121' },
  botaoPrincipal: { minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green, borderRadius: 16, borderBottomWidth: 5, borderBottomColor: '#08761F', marginTop: 8, paddingHorizontal: 18 }, botaoEntregar: { minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green, borderRadius: 16, borderBottomWidth: 5, borderBottomColor: '#08761F', marginTop: 8, paddingHorizontal: 18 }, finalTrilha: { alignItems: 'center', backgroundColor: '#EAF7E9', borderColor: '#8BCB79', borderWidth: 2, borderRadius: 20, padding: 16, marginTop: 14, marginBottom: 14, gap: 6 }, finalEmoji: { fontSize: 38 }, finalTitulo: { color: '#245C2D', fontSize: 20, fontFamily: fonts.extrabold, textAlign: 'center' }, finalTexto: { color: '#47452E', fontSize: 14, lineHeight: 20, fontFamily: fonts.semibold, textAlign: 'center' }, botaoDesabilitado: { opacity: 0.6 }, botaoPrincipalTxt: { color: colors.white, fontSize: 15, fontFamily: fonts.extrabold }, rodape: { textAlign: 'center', color: '#59645A', fontSize: 12, fontFamily: fonts.semibold, marginTop: 14 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 80, gap: 10 }, centroEmoji: { fontSize: 44 }, centroTitulo: { color: '#20221D', fontSize: 16, fontFamily: fonts.extrabold, textAlign: 'center' }, centroTexto: { color: '#65665F', fontSize: 12, fontFamily: fonts.medium, lineHeight: 18, textAlign: 'center' },
})
