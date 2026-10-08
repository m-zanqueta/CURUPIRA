import { useState, useEffect, useRef } from 'react'
import {
  View, StyleSheet, TouchableOpacity, Modal,
  Dimensions, Image, Animated, ScrollView,
  StatusBar, Platform,
} from 'react-native'
import {
  Appbar, Chip, ProgressBar, Text, ActivityIndicator,
  Surface, IconButton,
} from 'react-native-paper'
import { colors, fonts } from '../theme'
import { listarItensComprados, listarAcessoriosLoja } from '../services/storage'

const WIN      = Dimensions.get('window')
const W        = Math.min(WIN.width, 480)
const H        = WIN.height
const PET_SIZE = W * 0.65

const IMG_JACARE = require('../assets/jacare.png')
const IMG_ARARA  = require('../assets/arara.png')
const IMG_ONCA   = require('../assets/onca.png')

// Coordenadas calculadas das imagens reais 1024x1024
const PET_CFG = {
  jacare: {
    img: IMG_JACARE, cor: colors.green,  bgTopo: '#051a07', bgChao: '#143d14',
    chapeu: { top: -0.13, left: 0.18, w: 0.62 },
    colar:  { top:  0.23, left: 0.28, w: 0.45 },
  },
  arara: {
    img: IMG_ARARA,  cor: '#42A5F5',     bgTopo: '#020d1a', bgChao: '#0d2a50',
    chapeu: { top: -0.10, left: 0.20, w: 0.60 },
    colar:  { top:  0.25, left: 0.28, w: 0.44 },
  },
  onca: {
    img: IMG_ONCA,   cor: colors.yellow, bgTopo: '#1a0800', bgChao: '#3d1500',
    chapeu: { top: -0.12, left: 0.18, w: 0.62 },
    colar:  { top:  0.24, left: 0.26, w: 0.48 },
  },
}

function detectarPet(iconeUrl) {
  if (!iconeUrl) return PET_CFG.jacare
  const u = iconeUrl.toLowerCase()
  if (u.includes('arara'))                   return PET_CFG.arara
  if (u.includes('onca') || u.includes('tigre')) return PET_CFG.onca
  return PET_CFG.jacare
}

const ESTAGIOS = [
  { label: 'Filhote',              xpMin: 0    },
  { label: 'Guardião',             xpMin: 500  },
  { label: 'Espírito da Floresta', xpMin: 1000 },
]

const EMOCOES = {
  feliz:    { label: 'Feliz',     vel: 900,  amp: 6,  escala: 1.05 },
  euforico: { label: 'Eufórico!', vel: 500,  amp: 12, escala: 1.08 },
  normal:   { label: 'Normal',    vel: 1400, amp: 3,  escala: 1.02 },
  dormindo: { label: 'Dormindo',  vel: 2200, amp: 1,  escala: 1.01 },
  triste:   { label: 'Triste',    vel: 2500, amp: 2,  escala: 1.01 },
}

function getEstagio(xp) {
  let idx = 0
  ESTAGIOS.forEach((e, i) => { if (xp >= e.xpMin) idx = i })
  return idx
}

function Particula({ x, y, cor, onDone }) {
  const a = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 900, useNativeDriver: true }).start(onDone)
  }, [])
  return (
    <Animated.View style={{
      position: 'absolute', width: 10, height: 10, borderRadius: 5,
      backgroundColor: cor,
      transform: [
        { translateX: a.interpolate({ inputRange:[0,1], outputRange:[0,x] }) },
        { translateY: a.interpolate({ inputRange:[0,1], outputRange:[0,y] }) },
        { scale: a.interpolate({ inputRange:[0,0.4,1], outputRange:[0.4,1.5,0.2] }) },
      ],
      opacity: a.interpolate({ inputRange:[0,0.2,0.8,1], outputRange:[0,1,1,0] }),
    }} />
  )
}

