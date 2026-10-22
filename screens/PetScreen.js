import { useState, useEffect, useRef } from 'react'
import {
  View, StyleSheet, TouchableOpacity, Modal,
  Dimensions, Image, Animated, ScrollView,
  StatusBar, Platform, SafeAreaView,
} from 'react-native'
import {
  Text, ActivityIndicator, Surface, ProgressBar, Chip,
} from 'react-native-paper'
import { colors, fonts } from '../theme'
import { listarItensComprados, listarAcessoriosLoja } from '../services/storage'
import IconeUI, { IconeAcessorio } from '../components/IconeUI'
import TextoContorno from '../components/TextoContorno'

const WIN      = Dimensions.get('window')
const W        = Math.min(WIN.width, 480)
const H        = WIN.height
const PET_SIZE = W * 0.72

// Fundo padrão local — floresta amazônica
const FUNDO_PADRAO = require('../assets/fundo-floresta.png')

// Pet vem sempre do Supabase Storage via turma.pet (URL pública)
const PET_CFG = {
  default: { cor: colors.green,  bgCeu: '#061208', bgMeio: '#0d2410', bgChao: '#1a4020',
             chapeu: { top: -0.02, left: 0.18, w: 0.62 }, colar: { top: 0.42, left: 0.28, w: 0.45 } },
  arara:   { cor: '#42A5F5',     bgCeu: '#020810', bgMeio: '#061525', bgChao: '#0d2a50',
             chapeu: { top: -0.10, left: 0.20, w: 0.60 }, colar: { top: 0.25, left: 0.28, w: 0.44 } },
  onca:    { cor: colors.yellow, bgCeu: '#120800', bgMeio: '#241200', bgChao: '#3d2000',
             chapeu: { top: -0.12, left: 0.18, w: 0.62 }, colar: { top: 0.24, left: 0.26, w: 0.48 } },
}

