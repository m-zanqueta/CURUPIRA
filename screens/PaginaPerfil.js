import { useEffect, useState } from 'react'
import { View, StyleSheet, TouchableOpacity, Pressable, ScrollView, Image, Platform, Modal } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Text, ActivityIndicator } from 'react-native-paper'
import { colors, fonts } from '../theme'
import { carregarAvatarAluno, obterAvatarAlunoCache, enviarAvatarAluno, listarTrilhasConcluidasAluno, salvarVitrineTrilhasAluno, listarRankingTurmaAluno } from '../services/storage'

// Página "Perfil" do aluno (página 4 do paginador do PetScreen).
//
// Só mostra o que o backend realmente informa:
//   • nome, XP total, missões aprovadas e nº de conquistas -> `progresso` (consultarProgressoGeral:
//     RPCs obter_meu_perfil + aluno_meu_progresso_geral), mantido por useDadosAluno;
//   • turma e PET -> objeto `turma` que o App já carrega (buscarTurmaDoAluno).
// Os números chegam por props; foto e vitrine usam serviços autenticados pelo token do aluno.
// Quando um dado ainda não chegou, aparece "—" (nunca um número inventado).
//
// Props:
//   width     largura da página
//   aluno     aluno logado ({ id, nome, ... })
//   turma     turma/PET do aluno (nome, pet, petNome, estagio...) ou null
//   estagioPet estágio do PET calculado pelo PetScreen a partir do XP (opcional)
//   progresso { xp, nome, turmaId, missoesAprovadas, conquistas } ou null
//   erroProgresso erro da última atualização (os números mostrados continuam os últimos válidos)
//   onAtualizar   tenta atualizar os números de novo
//   onSair    callback de logout (vem do App)

function numeroOuTraco(valor) {
  const n = Number(valor)
  return valor === null || valor === undefined || !Number.isFinite(n) ? '—' : String(n)
}

