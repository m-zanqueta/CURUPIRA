import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

// ── Init ─────────────────────────────────────────────────

// Como os dados agora são reais e estão na nuvem, não precisamos mais 
// criar os dados padrão no AsyncStorage na inicialização.
export async function inicializarProfessores() {
  console.log('App conectado ao Supabase. Inicialização local ignorada.')
}

// ── Professores ───────────────────────────────────────────

export async function buscarProfessor(usuario, senha) {
  try {
    const { data, error } = await supabase
      .from('professores')
      .select('*')
      .eq('usuario', usuario)
      .eq('senha', senha)
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Erro ao buscar professor:', error.message)
    return null
  }
}

// ── Turmas e Pets ─────────────────────────────────────────

export async function listarTurmas() {
  try {
    // Busca as turmas e já puxa os dados do pet atrelado a ela
    const { data, error } = await supabase
      .from('turmas')
      .select(`
        id, 
        nome,
        pets ( icone, estagio, xp, progresso, emocao, cor, cosmetico )
      `)

    if (error) throw error

    // Formata o retorno para ficar idêntico ao que o seu app antigo esperava
    return data.map(turma => {
      const pet = Array.isArray(turma.pets) ? turma.pets[0] : turma.pets
      return {
        id: turma.id,
        nome: turma.nome,
        pet: pet?.icone || '❓', // Mapeia a coluna 'icone' de volta para 'pet'
        estagio: pet?.estagio || 'Desconhecido',
        xp: pet?.xp || 0,
        progresso: pet?.progresso || 0,
        emocao: pet?.emocao || '😐',
        cor: pet?.cor || '#888888',
        cosmetico: pet?.cosmetico || false
      }
    })
  } catch (error) {
    console.error('Erro ao listar turmas:', error.message)
    return []
  }
}

export async function salvarTurmas(turmas) {
  console.warn('A função salvarTurmas foi chamada, mas as turmas devem ser geridas no painel do Supabase.')
}

export async function buscarTurmaDoAluno(turmaId) {
  if (!turmaId) return null

  try {
    const { data, error } = await supabase
      .from('turmas')
      .select(`
        id, 
        nome,
        pets ( icone, estagio, xp, progresso, emocao, cor, cosmetico )
      `)
      .eq('id', turmaId)
      .single()

    if (error) throw error

    const pet = Array.isArray(data.pets) ? data.pets[0] : data.pets
    return {
      id: data.id,
      nome: data.nome,
      pet: pet?.icone || '❓',
      estagio: pet?.estagio || 'Desconhecido',
      xp: pet?.xp || 0,
      progresso: pet?.progresso || 0,
      emocao: pet?.emocao || '😐',
      cor: pet?.cor || '#888888',
      cosmetico: pet?.cosmetico || false
    }
  } catch (error) {
    console.error('Erro ao buscar turma do aluno:', error.message)
    return null
  }
}

// ── Alunos ────────────────────────────────────────────────

export async function listarAlunos() {
  try {
    const { data, error } = await supabase.from('alunos').select('*')
    if (error) throw error
    return data
  } catch (error) {
    console.error('Erro ao listar alunos:', error.message)
    return []
  }
}

export async function buscarAluno(email, senha) {
  // A lógica da loja continua igual
  if (email === 'loja@gmail.com' && senha === 'loja123') {
    return { id: 'loja', nome: 'Loja', email: 'loja@gmail.com', senha: 'loja123', turmaId: null, xp: 0, initials: 'LJ', cor: '#009D25' }
  }
  
  try {
    const { data, error } = await supabase
      .from('alunos')
      .select('*')
      .eq('email', email.trim().toLowerCase())
      .eq('senha', senha)
      .maybeSingle() // 🟢 Troque .single() por .maybeSingle() aqui

    if (error) throw error
    return data
  } catch (error) {
    console.log('Aluno não encontrado:', error.message)
    return null
  }
}

export async function buscarUsuario(email) {
  try {
    const { data, error } = await supabase
      .from('alunos')
      .select('*')
      .eq('email', email.trim().toLowerCase())
      .single()

    if (error) throw error
    return data
  } catch (error) {
    return null
  }
}

export async function salvarUsuario(dados) {
  try {
    const { data, error } = await supabase
      .from('alunos')
      .insert([{
        nome: dados.usuario,
        email: dados.email.toLowerCase().trim(),
        senha: dados.senha,
        turmaId: null, // Alunos novos começam sem turma
        xp: 0
        // 'initials' removido daqui
      }])
      .select()
      .single();

    if (error) {
      console.error('Erro no Supabase ao criar perfil:', error.message);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Erro inesperado ao criar perfil:', error);
    return null;
  }
}

export async function atualizarAluno(id, novos) {
  try {
    const { error } = await supabase
      .from('alunos')
      .update(novos)
      .eq('id', id)

    if (error) throw error
  } catch (error) {
    console.error('Erro ao atualizar aluno:', error.message)
  }
}

export async function deletarAluno(id) {
  try {
    const { error } = await supabase
      .from('alunos')
      .delete()
      .eq('id', id)

    if (error) throw error
  } catch (error) {
    console.error('Erro ao deletar aluno:', error.message)
  }
}

// ── Loja ─────────────────────────────────────────────────
// A loja continua utilizando o AsyncStorage pois os itens comprados 
// estão sendo salvos apenas no dispositivo físico (cache local).

export async function listarItensComprados() {
  const dados = await AsyncStorage.getItem('itens_comprados')
  return dados ? JSON.parse(dados) : []
}

export async function comprarItem(itemId) {
  const itens = await listarItensComprados()
  if (!itens.includes(itemId)) {
    itens.push(itemId)
    await AsyncStorage.setItem('itens_comprados', JSON.stringify(itens))
  }
}