function detectarCfg(iconeUrl) {
  if (!iconeUrl) return null
  const u = iconeUrl.toLowerCase()
  if (u.includes('arara'))                       return PET_CFG.arara
  if (u.includes('onca') || u.includes('tigre')) return PET_CFG.onca
  return PET_CFG.default
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

const EMOJI_PARA_EMOCAO = { '🤩':'euforico', '😄':'feliz', '😐':'normal', '😴':'dormindo', '😢':'triste' }
function resolverEmocao(v) {
  const chave = EMOJI_PARA_EMOCAO[v] || v
  return EMOCOES[chave] ? chave : 'normal'
}


function getEstagio(xp) {
  let idx = 0
  ESTAGIOS.forEach((e, i) => { if (xp >= e.xpMin) idx = i })
  return idx
}

// Tela de erro — pet não configurado
function TelaSemPet({ onLogout }) {
  return (
    <View style={se.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.green} />

      <View style={se.topo}>
        <Image source={require('../assets/logo.png')} style={se.logo} resizeMode="contain" />
        <Text style={se.appNome}>CURUPIRA</Text>
        <Text style={se.tagline}>Atividades extracurriculares gamificadas</Text>
      </View>

      <View style={se.card}>
        <View style={se.iconeWrap}>
          <IconeUI nome="pet" size={72} />
        </View>
        <Text style={se.titulo}>Pet não encontrado</Text>
        <Text style={se.sub}>
          Seu pet ainda não foi configurado.{'\n'}
          Fale com seu professor para liberar o seu pet!
        </Text>
        <TouchableOpacity style={se.btn} onPress={onLogout} activeOpacity={0.85}>
          <Text style={se.btnTxt}>Voltar ao Login</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const se = StyleSheet.create({
  root:      { flex:1, width:'100%', backgroundColor: colors.green, overflow:'hidden' },
  topo:      { alignItems:'center', paddingTop:60, paddingBottom:28, gap:8 },
  logo:      { width:80, height:80, borderRadius:40 },
  appNome:   { fontSize:24, fontFamily:fonts.extrabold, color:'#fff', letterSpacing:3 },
  tagline:   { fontSize:12, fontFamily:fonts.regular, color:'rgba(255,255,255,0.7)', textAlign:'center' },
  card:      { flex:1, backgroundColor:'#fff', borderTopLeftRadius:32, borderTopRightRadius:32, paddingHorizontal:24, paddingTop:32, paddingBottom:48, alignItems:'center' },
  iconeWrap: { width:72, height:72, borderRadius:36, backgroundColor:'#f0fff4', borderWidth:2, borderColor:colors.green+'40', alignItems:'center', justifyContent:'center', marginBottom:16 },
  icone:     { fontSize:34 },
  titulo:    { fontSize:22, fontFamily:fonts.extrabold, color:'#111', textAlign:'center', marginBottom:8 },
  sub:       { fontSize:14, fontFamily:fonts.regular, color:'#666', textAlign:'center', lineHeight:22, marginBottom:28 },
  btn:       { width:'100%', maxWidth:400, backgroundColor:colors.green, borderRadius:14, paddingVertical:18, alignItems:'center', elevation:4, shadowColor:colors.green, shadowOffset:{width:0,height:4}, shadowOpacity:0.3, shadowRadius:8 },
  btnTxt:    { fontSize:16, fontFamily:fonts.bold, color:'#fff' },
})

// Partícula
function Particula({ x, y, cor, onDone }) {
  const a = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(a, { toValue:1, duration:900, useNativeDriver:true }).start(onDone)
  }, [])
  return (
    <Animated.View style={{
      position:'absolute', width:10, height:10, borderRadius:5, backgroundColor:cor,
      transform:[
        { translateX: a.interpolate({ inputRange:[0,1], outputRange:[0,x] }) },
        { translateY: a.interpolate({ inputRange:[0,1], outputRange:[0,y] }) },
        { scale:      a.interpolate({ inputRange:[0,0.4,1], outputRange:[0.4,1.5,0.2] }) },
      ],
      opacity: a.interpolate({ inputRange:[0,0.2,0.8,1], outputRange:[0,1,1,0] }),
    }} />
  )
}

// Botão "gordinho" 3D: face colorida, brilho em cima e base mais escura que afunda ao tocar
function BotaoJogo({ label, slotIcone, cor, escura, itemEquipado, onPress }) {
  const [apertado, setApertado] = useState(false)
  const equipado = !!itemEquipado
  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={() => setApertado(true)}
      onPressOut={() => setApertado(false)}
      style={s.gBtnWrap}
    >
      <View style={[s.gBtnLip, { backgroundColor:escura, paddingBottom: apertado ? 2 : 7, marginTop: apertado ? 5 : 0 }]}>
        <View style={[s.gBtnFace, { backgroundColor:cor }]}>
          <View style={s.gBtnShine} />
          {itemEquipado?.imagem
            ? <Image source={{ uri:itemEquipado.imagem }} style={s.gBtnImg} resizeMode="contain" />
            : <IconeAcessorio slot={slotIcone} size={48} />}
        </View>
        {equipado && (
          <View style={s.gBtnBadge}><Text style={s.gBtnBadgeTxt}>✓</Text></View>
        )}
      </View>
      <TextoContorno size={13}>{label}</TextoContorno>
    </TouchableOpacity>
  )
}

