import { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Modal, Dimensions, Image, Animated, ScrollView,
  SafeAreaView, StatusBar, Platform,
} from 'react-native'
import { colors, fonts } from '../theme'
import Svg, { Path, Ellipse, Circle, Rect, G } from 'react-native-svg'
 
// Largura máxima do "quadro" do app — no celular usa a tela toda (que é
// sempre menor que isso); no navegador/desktop limita e centraliza, como
// uma moldura de celular, em vez de esticar tudo pra largura da janela.
const MAX_WIDTH = 480
const windowSize = Dimensions.get('window')
const width  = Math.min(windowSize.width, MAX_WIDTH)
const height = windowSize.height
 
const IMG_JACARE = require('../assets/jacare.png')
const IMG_ARARA  = require('../assets/arara.png')
const IMG_ONCA   = require('../assets/onca.png')
 
const PETS = {
  jacare: { nome: 'Jacaré',      imagem: IMG_JACARE, cor: '#00C853', corEscura: '#005723', ceuTopo: '#051a07', ceuBase: '#0d3b10', chaoTopo: '#1a6b1a', chaoBase: '#0a2a0a' },
  arara:  { nome: 'Arara-Azul',  imagem: IMG_ARARA,  cor: '#42A5F5', corEscura: '#0D47A1', ceuTopo: '#020d1a', ceuBase: '#0a2040', chaoTopo: '#0d3060', chaoBase: '#051020' },
  onca:   { nome: 'Onça-Pintada',imagem: IMG_ONCA,   cor: '#FFB300', corEscura: '#E65100', ceuTopo: '#1a0800', ceuBase: '#3d1500', chaoTopo: '#5a2a00', chaoBase: '#2a1000' },
}
 
const ESTAGIOS = [
  { label: 'Filhote',              icon: '🌱', xpMin: 0,    xpMax: 2000  },
  { label: 'Guardião',             icon: '🌿', xpMin: 2000, xpMax: 5000  },
  { label: 'Espírito da Floresta', icon: '👑', xpMin: 5000, xpMax: 10000 },
]
 
const EMOCOES = {
  '🤩': { label: 'Eufórico!', vel: 450,  amp: 14, escala: 1.08, felicidade: 100 },
  '😄': { label: 'Feliz',     vel: 900,  amp: 6,  escala: 1.05, felicidade: 80  },
  '😐': { label: 'Normal',    vel: 1400, amp: 3,  escala: 1.02, felicidade: 50  },
  '😴': { label: 'Dormindo',  vel: 2200, amp: 1,  escala: 1.01, felicidade: 30  },
  '😢': { label: 'Triste',    vel: 2500, amp: 2,  escala: 1.01, felicidade: 15  },
}
 
const COSMETICOS = {
  chapeus: [
    { id: 'jard',  nome: 'Jardineiro', emoji: '🪖', desbloqueado: true  },
    { id: 'coroa', nome: 'Coroa Real', emoji: '👑', desbloqueado: false },
    { id: 'flores',nome: 'Flores',     emoji: '🌸', desbloqueado: true  },
    { id: 'festa', nome: 'Festeiro',   emoji: '🎉', desbloqueado: false },
    { id: 'viking',nome: 'Viking',     emoji: '⛑️', desbloqueado: false },
    { id: 'mago',  nome: 'Mago',       emoji: '🧙', desbloqueado: false },
  ],
  acessorios: [
    { id: 'colar',  nome: 'Colar Ouro',  emoji: '📿', desbloqueado: true  },
    { id: 'oculos', nome: 'Óculos Cool', emoji: '🕶️', desbloqueado: false },
    { id: 'moch',   nome: 'Mochila',     emoji: '🎒', desbloqueado: true  },
    { id: 'escudo', nome: 'Escudo',      emoji: '🛡️', desbloqueado: false },
    { id: 'espada', nome: 'Espada',      emoji: '⚔️', desbloqueado: false },
    { id: 'livro',  nome: 'Livro',       emoji: '📚', desbloqueado: false },
  ],
  cenarios: [
    { id: 'floresta', nome: 'Floresta Amazônica', desbloqueado: true  },
    { id: 'rio',      nome: 'Rio Amazônico',      desbloqueado: true  },
    { id: 'noite',    nome: 'Noite Estrelada',    desbloqueado: false },
    { id: 'vulcao',   nome: 'Terra Vulcânica',    desbloqueado: false },
  ],
}
 