// Botão RPG — usa Paper Surface + imagem real quando equipado
function BotaoRPG({ label, cor, iconeVazio, itemEquipado, onPress }) {
  const pulsar = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (!itemEquipado) return
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulsar, { toValue: 1.08, duration: 700, useNativeDriver: true }),
      Animated.timing(pulsar, { toValue: 1,    duration: 700, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [itemEquipado])
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={s.btnWrap}>
      <Animated.View style={{ transform:[{scale:pulsar}] }}>
        <Surface style={[s.btnRPG, { borderColor: cor, backgroundColor: cor+'20' }]} elevation={2}>
          {itemEquipado?.imagem
            ? <Image source={{ uri: itemEquipado.imagem }} style={s.btnRPGImg} resizeMode="contain" />
            : <Text style={s.btnRPGIconeVazio}>{iconeVazio}</Text>
          }
          {itemEquipado && (
            <View style={[s.btnBadge, { backgroundColor: cor }]}>
              <Text style={s.btnBadgeTxt}>✓</Text>
            </View>
          )}
        </Surface>
      </Animated.View>
      <Text style={[s.btnLabel, { color: cor }]}>{label}</Text>
    </TouchableOpacity>
  )
}

// Modal de seleção de itens — usa Paper Surface
function ModalItens({ visible, titulo, itens, selecionado, cor, carregando, onSel, onFechar }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onFechar}>
      <View style={s.modalBg}>
        <Surface style={s.modalSheet} elevation={5}>
          <View style={s.modalHandle} />
          <Text variant="titleLarge" style={s.modalTitulo}>{titulo}</Text>

          {carregando ? (
            <View style={s.centralWrap}>
              <ActivityIndicator animating color={cor} size="large" />
            </View>
          ) : itens.length === 0 ? (
            <View style={s.centralWrap}>
              <Text variant="titleMedium" style={s.vazioTitulo}>Nenhum item comprado</Text>
              <Text variant="bodyMedium" style={s.vazioSub}>Visite a loja para comprar cosméticos!</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={s.modalGrid} showsVerticalScrollIndicator={false}>
              {/* Remover */}
              <TouchableOpacity style={s.itemRemover} onPress={() => { onSel(null); onFechar() }}>
                <View style={s.itemRemoverX}>
                  <Text style={{ color: '#ff6b6b', fontSize: 18, fontFamily: fonts.bold }}>✕</Text>
                </View>
                <Text variant="labelSmall" style={{ color: '#ff6b6b', textAlign: 'center' }}>Remover</Text>
              </TouchableOpacity>

              {itens.map(item => {
                const sel = selecionado?.id === item.id
                return (
                  <TouchableOpacity key={item.id}
                    style={[s.itemCard, sel && { borderColor: cor, borderWidth: 2.5, backgroundColor: cor+'18' }]}
                    onPress={() => { onSel(item); onFechar() }}
                    activeOpacity={0.75}
                  >
                    {item.imagem
                      ? <Image source={{ uri: item.imagem }} style={s.itemImg} resizeMode="contain" />
                      : <View style={s.itemImgPlaceholder} />
                    }
                    <Text variant="labelSmall" style={s.itemNome} numberOfLines={2}>{item.nome}</Text>
                    {sel && (
                      <View style={[s.selTag, { backgroundColor: cor }]}>
                        <Text style={s.selTxt}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          )}

          <TouchableOpacity style={[s.modalBtnFechar, { backgroundColor: cor }]} onPress={onFechar}>
            <Text variant="labelLarge" style={s.modalBtnFecharTxt}>Fechar</Text>
          </TouchableOpacity>
        </Surface>
      </View>
    </Modal>
  )
}

export default function PetScreen({ aluno, turma, onLogout, onLoja }) {
  const cfg       = detectarPet(turma?.pet)
  const emocaoKey = turma?.emocao || 'feliz'
  const emocao    = EMOCOES[emocaoKey] || EMOCOES.feliz
  const xp        = turma?.xp || 0
  const estagioI  = getEstagio(xp)
  const estagio   = ESTAGIOS[estagioI]
  const proxEst   = ESTAGIOS[estagioI + 1]
  const xpPct     = proxEst
    ? Math.min(1, (xp - estagio.xpMin) / (proxEst.xpMin - estagio.xpMin))
    : 1

  const [chapeu,     setChapeu]     = useState(null)
  const [colar,      setColar]      = useState(null)
  const [modal,      setModal]      = useState(null)
  const [particulas, setParticulas] = useState([])
  const [todosItens, setTodosItens] = useState([])
  const [comprados,  setComprados]  = useState([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => { listarItensComprados().then(setComprados) }, [])

  useEffect(() => {
    listarAcessoriosLoja()
      .then(itens => setTodosItens(itens || []))
      .catch(console.error)
      .finally(() => setCarregando(false))
  }, [])

  const chapeusDispo = todosItens.filter(i => i.slot === 'chapeu' && comprados.includes(i.id))
  const colaresDispo = todosItens.filter(i => i.slot === 'colar'  && comprados.includes(i.id))

  const escalaA  = useRef(new Animated.Value(1)).current
  const balancoA = useRef(new Animated.Value(0)).current
  const puloA    = useRef(new Animated.Value(0)).current
  const brilhoA  = useRef(new Animated.Value(0)).current
  const sombraA  = useRef(new Animated.Value(1)).current
  const entradaA = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.spring(entradaA, { toValue: 1, friction: 5, tension: 50, useNativeDriver: true }).start()
  }, [])

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(escalaA, { toValue: emocao.escala, duration: emocao.vel, useNativeDriver: true }),
        Animated.timing(sombraA, { toValue: 0.6,           duration: emocao.vel, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(escalaA, { toValue: 1, duration: emocao.vel, useNativeDriver: true }),
        Animated.timing(sombraA, { toValue: 1, duration: emocao.vel, useNativeDriver: true }),
      ]),
    ]))
    loop.start()
    return () => loop.stop()
  }, [emocaoKey])

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(balancoA, { toValue:  emocao.amp, duration: emocao.vel * 1.3, useNativeDriver: true }),
      Animated.timing(balancoA, { toValue: -emocao.amp, duration: emocao.vel * 1.3, useNativeDriver: true }),
      Animated.timing(balancoA, { toValue: 0,           duration: emocao.vel * 0.4, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [emocaoKey])

  function aoTocar() {
    Animated.sequence([
      Animated.timing(puloA, { toValue: -50, duration: 130, useNativeDriver: true }),
      Animated.spring(puloA, { toValue: 0, friction: 3, tension: 90, useNativeDriver: true }),
    ]).start()
    Animated.sequence([
      Animated.timing(brilhoA, { toValue: 1, duration: 80,  useNativeDriver: true }),
      Animated.timing(brilhoA, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start()
    setParticulas(Array.from({ length: 8 }, (_, i) => ({
      id: Date.now() + i,
      x: (Math.random() - 0.5) * 260,
      y: -(Math.random() * 180 + 80),
    })))
  }

  const rotate      = balancoA.interpolate({ inputRange:[-15,15], outputRange:['-12deg','12deg'] })
  const chapeuStyle = { position:'absolute', width: PET_SIZE * cfg.chapeu.w, height: PET_SIZE * cfg.chapeu.w * 0.6, top: PET_SIZE * cfg.chapeu.top, left: PET_SIZE * cfg.chapeu.left, zIndex: 10 }
  const colarStyle  = { position:'absolute', width: PET_SIZE * cfg.colar.w,  height: PET_SIZE * cfg.colar.w  * 0.7, top: PET_SIZE * cfg.colar.top,  left: PET_SIZE * cfg.colar.left,  zIndex: 10 }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <View style={[s.bgTopo, { backgroundColor: cfg.bgTopo }]} />
      <View style={[s.bgChao, { backgroundColor: cfg.bgChao }]} />

      {/* App Bar — react-native-paper Appbar */}
      <Appbar.Header style={[s.appBar, { backgroundColor: 'transparent' }]} statusBarHeight={Platform.OS === 'android' ? 0 : undefined}>
        <Appbar.BackAction onPress={onLogout} color="#fff" />
        <Appbar.Content
          title={turma?.nome || 'Meu Pet'}
          titleStyle={s.petNome}
        />
        {/* Chip de estágio — react-native-paper Chip */}
        <Chip
          style={[s.estagioChip, { borderColor: cfg.cor+'60', backgroundColor: cfg.cor+'20' }]}
          textStyle={[s.estagioLabel, { color: cfg.cor }]}
          compact
        >
          {estagio.label}
        </Chip>
      </Appbar.Header>

      {/* Chip de emoção */}
      <View style={s.emocaoRow}>
        <Chip
          style={[s.emocaoChip, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
          textStyle={[s.emocaoLabel, { color: cfg.cor }]}
          compact
        >
          {emocao.label}
        </Chip>
      </View>

      {/* Arena */}
      <View style={s.arena}>
        <Animated.View style={[s.brilhoRing, { opacity: brilhoA, borderColor: cfg.cor, shadowColor: cfg.cor }]} />

        {particulas.map(p => (
          <Particula key={p.id} x={p.x} y={p.y} cor={cfg.cor}
            onDone={() => setParticulas(prev => prev.filter(x => x.id !== p.id))} />
        ))}

        <Animated.View style={[s.petEntrada, {
          opacity: entradaA,
          transform: [{ scale: entradaA.interpolate({ inputRange:[0,1], outputRange:[0.3,1] }) }]
        }]}>
          <TouchableOpacity activeOpacity={1} onPress={aoTocar}>
            <Animated.View style={{ transform:[{ scale: escalaA }, { rotate }, { translateY: puloA }], width: PET_SIZE, height: PET_SIZE, position: 'relative' }}>
              {/* Pet — imagem local */}
              <Image source={cfg.img} style={{ width: PET_SIZE, height: PET_SIZE, position: 'absolute' }} resizeMode="contain" />
              {/* Chapéu — imagem do Supabase Storage, coordenadas calculadas */}
              {chapeu?.imagem && <Image source={{ uri: chapeu.imagem }} style={chapeuStyle} resizeMode="contain" />}
              {/* Colar — imagem do Supabase Storage, coordenadas calculadas */}
              {colar?.imagem  && <Image source={{ uri: colar.imagem  }} style={colarStyle}  resizeMode="contain" />}
            </Animated.View>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={[s.sombra, { backgroundColor: cfg.cor+'30', transform:[{scaleX:sombraA}], opacity:sombraA }]} />
      </View>

      {/* XP — react-native-paper ProgressBar */}
      <Surface style={s.xpCard} elevation={2}>
        <View style={s.xpRow}>
          <Text variant="labelLarge" style={s.xpLabel}>{xp.toLocaleString('pt-BR')} XP</Text>
          {proxEst
            ? <Text variant="labelSmall" style={s.xpFaltam}>faltam {(proxEst.xpMin - xp).toLocaleString()} para {proxEst.label}</Text>
            : <Text variant="labelSmall" style={[s.xpFaltam, { color: cfg.cor }]}>Nível máximo!</Text>
          }
        </View>
        <ProgressBar
          progress={xpPct}
          color={cfg.cor}
          style={s.progressBar}
        />
      </Surface>

      {/* Botões RPG */}
      <Surface style={s.botoesRow} elevation={4}>
        <BotaoRPG label="Chapéu"  cor={colors.green}  iconeVazio="🪖" itemEquipado={chapeu} onPress={() => setModal('chapeus')} />
        <BotaoRPG label="Colar"   cor={colors.purple} iconeVazio="📿" itemEquipado={colar}  onPress={() => setModal('colares')} />
        {onLoja && (
          <TouchableOpacity onPress={onLoja} activeOpacity={0.8} style={s.btnWrap}>
            <Surface style={[s.btnRPG, { borderColor: colors.yellow, backgroundColor: colors.yellow+'20' }]} elevation={2}>
              <Text style={s.btnRPGIconeVazio}>🛒</Text>
            </Surface>
            <Text style={[s.btnLabel, { color: colors.yellow }]}>Loja</Text>
          </TouchableOpacity>
        )}
      </Surface>

      {/* Modais */}
      <ModalItens
        visible={modal === 'chapeus'} titulo="Chapéus"
        itens={chapeusDispo} selecionado={chapeu} cor={colors.green}
        carregando={carregando} onSel={setChapeu} onFechar={() => setModal(null)}
      />
      <ModalItens
        visible={modal === 'colares'} titulo="Colares e Medalhas"
        itens={colaresDispo} selecionado={colar} cor={colors.purple}
        carregando={carregando} onSel={setColar} onFechar={() => setModal(null)}
      />
    </View>
  )
}

const s = StyleSheet.create({
  root:             { flex:1 },
  bgTopo:           { position:'absolute', top:0, left:0, right:0, bottom:0 },
  bgChao:           { position:'absolute', bottom:0, left:0, right:0, height:'35%', borderTopLeftRadius:60, borderTopRightRadius:60, opacity:0.8 },
  appBar:           { elevation:0 },
  petNome:          { fontSize:17, fontFamily:fonts.extrabold, color:'#fff', textShadowColor:'rgba(0,0,0,0.7)', textShadowOffset:{width:0,height:2}, textShadowRadius:6 },
  estagioChip:      { borderWidth:1.5, marginRight:8 },
  estagioLabel:     { fontSize:11, fontFamily:fonts.bold },
  emocaoRow:        { paddingHorizontal:14, alignItems:'flex-end', marginTop:-4, marginBottom:4 },
  emocaoChip:       { borderRadius:14 },
  emocaoLabel:      { fontSize:11, fontFamily:fonts.semibold },
  arena:            { flex:1, alignItems:'center', justifyContent:'flex-end', paddingBottom:12, position:'relative' },
  brilhoRing:       { position:'absolute', width:PET_SIZE*1.1, height:PET_SIZE*1.1, borderRadius:PET_SIZE*0.55, borderWidth:5, bottom:'14%', shadowOffset:{width:0,height:0}, shadowRadius:20, shadowOpacity:0.9 },
  petEntrada:       { alignItems:'center' },
  sombra:           { width:PET_SIZE*0.52, height:14, borderRadius:50, marginTop:4 },
  xpCard:           { marginHorizontal:14, marginBottom:8, borderRadius:16, padding:12, backgroundColor:'rgba(0,0,0,0.55)' },
  xpRow:            { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8 },
  xpLabel:          { color:'#fff', fontFamily:fonts.bold },
  xpFaltam:         { color:'rgba(255,255,255,0.45)', maxWidth:W*0.45, textAlign:'right' },
  progressBar:      { height:10, borderRadius:5, backgroundColor:'rgba(255,255,255,0.12)' },
  botoesRow:        { flexDirection:'row', justifyContent:'space-around', alignItems:'center', paddingHorizontal:10, paddingBottom:14, paddingTop:6, backgroundColor:'rgba(0,0,0,0.7)', borderTopWidth:1, borderTopColor:'rgba(255,255,255,0.06)' },
  btnWrap:          { alignItems:'center', gap:5 },
  btnRPG:           { width:58, height:58, borderRadius:29, borderWidth:2.5, alignItems:'center', justifyContent:'center', position:'relative' },
  btnRPGImg:        { width:36, height:36 },
  btnRPGIconeVazio: { fontSize:26 },
  btnBadge:         { position:'absolute', top:2, right:2, width:16, height:16, borderRadius:8, alignItems:'center', justifyContent:'center', borderWidth:1.5, borderColor:'#fff' },
  btnBadgeTxt:      { fontSize:8, color:'#fff', fontFamily:fonts.bold },
  btnLabel:         { fontSize:10, fontFamily:fonts.bold, letterSpacing:0.4 },
  modalBg:          { flex:1, backgroundColor:'rgba(0,0,0,0.88)', justifyContent:'flex-end', alignItems:'center' },
  modalSheet:       { width:'100%', maxWidth:480, backgroundColor:'#111a11', borderTopLeftRadius:32, borderTopRightRadius:32, padding:18, paddingBottom:36, maxHeight:H*0.72 },
  modalHandle:      { width:40, height:4, backgroundColor:'rgba(255,255,255,0.2)', borderRadius:2, alignSelf:'center', marginBottom:16 },
  modalTitulo:      { color:'#fff', textAlign:'center', marginBottom:16, fontFamily:fonts.bold },
  modalGrid:        { flexDirection:'row', flexWrap:'wrap', gap:10, justifyContent:'center', paddingBottom:10 },
  itemCard:         { width:(W-76)/3, alignItems:'center', padding:12, borderRadius:18, borderWidth:1.5, borderColor:'rgba(255,255,255,0.08)', backgroundColor:'rgba(255,255,255,0.05)', gap:6, position:'relative' },
  itemRemover:      { width:(W-76)/3, alignItems:'center', padding:12, borderRadius:18, borderWidth:1.5, borderColor:'rgba(255,80,80,0.3)', backgroundColor:'rgba(255,80,80,0.08)', gap:6 },
  itemRemoverX:     { width:36, height:36, borderRadius:18, borderWidth:1.5, borderColor:'rgba(255,80,80,0.4)', alignItems:'center', justifyContent:'center' },
  itemImg:          { width:52, height:52 },
  itemImgPlaceholder:{ width:52, height:52, backgroundColor:'rgba(255,255,255,0.08)', borderRadius:10 },
  itemNome:         { color:'rgba(255,255,255,0.7)', textAlign:'center' },
  selTag:           { position:'absolute', top:6, right:6, width:18, height:18, borderRadius:9, alignItems:'center', justifyContent:'center' },
  selTxt:           { fontSize:10, color:'#fff', fontFamily:fonts.bold },
  centralWrap:      { paddingVertical:32, alignItems:'center', gap:10 },
  vazioTitulo:      { color:'#fff', fontFamily:fonts.bold },
  vazioSub:         { color:'rgba(255,255,255,0.45)', textAlign:'center' },
  modalBtnFechar:   { borderRadius:16, padding:15, alignItems:'center', marginTop:10 },
  modalBtnFecharTxt:{ color:'#fff', fontFamily:fonts.bold },
})
