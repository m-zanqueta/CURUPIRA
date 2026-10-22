import { View } from 'react-native'
import { Text } from 'react-native-paper'
import { fonts } from '../theme'

// Texto com contorno escuro grosso (estilo jogo)
export default function TextoContorno({ children, size = 12, cor = '#FFFFFF', stroke = '#1B1030' }) {
  const base = { fontSize: size, fontFamily: fonts.extrabold, textAlign: 'center' }
  const offs = [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5], [-1.2, -1.2], [1.2, 1.2], [-1.2, 1.2], [1.2, -1.2], [0, 2.5]]
  return (
    <View>
      {offs.map(([x, y], i) => (
        <Text key={i} style={[base, { color: stroke, position: 'absolute', left: x, top: y, width: '100%' }]}>{children}</Text>
      ))}
      <Text style={[base, { color: cor }]}>{children}</Text>
    </View>
  )
}
