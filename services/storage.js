import AsyncStorage from '@react-native-async-storage/async-storage'

const PROFESSORES_PADRAO = [
  { id: 'prof1', usuario: 'professor1', email: 'professor1', senha: 'Senha1!', nome: 'Professor 1' },
  { id: 'prof2', usuario: 'professor2', email: 'professor2', senha: 'Senha2!', nome: 'Professor 2' },
  { id: 'prof3', usuario: 'professor3', email: 'professor3', senha: 'Senha3!', nome: 'Professor 3' },
]

const TURMAS_PADRAO = [
  { id: 1, nome: '2º A', pet: '🐉', estagio: 'Jovem',   xp: 980, progresso: 78, emocao: '😄', cor: '#009D25', cosmetico: true  },
  { id: 2, nome: '2º B', pet: '🦊', estagio: 'Filhote', xp: 640, progresso: 52, emocao: '😐', cor: '#6A109E', cosmetico: false },
  { id: 3, nome: '2º C', pet: '🦅', estagio: 'Adulto',  xp: 830, progresso: 91, emocao: '🤩', cor: '#DBB407', cosmetico: true  },
  { id: 4, nome: '2º D', pet: '🐺', estagio: 'Filhote', xp: 510, progresso: 41, emocao: '😴', cor: '#888888', cosmetico: false },
]

const ALUNOS_PADRAO = [
  { id: 1, nome: 'Maria Fernanda', email: 'mariafernanda@gmail.com', senha: 'maria123', turmaId: 1, xp: 980, initials: 'MF' },
  { id: 2, nome: 'João Pedro',     email: 'joaopedro@gmail.com',     senha: 'joao123',  turmaId: 2, xp: 830, initials: 'JP' },
  { id: 3, nome: 'Carlos R.',      email: 'carlosr@gmail.com',       senha: 'carlos123', turmaId: null, xp: 0, initials: 'CR' },
]

// ── Init ─────────────────────────────────────────────────

export async function inicializarProfessores() {
  const jaIniciou = await AsyncStorage.getItem('dados_init_v3')
  if (!jaIniciou) {
    await AsyncStorage.setItem('professores', JSON.stringify(PROFESSORES_PADRAO))
    await AsyncStorage.setItem('turmas', JSON.stringify(TURMAS_PADRAO))
    await AsyncStorage.setItem('alunos', JSON.stringify(ALUNOS_PADRAO))
    await AsyncStorage.setItem('dados_init_v3', 'true')
  }
}

// ── Professores ───────────────────────────────────────────

export async function buscarProfessor(usuario, senha) {
  const dados = await AsyncStorage.getItem('professores')
  const lista = dados ? JSON.parse(dados) : PROFESSORES_PADRAO
  return lista.find(p => p.usuario === usuario && p.senha === senha) || null
}

// ── Turmas ────────────────────────────────────────────────

export async function listarTurmas() {
  const dados = await AsyncStorage.getItem('turmas')
  return dados ? JSON.parse(dados) : TURMAS_PADRAO
}

export async function salvarTurmas(turmas) {
  await AsyncStorage.setItem('turmas', JSON.stringify(turmas))
}

export async function buscarTurmaDoAluno(turmaId) {
  if (!turmaId) return null
  const turmas = await listarTurmas()
  return turmas.find(t => t.id === turmaId) || null
}

// ── Alunos ────────────────────────────────────────────────

export async function listarAlunos() {
  const dados = await AsyncStorage.getItem('alunos')
  return dados ? JSON.parse(dados) : ALUNOS_PADRAO
}

export async function buscarAluno(email, senha) {
  const alunos = await listarAlunos()
  return alunos.find(a => a.email === email && a.senha === senha) || null
}

export async function buscarUsuario(email) {
  const alunos = await listarAlunos()
  return alunos.find(a => a.email === email) || null
}

export async function salvarUsuario(dados) {
  const alunos = await listarAlunos()
  const novoId = alunos.length > 0 ? Math.max(...alunos.map(a => a.id)) + 1 : 1
  const initials = dados.usuario.trim().split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
  const novo = {
    id: novoId,
    nome: dados.usuario,
    email: dados.email.toLowerCase(),
    senha: dados.senha,
    turmaId: null,
    xp: 0,
    initials,
  }
  alunos.push(novo)
  await AsyncStorage.setItem('alunos', JSON.stringify(alunos))
  return novo
}

export async function atualizarAluno(id, novos) {
  const alunos = await listarAlunos()
  const atualizados = alunos.map(a => a.id === id ? { ...a, ...novos } : a)
  await AsyncStorage.setItem('alunos', JSON.stringify(atualizados))
}

export async function deletarAluno(id) {
  const alunos = await listarAlunos()
  await AsyncStorage.setItem('alunos', JSON.stringify(alunos.filter(a => a.id !== id)))
}