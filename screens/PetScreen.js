import { useState, useEffect, useRef } from 'react'
import {
  View, StyleSheet, TouchableOpacity, Modal,
  Dimensions, Image, Animated, ScrollView, PanResponder,
  StatusBar, Platform, SafeAreaView,
} from 'react-native'
import {
  Text, ActivityIndicator, Surface, ProgressBar, Chip,
} from 'react-native-paper'
import { colors, fonts } from '../theme'
import { listarItensComprados, listarAcessoriosLoja, listarEquipados, atualizarEquipado } from '../services/storage'
import IconeUI from '../components/IconeUI'
import TextoContorno from '../components/TextoContorno'

const WIN      = Dimensions.get('window')
const W        = Math.min(WIN.width, 480)
const H        = WIN.height
const PET_SIZE = W * 0.72

// Fundo padrão local — floresta amazônica
const FUNDO_PADRAO = require('../assets/fundo-floresta.png')
// Pet vem do Supabase Storage via turma.pet (URL pública).
// As coordenadas dos acessórios serão ajustadas separadamente por pet.
// Calibração das imagens do Supabase (1024x1024, quadrada).
// posChapeu converte um ponto (x,y) da imagem original em top/left/w
// da caixa do chapéu (que tem altura = 0.6 * largura).
const IMG_W = 1024
const IMG_H = 1024
const LETTERBOX = 0
const HAT_ART = { cx: 0.49, base: 0.52, w: 0.38 }

function posChapeu({ x, y, largura }) {
  const w = (largura / IMG_W) / HAT_ART.w
  const h = w * 0.6
  return {
    w,
    left: x / IMG_W - HAT_ART.cx * w,
    top:  LETTERBOX + y / IMG_W - HAT_ART.base * h,
  }
}
// Configuração visual por espécie. A espécie vem de pets.nome (via
// turma.petNome) — NÃO do nome do arquivo da imagem: os uploads do admin
// geram nomes aleatórios (<timestamp>-<random>.png), então a URL não diz nada.
//
// `calibrado` indica se as coordenadas do chapéu/colar foram medidas na
// imagem real daquela espécie. Hoje só o jacaré foi (medido no Paint, imagem
// 1024x1024 do Supabase). Arara e onça AINDA usam os valores que já estavam
// no código (iguais aos do jacaré) e precisam ser medidos nas imagens reais —
// até lá o chapéu pode ficar torto nelas. Não "chutar" coordenadas aqui.
const PET_CFG = {
  jacare: {
    especie: 'jacare', calibrado: true,
    cor: colors.green,
    bgCeu: '#061208',
    bgMeio: '#0d2410',
    bgChao: '#1a4020',
    chapeu: posChapeu({ x: 516, y: 220, largura: 250 }),
    colar: { top: 0.50, left: 0.28, w: 0.45 },
  },
  arara: {
    especie: 'arara', calibrado: false, // TODO: medir cabeça/pescoço na imagem real da arara
    cor: '#42A5F5',
    bgCeu: '#020810',
    bgMeio: '#061525',
    bgChao: '#0d2a50',
    chapeu: posChapeu({ x: 516, y: 220, largura: 280 }),
    colar: { top: 0.55, left: 0.28, w: 0.44 },
  },
  onca: {
    especie: 'onca', calibrado: false, // TODO: medir cabeça/pescoço na imagem real da onça/tigre
    cor: colors.yellow,
    bgCeu: '#120800',
    bgMeio: '#241200',
    bgChao: '#3d2000',
    chapeu: posChapeu({ x: 516, y: 220, largura: 280 }),
    colar: { top: 0.55, left: 0.26, w: 0.48 },
  },
  // Espécie desconhecida / nome ausente: tela nunca quebra. Usa a geometria do
  // jacaré só como valor seguro — não é calibração dessa espécie.
  default: {
    especie: 'default', calibrado: false,
    cor: colors.green,
    bgCeu: '#061208',
    bgMeio: '#0d2410',
    bgChao: '#1a4020',
    chapeu: posChapeu({ x: 516, y: 220, largura: 250 }),
    colar: { top: 0.50, left: 0.28, w: 0.45 },
  },
}

// Termos (sem acento, minúsculos) que identificam cada espécie no pets.nome.
const ESPECIES = [
  { chave: 'jacare', termos: ['jacare'] },
  { chave: 'arara',  termos: ['arara'] },
  { chave: 'onca',   termos: ['onca', 'tigre', 'jaguar'] },
]