// Modal de seleção de itens
function ModalItens({ visible, titulo, itens, selecionado, cor, carregando, onSel, onFechar }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onFechar}>
      <View style={s.modalBg}>
        <Surface style={s.modalSheet} elevation={5}>
          <View style={s.modalHandle} />
          <Text style={s.modalTitulo}>{titulo}</Text>
          {carregando ? (
            <View style={s.centralWrap}>
              <ActivityIndicator animating color={cor} size="large" />
            </View>
          ) : itens.length === 0 ? (
            <View style={s.centralWrap}>
              <Text style={s.vazioTitulo}>Nenhum item comprado</Text>
              <Text style={s.vazioSub}>Visite a loja para comprar cosméticos!</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={s.modalGrid} showsVerticalScrollIndicator={false}>
              <TouchableOpacity style={s.itemRemover} onPress={() => { onSel(null); onFechar() }}>
                <View style={s.itemRemoverX}><Text style={{ color:'#ff6b6b', fontSize:18, fontFamily:fonts.bold }}>✕</Text></View>
                <Text style={[s.itemNome, { color:'#ff6b6b' }]}>Remover</Text>
              </TouchableOpacity>
              {itens.map(item => {
                const sel = selecionado?.id === item.id
                return (
                  <TouchableOpacity key={item.id}
                    style={[s.itemCard, sel && { borderColor:cor, borderWidth:2.5, backgroundColor:cor+'18' }]}
                    onPress={() => { onSel(item); onFechar() }}
                    activeOpacity={0.75}
                  >
                    {item.imagem
                      ? <Image source={{ uri:item.imagem }} style={s.itemImg} resizeMode="contain" />
                      : <View style={s.itemImgPlaceholder} />
                    }
                    <Text style={s.itemNome} numberOfLines={2}>{item.nome}</Text>
                    {sel && <View style={[s.selTag, { backgroundColor:cor }]}><Text style={s.selTxt}>✓</Text></View>}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          )}
          <TouchableOpacity style={[s.modalBtnFechar, { backgroundColor:cor }]} onPress={onFechar}>
            <Text style={s.modalBtnFecharTxt}>Fechar</Text>
          </TouchableOpacity>
        </Surface>
      </View>
    </Modal>
  )
}

export default function PetScreen(props) {
  if (!detectarCfg(props.turma?.pet)) return <TelaSemPet onLogout={props.onLogout} />
  return <PetScreenConteudo {...props} />
}

function PetScreenConteudo({ aluno, turma, onLogout, onLoja }) {
  const cfg       = detectarCfg(turma?.pet)
  const emocaoKey = resolverEmocao(turma?.emocao)
  const emocao    = EMOCOES[emocaoKey]
  const xp        = turma?.xp || 0
  const estagioI  = getEstagio(xp)
  const estagio   = ESTAGIOS[estagioI]
  const proxEst   = ESTAGIOS[estagioI + 1]
  const xpPct     = proxEst ? Math.min(1, (xp - estagio.xpMin) / (proxEst.xpMin - estagio.xpMin)) : 1

  const [chapeu,     setChapeu]     = useState(null)
  const [colar,      setColar]      = useState(null)
  const [cenario,    setCenario]    = useState(null)
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
  const cenariosDispo = todosItens.filter(i => i.slot === 'fundo' && comprados.includes(i.id))

  const escalaA  = useRef(new Animated.Value(1)).current
  const balancoA = useRef(new Animated.Value(0)).current
  const puloA    = useRef(new Animated.Value(0)).current
  const brilhoA  = useRef(new Animated.Value(0)).current
  const sombraA  = useRef(new Animated.Value(1)).current
  const entradaA = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.spring(entradaA, { toValue:1, friction:5, tension:50, useNativeDriver:true }).start()
  }, [])

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(escalaA, { toValue:emocao.escala, duration:emocao.vel, useNativeDriver:true }),
        Animated.timing(sombraA, { toValue:0.6,           duration:emocao.vel, useNativeDriver:true }),
      ]),
      Animated.parallel([
        Animated.timing(escalaA, { toValue:1, duration:emocao.vel, useNativeDriver:true }),
        Animated.timing(sombraA, { toValue:1, duration:emocao.vel, useNativeDriver:true }),
      ]),
    ]))
    loop.start()
    return () => loop.stop()
  }, [emocaoKey])

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(balancoA, { toValue: emocao.amp,  duration:emocao.vel*1.3, useNativeDriver:true }),
      Animated.timing(balancoA, { toValue:-emocao.amp,  duration:emocao.vel*1.3, useNativeDriver:true }),
      Animated.timing(balancoA, { toValue:0,            duration:emocao.vel*0.4, useNativeDriver:true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [emocaoKey])

  function aoTocar() {
    Animated.sequence([
      Animated.timing(puloA, { toValue:-55, duration:130, useNativeDriver:true }),
      Animated.spring(puloA, { toValue:0, friction:3, tension:90, useNativeDriver:true }),
    ]).start()
    Animated.sequence([
      Animated.timing(brilhoA, { toValue:1, duration:80,  useNativeDriver:true }),
      Animated.timing(brilhoA, { toValue:0, duration:500, useNativeDriver:true }),
    ]).start()
    setParticulas(Array.from({ length:10 }, (_,i) => ({
      id: Date.now()+i,
      x: (Math.random()-.5)*280,
      y: -(Math.random()*200+80),
    })))
  }

  const rotate      = balancoA.interpolate({ inputRange:[-15,15], outputRange:['-10deg','10deg'] })
  const chapeuStyle = { position:'absolute', width:PET_SIZE*cfg.chapeu.w, height:PET_SIZE*cfg.chapeu.w*0.6, top:PET_SIZE*cfg.chapeu.top, left:PET_SIZE*cfg.chapeu.left, zIndex:10 }
  const colarStyle  = { position:'absolute', width:PET_SIZE*cfg.colar.w,  height:PET_SIZE*cfg.colar.w*0.7,  top:PET_SIZE*cfg.colar.top,  left:PET_SIZE*cfg.colar.left,  zIndex:10 }

  return (
    <View style={s.telaExterna}>
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* Fundo — imagem do banco tem prioridade, senão usa floresta padrão */}
      <Image
        source={cenario?.imagem ? { uri: cenario.imagem } : turma?.fundo ? { uri: turma.fundo } : FUNDO_PADRAO}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      {/* Overlay escuro suave para legibilidade */}
      <View style={s.fundoOverlay} />

      <SafeAreaView style={s.safe}>

        {/* Header compacto */}
        <View style={s.header}>
          <TouchableOpacity style={s.btnVoltar} onPress={onLogout} activeOpacity={0.7}>
            <Text style={s.btnVoltarTxt}>←</Text>
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <View style={s.placaNome}>
              <Text style={s.placaTurma} numberOfLines={1} adjustsFontSizeToFit>{turma?.nome || 'Meu Pet'}</Text>
              {turma?.petNome ? <Text style={s.placaPet} numberOfLines={1} adjustsFontSizeToFit>{turma.petNome}</Text> : null}
            </View>
            <View style={s.chipsRow}>
              <View style={[s.pill, { backgroundColor:'#FFC107' }]}>
                <Text style={s.pillTxt}>{estagio.label}</Text>
              </View>
              <View style={[s.pill, { backgroundColor:'#FFFFFF' }]}>
                <Text style={s.pillTxt}>{emocao.label}</Text>
              </View>
            </View>
          </View>
          <View style={{ width:48 }} />
        </View>

        {/* Arena */}
        <View style={s.arena}>
          {/* Brilho ao tocar */}
          <Animated.View style={[s.brilhoRing, { opacity:brilhoA, borderColor:cfg.cor, shadowColor:cfg.cor }]} />

          {/* Partículas */}
          {particulas.map(p => (
            <Particula key={p.id} x={p.x} y={p.y} cor={cfg.cor}
              onDone={() => setParticulas(prev => prev.filter(x => x.id !== p.id))} />
          ))}

          {/* Pet + cosméticos */}
          <Animated.View style={[s.petEntrada, {
            opacity: entradaA,
            transform:[{ scale: entradaA.interpolate({ inputRange:[0,1], outputRange:[0.3,1] }) }]
          }]}>
            <TouchableOpacity activeOpacity={1} onPress={aoTocar}>
              <Animated.View style={{
                transform:[{ scale:escalaA },{ rotate },{ translateY:puloA }],
                width:PET_SIZE, height:PET_SIZE, position:'relative',
              }}>
                {/* Pet — URL do Supabase */}
                <Image
                  source={{ uri: turma.pet }}
                  style={{ width:PET_SIZE, height:PET_SIZE, position:'absolute' }}
                  resizeMode="contain"
                />
                {/* Chapéu */}
                {chapeu?.imagem && <Image source={{ uri:chapeu.imagem }} style={chapeuStyle} resizeMode="contain" />}
                {/* Colar */}
                {colar?.imagem  && <Image source={{ uri:colar.imagem  }} style={colarStyle}  resizeMode="contain" />}
              </Animated.View>
            </TouchableOpacity>
          </Animated.View>

          {/* Sombra no chão */}
          <Animated.View style={[s.sombra, {
            backgroundColor: cfg.cor+'28',
            transform:[{ scaleX:sombraA }],
            opacity: sombraA,
          }]} />
        </View>

        {/* XP — barra estilo jogo */}
        <View style={s.xpWrap}>
          <View style={s.xpTrack}>
            {xpPct > 0 && (
              <View style={[s.xpFill, { width:`${Math.max(xpPct*100, 8)}%` }]}>
                <View style={s.xpGloss} />
              </View>
            )}
            <View style={s.xpTextoWrap} pointerEvents="none">
              <TextoContorno size={14}>
                {proxEst ? `${xp.toLocaleString('pt-BR')} / ${proxEst.xpMin.toLocaleString('pt-BR')} XP` : 'NÍVEL MÁXIMO!'}
              </TextoContorno>
            </View>
          </View>
          <View style={s.xpBadge}><IconeUI nome="xp" size={26} /></View>
          {proxEst && (
            <View style={s.xpProx}>
              <TextoContorno size={12}>{`Faltam ${(proxEst.xpMin - xp).toLocaleString('pt-BR')} para ${proxEst.label}`}</TextoContorno>
            </View>
          )}
        </View>

        {/* Barra de ações */}
        <View style={s.acoes}>
          <BotaoJogo label="Chapéu"  slotIcone="chapeu" cor="#4CD137" escura="#2E8B1E" itemEquipado={chapeu}  onPress={() => setModal('chapeus')} />
          <BotaoJogo label="Cenário" slotIcone="fundo" cor="#29B6F6" escura="#0B6FA8" itemEquipado={cenario} onPress={() => setModal('cenarios')} />
          <BotaoJogo label="Colar"   slotIcone="colar" cor="#B15CFF" escura="#6A1FB5" itemEquipado={colar}   onPress={() => setModal('colares')} />
          {onLoja && (
            <BotaoJogo label="Loja" cor="#FFC928" escura="#C47F00" onPress={onLoja} />
          )}
        </View>

      </SafeAreaView>

      {/* Modais */}
      <ModalItens
        visible={modal==='chapeus'} titulo="Chapéus"
        itens={chapeusDispo} selecionado={chapeu} cor={colors.green}
        carregando={carregando} onSel={setChapeu} onFechar={() => setModal(null)}
      />
      <ModalItens
        visible={modal==='colares'} titulo="Colares e Medalhas"
        itens={colaresDispo} selecionado={colar} cor={colors.purple}
        carregando={carregando} onSel={setColar} onFechar={() => setModal(null)}
      />
      <ModalItens
        visible={modal==='cenarios'} titulo="Cenários"
        itens={cenariosDispo} selecionado={cenario} cor={colors.yellow}
        carregando={carregando} onSel={setCenario} onFechar={() => setModal(null)}
      />
    </View>
    </View>
  )
}