export default function PaginaPerfil({ width, aluno, turma, progresso, erroProgresso, onAtualizar, onSair, ativa }) {
  const nome = String(progresso?.nome || aluno?.nome || '').trim()
  const temProgresso = !!progresso
  const missoes = temProgresso ? progresso.missoesAprovadas : null
  const conquistas = temProgresso ? progresso.conquistas : null
  const xp = temProgresso ? progresso.xp : null
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const [erroFoto, setErroFoto] = useState('')
  const [trilhas, setTrilhas] = useState([])
  const [vitrineIds, setVitrineIds] = useState([])
  const [editandoVitrine, setEditandoVitrine] = useState(false)
  const [carregandoVitrine, setCarregandoVitrine] = useState(false)
  const [salvandoVitrine, setSalvandoVitrine] = useState(false)
  const [erroVitrine, setErroVitrine] = useState('')
  const [rankingVisivel, setRankingVisivel] = useState(false)
  const [ranking, setRanking] = useState([])
  const [carregandoRanking, setCarregandoRanking] = useState(false)
  const [erroRanking, setErroRanking] = useState('')

  async function abrirRanking() {
    setRankingVisivel(true)
    if (carregandoRanking) return
    setCarregandoRanking(true)
    setErroRanking('')
    try { setRanking(await listarRankingTurmaAluno()) }
    catch (e) { setErroRanking(e?.message || 'Não foi possível carregar o ranking.') }
    finally { setCarregandoRanking(false) }
  }

  async function carregarVitrine() {
    setCarregandoVitrine(true)
    try {
      const lista = await listarTrilhasConcluidasAluno()
      setTrilhas(lista)
      setVitrineIds(lista.filter(x => x.posicao != null).sort((a, b) => a.posicao - b.posicao).map(x => String(x.id)))
      setErroVitrine('')
    } catch (e) { setErroVitrine(e?.message || 'Não foi possível carregar as insígnias.') }
    finally { setCarregandoVitrine(false) }
  }

  useEffect(() => {
    let ativo = true
    if (!ativa || !aluno?.id || aluno.id === 'loja') return () => { ativo = false }
    obterAvatarAlunoCache().then(url => {
      if (!ativo) return
      if (url) { setAvatarUrl(url); return }
      carregarAvatarAluno().then(novaUrl => { if (ativo) setAvatarUrl(novaUrl) }).catch(e => { if (ativo) setErroFoto(e?.message || 'Não foi possível carregar sua foto.') })
    })
    carregarVitrine()
    return () => { ativo = false }
  }, [aluno?.id, ativa])

  async function escolherFoto() {
    if (enviandoFoto) return
    try {
      const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permissao.granted) { setErroFoto('Permita o acesso às fotos para escolher sua imagem.'); return }
      const resultado = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.65 })
      if (resultado.canceled) return
      const imagem = resultado.assets?.[0]
      if (!imagem) return
      if (imagem.fileSize && imagem.fileSize > 1024 * 1024) { setErroFoto('Escolha uma imagem de até 1 MB.'); return }
      setEnviandoFoto(true)
      setErroFoto('')
      const url = await enviarAvatarAluno(imagem)
      setAvatarUrl(url)
    } catch (e) { setErroFoto(e?.message || 'Não foi possível salvar sua foto.') }
    finally { setEnviandoFoto(false) }
  }

  function alternarInsignia(id) {
    const chave = String(id)
    setVitrineIds(atuais => {
      if (atuais.includes(chave)) return atuais.filter(x => x !== chave)
      if (atuais.length >= 5) { setErroVitrine('Escolha até 5 insígnias.'); return atuais }
      setErroVitrine('')
      return [...atuais, chave]
    })
  }

  async function salvarVitrine() {
    setSalvandoVitrine(true)
    setErroVitrine('')
    try {
      await salvarVitrineTrilhasAluno(vitrineIds)
      await carregarVitrine()
      setEditandoVitrine(false)
    } catch (e) { setErroVitrine(e?.message || 'Não foi possível salvar sua vitrine.') }
    finally { setSalvandoVitrine(false) }
  }

  function cancelarEdicaoVitrine() {
    setVitrineIds(trilhas.filter(x => x.posicao != null).sort((a, b) => a.posicao - b.posicao).map(x => String(x.id)))
    setErroVitrine('')
    setEditandoVitrine(false)
  }

  const escolhidas = vitrineIds.map(id => trilhas.find(x => String(x.id) === id)).filter(Boolean)

  return (
    <View style={[p.page, { width }]}>
      <ScrollView contentContainerStyle={p.profileScroll} showsVerticalScrollIndicator={false}>
        <View style={p.profileHero}>
          <View style={p.profileTopLine}>
            <Text style={p.profilePageTitle}>Meu perfil</Text>
            <TouchableOpacity onPress={abrirRanking} style={p.rankingButton} accessibilityRole="button" accessibilityLabel="Ver ranking de XP da turma">
              <Text style={p.rankingButtonText}>🏆</Text>
            </TouchableOpacity>
          </View>
          <Pressable
            onPress={escolherFoto}
            disabled={enviandoFoto}
            style={({ pressed }) => [p.avatarCircle, pressed && !enviandoFoto && p.avatarPressed]}
            hitSlop={16}
            pressRetentionOffset={16}
            collapsable={false}
            accessibilityRole="button"
            accessibilityLabel="Trocar foto do perfil"
            accessibilityHint="Toque em qualquer parte do círculo para escolher uma foto"
          >
            {avatarUrl ? <Image pointerEvents="none" source={{ uri: avatarUrl, cache: 'force-cache' }} style={p.avatarImage} resizeMode="cover" /> : <Text pointerEvents="none" style={p.avatarGlyph}>🧑‍🌾</Text>}
            {enviandoFoto ? <View pointerEvents="none" style={p.avatarOverlay}><ActivityIndicator color={colors.white} /></View> : <View pointerEvents="none" style={p.cameraBadge}><Text style={p.cameraGlyph}>📷</Text></View>}
          </Pressable>
        </View>

        <View style={p.profileInfo}>
          {nome ? <Text style={p.profileName}>{nome}</Text> : null}
          {turma?.nome ? <Text style={p.profileTurma}>Turma {turma.nome}</Text> : null}

          <View style={p.profileStats}>
            <View style={p.profileStat}><Text style={p.profileStatValue}>{numeroOuTraco(xp)}</Text><Text style={p.profileStatLabel}>XP total</Text></View>
            <View style={p.statDivider} />
            <View style={p.profileStat}><Text style={p.profileStatValue}>{numeroOuTraco(missoes)}</Text><Text style={p.profileStatLabel}>{missoes === 1 ? 'trilha concluída' : 'trilhas concluídas'}</Text></View>
            <View style={p.statDivider} />
            <View style={p.profileStat}>
              <Text style={p.profileStatValue}>{numeroOuTraco(conquistas)}</Text><Text style={p.profileStatLabel}>{conquistas === 1 ? 'conquista' : 'conquistas'}</Text>
            </View>
          </View>

          {erroProgresso ? (
            <TouchableOpacity onPress={onAtualizar} activeOpacity={0.85} style={p.aviso} accessibilityRole="button">
              <Text style={p.avisoTxt}>Não foi possível atualizar seus números agora. Toque para tentar de novo.</Text>
            </TouchableOpacity>
          ) : null}

          {!!erroFoto && <Text style={p.feedbackErro}>{erroFoto}</Text>}

          <View style={p.vitrineCard}>
            <View style={p.vitrineHeader}><Text style={p.vitrineTitle}>Minha vitrine</Text>
              <TouchableOpacity onPress={() => { setErroVitrine(''); setEditandoVitrine(v => !v) }} disabled={carregandoVitrine || salvandoVitrine} accessibilityRole="button">
                <Text style={p.vitrineLink}>{editandoVitrine ? 'Cancelar' : 'Editar'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={p.vitrineSub}>{editandoVitrine ? 'Escolha até 5 insígnias.' : 'Suas trilhas favoritas'}</Text>
            {carregandoVitrine ? <ActivityIndicator style={{ margin: 12 }} color={colors.green} /> : editandoVitrine ? (
              <View style={p.badgeGrid}>
                {trilhas.map(item => {
                  const escolhida = vitrineIds.includes(String(item.id))
                  return <TouchableOpacity key={item.id} onPress={() => alternarInsignia(item.id)} style={[p.badgeOption, escolhida && p.badgeOptionSelected]} accessibilityRole="button" accessibilityLabel={`${item.nome}${escolhida ? ', selecionada' : ''}`}>
                    {/^https?:\/\//i.test(item.icone || '') ? <Image source={{ uri: item.icone }} style={p.badgeImage} resizeMode="contain" /> : <Text style={p.badgeEmoji}>{item.icone || '🌿'}</Text>}
                    <Text style={p.badgeName} numberOfLines={2}>{item.nome}</Text>
                    {escolhida && <Text style={p.badgeSelectedMark}>✓</Text>}
                  </TouchableOpacity>
                })}
                {!trilhas.length && <Text style={p.vitrineEmpty}>Conclua uma trilha para ganhar uma insígnia.</Text>}
              </View>
            ) : escolhidas.length ? (
              <View style={p.badgeGrid}>{escolhidas.map(item => <View key={item.id} style={p.badgeShowcase}>
                {/^https?:\/\//i.test(item.icone || '') ? <Image source={{ uri: item.icone }} style={p.badgeImage} resizeMode="contain" /> : <Text style={p.badgeEmoji}>{item.icone || '🌿'}</Text>}
                <Text style={p.badgeName} numberOfLines={2}>{item.nome}</Text>
              </View>)}</View>
            ) : <Text style={p.vitrineEmpty}>{trilhas.length ? 'Escolha as insígnias que quer mostrar.' : 'Conclua uma trilha para ganhar uma insígnia.'}</Text>}
            {!!erroVitrine && <Text style={p.feedbackErro}>{erroVitrine}</Text>}
            {editandoVitrine && <View style={p.vitrineActions}>
              <TouchableOpacity style={p.cancelButton} onPress={cancelarEdicaoVitrine} disabled={salvandoVitrine}><Text style={p.cancelText}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[p.saveButton, salvandoVitrine && { opacity: 0.65 }]} onPress={salvarVitrine} disabled={salvandoVitrine}>{salvandoVitrine ? <ActivityIndicator color={colors.white} /> : <Text style={p.saveText}>Salvar vitrine</Text>}</TouchableOpacity>
            </View>}
          </View>

          <TouchableOpacity onPress={onSair} activeOpacity={0.85} style={p.logoutButton} accessibilityRole="button">
            <Text style={p.logoutEmoji}>🚪</Text><Text style={p.logoutText}>Sair da conta</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <Modal visible={rankingVisivel} transparent animationType="fade" onRequestClose={() => setRankingVisivel(false)}>
        <View style={p.modalBackdrop}>
          <View style={p.rankingModal}>
            <View style={p.rankingHeading}><View><Text style={p.rankingTitle}>Ranking da turma</Text><Text style={p.rankingSubtitle}>Quem juntou mais XP?</Text></View><TouchableOpacity onPress={() => setRankingVisivel(false)} accessibilityRole="button" accessibilityLabel="Fechar ranking"><Text style={p.rankingClose}>×</Text></TouchableOpacity></View>
            {carregandoRanking ? <ActivityIndicator color={colors.green} style={{ marginVertical: 28 }} /> : erroRanking ? <Text style={p.rankingEmpty}>{erroRanking}</Text> : ranking.length ? <ScrollView style={p.rankingList}>
              {ranking.map((item, index) => <View key={item.id} style={p.rankingRow}>
                <Text style={p.rankingPosition}>{index + 1}</Text>
                {item.foto ? <Image source={{ uri: item.foto }} style={p.rankingAvatar} resizeMode="cover" /> : <View style={p.rankingAvatarFallback}><Text style={p.rankingAvatarEmoji}>🧑‍🌾</Text></View>}
                <Text style={p.rankingName} numberOfLines={1}>{item.nome}</Text>
                <Text style={p.rankingXp}>⭐ {item.xp}</Text>
              </View>)}
            </ScrollView> : <Text style={p.rankingEmpty}>Entre em uma turma para ver o ranking.</Text>}
          </View>
        </View>
      </Modal>
    </View>
  )
}

const p = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.cream, overflow: 'hidden' },
  profileScroll: { paddingBottom: 78, backgroundColor: colors.cream },
  profileHero: { height: 174, backgroundColor: colors.green, paddingTop: Platform.OS === 'android' ? 34 : 48, alignItems: 'center', zIndex: 2, elevation: 2 },
  profileTopLine: { width: '100%', paddingHorizontal: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  profilePageTitle: { color: colors.white, fontSize: 23, fontFamily: fonts.extrabold },
  rankingButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFD54A', borderWidth: 2, borderColor: '#A67B00' }, rankingButtonText: { fontSize: 22 },
  avatarCircle: { position: 'absolute', bottom: -46, width: 104, height: 104, borderRadius: 52, backgroundColor: '#E8EFE9', borderWidth: 5, borderColor: colors.white, alignItems: 'center', justifyContent: 'center', elevation: 5, zIndex: 5 },
  avatarPressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
  avatarImage: { width: '100%', height: '100%', borderRadius: 52 },
  avatarOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 52, backgroundColor: '#0008', alignItems: 'center', justifyContent: 'center' },
  cameraBadge: { position: 'absolute', right: -2, bottom: 0, width: 31, height: 31, borderRadius: 16, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
  cameraGlyph: { fontSize: 15 },
  avatarGlyph: { color: '#79877B', fontSize: 58, fontFamily: fonts.regular, lineHeight: 66 },
  profileInfo: { paddingTop: 52, paddingHorizontal: 18, zIndex: 1 },
  profileName: { textAlign: 'center', color: '#171914', fontSize: 26, fontFamily: fonts.extrabold, marginBottom: 4 },
  profileTurma: { textAlign: 'center', color: '#77786F', fontSize: 12, fontFamily: fonts.semibold, marginBottom: 14 },
  profileStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: colors.white, borderRadius: 16, paddingVertical: 14, marginTop: 8, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  profileStat: { flex: 1, alignItems: 'center', gap: 3 },
  profileStatValue: { color: colors.green, fontSize: 18, fontFamily: fonts.extrabold },
  profileStatLabel: { color: '#77786F', fontSize: 10, fontFamily: fonts.medium, textAlign: 'center' },
  statDivider: { width: 1, height: 30, backgroundColor: colors.border },
  aviso: { backgroundColor: colors.yellowLight, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#EBDDA0', marginBottom: 12 },
  avisoTxt: { color: '#785A00', fontSize: 12, fontFamily: fonts.bold, textAlign: 'center' },
  feedbackErro: { color: '#C62828', fontSize: 12, fontFamily: fonts.semibold, marginBottom: 10 },
  vitrineCard: { backgroundColor: colors.white, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: colors.border, marginTop: 2 },
  vitrineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  vitrineTitle: { color: '#171914', fontSize: 18, fontFamily: fonts.extrabold },
  vitrineLink: { color: colors.green, fontSize: 14, fontFamily: fonts.bold, padding: 5 },
  vitrineSub: { color: '#77786F', fontSize: 12, fontFamily: fonts.medium, marginTop: 2, marginBottom: 10 },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badgeOption: { width: '31%', minHeight: 100, borderRadius: 14, backgroundColor: colors.cream, borderWidth: 2, borderColor: colors.border, padding: 7, alignItems: 'center', justifyContent: 'center' },
  badgeOptionSelected: { borderColor: colors.green, backgroundColor: '#E8F7EB' },
  badgeShowcase: { width: '31%', minHeight: 90, borderRadius: 14, backgroundColor: colors.cream, padding: 7, alignItems: 'center', justifyContent: 'center' },
  badgeImage: { width: 48, height: 48 },
  badgeEmoji: { fontSize: 38, textAlign: 'center' },
  badgeName: { color: '#33352F', fontSize: 10, fontFamily: fonts.bold, textAlign: 'center', marginTop: 3 },
  badgeSelectedMark: { position: 'absolute', top: 3, right: 6, color: colors.green, fontSize: 16, fontFamily: fonts.extrabold },
  vitrineEmpty: { color: '#77786F', fontSize: 12, fontFamily: fonts.medium, paddingVertical: 10 },
  vitrineActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  cancelButton: { flex: 1, minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#60615A', fontSize: 12, fontFamily: fonts.bold },
  saveButton: { flex: 1, minHeight: 42, borderRadius: 12, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: colors.white, fontSize: 12, fontFamily: fonts.bold },
  logoutButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: colors.green, borderRadius: 16, borderBottomWidth: 5, borderBottomColor: '#08761F', marginTop: 16 },
  logoutEmoji: { fontSize: 22 },
  logoutText: { color: colors.white, fontSize: 18, fontFamily: fonts.extrabold },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  rankingModal: { width: '100%', maxWidth: 420, maxHeight: '78%', backgroundColor: colors.cream, borderRadius: 22, padding: 18, borderWidth: 2, borderColor: '#E2B800' },
  rankingHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, rankingTitle: { color: '#171914', fontSize: 21, fontFamily: fonts.extrabold }, rankingSubtitle: { color: '#74766D', fontSize: 12, fontFamily: fonts.semibold, marginTop: 2 }, rankingClose: { color: '#4F514B', fontSize: 30, lineHeight: 34, paddingHorizontal: 6 },
  rankingList: { flexGrow: 0 }, rankingRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 9, marginBottom: 7, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border }, rankingPosition: { width: 22, color: '#8B6900', fontSize: 16, fontFamily: fonts.extrabold, textAlign: 'center' }, rankingAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E8EFE9' }, rankingAvatarFallback: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E8EFE9', alignItems: 'center', justifyContent: 'center' }, rankingAvatarEmoji: { fontSize: 22 }, rankingName: { flex: 1, color: '#252720', fontSize: 14, fontFamily: fonts.bold }, rankingXp: { color: colors.green, fontSize: 13, fontFamily: fonts.extrabold }, rankingEmpty: { color: '#60615A', fontSize: 14, fontFamily: fonts.semibold, textAlign: 'center', paddingVertical: 22 },
})