const TURMA = { petId: 'jacare', xp: 3570, emocao: '😄', energia: 75, missoes: 2 }
const XP_MAX = 5000
 
function getEstagio(xp) {
  return ESTAGIOS.findIndex((e, i) =>
    xp >= e.xpMin && (i === ESTAGIOS.length - 1 || xp < ESTAGIOS[i + 1].xpMin)
  )
}
 
// ── SVG do cenário floresta ──────────────────────────────────
function CenarioFloresta({ pet }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Céu */}
      <View style={[s.ceu, { backgroundColor: pet.ceuTopo }]} />
      {/* Chão */}
      <View style={[s.chao, { backgroundColor: pet.chaoBase }]} />
      {/* Colinas ao fundo */}
      <Svg width={width} height={height * 0.5} style={{ position: 'absolute', bottom: height * 0.22 }}>
        <Path d={`M0,${height*0.25} Q${width*0.25},${height*0.05} ${width*0.5},${height*0.18} Q${width*0.75},${height*0.03} ${width},${height*0.15} L${width},${height*0.25} Z`}
          fill={pet.chaoTopo} opacity={0.5} />
        <Path d={`M0,${height*0.25} Q${width*0.15},${height*0.12} ${width*0.35},${height*0.2} Q${width*0.55},${height*0.08} ${width*0.75},${height*0.18} Q${width*0.9},${height*0.1} ${width},${height*0.2} L${width},${height*0.25} Z`}
          fill={pet.chaoTopo} opacity={0.35} />
      </Svg>
      {/* Grama ondulada */}
      <Svg width={width} height={40} style={{ position: 'absolute', bottom: height * 0.22 - 20 }}>
        <Path d={`M0,40 Q${width*0.08},10 ${width*0.15},30 Q${width*0.22},5 ${width*0.3},25 Q${width*0.38},8 ${width*0.45},28 Q${width*0.52},6 ${width*0.6},24 Q${width*0.68},7 ${width*0.75},26 Q${width*0.82},5 ${width*0.9},22 Q${width*0.96},10 ${width},28 L${width},40 Z`}
          fill={pet.chaoTopo} />
      </Svg>
      {/* Chão principal */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.22, backgroundColor: pet.chaoTopo }} />
      {/* Grama front */}
      <Svg width={width} height={30} style={{ position: 'absolute', bottom: height * 0.22 - 5 }}>
        <Path d={`M0,30 Q${width*0.05},12 ${width*0.1},26 Q${width*0.18},8 ${width*0.25},24 Q${width*0.33},10 ${width*0.4},26 Q${width*0.48},6 ${width*0.55},22 Q${width*0.63},10 ${width*0.7},24 Q${width*0.78},8 ${width*0.85},22 Q${width*0.92},10 ${width},24 L${width},30 Z`}
          fill={pet.corEscura} opacity={0.6} />
      </Svg>
      {/* Flores no chão */}
      <Svg width={width} height={20} style={{ position: 'absolute', bottom: height * 0.22 }}>
        {[0.08,0.22,0.45,0.65,0.82,0.93].map((x, i) => (
          <G key={i} transform={`translate(${width*x},10)`}>
            <Circle cx={0} cy={0} r={4} fill={i%2===0 ? '#ffeb3b' : '#e91e63'} opacity={0.7} />
            <Rect x={-1} y={0} width={2} height={8} fill={pet.corEscura} opacity={0.5} />
          </G>
        ))}
      </Svg>
    </View>
  )
}
 
// ── Partícula individual ─────────────────────────────────────
function Particula({ emoji, x, y, onDone }) {
  const a = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 1100, useNativeDriver: true }).start(onDone)
  }, [])
  return (
    <Animated.Text style={{
      position: 'absolute', fontSize: 20, zIndex: 30,
      transform: [
        { translateX: a.interpolate({ inputRange:[0,1], outputRange:[0,x] }) },
        { translateY: a.interpolate({ inputRange:[0,1], outputRange:[0,y] }) },
        { scale:      a.interpolate({ inputRange:[0,0.4,1], outputRange:[0.4,1.5,0.7] }) },
      ],
      opacity: a.interpolate({ inputRange:[0,0.15,0.8,1], outputRange:[0,1,1,0] }),
    }}>{emoji}</Animated.Text>
  )
}
 
