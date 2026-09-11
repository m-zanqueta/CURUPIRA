import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native'
import { cores } from '../constants/cores'

export default function Home({ onVerPet }) {
  return (
    <View style={styles.container}>
      <Image source={require('../assets/logo.png')} style={styles.logo} resizeMode="contain" />
      <Text style={styles.titulo}>Bem-vindo ao Curupira!</Text>
      <Text style={styles.sub}>Acompanhe seu pet e suas missões</Text>

      <TouchableOpacity style={styles.btnPet} onPress={onVerPet}>
        <Text style={styles.btnPetEmoji}>🐊</Text>
        <Text style={styles.btnPetText}>Ver meu Pet</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cores.branco,
    padding: 32,
    gap: 12,
  },
  logo: {
    width: 110,
    height: 110,
    marginBottom: 8,
  },
  titulo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: cores.verde,
    textAlign: 'center',
  },
  sub: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 16,
  },
  btnPet: {
    backgroundColor: cores.verde,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 40,
    alignItems: 'center',
    width: '100%',
    gap: 6,
    elevation: 3,
  },
  btnPetEmoji: {
    fontSize: 36,
  },
  btnPetText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
})
