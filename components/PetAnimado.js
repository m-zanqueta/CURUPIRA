import { useEffect, useRef, useState } from 'react'
import { Animated, TouchableWithoutFeedback, View, Text, StyleSheet, Image } from 'react-native'
import { colors, fonts } from '../theme'

const EMOCAO_CONFIG = {
  '🤩': { velocidade: 600,  escala: 1.08, cor: colors.yellow  },
  '😄': { velocidade: 900,  escala: 1.05, cor: colors.green   },
  '😐': { velocidade: 1400, escala: 1.02, cor: '#888'         },
  '😴': { velocidade: 2000, escala: 1.01, cor: '#aaa'         },
  '😢': { velocidade: 2500, escala: 1.01, cor: colors.purple  },
}

export default function PetAnimado({ emocao = '😄', imagem, emoji = '🐊', estagio, cor }) {
  const escalaAnim   = useRef(new Animated.Value(1)).current
  const balanceAnim  = useRef(new Animated.Value(0)).current
  const puloAnim     = useRef(new Animated.Value(0)).current
  const [particulas, setParticulas] = useState([])
  const cfg = EMOCAO_CONFIG[emocao] || EMOCAO_CONFIG['😄']

  // Respiração em loop
  useEffect(() => {
    const respiracao = Animated.loop(
      Animated.sequence([
        Animated.timing(escalaAnim, { toValue: cfg.escala, duration: cfg.velocidade, useNativeDriver: true }),
        Animated.timing(escalaAnim, { toValue: 1,          duration: cfg.velocidade, useNativeDriver: true }),
      ])
    )
    respiracao.start()
    return () => respiracao.stop()
  }, [emocao])

  // Balanço suave em loop
  useEffect(() => {
    const balanco = Animated.loop(
      Animated.sequence([
        Animated.timing(balanceAnim, { toValue: emocao === '😴' ? 3 : 6,  duration: cfg.velocidade * 1.5, useNativeDriver: true }),
        Animated.timing(balanceAnim, { toValue: emocao === '😴' ? -3 : -6, duration: cfg.velocidade * 1.5, useNativeDriver: true }),
        Animated.timing(balanceAnim, { toValue: 0, duration: cfg.velocidade * 0.5, useNativeDriver: true }),
      ])
    )
    balanco.start()
    return () => balanco.stop()
  }, [emocao])

  // Toque — pulo + partículas
  function aoTocar() {
    // Pulo
    Animated.sequence([
      Animated.timing(puloAnim, { toValue: -30, duration: 150, useNativeDriver: true }),
      Animated.timing(puloAnim, { toValue: 0,   duration: 200, useNativeDriver: true }),
    ]).start()

    // Partículas
    const novosEmojis = emocao === '😴' ? ['💤','😴','💤'] : emocao === '😢' ? ['💧','😢','💧'] : ['✨','❤️','⭐','💫','🌟']
    const novas = Array.from({ length: 5 }, (_, i) => ({
      id: Date.now() + i,
      emoji: novosEmojis[i % novosEmojis.length],
      x: Math.random() * 200 - 100,
      y: Math.random() * -120 - 40,
      anim: new Animated.Value(0),
    }))
    setParticulas(prev => [...prev, ...novas])
    novas.forEach(p => {
      Animated.timing(p.anim, { toValue: 1, duration: 900, useNativeDriver: true }).start(() => {
        setParticulas(prev => prev.filter(x => x.id !== p.id))
      })
    })
  }

  const rotate = balanceAnim.interpolate({ inputRange: [-10, 10], outputRange: ['-10deg', '10deg'] })

  return (
    <View style={s.wrap}>
      {/* Partículas */}
      {particulas.map(p => (
        <Animated.Text key={p.id} style={[s.particula, {
          transform: [
            { translateX: p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, p.x] }) },
            { translateY: p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, p.y] }) },
          ],
          opacity: p.anim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
        }]}>
          {p.emoji}
        </Animated.Text>
      ))}

      {/* Pet */}
      <TouchableWithoutFeedback onPress={aoTocar}>
        <Animated.View style={[s.petWrap, {
          transform: [
            { scale: escalaAnim },
            { rotate },
            { translateY: puloAnim },
          ]
        }]}>
          <View style={[s.petCircle, { borderColor: cor || colors.green }]}>
            {imagem ? (
              <Image source={imagem} style={s.petImg} resizeMode="contain" />
            ) : (
              <Text style={s.petEmoji}>{emoji}</Text>
            )}
          </View>

          {/* Emoção flutuante */}
          <View style={s.emocaoBubble}>
            <Text style={s.emocaoText}>{emocao}</Text>
          </View>

          {/* ZZZ se dormindo */}
          {emocao === '😴' && (
            <Text style={s.zzz}>💤</Text>
          )}
        </Animated.View>
      </TouchableWithoutFeedback>

      {/* Estágio */}
      {estagio && (
        <View style={[s.estagioTag, { backgroundColor: cor + '20', borderColor: cor }]}>
          <Text style={[s.estagioText, { color: cor }]}>{estagio}</Text>
        </View>
      )}

      {/* Sombra */}
      <View style={s.sombra} />
    </View>
  )
}

const s = StyleSheet.create({
  wrap:        { alignItems: 'center', justifyContent: 'center', height: 220 },
  petWrap:     { alignItems: 'center', justifyContent: 'center' },
  petCircle: {
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: '#fff',
    borderWidth: 4,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  petImg:      { width: 120, height: 120 },
  petEmoji:    { fontSize: 80 },
  emocaoBubble:{ position: 'absolute', top: -10, right: -10, backgroundColor: '#fff', borderRadius: 20, padding: 4, elevation: 4 },
  emocaoText:  { fontSize: 20 },
  zzz:         { position: 'absolute', top: -20, left: 10, fontSize: 20 },
  particula:   { position: 'absolute', fontSize: 22, zIndex: 10 },
  estagioTag:  { marginTop: 12, paddingHorizontal: 16, paddingVertical: 5, borderRadius: 20, borderWidth: 1.5 },
  estagioText: { fontSize: 13, fontFamily: fonts.semibold },
  sombra:      { width: 100, height: 12, backgroundColor: '#00000015', borderRadius: 50, marginTop: 4 },
})
