import { View, Text, StyleSheet } from 'react-native'
import { cores } from '../constants/cores'

export default function Home() {
  return (
    <View style={styles.container}>
      <Text style={styles.texto}>Logado!</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.branco },
  texto: { fontSize: 32, fontWeight: 'bold', color: cores.verde },
})