import { useEffect, useRef } from 'react'
import { Animated, PanResponder, StyleSheet, TouchableOpacity, View } from 'react-native'
import { Text } from 'react-native-paper'
import { colors, fonts } from '../theme'

export default function ConquistaToast({ notificacao, onDispensar, onAbrir }) {
  const x = useRef(new Animated.Value(0)).current
  const dispensarRef = useRef(onDispensar)
  const notificacaoRef = useRef(notificacao)
  dispensarRef.current = onDispensar
  notificacaoRef.current = notificacao

  useEffect(() => {
    if (!notificacao) return
    x.setValue(0)
    const timer = setTimeout(() => dispensarRef.current?.(notificacao), 5000)
    return () => clearTimeout(timer)
  }, [notificacao?.chave, notificacao?.tipo, notificacao?.id, x])

  const gesto = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderMove: (_, g) => x.setValue(g.dx),
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) > 70) {
        const atual = notificacaoRef.current
        Animated.timing(x, { toValue: g.dx > 0 ? 420 : -420, duration: 170, useNativeDriver: true }).start(() => dispensarRef.current?.(atual))
      } else Animated.spring(x, { toValue: 0, useNativeDriver: true }).start()
    },
  })).current

  if (!notificacao) return null
  return (
    <Animated.View {...gesto.panHandlers} style={[s.toast, { transform: [{ translateX: x }] }]}>
      <TouchableOpacity activeOpacity={0.8} onPress={() => onAbrir?.(notificacao)} style={s.conteudo} accessibilityRole="button" accessibilityLabel={notificacao.tipo === 'tarefa' ? 'Abrir trilha da tarefa aprovada' : 'Ver conquista desbloqueada'}>
      <View style={s.icone}><Text style={s.emoji}>{notificacao.icone || '🏅'}</Text></View>
      <View style={s.textos}>
        <Text style={s.chamada}>{notificacao.tipo === 'tarefa' ? 'TAREFA APROVADA! TOQUE PARA VER' : 'CONQUISTA DESBLOQUEADA!'}</Text>
        <Text style={s.titulo} numberOfLines={1}>{notificacao.titulo}</Text>
        {!!(notificacao.tipo === 'tarefa' ? notificacao.mensagem : notificacao.descricao) && <Text style={s.descricao} numberOfLines={2}>{notificacao.tipo === 'tarefa' ? notificacao.mensagem : notificacao.descricao}</Text>}
      </View>
      </TouchableOpacity>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  toast: { position: 'absolute', top: 48, left: 14, right: 14, zIndex: 9999, elevation: 20, minHeight: 82, borderRadius: 18, backgroundColor: colors.cream || '#F5F4D9', borderWidth: 2, borderColor: colors.green || '#009D25', padding: 12, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  conteudo: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  icone: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#E5F5E7', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  emoji: { fontSize: 29 },
  textos: { flex: 1 },
  chamada: { fontFamily: fonts.bold || 'Montserrat_700Bold', color: '#008A21', fontSize: 10, letterSpacing: 0.4 },
  titulo: { fontFamily: fonts.bold || 'Montserrat_700Bold', color: '#172019', fontSize: 16, marginTop: 2 },
  descricao: { fontFamily: fonts.regular || 'Montserrat_400Regular', color: '#59615B', fontSize: 11, marginTop: 2 },
})