// ── Barra de status estilo folha ────────────────────────────
function BarraStatus({ icon, valor, cor, label }) {
  const animVal = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(animVal, { toValue: valor/100, duration: 1200, useNativeDriver: false }).start()
  }, [valor])
  return (
    <View style={s.barraWrap}>
      <Text style={s.barraIcon}>{icon}</Text>
      <View style={s.barraTrilho}>
        <Animated.View style={[s.barraPreenchimento, {
          width: animVal.interpolate({ inputRange:[0,1], outputRange:['0%','100%'] }),
          backgroundColor: cor,
        }]}>
          <View style={s.barraShine} />
        </Animated.View>
      </View>
      <Text style={[s.barraValor, { color: cor }]}>{valor}</Text>
    </View>
  )
}
 
// ── Botão de customização estilo RPG ────────────────────────
function BotaoRPG({ icon, label, cor, onPress, itemEquipado }) {
  const pulsar = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (!itemEquipado) return
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulsar, { toValue: 1.06, duration: 800, useNativeDriver: true }),
      Animated.timing(pulsar, { toValue: 1,    duration: 800, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [itemEquipado])
 
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={s.btnRPGWrap}>
      <Animated.View style={[s.btnRPG, { borderColor: cor, transform:[{scale:pulsar}] }]}>
        <View style={[s.btnRPGFundo, { backgroundColor: cor + '25' }]}>
          <Text style={s.btnRPGIcon}>{itemEquipado ? itemEquipado.emoji : icon}</Text>
        </View>
        {itemEquipado && (
          <View style={[s.btnRPGDot, { backgroundColor: cor }]}>
            <Text style={{ fontSize: 7, color: '#fff', fontFamily: fonts.bold }}>✓</Text>
          </View>
        )}
      </Animated.View>
      <Text style={[s.btnRPGLabel, { color: cor }]}>{label}</Text>
    </TouchableOpacity>
  )
}
 