function normalizarNome(nome) {
  return String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function detectarCfg(petNome) {
  const n = normalizarNome(petNome)
  const achada = n && ESPECIES.find(e => e.termos.some(t => n.includes(t)))
  return PET_CFG[achada ? achada.chave : 'default']
}

const _avisados = new Set()
function avisarSemCalibracao(cfg) {
  if (typeof __DEV__ === 'undefined' || !__DEV__ || cfg.calibrado || _avisados.has(cfg.especie)) return
  _avisados.add(cfg.especie)
  console.warn(`[PetScreen] Coordenadas de chapéu/colar da espécie "${cfg.especie}" ainda não foram calibradas na imagem real.`)
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
          <Text style={se.icone}>🙋</Text>
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
function BotaoJogo({ label, emoji, cor, escura, itemEquipado, onPress }) {
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
          <Text style={s.gBtnEmoji}>{emoji}</Text>
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

export default function PetScreen({ aluno, turma, onLogout, onLoja }) {
  // A tela do PET ocupa a página central; há duas páginas vazias de cada lado.
  const [pagina, setPagina] = useState(2)
  const paginaRef = useRef(2)
  const deslocamentoPaginas = useRef(new Animated.Value(-2 * W)).current
  const gestoHorizontal = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gesto) =>
      Math.abs(gesto.dx) > 18 && Math.abs(gesto.dx) > Math.abs(gesto.dy) * 1.2,
    onMoveShouldSetPanResponderCapture: (_, gesto) =>
      Math.abs(gesto.dx) > 18 && Math.abs(gesto.dx) > Math.abs(gesto.dy) * 1.2,
    onPanResponderRelease: (_, gesto) => {
      let destino = paginaRef.current
      if (gesto.dx < -40) destino = Math.min(4, destino + 1)
      else if (gesto.dx > 40) destino = Math.max(0, destino - 1)
      if (destino === paginaRef.current) return
      paginaRef.current = destino
      setPagina(destino)
      Animated.spring(deslocamentoPaginas, {
        toValue: -destino * W,
        speed: 16,
        bounciness: 3,
        useNativeDriver: true,
      }).start()
    },
  })).current

  const cfg       = detectarCfg(turma?.petNome)
  avisarSemCalibracao(cfg)
  const emocaoKey = turma?.emocao || 'feliz'
  const emocao    = EMOCOES[emocaoKey] || EMOCOES.feliz
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

  const alunoId = aluno?.id
  const petId   = turma?.petId

  useEffect(() => {
    if (!alunoId) { setComprados([]); return }
    let ativo = true // troca rápida de tela/aluno: resposta atrasada não pode sobrescrever o estado atual
    listarItensComprados(alunoId)
      .then(ids => { if (ativo) setComprados(ids) })
      .catch(e => console.error('Erro ao carregar inventário:', e?.codigo || e?.message))
    return () => { ativo = false }
  }, [alunoId])

  useEffect(() => {
    listarAcessoriosLoja()
      .then(itens => setTodosItens(itens || []))
      .catch(console.error)
      .finally(() => setCarregando(false))
  }, [])

  // Slots que o usuário já mexeu nesta sessão: a restauração assíncrona do
  // storage não pode sobrescrever uma escolha feita enquanto ela carregava.
  const tocados = useRef({})

  // Restaura o que o aluno tinha equipado nesse pet (persistido por
  // aluno+pet — ver services/storage.js): chapéu, colar e cenário ('fundo').
  // Só dá pra montar os objetos completos (com imagem etc) depois que o
  // catálogo (todosItens) chega, por isso depende dele. Só LÊ o storage e
  // atualiza o estado — nunca escreve (null aqui não apaga nada salvo).
  // Roda de novo se o aluno trocar de pet/turma.
  useEffect(() => {
    if (!alunoId || todosItens.length === 0) return
    let ativo = true
    const achar = id => (id == null ? null : todosItens.find(i => String(i.id) === String(id)) || null)
    listarEquipados(alunoId, petId).then(({ chapeu: chapeuId, colar: colarId, fundo: fundoId }) => {
      if (!ativo) return
      if (!tocados.current.chapeu) setChapeu(achar(chapeuId))
      if (!tocados.current.colar)  setColar(achar(colarId))
      if (!tocados.current.fundo)  setCenario(achar(fundoId))
    }).catch(e => console.error('Erro ao carregar acessórios equipados:', e?.codigo || e?.message)) // falha de rede: mantém o que está na tela
    return () => { ativo = false }
  }, [alunoId, petId, todosItens])

  // Equipar/trocar/desequipar (item null = desequipar) — atualiza a tela
  // na hora E persiste, pra sobreviver a fechar/reabrir a tela do pet ou
  // o app. Sem aluno identificado, só fica equipado nesta sessão.
  function equipar(slot, setar, item, anterior) {
    tocados.current[slot] = true
    setar(item)
    // Se o servidor recusar/falhar, volta ao item anterior: a tela nunca mostra
    // algo equipado que não foi salvo.
    if (alunoId) atualizarEquipado(alunoId, petId, slot, item?.id ?? null).catch(e => {
      console.error('Erro ao salvar acessório equipado:', e?.codigo || e?.message)
      setar(anterior)
    })
  }
  const selecionarChapeu  = item => equipar('chapeu', setChapeu,  item, chapeu)
  const selecionarColar   = item => equipar('colar',  setColar,   item, colar)
  const selecionarCenario = item => equipar('fundo',  setCenario, item, cenario)

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
    <View style={s.telaExterna} {...gestoHorizontal.panHandlers}>
    <View style={s.root}>
      <Animated.View style={[s.trilhaPaginas, { width:W*5, transform:[{ translateX:deslocamentoPaginas }] }]}>
      <PaginaCalendario width={W} petImage={turma?.pet} />
      <PaginaTarefas width={W} petImage={turma?.pet} />
      <View style={[s.paginaConteudo, { width:W }]}>
      <StatusBar barStyle={pagina === 1 || pagina === 3 ? 'dark-content' : 'light-content'} />

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
          <View style={{ width:48 }} />
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
          <BotaoJogo label="Chapéu" emoji="🎩" cor="#4CD137" escura="#2E8B1E" itemEquipado={chapeu}  onPress={() => setModal('chapeus')} />
          <BotaoJogo label="Cenário" emoji="🌄" cor="#29B6F6" escura="#0B6FA8" itemEquipado={cenario} onPress={() => setModal('cenarios')} />
          <BotaoJogo label="Colar"   emoji="📿" cor="#B15CFF" escura="#6A1FB5" itemEquipado={colar}   onPress={() => setModal('colares')} />
          {onLoja && (
            <BotaoJogo label="Loja" emoji="🛍️" cor="#FFC928" escura="#C47F00" onPress={onLoja} />
          )}
        </View>

      </SafeAreaView>

      {/* Modais */}
      <ModalItens
        visible={modal==='chapeus'} titulo="Chapéus"
        itens={chapeusDispo} selecionado={chapeu} cor={colors.green}
        carregando={carregando} onSel={selecionarChapeu} onFechar={() => setModal(null)}
      />
      <ModalItens
        visible={modal==='colares'} titulo="Colares e Medalhas"
        itens={colaresDispo} selecionado={colar} cor={colors.purple}
        carregando={carregando} onSel={selecionarColar} onFechar={() => setModal(null)}
      />
      <ModalItens
        visible={modal==='cenarios'} titulo="Cenários"
        itens={cenariosDispo} selecionado={cenario} cor={colors.yellow}
        carregando={carregando} onSel={selecionarCenario} onFechar={() => setModal(null)}
      />
      <ModalItens
        visible={modal==='cenarios'} titulo="Cenários"
        itens={cenariosDispo} selecionado={cenario} cor={colors.yellow}
        carregando={carregando} onSel={setCenario} onFechar={() => setModal(null)}
      />
      </View>
      <PaginaCursos width={W} petImage={turma?.pet} />
      <PaginaPerfil width={W} aluno={aluno} onSair={onLogout} />
      </Animated.View>
      <View pointerEvents="none" style={s.pageDots}>
        {[0, 1, 2, 3, 4].map(indice => (
          <View key={indice} style={[s.pageDot, pagina === indice && s.pageDotAtivo]} />
        ))}
      </View>
    </View>
    </View>
  )
}

