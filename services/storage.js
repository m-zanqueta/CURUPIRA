import AsyncStorage from '@react-native-async-storage/async-storage'

const PROFESSORES_PADRAO = [
  { id: 'prof1', usuario: 'professor1', email: 'professor1', senha: 'Senha1!', tipo: 'professor', nome: 'Professor 1' },
  { id: 'prof2', usuario: 'professor2', email: 'professor2', senha: 'Senha2!', tipo: 'professor', nome: 'Professor 2' },
  { id: 'prof3', usuario: 'professor3', email: 'professor3', senha: 'Senha3!', tipo: 'professor', nome: 'Professor 3' },
]

export async function inicializarProfessores() {
  const jaIniciou = await AsyncStorage.getItem('professores_inicializados')
  if (!jaIniciou) {
    await AsyncStorage.setItem('professores', JSON.stringify(PROFESSORES_PADRAO))
    await AsyncStorage.setItem('professores_inicializados', 'true')
  }
}

export async function buscarProfessor(email, senha) {
  const dados = await AsyncStorage.getItem('professores')
  const professores = dados ? JSON.parse(dados) : PROFESSORES_PADRAO
  return professores.find(p => p.email === email && p.senha === senha) || null
}

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
  return usuarios.find(u => u.email === email) || null
}