// ── TELA PRINCIPAL ───────────────────────────────────────────
export default function PetScreen({ aluno, onVoltar }) {
  const pet       = PETS[TURMA.petId]
  const emocao    = EMOCOES[TURMA.emocao] || EMOCOES['😄']
  const estagioI  = getEstagio(TURMA.xp)
  const estagio   = ESTAGIOS[estagioI]
  const proxEst   = ESTAGIOS[estagioI + 1]
  const xpLocal   = TURMA.xp - estagio.xpMin
  const xpNeed    = proxEst ? proxEst.xpMin - estagio.xpMin : 1
  const xpPct     = Math.min(100, Math.round((xpLocal / xpNeed) * 100))
 
  const [chapeu,     setChapeu]     = useState(null)
  const [acessorio,  setAcessorio]  = useState(null)
  const [cenario,    setCenario]    = useState(COSMETICOS.cenarios[0])
  const [modal,      setModal]      = useState(null)
  const [particulas, setParticulas] = useState([])
 
  const escalaA  = useRef(new Animated.Value(1)).current
  const balancoA = useRef(new Animated.Value(0)).current
  const puloA    = useRef(new Animated.Value(0)).current
  const brilhoA  = useRef(new Animated.Value(0)).current
  const sombraA  = useRef(new Animated.Value(1)).current
  const entradaA = useRef(new Animated.Value(0)).current
 
  // Animação de entrada
  useEffect(() => {
    Animated.spring(entradaA, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }).start()
  }, [])
 
  // Respiração
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(escalaA, { toValue: emocao.escala, duration: emocao.vel, useNativeDriver: true }),
        Animated.timing(sombraA, { toValue: 0.6, duration: emocao.vel, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(escalaA, { toValue: 1, duration: emocao.vel, useNativeDriver: true }),
        Animated.timing(sombraA, { toValue: 1, duration: emocao.vel, useNativeDriver: true }),
      ]),
    ]))
    loop.start()
    return () => loop.stop()
  }, [])
 
  // Balanço
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(balancoA, { toValue: emocao.amp,  duration: emocao.vel * 1.3, useNativeDriver: true }),
      Animated.timing(balancoA, { toValue: -emocao.amp, duration: emocao.vel * 1.3, useNativeDriver: true }),
      Animated.timing(balancoA, { toValue: 0,           duration: emocao.vel * 0.4, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [])
 
  function aoTocar() {
    Animated.sequence([
      Animated.timing(puloA,  { toValue: -55, duration: 130, useNativeDriver: true }),
      Animated.spring(puloA,  { toValue: 0, friction: 3, tension: 90, useNativeDriver: true }),
    ]).start()
    Animated.sequence([
      Animated.timing(brilhoA, { toValue: 1, duration: 80,  useNativeDriver: true }),
      Animated.timing(brilhoA, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start()
 
    const mapa = {
      '🤩': ['🌟','💥','🔥','⭐','✨','🎊','💫','🌈'],
      '😄': ['❤️','✨','⭐','💖','💫','🌟','💝','🎉'],
      '😐': ['💭','😶','💬','🌀'],
      '😴': ['💤','😪','🌙','💤'],
      '😢': ['💧','😢','🌧️','💦'],
    }
    const emojis = mapa[TURMA.emocao] || mapa['😄']
    const count  = TURMA.emocao === '🤩' ? 12 : 8
    const novas  = Array.from({ length: count }, (_, i) => ({
      id: Date.now() + i,
      emoji: emojis[i % emojis.length],
      x: (Math.random() - 0.5) * 260,
      y: -(Math.random() * 200 + 80),
    }))
    setParticulas(p => [...p, ...novas])
  }
 
  const rotate = balancoA.interpolate({ inputRange: [-15,15], outputRange: ['-12deg','12deg'] })
 
  return (
    // Fundo fora da "moldura" — só aparece nas laterais em telas largas (web)
    <View style={s.telaExterna}>
      <View style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor={pet.ceuTopo} />
 
        {/* Cenário SVG */}
        <CenarioFloresta pet={pet} />
 
        <SafeAreaView style={s.safe}>
 
          {/* Header */}
          <View style={s.header}>
            <TouchableOpacity style={s.btnVoltar} onPress={onVoltar} activeOpacity={0.7}>
              <Text style={s.btnVoltarTxt}>←</Text>
            </TouchableOpacity>
 
            <Animated.View style={[s.headerCenter, {
              opacity: entradaA,
              transform: [{ translateY: entradaA.interpolate({ inputRange:[0,1], outputRange:[-20,0] }) }]
            }]}>
              <Text style={s.petNome}>{pet.nome}</Text>
              <View style={[s.estagioChip, { borderColor: pet.cor + '70', backgroundColor: pet.cor + '25' }]}>
                <Text style={s.estagioIcon}>{estagio.icon}</Text>
                <Text style={[s.estagioLabel, { color: pet.cor }]}>{estagio.label}</Text>
              </View>
            </Animated.View>
 
            <View style={s.emocaoWrap}>
              <Text style={s.emocaoEmoji}>{TURMA.emocao}</Text>
              <Text style={s.emocaoLabel}>{emocao.label}</Text>
            </View>
          </View>
 
          {/* Barras de status — estilo folha/natureza */}
          <Animated.View style={[s.statusWrap, {
            opacity: entradaA,
            transform: [{ translateX: entradaA.interpolate({ inputRange:[0,1], outputRange:[-30,0] }) }]
          }]}>
            <BarraStatus icon="❤️" valor={emocao.felicidade} cor="#e53935" label="Vida" />
            <BarraStatus icon="⚡" valor={TURMA.energia}      cor="#f9a825" label="Energia" />
            <BarraStatus icon="🏆" valor={TURMA.missoes * 40} cor={pet.cor} label="Missões" />
          </Animated.View>
 
          {/* Arena */}
          <View style={s.arena}>
            {/* Brilho ao tocar */}
            <Animated.View style={[s.brilhoRing, {
              opacity: brilhoA,
              borderColor: pet.cor,
              shadowColor: pet.cor,
            }]} />
 
            {/* Partículas */}
            {particulas.map(p => (
              <Particula key={p.id} emoji={p.emoji} x={p.x} y={p.y}
                onDone={() => setParticulas(prev => prev.filter(x => x.id !== p.id))} />
            ))}
 
            {/* Pet */}
            <Animated.View style={[s.petAnimWrap, {
              opacity: entradaA,
              transform: [{ scale: entradaA.interpolate({ inputRange:[0,1], outputRange:[0.3,1] }) }]
            }]}>
              <TouchableOpacity activeOpacity={1} onPress={aoTocar} style={s.petTouch}>
                <Animated.View style={{
                  transform: [{ scale: escalaA }, { rotate }, { translateY: puloA }],
                  alignItems: 'center',
                }}>
                  {chapeu && <Text style={s.chapeu}>{chapeu.emoji}</Text>}
                  <Image source={pet.imagem} style={s.petImg} resizeMode="contain" />
                  {acessorio && <Text style={s.acessorio}>{acessorio.emoji}</Text>}
                  {TURMA.emocao === '😴' && <Text style={s.zzz}>💤</Text>}
                  {TURMA.emocao === '😢' && <Text style={s.lagrima}>💧</Text>}
                </Animated.View>
              </TouchableOpacity>
            </Animated.View>
 
            {/* Sombra no chão */}
            <Animated.View style={[s.sombra, {
              backgroundColor: pet.cor + '35',
              transform: [{ scaleX: sombraA }],
              opacity: sombraA,
            }]} />
 
            <Text style={s.dica}>👆 Toque no {pet.nome}!</Text>
          </View>
 
          {/* XP com design de folha */}
          <View style={s.xpWrap}>
            <View style={s.xpHeader}>
              <View style={s.xpLabelWrap}>
                <Text style={s.xpIcon}>🍃</Text>
                <Text style={s.xpLabel}>{TURMA.xp.toLocaleString('pt-BR')} XP</Text>
              </View>
              {proxEst ? (
                <Text style={s.xpFaltam}>
                  {(proxEst.xpMin - TURMA.xp).toLocaleString('pt-BR')} para {proxEst.icon} {proxEst.label}
                </Text>
              ) : (
                <Text style={[s.xpFaltam, { color: pet.cor }]}>👑 Nível máximo!</Text>
              )}
            </View>
            <View style={s.xpTrilho}>
              <View style={[s.xpFill, { width: xpPct + '%', backgroundColor: pet.cor }]}>
                <View style={s.xpShine} />
              </View>
              {/* Marcadores de nível */}
              {[25, 50, 75].map(m => (
                <View key={m} style={[s.xpMarca, { left: m + '%' }]} />
              ))}
            </View>
          </View>
 
          {/* Botões RPG */}
          <View style={s.btnsRPG}>
            <BotaoRPG icon="🪖" label="Chapéu"    cor="#4CAF50" itemEquipado={chapeu}    onPress={() => setModal('chapeus')} />
            <BotaoRPG icon="🌳" label="Cenário"   cor={pet.cor} itemEquipado={null}      onPress={() => setModal('cenarios')} />
            <BotaoRPG icon="📿" label="Acessório" cor="#9C27B0" itemEquipado={acessorio} onPress={() => setModal('acessorios')} />
          </View>
 
        </SafeAreaView>
 
        {/* Modais */}
        <ModalItens
          visible={modal === 'chapeus'}
          titulo="🪖 Chapéus"
          itens={COSMETICOS.chapeus}
          selecionado={chapeu}
          cor="#4CAF50"
          onSel={setChapeu}
          onFechar={() => setModal(null)}
        />
        <ModalItens
          visible={modal === 'acessorios'}
          titulo="📿 Acessórios"
          itens={COSMETICOS.acessorios}
          selecionado={acessorio}
          cor="#9C27B0"
          onSel={setAcessorio}
          onFechar={() => setModal(null)}
        />
        <Modal visible={modal === 'cenarios'} transparent animationType="slide" onRequestClose={() => setModal(null)}>
          <View style={s.modalBg}>
            <View style={s.modalSheet}>
              <View style={s.modalHandle} />
              <Text style={s.modalTitulo}>🌍 Cenários</Text>
              <View style={s.cenarioGrid}>
                {COSMETICOS.cenarios.map(c => (
                  <TouchableOpacity key={c.id}
                    style={[s.cenarioItem,
                      { borderColor: cenario.id === c.id ? pet.cor : 'rgba(255,255,255,0.08)' },
                      cenario.id === c.id && { backgroundColor: pet.cor + '20' },
                      !c.desbloqueado && { opacity: 0.4 },
                    ]}
                    onPress={() => { if (c.desbloqueado) { setCenario(c); setModal(null) } }}
                    activeOpacity={c.desbloqueado ? 0.8 : 1}
                  >
                    <Text style={s.cenarioNome}>{c.nome}</Text>
                    {!c.desbloqueado && <Text style={s.lockTag}>🔒</Text>}
                    {cenario.id === c.id && <View style={[s.selTag, { backgroundColor: pet.cor }]}><Text style={s.selTxt}>✓</Text></View>}
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={[s.btnFechar, { backgroundColor: pet.cor }]} onPress={() => setModal(null)}>
                <Text style={s.btnFecharTxt}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </View>
  )
}
 
function ModalItens({ visible, titulo, itens, selecionado, cor, onSel, onFechar }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onFechar}>
      <View style={s.modalBg}>
        <View style={s.modalSheet}>
          <View style={s.modalHandle} />
          <Text style={s.modalTitulo}>{titulo}</Text>
          <ScrollView contentContainerStyle={s.itemGrid} showsVerticalScrollIndicator={false}>
            <TouchableOpacity style={s.itemCard} onPress={() => { onSel(null); onFechar() }}>
              <Text style={{ fontSize: 30 }}>❌</Text>
              <Text style={s.itemNome}>Remover</Text>
            </TouchableOpacity>
            {itens.map(item => {
              const sel = selecionado?.id === item.id
              return (
                <TouchableOpacity key={item.id}
                  style={[s.itemCard,
                    sel && { borderColor: cor, borderWidth: 2.5, backgroundColor: cor + '18' },
                    !item.desbloqueado && { opacity: 0.35 },
                  ]}
                  onPress={() => { if (item.desbloqueado) { onSel(item); onFechar() } }}
                  activeOpacity={item.desbloqueado ? 0.75 : 1}
                >
                  <Text style={{ fontSize: 34, opacity: item.desbloqueado ? 1 : 0.2 }}>{item.emoji}</Text>
                  <Text style={[s.itemNome, !item.desbloqueado && { color: '#444' }]}>{item.nome}</Text>
                  {!item.desbloqueado && <Text style={s.lockTag}>🔒</Text>}
                  {sel && <View style={[s.selTag, { backgroundColor: cor }]}><Text style={s.selTxt}>✓</Text></View>}
                </TouchableOpacity>
              )
            })}
          </ScrollView>
          <TouchableOpacity style={[s.btnFechar, { backgroundColor: cor }]} onPress={onFechar}>
            <Text style={s.btnFecharTxt}>Fechar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}
 
const s = StyleSheet.create({
  // Envolve tudo: no navegador largo, centraliza a "moldura" de app e
  // preenche o resto com o próprio tom de fundo do cenário.
  telaExterna: { flex: 1, alignItems: 'center', backgroundColor: '#000' },
  root:        { flex: 1, width: '100%', maxWidth: MAX_WIDTH, overflow: 'hidden' },
  safe:        { flex: 1 },
  ceu:         { position: 'absolute', top: 0, left: 0, right: 0, height: '65%' },
  chao:        { position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%' },
 
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: Platform.OS === 'android' ? 10 : 4, paddingBottom: 6 },
  btnVoltar:   { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  btnVoltarTxt:{ fontSize: 20, color: '#fff' },
  headerCenter:{ alignItems: 'center', gap: 4 },
  petNome:     { fontSize: 17, fontFamily: fonts.extrabold, color: '#fff', textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  estagioChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 3 },
  estagioIcon: { fontSize: 12 },
  estagioLabel:{ fontSize: 11, fontFamily: fonts.bold },
  emocaoWrap:  { alignItems: 'center', gap: 2 },
  emocaoEmoji: { fontSize: 24 },
  emocaoLabel: { fontSize: 8, fontFamily: fonts.semibold, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 },
 
  statusWrap:  { paddingHorizontal: 14, gap: 5, marginBottom: 4 },
  barraWrap:   { flexDirection: 'row', alignItems: 'center', gap: 7 },
  barraIcon:   { fontSize: 13, width: 18, textAlign: 'center' },
  barraTrilho: { flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' },
  barraPreenchimento: { height: '100%', borderRadius: 4, position: 'relative', overflow: 'hidden' },
  barraShine:  { position: 'absolute', top: 0, left: 0, right: 0, height: '50%', backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 4 },
  barraValor:  { fontSize: 10, fontFamily: fonts.bold, width: 24, textAlign: 'right' },
 
  arena:       { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 16, position: 'relative' },
  brilhoRing:  { position: 'absolute', width: width * 0.72, height: width * 0.72, borderRadius: width * 0.36, borderWidth: 5, bottom: '15%', shadowOffset: { width: 0, height: 0 }, shadowRadius: 20, shadowOpacity: 0.9 },
  petAnimWrap: { alignItems: 'center' },
  petTouch:    { alignItems: 'center' },
  petImg:      { width: width * 0.62, height: width * 0.62 },
  chapeu:      { fontSize: 50, marginBottom: -16, zIndex: 5 },
  acessorio:   { fontSize: 30, marginTop: -10 },
  zzz:         { position: 'absolute', top: 0, right: 10, fontSize: 24 },
  lagrima:     { position: 'absolute', bottom: 20, left: 10, fontSize: 20 },
  sombra:      { width: width * 0.38, height: 14, borderRadius: 50, marginTop: -4 },
  dica:        { position: 'absolute', bottom: 2, color: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: fonts.medium, letterSpacing: 0.3 },
 
  xpWrap:      { marginHorizontal: 14, marginBottom: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 14, padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  xpHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  xpLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  xpIcon:      { fontSize: 14 },
  xpLabel:     { fontSize: 13, fontFamily: fonts.bold, color: '#fff' },
  xpFaltam:    { fontSize: 9, fontFamily: fonts.medium, color: 'rgba(255,255,255,0.45)', maxWidth: width * 0.42, textAlign: 'right' },
  xpTrilho:    { height: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 6, overflow: 'hidden', position: 'relative' },
  xpFill:      { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 6, overflow: 'hidden' },
  xpShine:     { position: 'absolute', top: 0, left: 0, right: 0, height: '45%', backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 6 },
  xpMarca:     { position: 'absolute', top: 2, bottom: 2, width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
 
  btnsRPG:     { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, paddingTop: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  btnRPGWrap:  { alignItems: 'center', gap: 5 },
  btnRPG:      { width: 62, height: 62, borderRadius: 31, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  btnRPGFundo: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 31 },
  btnRPGIcon:  { fontSize: 28 },
  btnRPGDot:   { position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff' },
  btnRPGLabel: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 0.5 },
 
  modalBg:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end', alignItems: 'center' },
  modalSheet:  { width: '100%', maxWidth: MAX_WIDTH, backgroundColor: '#111a11', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 18, paddingBottom: 36, maxHeight: height * 0.68, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  modalHandle: { width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitulo: { fontSize: 18, fontFamily: fonts.bold, color: '#fff', textAlign: 'center', marginBottom: 16 },
  itemGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', paddingBottom: 10 },
  itemCard:    { width: (width - 76) / 3, alignItems: 'center', padding: 12, borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.05)', gap: 5, position: 'relative' },
  itemNome:    { fontSize: 10, fontFamily: fonts.semibold, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  lockTag:     { position: 'absolute', top: 6, right: 6, fontSize: 12 },
  selTag:      { position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  selTxt:      { fontSize: 10, color: '#fff', fontFamily: fonts.bold },
  cenarioGrid: { gap: 10, marginBottom: 12 },
  cenarioItem: { borderRadius: 14, borderWidth: 1.5, padding: 14, position: 'relative' },
  cenarioNome: { fontSize: 14, fontFamily: fonts.bold, color: '#fff' },
  btnFechar:   { borderRadius: 16, padding: 15, alignItems: 'center', marginTop: 10 },
  btnFecharTxt:{ fontSize: 15, fontFamily: fonts.bold, color: '#fff' },
})