const s = StyleSheet.create({
  telaExterna:      { flex:1, alignItems:'center', backgroundColor:'#000' },
  root:             { flex:1, width:'100%', maxWidth:480, overflow:'hidden' },
  trilhaPaginas:    { flex:1, flexDirection:'row' },
  paginaConteudo:   { flex:1, overflow:'hidden' },
  pageDots:         { position:'absolute', bottom:18, alignSelf:'center', flexDirection:'row', alignItems:'center', gap:8, paddingHorizontal:12, paddingVertical:8, borderRadius:20, backgroundColor:'rgba(0,0,0,0.58)', zIndex:20 },
  pageDot:          { width:8, height:8, borderRadius:4, backgroundColor:'rgba(255,255,255,0.65)' },
  pageDotAtivo:     { width:22, backgroundColor:'#FFC928' },
  safe:             { flex:1 },

  // Fundo
  fundoOverlay:     { position:'absolute', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.18)' },

  // Header
  header:           { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:14, paddingTop:Platform.OS==='android'?12:4, paddingBottom:8 },
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
  gBtnEmoji:        { fontSize:42 },
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

// Protótipos locais, sem RPCs. O perfil usa só o nome do aluno conectado e o
// callback de logout solicitado.
function criarEtapasComposteira() {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const dataDaEtapa = dias => {
    const data = new Date(hoje)
    data.setDate(data.getDate() + dias)
    return data
  }
  return [
    { titulo:'Pegar uma caixa', emoji:'📦', data:dataDaEtapa(0), feita:true },
    { titulo:'Colocar terra', emoji:'🪴', data:dataDaEtapa(0), feita:true },
    { titulo:'Adicionar minhocas', emoji:'🪱', data:dataDaEtapa(0), feita:false },
    { titulo:'Adicionar adubo', emoji:'🍂', data:dataDaEtapa(0), feita:false },
    { titulo:'Esperar 2 semanas', emoji:'⏳', data:dataDaEtapa(0), feita:false },
    { titulo:'Retirar a terra adubada', emoji:'🌱', data:dataDaEtapa(14), feita:false },
  ]
}

function chaveData(data) {
  return `${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`
}

function dataCurta(data) {
  return data.toLocaleDateString('pt-BR', { day:'numeric', month:'short' }).replace('.', '')
}

// Calendário local do aparelho com eventos da composteira de demonstração.
function MiniPet({ uri, emoji = '🌱', style }) {
  return uri
    ? <Image source={{ uri }} style={style} resizeMode="contain" />
    : <Text style={style}>{emoji}</Text>
}

function PaginaCalendario({ width, petImage }) {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const etapas = criarEtapasComposteira()
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const inicioGrade = (primeiroDia.getDay() + 6) % 7
  const dias = Array.from({ length:42 }, (_, indice) => new Date(hoje.getFullYear(), hoje.getMonth(), indice - inicioGrade + 1))
  const nomeMes = hoje.toLocaleDateString('pt-BR', { month:'long', year:'numeric' })
  const resumo = [
    { data:etapas[0].data, titulo:'Montar a composteira', detalhe:'4 etapas', emoji:'📦' },
    { data:etapas[5].data, titulo:'Terra adubada pronta', detalhe:'Finalizar composteira', emoji:'🌱' },
  ]

  return (
    <View style={[p.page, { width }]}>
      <View style={p.calendarHero}>
        <View style={p.calendarHeroRow}>
          <View style={p.calendarHeroText}>
            <Text style={p.calendarTitle}>📅 Calendário</Text>
            <Text style={p.calendarSubTitle}>Sua aventura de hoje</Text>
          </View>
          <MiniPet uri={petImage} emoji="🌿" style={p.calendarPet} />
        </View>
        <View style={p.monthRow}>
          <Text style={p.monthArrow}>‹</Text>
          <Text style={p.monthName}>{nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}</Text>
          <Text style={p.monthArrow}>›</Text>
        </View>
        <View style={p.weekdays}>
          {['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d => <Text key={d} style={p.weekday}>{d}</Text>)}
        </View>
      </View>
      <ScrollView contentContainerStyle={p.calendarContent} showsVerticalScrollIndicator={false}>
        <View style={p.calendarCard}>
          {dias.map((data, i) => {
            const mesmoMes = data.getMonth() === hoje.getMonth()
            const selecionado = chaveData(data) === chaveData(hoje)
            const temEvento = etapas.some(etapa => chaveData(etapa.data) === chaveData(data))
            return (
              <View key={`${data.getFullYear()}-${data.getMonth()}-${i}`} style={p.dayCell}>
                <View style={[p.dayCircle, selecionado && p.selectedDay]}>
                  <Text style={[p.dayText, !mesmoMes && p.mutedDay, selecionado && p.selectedDayText]}>{data.getDate()}</Text>
                </View>
                {temEvento ? <View style={[p.dayMark, selecionado && p.dayMarkSelected]} /> : <View style={p.dayMarkSpace} />}
              </View>
            )
          })}
        </View>
        <View style={p.calendarToday}><Text style={p.calendarTodayEmoji}>🌿</Text><Text style={p.calendarTodayText}>Hoje, {dataCurta(hoje)}</Text></View>
        <Text style={p.sectionTitle}>Composteira caseira</Text>
        {resumo.map(item => (
          <View key={item.titulo} style={p.calendarEvent}>
            <View style={p.calendarEventIcon}><Text style={p.calendarEventEmoji}>{item.emoji}</Text></View>
            <View style={p.calendarEventInfo}>
              <Text style={p.calendarEventTitle}>{item.titulo}</Text>
              <Text style={p.calendarEventSub}>{item.detalhe}</Text>
            </View>
            <Text style={p.calendarEventDate}>{dataCurta(item.data)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

function PaginaTarefas({ width, petImage }) {
  const etapas = criarEtapasComposteira()
  const feitas = etapas.filter(etapa => etapa.feita).length
  return (
    <View style={[p.page, { width }]}>
      <View style={p.taskHero}>
        <MiniPet uri={petImage} emoji="🌱" style={p.taskHeroPet} />
        <View style={p.taskHeroText}>
          <Text style={p.taskHeroEyebrow}>MISSÃO DO PET</Text>
          <Text style={p.taskHeroTitle}>Composteira caseira</Text>
        </View>
        <View style={p.taskCount}><Text style={p.taskCountText}>{feitas}/{etapas.length}</Text></View>
      </View>
      <ScrollView contentContainerStyle={p.taskContent} showsVerticalScrollIndicator={false}>
        <View style={p.taskProgressCard}>
          <Text style={p.taskProgressTitle}>Sua trilha</Text>
          <View style={p.taskProgressTrack}><View style={[p.taskProgressFill, { width:`${feitas / etapas.length * 100}%` }]} /></View>
          <Text style={p.taskProgressSub}>{feitas} de {etapas.length} etapas prontas</Text>
        </View>
        <View style={p.stepsList}>
          {etapas.map((etapa, i) => (
            <View key={etapa.titulo} style={p.stepRow}>
              <View style={p.stepRail}>
                <View style={[p.stepNumber, etapa.feita && p.stepDone]}>
                  <Text style={[p.stepNumberText, etapa.feita && p.stepDoneText]}>{etapa.feita ? '✓' : i + 1}</Text>
                </View>
                {i < etapas.length - 1 && <View style={[p.stepLine, etapa.feita && p.stepLineDone]} />}
              </View>
              <View style={[p.stepCard, etapa.feita && p.stepCardDone]}>
                <Text style={p.stepEmoji}>{etapa.emoji}</Text>
                <View style={p.stepInfo}>
                  <Text style={p.stepTitle}>{etapa.titulo}</Text>
                  <Text style={p.stepDate}>{i === 5 ? `Pronto em ${dataCurta(etapa.data)}` : i < feitas ? 'Etapa concluída' : 'Próxima etapa'}</Text>
                </View>
                <View style={p.stepXp}><Text style={p.stepXpText}>+5 XP</Text></View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

function PaginaCursos({ width, petImage }) {
  const conquistas = [
    { titulo:'Primeiro login', descricao:'Entrou no Curupira', emoji:'👋', ganha:true, cor:'#FFE27A' },
    { titulo:'Chapéu para o PET', descricao:'Compre um chapéu', emoji:'🎩', ganha:false, cor:'#C6F1C9' },
    { titulo:'Mãos na terra', descricao:'Complete uma etapa', emoji:'🪴', ganha:false, cor:'#D8C3F0' },
    { titulo:'Composteira pronta', descricao:'Complete a missão', emoji:'🏆', ganha:false, cor:'#FFD2A8' },
  ]
  return (
    <View style={[p.page, { width }]}>
      <View style={p.simpleHeader}>
        <Text style={p.headerEyebrow}>MEDALHAS DA AVENTURA</Text>
        <Text style={p.simpleTitle}>Conquistas</Text>
      </View>
      <ScrollView contentContainerStyle={p.courseContent} showsVerticalScrollIndicator={false}>
        <View style={p.achievementBanner}>
          <MiniPet uri={petImage} emoji="🏅" style={p.bannerPet} />
          <Text style={p.bannerText}>Sua coleção</Text>
          <Text style={p.bannerCount}>1 / {conquistas.length}</Text>
        </View>
        {conquistas.map(item => (
          <View key={item.titulo} style={[p.badgeCard, !item.ganha && p.badgeCardLocked]}>
            <View style={[p.badgeArt, { backgroundColor:item.cor }, !item.ganha && p.badgeArtLocked]}><Text style={p.badgeEmoji}>{item.emoji}</Text></View>
            <View style={p.badgeInfo}>
              <Text style={p.badgeTitle}>{item.titulo}</Text>
              <Text style={p.badgeDescription}>{item.descricao}</Text>
              <Text style={[p.badgeStatus, item.ganha && p.badgeStatusWon]}>{item.ganha ? 'CONQUISTADA!' : 'BLOQUEADA'}</Text>
            </View>
            {item.ganha && <Text style={p.badgeCheck}>✓</Text>}
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

function PaginaPerfil({ width, aluno, onSair }) {
  const nomeReal = String(aluno?.nome || '').trim()
  return (
    <View style={[p.page, { width }]}>
      <ScrollView contentContainerStyle={p.profileScroll} showsVerticalScrollIndicator={false}>
        <View style={p.profileHero}>
          <View style={p.profileTopLine}>
            <Text style={p.profilePageTitle}>Meu perfil</Text>
          </View>
          <View style={p.avatarCircle}><Text style={p.avatarGlyph}>🧑‍🌾</Text></View>
        </View>
        <View style={p.profileInfo}>
          {nomeReal ? <Text style={p.profileName}>{nomeReal}</Text> : null}
          <View style={p.profileTabs}>
            <View style={p.profileTabActive}><Text style={p.profileTabActiveText}>Conquistas</Text></View>
            <View style={p.profileTab}><Text style={p.profileTabText}>Meu PET</Text></View>
          </View>
          <View style={p.profileStats}>
            <View style={p.profileStat}><Text style={p.profileStatValue}>1</Text><Text style={p.profileStatLabel}>conquista</Text></View>
            <View style={p.statDivider} />
            <View style={p.profileStat}><Text style={p.profileStatValue}>🌱</Text><Text style={p.profileStatLabel}>meu PET</Text></View>
          </View>
          <View style={p.profileWelcome}><Text style={p.profileWelcomeEmoji}>✨</Text><Text style={p.profileWelcomeText}>Continue sua aventura!</Text></View>
          <TouchableOpacity onPress={onSair} activeOpacity={0.85} style={p.logoutButton}>
            <Text style={p.logoutEmoji}>🚪</Text><Text style={p.logoutText}>Sair da conta</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  )
}

const p = StyleSheet.create({
  page: { flex:1, backgroundColor:colors.cream, overflow:'hidden' },
  calendarHero: { backgroundColor:colors.green, paddingTop:Platform.OS === 'android' ? 34 : 48, paddingHorizontal:22, paddingBottom:18, borderBottomLeftRadius:24, borderBottomRightRadius:24, borderBottomWidth:5, borderBottomColor:'#08761F' },
  calendarHeroRow: { minHeight:78, flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  calendarHeroText: { flex:1, gap:4 },
  heroEyebrow: { color:'rgba(255,255,255,0.72)', fontSize:10, fontFamily:fonts.bold, letterSpacing:1.5, textAlign:'center' },
  calendarTitle: { color:colors.white, fontSize:22, fontFamily:fonts.extrabold },
  calendarSubTitle: { color:'rgba(255,255,255,0.85)', fontSize:13, fontFamily:fonts.semibold },
  calendarPet: { width:82, height:82, fontSize:54, textAlign:'center' },
  monthRow: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:14, paddingHorizontal:20 },
  monthArrow: { color:colors.white, fontSize:28, fontFamily:fonts.medium },
  monthName: { color:colors.white, fontSize:20, fontFamily:fonts.bold },
  weekdays: { flexDirection:'row', justifyContent:'space-around', marginTop:16 },
  weekday: { width:'14.28%', textAlign:'center', color:'rgba(255,255,255,0.8)', fontSize:10, fontFamily:fonts.semibold },
  calendarContent: { padding:16, paddingBottom:74 },
  calendarCard: { flexDirection:'row', flexWrap:'wrap', backgroundColor:colors.white, borderRadius:20, paddingVertical:12, paddingHorizontal:4, borderWidth:1, borderColor:colors.border },
  dayCell: { width:'14.28%', height:42, alignItems:'center', justifyContent:'center', gap:3 },
  dayCircle: { width:28, height:28, borderRadius:14, alignItems:'center', justifyContent:'center' },
  selectedDay: { backgroundColor:colors.green },
  dayText: { color:'#4B4B43', fontSize:13, fontFamily:fonts.bold },
  mutedDay: { color:'#B8B8AD' },
  selectedDayText: { color:colors.white, fontFamily:fonts.bold },
  dayMark: { width:4, height:4, borderRadius:2, backgroundColor:colors.green, position:'absolute', bottom:1 },
  dayMarkSelected: { backgroundColor:colors.white },
  dayMarkSpace: { width:4, height:4, position:'absolute', bottom:1 },
  calendarToday: { flexDirection:'row', alignItems:'center', gap:8, marginTop:18, marginBottom:12, backgroundColor:colors.purple, paddingHorizontal:14, paddingVertical:10, borderRadius:14, borderBottomWidth:4, borderBottomColor:'#4D0D75' },
  calendarTodayEmoji: { fontSize:22 },
  calendarTodayText: { color:colors.white, fontSize:16, fontFamily:fonts.extrabold },
  calendarEvent: { flexDirection:'row', alignItems:'center', gap:10, backgroundColor:colors.white, borderRadius:16, padding:11, marginTop:8, borderWidth:1.5, borderColor:colors.border, borderBottomWidth:4, borderBottomColor:'#D8D4C1' },
  calendarEventIcon: { width:54, height:54, borderRadius:16, backgroundColor:colors.greenLight, alignItems:'center', justifyContent:'center' },
  calendarEventEmoji: { fontSize:32 },
  calendarEventInfo: { flex:1, gap:3 },
  calendarEventTitle: { color:'#20221D', fontSize:14, fontFamily:fonts.extrabold },
  calendarEventSub: { color:'#77786F', fontSize:12, fontFamily:fonts.medium },
  calendarEventDate: { color:colors.green, fontSize:13, fontFamily:fonts.extrabold },
  sectionHeading: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:22, marginBottom:10 },
  sectionTitle: { color:'#171914', fontSize:18, fontFamily:fonts.extrabold },
  sectionLink: { color:colors.green, fontSize:11, fontFamily:fonts.semibold },
  agendaRow: { minHeight:44, flexDirection:'row', alignItems:'center', gap:10, borderBottomWidth:1, borderBottomColor:'#E9E8DE' },
  agendaDot: { width:10, height:10, borderRadius:5, backgroundColor:colors.green },
  agendaDotGold: { backgroundColor:colors.yellow },
  agendaName: { flex:1, color:'#25261F', fontSize:12, fontFamily:fonts.medium },
  agendaWhen: { color:'#77786F', fontSize:10, fontFamily:fonts.regular },

  simpleHeader: { backgroundColor:colors.white, paddingTop:Platform.OS === 'android' ? 34 : 48, paddingBottom:14, alignItems:'center', borderBottomWidth:1, borderBottomColor:colors.border },
  headerEyebrow: { color:colors.green, fontSize:9, fontFamily:fonts.bold, letterSpacing:1.4 },
  simpleTitle: { color:'#171914', fontSize:23, fontFamily:fonts.extrabold, marginTop:3 },
  taskHero: { minHeight:104, backgroundColor:colors.green, flexDirection:'row', alignItems:'center', paddingHorizontal:14, gap:9, borderBottomLeftRadius:22, borderBottomRightRadius:22, borderBottomWidth:5, borderBottomColor:'#08761F' },
  taskHeroPet: { width:68, height:68, fontSize:48, textAlign:'center' },
  taskHeroText: { flex:1, gap:4 },
  taskHeroEyebrow: { color:'rgba(255,255,255,0.78)', fontSize:9, fontFamily:fonts.bold, letterSpacing:1 },
  taskHeroTitle: { color:colors.white, fontSize:19, fontFamily:fonts.extrabold },
  taskCount: { width:54, height:54, borderRadius:27, backgroundColor:colors.yellow, borderWidth:3, borderColor:'#835F00', alignItems:'center', justifyContent:'center' },
  taskCountText: { color:'#171914', fontSize:14, fontFamily:fonts.extrabold },
  taskContent: { paddingHorizontal:14, paddingTop:14, paddingBottom:84 },
  taskProgressCard: { backgroundColor:colors.purple, borderRadius:18, padding:14, borderBottomWidth:5, borderBottomColor:'#4D0D75', marginBottom:14 },
  taskProgressTitle: { color:colors.white, fontSize:17, fontFamily:fonts.extrabold },
  taskProgressTrack: { height:14, borderRadius:8, backgroundColor:'rgba(255,255,255,0.25)', overflow:'hidden', marginTop:10 },
  taskProgressFill: { height:'100%', borderRadius:8, backgroundColor:'#7CE82B' },
  taskProgressSub: { color:'#F3E8FF', fontSize:12, fontFamily:fonts.bold, marginTop:7 },
  stepsList: { gap:0 },
  stepRow: { minHeight:72, flexDirection:'row', alignItems:'stretch', gap:9 },
  stepRail: { width:32, alignItems:'center' },
  stepNumber: { width:30, height:30, borderRadius:15, backgroundColor:colors.yellow, borderWidth:2, borderColor:'#8B6900', alignItems:'center', justifyContent:'center', zIndex:1 },
  stepDone: { backgroundColor:colors.green, borderColor:'#08761F' },
  stepNumberText: { color:'#302500', fontSize:12, fontFamily:fonts.extrabold },
  stepDoneText: { color:colors.white, fontSize:15 },
  stepLine: { position:'absolute', top:28, bottom:-2, width:4, backgroundColor:'#D9D6C8' },
  stepLineDone: { backgroundColor:colors.green },
  stepCard: { flex:1, minHeight:56, flexDirection:'row', alignItems:'center', gap:8, backgroundColor:colors.white, borderRadius:15, paddingHorizontal:9, paddingVertical:7, borderWidth:1.5, borderColor:colors.border, borderBottomWidth:4, borderBottomColor:'#D7D2BE', marginBottom:8 },
  stepCardDone: { backgroundColor:colors.greenLight, borderColor:'#B6DDBE', borderBottomColor:'#8CC796' },
  stepEmoji: { fontSize:31 },
  stepInfo: { flex:1, gap:3 },
  stepTitle: { color:'#20221D', fontSize:14, fontFamily:fonts.extrabold },
  stepDate: { color:'#74766D', fontSize:11, fontFamily:fonts.semibold },
  stepXp: { backgroundColor:colors.yellowLight, borderRadius:12, paddingHorizontal:8, paddingVertical:7 },
  stepXpText: { color:'#785A00', fontSize:11, fontFamily:fonts.extrabold },
  progressArea: { alignItems:'center', paddingTop:24, paddingBottom:20 },
  progressRing: { width:144, height:144, borderRadius:72, borderWidth:3, borderColor:colors.green, alignItems:'center', justifyContent:'center', backgroundColor:colors.white },
  progressInner: { alignItems:'center', justifyContent:'center' },
  progressNumber: { color:colors.green, fontSize:16, fontFamily:fonts.bold },
  progressCaption: { color:colors.yellow, fontSize:9, fontFamily:fonts.medium, marginTop:4 },
  progressHint: { color:'#77786F', fontSize:11, fontFamily:fonts.medium, marginTop:10 },
  taskListCard: { backgroundColor:colors.white, borderRadius:16, borderWidth:1, borderColor:colors.border, paddingHorizontal:14 },
  taskRow: { minHeight:58, flexDirection:'row', alignItems:'center', gap:10 },
  taskRowBorder: { borderTopWidth:1, borderTopColor:'#ECEBE3' },
  taskStatusDot: { width:10, height:10, borderRadius:5, backgroundColor:colors.green },
  taskDoneDot: { backgroundColor:'#B7DFC0' },
  taskRowMain: { flex:1, gap:3 },
  taskName: { color:'#23251F', fontSize:12, fontFamily:fonts.semibold },
  taskDoneName: { color:'#77786F', textDecorationLine:'line-through' },
  taskStatus: { color:colors.green, fontSize:9, fontFamily:fonts.medium },
  taskDeadline: { color:'#77786F', fontSize:10, fontFamily:fonts.regular },
  tipCard: { marginTop:16, backgroundColor:colors.greenLight, borderRadius:16, padding:16, borderWidth:1, borderColor:'#C5E7CD' },
  tipTitle: { color:colors.green, fontSize:13, fontFamily:fonts.bold },
  tipBody: { color:'#59645A', fontSize:11, fontFamily:fonts.regular, lineHeight:17, marginTop:5 },

  courseContent: { padding:18, paddingBottom:78, gap:14 },
  achievementBanner: { minHeight:78, flexDirection:'row', alignItems:'center', gap:10, backgroundColor:colors.purple, borderRadius:18, paddingHorizontal:14, borderBottomWidth:5, borderBottomColor:'#4D0D75' },
  bannerPet: { width:58, height:58, fontSize:38, textAlign:'center' },
  bannerText: { flex:1, color:colors.white, fontSize:18, fontFamily:fonts.extrabold },
  bannerCount: { color:colors.yellow, fontSize:16, fontFamily:fonts.extrabold },
  badgeCard: { minHeight:102, flexDirection:'row', alignItems:'center', gap:11, backgroundColor:colors.white, padding:12, borderRadius:18, borderWidth:1.5, borderColor:colors.border, borderBottomWidth:5, borderBottomColor:'#D7D2BE' },
  badgeCardLocked: { opacity:0.78 },
  badgeArt: { width:72, height:72, borderRadius:22, alignItems:'center', justifyContent:'center', borderWidth:2, borderColor:'rgba(0,0,0,0.06)' },
  badgeArtLocked: { backgroundColor:'#E6E5DF' },
  badgeEmoji: { fontSize:44 },
  badgeInfo: { flex:1, gap:4 },
  badgeTitle: { color:'#20221D', fontSize:16, fontFamily:fonts.extrabold },
  badgeDescription: { color:'#74766D', fontSize:12, fontFamily:fonts.semibold },
  badgeStatus: { color:'#8A8B83', fontSize:10, fontFamily:fonts.bold, letterSpacing:0.3 },
  badgeStatusWon: { color:colors.green },
  badgeCheck: { color:colors.green, fontSize:22, fontFamily:fonts.extrabold },
  introText: { color:'#65665F', fontSize:12, fontFamily:fonts.regular, lineHeight:18, marginBottom:2 },
  courseCard: { backgroundColor:colors.white, borderRadius:20, overflow:'hidden', borderWidth:1, borderColor:colors.border },
  courseArt: { height:136, alignItems:'center', justifyContent:'center', position:'relative' },
  courseArtCircle: { width:86, height:86, borderRadius:43, backgroundColor:'rgba(255,255,255,0.7)', alignItems:'center', justifyContent:'center' },
  courseEmoji: { fontSize:42 },
  courseBadge: { position:'absolute', top:12, left:12, backgroundColor:colors.white, borderRadius:12, paddingHorizontal:9, paddingVertical:5 },
  courseBadgeText: { color:colors.green, fontSize:8, fontFamily:fonts.bold, letterSpacing:0.5 },
  courseInfo: { padding:14 },
  courseTitle: { color:'#20221D', fontSize:14, fontFamily:fonts.bold },
  courseMeta: { color:'#77786F', fontSize:10, fontFamily:fonts.regular, marginTop:5 },
  courseFooter: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop:12, borderTopWidth:1, borderTopColor:'#ECEBE3', paddingTop:10 },
  courseProgress: { color:colors.green, fontSize:10, fontFamily:fonts.semibold },
  courseArrow: { color:colors.green, fontSize:22, lineHeight:22 },

  profileScroll: { paddingBottom:78, backgroundColor:colors.cream },
  profileHero: { height:174, backgroundColor:colors.green, paddingTop:Platform.OS === 'android' ? 34 : 48, alignItems:'center' },
  profileTopLine: { width:'100%', paddingHorizontal:22, flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  profilePageTitle: { color:colors.white, fontSize:23, fontFamily:fonts.extrabold },
  profileExitButton: { backgroundColor:'#08761F', borderRadius:14, paddingHorizontal:14, paddingVertical:8, borderBottomWidth:3, borderBottomColor:'#075819' },
  profileExit: { color:colors.white, fontSize:14, fontFamily:fonts.extrabold },
  avatarCircle: { position:'absolute', bottom:-46, width:104, height:104, borderRadius:52, backgroundColor:'#E8EFE9', borderWidth:5, borderColor:colors.white, alignItems:'center', justifyContent:'center', elevation:5 },
  avatarGlyph: { color:'#79877B', fontSize:58, fontFamily:fonts.regular, lineHeight:66 },
  profileInfo: { paddingTop:52, paddingHorizontal:18 },
  profileName: { textAlign:'center', color:'#171914', fontSize:26, fontFamily:fonts.extrabold, marginBottom:10 },
  profileTabs: { height:38, flexDirection:'row', backgroundColor:'#EBEAE1', borderRadius:20, padding:3, marginTop:16, marginBottom:16 },
  profileTabActive: { flex:1, borderRadius:18, backgroundColor:colors.white, alignItems:'center', justifyContent:'center', elevation:1 },
  profileTab: { flex:1, borderRadius:18, alignItems:'center', justifyContent:'center' },
  profileTabActiveText: { color:colors.green, fontSize:13, fontFamily:fonts.extrabold },
  profileTabText: { color:'#77786F', fontSize:13, fontFamily:fonts.bold },
  profileStats: { flexDirection:'row', alignItems:'center', justifyContent:'space-around', backgroundColor:colors.white, borderRadius:16, paddingVertical:12, marginBottom:22, borderWidth:1, borderColor:colors.border },
  profileStat: { alignItems:'center', gap:3 },
  profileStatValue: { color:colors.green, fontSize:16, fontFamily:fonts.bold },
  profileStatLabel: { color:'#77786F', fontSize:9, fontFamily:fonts.medium },
  statDivider: { width:1, height:28, backgroundColor:colors.border },
  profileWelcome: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, marginTop:16, padding:14, backgroundColor:colors.greenLight, borderRadius:16 },
  profileWelcomeEmoji: { fontSize:23 },
  profileWelcomeText: { color:colors.green, fontSize:14, fontFamily:fonts.bold },
  logoutButton: { minHeight:54, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:9, backgroundColor:colors.green, borderRadius:16, borderBottomWidth:5, borderBottomColor:'#08761F', marginTop:16 },
  logoutEmoji: { fontSize:22 },
  logoutText: { color:colors.white, fontSize:18, fontFamily:fonts.extrabold },
  achievementRow: { minHeight:64, flexDirection:'row', alignItems:'center', gap:10, borderBottomWidth:1, borderBottomColor:'#E6E4D9' },
  achievementIcon: { width:38, height:38, borderRadius:12, backgroundColor:colors.greenLight, alignItems:'center', justifyContent:'center' },
  achievementSymbol: { color:colors.green, fontSize:20, fontFamily:fonts.bold },
  achievementInfo: { flex:1, gap:3 },
  achievementTitle: { color:'#22241E', fontSize:10, fontFamily:fonts.bold },
  achievementDetail: { color:'#77786F', fontSize:9, fontFamily:fonts.regular },
  achievementTime: { color:'#999A91', fontSize:8, fontFamily:fonts.regular },
})
