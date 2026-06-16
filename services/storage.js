import AsyncStorage from '@react-native-async-storage/async-storage'

export async function salvarUsuario(usuario) {
  const usuarios = await listarUsuarios()
  usuarios.push(usuario)
  await AsyncStorage.setItem('usuarios', JSON.stringify(usuarios))
}

export async function listarUsuarios() {
  const dados = await AsyncStorage.getItem('usuarios')
  return dados ? JSON.parse(dados) : []
}

export async function buscarUsuario(email) {
  const usuarios = await listarUsuarios()
  return usuarios.find(u => u.email === email)
}