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
import { listarItensComprados, listarAcessoriosLoja, listarEquipados, atualizarEquipado } from '../services/storage'

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

function getEstagio(xp) {
  let idx = 0
  ESTAGIOS.forEach((e, i) => { if (xp >= e.xpMin) idx = i })
  return idx
}

// Tela de erro — pet não configurado
function TelaSemPet({ onLogout }) {
  return (
    <View style={se.root}>
      <StatusBar barStyle="light-content" />
      <View style={se.card}>
        <Text style={se.titulo}>Pet não encontrado</Text>
        <Text style={se.msg}>
          Seu pet ainda não foi configurado.{'\n\n'}
          Fale com seu professor para que ele atribua sua turma e libere seu pet!
        </Text>
        <View style={se.dica}>
          <Text style={se.dicaTxt}>🙋 Fale com seu professor</Text>
        </View>
        <TouchableOpacity style={se.btn} onPress={onLogout} activeOpacity={0.85}>
          <Text style={se.btnTxt}>Voltar ao Login</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const se = StyleSheet.create({
  root:    { flex:1, backgroundColor: colors.dark, alignItems:'center', justifyContent:'center', padding:28 },
  card:    { width:'100%', backgroundColor:'#111', borderRadius:24, padding:28, alignItems:'center', gap:16, borderWidth:1, borderColor:'rgba(255,255,255,0.08)' },
  titulo:  { fontSize:22, fontFamily:fonts.extrabold, color:colors.cream, textAlign:'center' },
  msg:     { fontSize:14, fontFamily:fonts.regular, color:'rgba(245,244,217,0.6)', textAlign:'center', lineHeight:22 },
  dica:    { backgroundColor:colors.green+'22', borderRadius:12, padding:14, borderWidth:1, borderColor:colors.green+'44', width:'100%', alignItems:'center' },
  dicaTxt: { fontSize:14, fontFamily:fonts.bold, color:colors.green },
  btn:     { backgroundColor:colors.green, borderRadius:14, paddingVertical:16, paddingHorizontal:40, marginTop:8 },
  btnTxt:  { fontSize:15, fontFamily:fonts.bold, color:'#fff' },
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

// Botão de cosmético — circular, mostra imagem quando equipado
function BotaoCosmético({ label, cor, iconeVazio, itemEquipado, onPress }) {
  const pulsar = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (!itemEquipado) return
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulsar, { toValue:1.1, duration:600, useNativeDriver:true }),
      Animated.timing(pulsar, { toValue:1,   duration:600, useNativeDriver:true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [itemEquipado])
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={s.btnCosmWrap}>
      <Animated.View style={[s.btnCosm, { borderColor: cor, backgroundColor: cor+'20' }, { transform:[{scale:pulsar}] }]}>
        {itemEquipado?.imagem
          ? <Image source={{ uri: itemEquipado.imagem }} style={s.btnCosmImg} resizeMode="contain" />
          : <Text style={s.btnCosmIcone}>{iconeVazio}</Text>
        }
        {itemEquipado && <View style={[s.btnCosmDot, { backgroundColor: cor }]} />}
      </Animated.View>
      <Text style={[s.btnCosmLabel, { color: cor }]}>{label}</Text>
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
  const cfg       = detectarCfg(turma?.petNome)
  avisarSemCalibracao(cfg)
  const emocaoKey = turma?.emocao || 'feliz'
  const emocao    = EMOCOES[emocaoKey] || EMOCOES.feliz
  const xp        = turma?.xp || 0
  const estagioI  = getEstagio(xp)
  const estagio   = ESTAGIOS[estagioI]
  const proxEst   = ESTAGIOS[estagioI + 1]
  const xpPct     = proxEst ? Math.min(1, (xp - estagio.xpMin) / (proxEst.xpMin - estagio.xpMin)) : 1

  if (!cfg || !turma?.pet) return <TelaSemPet onLogout={onLogout} />

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
            <Text style={s.headerNome}>{turma?.nome || 'Meu Pet'}</Text>
            <Chip
              compact
              style={[s.estagioChip, { borderColor:cfg.cor+'50', backgroundColor:cfg.cor+'18' }]}
              textStyle={[s.estagioTxt, { color:cfg.cor }]}
            >
              {estagio.label}
            </Chip>
          </View>
          <Chip
            compact
            style={[s.emocaoChip, { backgroundColor:'rgba(0,0,0,0.45)' }]}
            textStyle={[s.emocaoTxt, { color:cfg.cor }]}
          >
            {emocao.label}
          </Chip>
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

        {/* XP */}
        <Surface style={s.xpCard} elevation={3}>
          <View style={s.xpRow}>
            <Text style={s.xpLabel}>{xp.toLocaleString('pt-BR')} XP</Text>
            {proxEst
              ? <Text style={s.xpFaltam}>faltam {(proxEst.xpMin - xp).toLocaleString()} para {proxEst.label}</Text>
              : <Text style={[s.xpFaltam, { color:cfg.cor }]}>Nível máximo!</Text>
            }
          </View>
          <ProgressBar progress={xpPct} color={cfg.cor} style={s.progressBar} />
        </Surface>

        {/* Barra de ações */}
        <Surface style={s.acoes} elevation={4}>
          <BotaoCosmético label="Chapéu"  cor={colors.green}  iconeVazio="🪖" itemEquipado={chapeu} onPress={() => setModal('chapeus')} />
          <BotaoCosmético label="Cenário" cor={colors.yellow} iconeVazio="🌳" itemEquipado={cenario} onPress={() => setModal('cenarios')} />
          <BotaoCosmético label="Colar"   cor={colors.purple} iconeVazio="📿" itemEquipado={colar}  onPress={() => setModal('colares')} />
          {onLoja && (
            <TouchableOpacity onPress={onLoja} activeOpacity={0.8} style={s.btnCosmWrap}>
              <View style={[s.btnCosm, { borderColor:colors.yellow, backgroundColor:colors.yellow+'20' }]}>
                <Text style={s.btnCosmIcone}>🛒</Text>
              </View>
              <Text style={[s.btnCosmLabel, { color:colors.yellow }]}>Loja</Text>
            </TouchableOpacity>
          )}
        </Surface>

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
    </View>
  )
}

const s = StyleSheet.create({
  root:             { flex:1 },
  safe:             { flex:1 },

  // Fundo
  fundoOverlay:     { position:'absolute', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.18)' },

  // Header
  header:           { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:14, paddingTop:Platform.OS==='android'?12:4, paddingBottom:8 },
  btnVoltar:        { width:40, height:40, borderRadius:20, backgroundColor:'rgba(0,0,0,0.5)', borderWidth:1, borderColor:'rgba(255,255,255,0.12)', alignItems:'center', justifyContent:'center' },
  btnVoltarTxt:     { fontSize:20, color:'#fff' },
  headerCenter:     { alignItems:'center', gap:4 },
  headerNome:       { fontSize:16, fontFamily:fonts.extrabold, color:colors.cream, textShadowColor:'rgba(0,0,0,0.8)', textShadowOffset:{width:0,height:2}, textShadowRadius:6 },
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
  acoes:            { flexDirection:'row', justifyContent:'space-around', alignItems:'center', paddingHorizontal:8, paddingVertical:10, backgroundColor:'rgba(5,10,5,0.9)', borderTopWidth:1, borderTopColor:'rgba(255,255,255,0.05)' },
  btnCosmWrap:      { alignItems:'center', gap:5 },
  btnCosm:          { width:60, height:60, borderRadius:30, borderWidth:2.5, alignItems:'center', justifyContent:'center', position:'relative' },
  btnCosmImg:       { width:38, height:38 },
  btnCosmIcone:     { fontSize:28 },
  btnCosmDot:       { position:'absolute', top:2, right:2, width:14, height:14, borderRadius:7, borderWidth:2, borderColor:'rgba(5,10,5,0.9)' },
  btnCosmLabel:     { fontSize:10, fontFamily:fonts.bold, letterSpacing:0.3 },

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