const s = StyleSheet.create({
  telaExterna:      { flex:1, alignItems:'center', backgroundColor:'#000' },
  root:             { flex:1, width:'100%', maxWidth:480, overflow:'hidden' },
  safe:             { flex:1 },

  // Fundo
  fundoOverlay:     { position:'absolute', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.18)' },

  // Header
  header:           { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:14, paddingTop:Platform.OS==='android'?12:4, paddingBottom:8 },
  btnVoltar:        { width:48, height:48, borderRadius:24, backgroundColor:'#FFFFFF', borderWidth:3, borderColor:'#2E7D32', alignItems:'center', justifyContent:'center', elevation:4 },
  btnVoltarTxt:     { fontSize:26, fontFamily:fonts.extrabold, color:'#1B5E20', marginTop:-2 },
  headerCenter:     { flex:1, alignItems:'center', gap:8, paddingHorizontal:8 },
  placaNome:        { alignItems:'center', maxWidth:'100%', backgroundColor:'#FFF8E1', borderWidth:3, borderColor:'#2E7D32', borderRadius:20, paddingHorizontal:20, paddingVertical:8, elevation:4 },
  placaTurma:       { fontSize:15, fontFamily:fonts.bold, color:'#5D4037', letterSpacing:1 },
  placaPet:         { fontSize:30, fontFamily:fonts.extrabold, color:'#1B5E20' },
  chipsRow:         { flexDirection:'row', flexWrap:'wrap', justifyContent:'center', gap:6 },
  pill:             { paddingHorizontal:12, paddingVertical:6, borderRadius:20, borderWidth:2, borderColor:'#3E2723', elevation:3 },
  pillTxt:          { fontSize:14, fontFamily:fonts.bold, color:'#3E2723' },
  headerNome:       { fontSize:16, fontFamily:fonts.extrabold, color:colors.cream, textShadowColor:'rgba(0,0,0,0.8)', textShadowOffset:{width:0,height:2}, textShadowRadius:6 },
  petNomeHeader:    { fontSize:13, fontFamily:fonts.semibold, color:'rgba(245,244,217,0.75)', textShadowColor:'rgba(0,0,0,0.8)', textShadowOffset:{width:0,height:1}, textShadowRadius:4 },
  estagioChip:      { borderWidth:1.5 },
  estagioTxt:       { fontSize:11, fontFamily:fonts.bold },
  emocaoChip:       { borderRadius:14 },
  emocaoTxt:        { fontSize:11, fontFamily:fonts.semibold },

  // Arena
  arena:            { flex:1, alignItems:'center', justifyContent:'flex-end', paddingBottom:8, position:'relative' },
  brilhoRing:       { position:'absolute', width:PET_SIZE*1.15, height:PET_SIZE*1.15, borderRadius:PET_SIZE*0.575, borderWidth:6, bottom:'10%', shadowOffset:{width:0,height:0}, shadowRadius:24, shadowOpacity:1 },
  petEntrada:       { alignItems:'center' },
  sombra:           { width:PET_SIZE*0.55, height:18, borderRadius:50, marginTop:2 },

  // XP
  xpCard:           { marginHorizontal:14, marginBottom:6, borderRadius:18, padding:14, backgroundColor:'rgba(5,10,5,0.75)' },
  xpRow:            { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8 },
  xpLabel:          { fontSize:13, fontFamily:fonts.bold, color:colors.cream },
  xpFaltam:         { fontSize:9, fontFamily:fonts.medium, color:'rgba(245,244,217,0.45)', maxWidth:W*0.45, textAlign:'right' },
  progressBar:      { height:10, borderRadius:5, backgroundColor:'rgba(255,255,255,0.08)' },

  // Barra de ações
  acoes:            { flexDirection:'row', justifyContent:'space-around', alignItems:'flex-start', paddingHorizontal:8, paddingTop:14, paddingBottom:12, backgroundColor:'#2A1A4A', borderTopWidth:5, borderTopColor:'#FFC928' },
  gBtnWrap:         { alignItems:'center', gap:6 },
  gBtnLip:          { borderRadius:20, borderWidth:3.5, borderColor:'#1B1030', paddingBottom:7, position:'relative' },
  gBtnFace:         { width:72, height:68, borderRadius:15, alignItems:'center', justifyContent:'center', overflow:'hidden' },
  gBtnShine:        { position:'absolute', top:0, left:0, right:0, height:'45%', backgroundColor:'rgba(255,255,255,0.32)' },
  gBtnIcone:        { fontSize:36 },
  gBtnImg:          { width:52, height:52 },
  gBtnBadge:        { position:'absolute', top:-10, right:-10, width:26, height:26, borderRadius:13, backgroundColor:'#FF3B5C', borderWidth:3, borderColor:'#1B1030', alignItems:'center', justifyContent:'center' },
  gBtnBadgeTxt:     { fontSize:13, color:'#fff', fontFamily:fonts.extrabold },
  xpWrap:           { marginHorizontal:22, marginTop:6, marginBottom:12 },
  xpTrack:          { height:30, borderRadius:15, backgroundColor:'#1B1030', borderWidth:3.5, borderColor:'#1B1030', overflow:'hidden', justifyContent:'center', marginLeft:14 },
  xpFill:           { position:'absolute', left:0, top:0, bottom:0, borderRadius:12, backgroundColor:'#7CE82B', borderBottomWidth:4, borderBottomColor:'#3C9A00', overflow:'hidden' },
  xpGloss:          { position:'absolute', top:0, left:0, right:0, height:'45%', backgroundColor:'rgba(255,255,255,0.4)' },
  xpTextoWrap:      { ...StyleSheet.absoluteFillObject, alignItems:'center', justifyContent:'center' },
  xpBadge:          { position:'absolute', left:-6, top:-7, width:42, height:42, borderRadius:21, backgroundColor:'#8E5CF0', borderWidth:3.5, borderColor:'#1B1030', alignItems:'center', justifyContent:'center' },
  xpBadgeTxt:       { fontSize:20 },
  xpProx:           { alignItems:'center', marginTop:8 },
  btnCosmWrap:      { alignItems:'center', gap:5 },
  btnCosmSombra:    { borderRadius:14, shadowColor:'#000', shadowOffset:{width:0,height:4}, shadowOpacity:0.6, shadowRadius:6, elevation:8 },
  btnCosmBorda:     { width:68, height:72, borderRadius:14, borderWidth:3, alignItems:'center', justifyContent:'center', position:'relative', overflow:'hidden' },
  btnCosmShine:     { position:'absolute', top:0, left:0, right:0, height:'45%', backgroundColor:'rgba(255,255,255,0.12)' },
  btnCosmInner:     { alignItems:'center', justifyContent:'center', width:'100%', height:'100%' },
  btnCosmImg:       { width:44, height:44 },
  btnCosmBadge:     { position:'absolute', top:2, right:2, width:18, height:18, borderRadius:9, alignItems:'center', justifyContent:'center', borderWidth:2, borderColor:'rgba(0,0,0,0.5)' },
  btnCosmBadgeTxt:  { fontSize:9, color:'#fff', fontFamily:fonts.bold },
  btnCosmLabel:     { fontSize:11, fontFamily:fonts.bold, letterSpacing:0.3 },

  // Modal
  modalBg:          { flex:1, backgroundColor:'rgba(0,0,0,0.88)', justifyContent:'flex-end', alignItems:'center' },
  modalSheet:       { width:'100%', maxWidth:480, backgroundColor:'#0d160d', borderTopLeftRadius:32, borderTopRightRadius:32, padding:18, paddingBottom:36, maxHeight:H*0.72 },
  modalHandle:      { width:40, height:4, backgroundColor:'rgba(255,255,255,0.15)', borderRadius:2, alignSelf:'center', marginBottom:16 },
  modalTitulo:      { fontSize:18, fontFamily:fonts.bold, color:colors.cream, textAlign:'center', marginBottom:16 },
  modalGrid:        { flexDirection:'row', flexWrap:'wrap', gap:10, justifyContent:'center', paddingBottom:10 },
  itemCard:         { width:(W-76)/3, alignItems:'center', padding:12, borderRadius:18, borderWidth:1.5, borderColor:'rgba(255,255,255,0.08)', backgroundColor:'rgba(255,255,255,0.04)', gap:6, position:'relative' },
  itemRemover:      { width:(W-76)/3, alignItems:'center', padding:12, borderRadius:18, borderWidth:1.5, borderColor:'rgba(255,80,80,0.3)', backgroundColor:'rgba(255,80,80,0.07)', gap:6 },
  itemRemoverX:     { width:36, height:36, borderRadius:18, borderWidth:1.5, borderColor:'rgba(255,80,80,0.4)', alignItems:'center', justifyContent:'center' },
  itemImg:          { width:52, height:52 },
  itemImgPlaceholder:{ width:52, height:52, backgroundColor:'rgba(255,255,255,0.07)', borderRadius:10 },
  itemNome:         { fontSize:10, fontFamily:fonts.semibold, color:'rgba(245,244,217,0.7)', textAlign:'center' },
  selTag:           { position:'absolute', top:6, right:6, width:18, height:18, borderRadius:9, alignItems:'center', justifyContent:'center' },
  selTxt:           { fontSize:10, color:'#fff', fontFamily:fonts.bold },
  centralWrap:      { paddingVertical:32, alignItems:'center', gap:10 },
  vazioTitulo:      { fontSize:15, fontFamily:fonts.bold, color:colors.cream },
  vazioSub:         { fontSize:12, fontFamily:fonts.regular, color:'rgba(245,244,217,0.45)', textAlign:'center' },
  modalBtnFechar:   { borderRadius:16, padding:15, alignItems:'center', marginTop:10 },
  modalBtnFecharTxt:{ fontSize:15, fontFamily:fonts.bold, color:'#fff' },
})