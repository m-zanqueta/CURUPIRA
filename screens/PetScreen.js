import { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Modal, Dimensions, Image, Animated, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native'
import { colors, fonts } from '../theme'

const { width, height } = Dimensions.get('window')

const PETS = {
  jacare: { nome: 'Jacaré', imagem: require('../assets/jacare.png'), cor: colors.green,  corFundo: '#0a3d1f' },
  arara:  { nome: 'Arara',  imagem: require('../assets/arara.png'),  cor: '#1565C0',     corFundo: '#0a1a3d' },
  onca:   { nome: 'Onça',   imagem: require('../assets/onca.png'),   cor: colors.yellow, corFundo: '#3d2a00' },
}

const ESTAGIOS = ['🌱 Filhote', '🌿 Guardião', '👑 Espírito da Floresta']

const EMOCOES = {
  '🤩': { cor: colors.yellow, velocidade: 500  },
  '😄': { cor: colors.green,  velocidade: 900  },
  '😐': { cor: '#888',        velocidade: 1400 },
  '😴': { cor: '#aaa',        velocidade: 2200 },
  '😢': { cor: colors.purple, velocidade: 2500 },
}

const COSMETICOS = {
  chapeus: [
    { id: 'horta', nome: 'Jardineiro', emoji: '🪖', desbloqueado: true  },
    { id: 'coroa', nome: 'Coroa',      emoji: '👑', desbloqueado: false },
    { id: 'flores',nome: 'Flores',     emoji: '🌸', desbloqueado: true  },
    { id: 'festa', nome: 'Festa',      emoji: '🎉', desbloqueado: false },
  ],
  acessorios: [
    { id: 'colar', nome: 'Colar',      emoji: '📿', desbloqueado: true  },
    { id: 'oculos',nome: 'Óculos',     emoji: '🕶️', desbloqueado: false },
    { id: 'moch',  nome: 'Mochila',    emoji: '🎒', desbloqueado: true  },
    { id: 'grav',  nome: 'Gravata',    emoji: '👔', desbloqueado: false },
  ],
  fundos: [
    { id: 'floresta', nome: 'Floresta',  emoji: '🌳', cor: '#1B5E20', desbloqueado: true  },
    { id: 'rio',      nome: 'Rio',       emoji: '🌊', cor: '#0D47A1', desbloqueado: true  },
    { id: 'noite',    nome: 'Noite',     emoji: '🌙', cor: '#1A237E', desbloqueado: false },
    { id: 'sol',      nome: 'Pôr do Sol',emoji: '🌅', cor: '#BF360C', desbloqueado: false },
  ],
}

const TURMA = { petId: 'jacare', xp: 3570, estagio: 1, emocao: '😄' }
const XP_PROXIMO = 5000

export default function PetScreen({ aluno, onVoltar }) {
  const pet    = PETS[TURMA.petId]
  const emocao = EMOCOES[TURMA.emocao] || EMOCOES['😄']

  const [chapeu,    setChapeu]    = useState(null)
  const [acessorio, setAcessorio] = useState(null)
  const [fundo,     setFundo]     = useState(COSMETICOS.fundos[0])
  const [modal,     setModal]     = useState(null) // null | 'chapeus' | 'acessorios' | 'fundos'
  const [particulas,setParticulas]= useState([])

  // Animações
  const escala   = useRef(new Animated.Value(1)).current
  const balanço  = useRef(new Animated.Value(0)).current
  const pulo     = useRef(new Animated.Value(0)).current
  const brilho   = useRef(new Animated.Value(0)).current

  // Respiração em loop
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(escala, { toValue: 1 + (TURMA.emocao === '😴' ? 0.01 : 0.05), duration: emocao.velocidade, useNativeDriver: true }),
      Animated.timing(escala, { toValue: 1, duration: emocao.velocidade, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [])

  // Balanço em loop
  useEffect(() => {
    const amp = TURMA.emocao === '😴' ? 2 : TURMA.emocao === '🤩' ? 10 : 5
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(balanço, { toValue: amp,  duration: emocao.velocidade * 1.2, useNativeDriver: true }),
      Animated.timing(balanço, { toValue: -amp, duration: emocao.velocidade * 1.2, useNativeDriver: true }),
      Animated.timing(balanço, { toValue: 0,    duration: emocao.velocidade * 0.4, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [])

  function aoTocar() {
    // Pulo
    Animated.sequence([
      Animated.timing(pulo, { toValue: -40, duration: 160, useNativeDriver: true }),
      Animated.spring(pulo, { toValue: 0, friction: 4, useNativeDriver: true }),
    ]).start()

    // Brilho
    Animated.sequence([
      Animated.timing(brilho, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(brilho, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start()

    // Partículas
    const emojis = TURMA.emocao === '😴' ? ['💤','💤','😴'] : ['✨','❤️','⭐','💫','🌟']
    const novas = Array.from({ length: 6 }, (_, i) => ({
      id: Date.now() + i,
      emoji: emojis[i % emojis.length],
      x: (Math.random() - 0.5) * 200,
      y: -(Math.random() * 120 + 60),
      anim: new Animated.Value(0),
    }))
    setParticulas(p => [...p, ...novas])
    novas.forEach(p => {
      Animated.timing(p.anim, { toValue: 1, duration: 1000, useNativeDriver: true }).start(() => {
        setParticulas(prev => prev.filter(x => x.id !== p.id))
      })
    })
  }

  const rotate = balanço.interpolate({ inputRange: [-15, 15], outputRange: ['-15deg', '15deg'] })
  const xpPct  = Math.min(100, Math.round((TURMA.xp / XP_PROXIMO) * 100))

  return (
    <SafeAreaView style={s.safe}>

      {/* ── ARENA PRINCIPAL ── ocupa 60% da tela */}
      <View style={[s.arena, { backgroundColor: fundo?.cor || pet.corFundo }]}>

        {/* Topo: nome da turma + botão sair */}
        <View style={s.arenaTop}>
          <View style={s.nomeTag}>
            <Text style={s.nomePet}>{pet.nome}</Text>
            <Text style={s.emocaoTag}>{TURMA.emocao}</Text>
          </View>
          <TouchableOpacity style={s.btnSair} onPress={onVoltar}>
            <Text style={s.btnSairTxt}>←</Text>
          </TouchableOpacity>
        </View>

        {/* Partículas */}
        {particulas.map(p => (
          <Animated.Text key={p.id} style={[s.particula, {
            transform: [
              { translateX: p.anim.interpolate({ inputRange: [0,1], outputRange: [0, p.x] }) },
              { translateY: p.anim.interpolate({ inputRange: [0,1], outputRange: [0, p.y] }) },
            ],
            opacity: p.anim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 1, 0] }),
          }]}>
            {p.emoji}
          </Animated.Text>
        ))}

        {/* Pet */}
        <TouchableOpacity activeOpacity={0.9} onPress={aoTocar} style={s.petWrap}>
          <Animated.View style={{
            transform: [{ scale: escala }, { rotate }, { translateY: pulo }]
          }}>
            <Animated.View style={[s.petBrilho, { opacity: brilho, borderColor: emocao.cor }]} />
            <View style={[s.petCircle, { borderColor: pet.cor }]}>
              <Image source={pet.imagem} style={s.petImg} resizeMode="contain" />

              {/* Chapéu por cima */}
              {chapeu && (
                <Text style={s.chapeuOverlay}>{chapeu.emoji}</Text>
              )}
            </View>

            {/* ZZZ se dormindo */}
            {TURMA.emocao === '😴' && <Text style={s.zzz}>💤</Text>}
          </Animated.View>
        </TouchableOpacity>

        {/* Estágio */}
        <View style={[s.estagioTag, { borderColor: pet.cor + '80' }]}>
          <Text style={[s.estagioTxt, { color: pet.cor }]}>{ESTAGIOS[TURMA.estagio]}</Text>
        </View>

        {/* Dica */}
        <Text style={s.dica}>Toque no pet! 👆</Text>
      </View>

      {/* ── BARRA DE XP ── */}
      <View style={s.xpWrap}>
        <View style={s.xpRow}>
          <Text style={s.xpLabel}>⭐ XP</Text>
          <Text style={s.xpValor}>{TURMA.xp} / {XP_PROXIMO}</Text>
        </View>
        <View style={s.xpBg}>
          <Animated.View style={[s.xpFill, { width: xpPct + '%', backgroundColor: pet.cor }]} />
        </View>
      </View>

      {/* ── BOTÕES GRANDES ── */}
      <View style={s.botoesWrap}>
        {[
          { emoji: '🪖', label: 'Chapéu',    cat: 'chapeus',    cor: '#2E7D32' },
          { emoji: '📿', label: 'Acessório', cat: 'acessorios', cor: '#4A148C' },
          { emoji: '🌳', label: 'Fundo',     cat: 'fundos',     cor: '#1565C0' },
        ].map(b => (
          <TouchableOpacity key={b.cat} style={[s.btnGrande, { backgroundColor: b.cor }]}
            onPress={() => setModal(b.cat)} activeOpacity={0.8}>
            <Text style={s.btnGrandeEmoji}>{b.emoji}</Text>
            <Text style={s.btnGrandeTxt}>{b.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── MODAL COSMÉTICOS ── */}
      <Modal visible={!!modal} transparent animationType="slide" onRequestClose={() => setModal(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitulo}>
              {modal === 'chapeus' ? '🪖 Chapéus' : modal === 'acessorios' ? '📿 Acessórios' : '🌳 Fundos'}
            </Text>

            <ScrollView contentContainerStyle={s.grid} showsVerticalScrollIndicator={false}>
              {/* Remover */}
              <TouchableOpacity style={s.itemRemover}
                onPress={() => {
                  if (modal === 'chapeus') setChapeu(null)
                  else if (modal === 'acessorios') setAcessorio(null)
                  else setFundo(null)
                  setModal(null)
                }}>
                <Text style={{ fontSize: 30 }}>❌</Text>
                <Text style={s.itemNome}>Remover</Text>
              </TouchableOpacity>

              {COSMETICOS[modal]?.map(item => {
                const sel = modal === 'chapeus' ? chapeu?.id === item.id
                  : modal === 'acessorios' ? acessorio?.id === item.id
                  : fundo?.id === item.id
                return (
                  <TouchableOpacity key={item.id}
                    style={[s.item, sel && { borderColor: pet.cor, borderWidth: 3 }, !item.desbloqueado && s.itemLocked]}
                    onPress={() => {
                      if (!item.desbloqueado) return
                      if (modal === 'chapeus') setChapeu(item)
                      else if (modal === 'acessorios') setAcessorio(item)
                      else setFundo(item)
                      setModal(null)
                    }}
                    activeOpacity={item.desbloqueado ? 0.7 : 1}
                  >
                    <Text style={{ fontSize: 32, opacity: item.desbloqueado ? 1 : 0.3 }}>{item.emoji}</Text>
                    <Text style={[s.itemNome, !item.desbloqueado && { color: '#bbb' }]}>{item.nome}</Text>
                    {!item.desbloqueado && <Text style={s.lockTag}>🔒</Text>}
                    {sel && <View style={[s.selTag, { backgroundColor: pet.cor }]}><Text style={{ color: '#fff', fontSize: 12, fontFamily: fonts.bold }}>✓</Text></View>}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>

            <TouchableOpacity style={[s.btnFechar, { backgroundColor: pet.cor }]} onPress={() => setModal(null)}>
              <Text style={s.btnFecharTxt}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: '#090C0E' },

  // Arena
  arena:       { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  arenaTop:    { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nomeTag:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  nomePet:     { fontSize: 16, fontFamily: fonts.bold, color: '#fff' },
  emocaoTag:   { fontSize: 20 },
  btnSair:     { backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  btnSairTxt:  { fontSize: 20, color: '#fff' },

  // Pet
  petWrap:     { alignItems: 'center', justifyContent: 'center' },
  petBrilho:   { position: 'absolute', width: 190, height: 190, borderRadius: 95, borderWidth: 6, zIndex: 0 },
  petCircle:   { width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 4, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  petImg:      { width: 145, height: 145 },
  chapeuOverlay:{ position: 'absolute', top: -30, fontSize: 40 },
  zzz:         { position: 'absolute', top: -30, left: -10, fontSize: 24 },

  // Estágio
  estagioTag:  { position: 'absolute', bottom: 44, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1.5 },
  estagioTxt:  { fontSize: 13, fontFamily: fonts.bold },
  dica:        { position: 'absolute', bottom: 14, color: 'rgba(255,255,255,0.45)', fontSize: 12, fontFamily: fonts.regular },

  // Partícula
  particula:   { position: 'absolute', fontSize: 24, zIndex: 10 },

  // XP
  xpWrap:      { backgroundColor: '#111', paddingHorizontal: 20, paddingVertical: 10 },
  xpRow:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  xpLabel:     { fontSize: 13, fontFamily: fonts.semibold, color: '#fff' },
  xpValor:     { fontSize: 13, fontFamily: fonts.bold, color: '#aaa' },
  xpBg:        { height: 12, backgroundColor: '#333', borderRadius: 6, overflow: 'hidden' },
  xpFill:      { height: '100%', borderRadius: 6 },

  // Botões grandes
  botoesWrap:  { flexDirection: 'row', gap: 10, padding: 14, backgroundColor: '#111' },
  btnGrande:   { flex: 1, borderRadius: 16, paddingVertical: 16, alignItems: 'center', gap: 4 },
  btnGrandeEmoji: { fontSize: 30 },
  btnGrandeTxt:{ fontSize: 14, fontFamily: fonts.bold, color: '#fff' },

  // Modal
  modalOverlay:{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalBox:    { backgroundColor: '#1a1a1a', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 36, maxHeight: height * 0.6 },
  modalTitulo: { fontSize: 20, fontFamily: fonts.bold, color: '#fff', textAlign: 'center', marginBottom: 16 },
  grid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', paddingBottom: 8 },
  item:        { width: (width - 80) / 3, alignItems: 'center', padding: 14, borderRadius: 16, borderWidth: 2, borderColor: '#333', backgroundColor: '#2a2a2a', gap: 4, position: 'relative' },
  itemRemover: { width: (width - 80) / 3, alignItems: 'center', padding: 14, borderRadius: 16, borderWidth: 2, borderColor: '#444', backgroundColor: '#2a2a2a', gap: 4 },
  itemLocked:  { opacity: 0.5 },
  itemNome:    { fontSize: 11, fontFamily: fonts.semibold, color: '#ccc', textAlign: 'center' },
  lockTag:     { position: 'absolute', top: 4, right: 4, fontSize: 12 },
  selTag:      { position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  btnFechar:   { borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 12 },
  btnFecharTxt:{ fontSize: 16, fontFamily: fonts.bold, color: '#fff' },
})
