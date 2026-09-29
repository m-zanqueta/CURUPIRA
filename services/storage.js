import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

// ── Init ─────────────────────────────────────────────────

// Como os dados agora são reais e estão na nuvem, não precisamos mais 
// criar os dados padrão no AsyncStorage na inicialização.
export async function inicializarProfessores() {
  console.log('App conectado ao Supabase. Inicialização local ignorada.')
}

// ── Professores ───────────────────────────────────────────

export async function buscarProfessor(emailDigitado, senhaDigitada) {
  try {
    const { data, error } = await supabase
      .from('professores')
      .select('*')
      .eq('email', emailDigitado.trim().toLowerCase())
      .eq('senha', senhaDigitada)
      .maybeSingle()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Erro ao buscar professor:', error.message)
    return null
  }
}

export async function salvarProfessor(dados) {
  const { data, error } = await supabase
    .from('professores')
    .insert([{ nome: dados.nome.trim(), email: dados.email.trim().toLowerCase(), senha: dados.senha }])
    .select('id, nome, email')
    .single();
  if (error) throw error;
  return data;
}

export async function salvarPetAdmin(dados) {
  const { data, error } = await supabase
    .from('pets')
    .insert([{
      icone: dados.icone.trim(),
      estagio: dados.estagio.trim() || 'Filhote',
      xp: 0,
      progresso: 0,
      emocao: '😐',
      cor: dados.cor || '#009D25',
      cosmetico: null,
      turma_id: null,
    }])
    .select('id, icone, estagio, xp, progresso, emocao, cor, cosmetico, turma_id')
    .single();
  if (error) throw error;
  return data;
}

export async function salvarIconeMissao(dados) {
  const { data, error } = await supabase
    .from('icones_missoes')
    .insert([{ nome: dados.nome.trim(), icone: dados.icone.trim(), ativo: true }])
    .select('id, nome, icone, ativo')
    .single();
  if (error) throw error;
  return data;
}

// ── Turmas e Pets (ATUALIZADO) ─────────────────────────────────────────

export async function listarTurmas(professorId) {
  if (!professorId) return [];

  try {
    const { data: turmas, error: turmasError } = await supabase
      .from('turmas')
      .select('id, nome, codigo, professor_id')
      .eq('professor_id', professorId);
    if (turmasError) throw turmasError;
    if (!turmas?.length) return [];

    const { data: pets, error: petsError } = await supabase
      .from('pets')
      .select('id, icone, estagio, xp, progresso, emocao, cor, cosmetico, turma_id')
      .in('turma_id', turmas.map(turma => turma.id));
    if (petsError) throw petsError;

    const petPorTurma = new Map((pets || []).map(pet => [String(pet.turma_id), pet]));
    return turmas.map(turma => {
      const pet = petPorTurma.get(String(turma.id));
      return {
      id: turma.id,
      nome: turma.nome,
      codigo: turma.codigo,
      professorId: turma.professor_id,
      petId: pet?.id || null,
      pet: pet?.icone || null,
      estagio: pet?.estagio || 'Filhote',
      xp: Number(pet?.xp) || 0,
      progresso: Number(pet?.progresso) || 0,
      emocao: pet?.emocao || '😐',
      cor: pet?.cor || '#888888',
      cosmetico: pet?.cosmetico || false,
      };
    });
  } catch (error) {
    console.error('Erro ao listar turmas:', error.message);
    return [];
  }
}

export async function listarPetsDisponiveis() {
  const { data, error } = await supabase
    .from('pets')
    .select('id, icone, estagio, xp, progresso, emocao, cor, cosmetico, turma_id')
    .is('turma_id', null)
    .order('id', { ascending: true });

  if (error) throw error;

  // A coluna icone deve conter a URL pública da imagem no Supabase Storage.
  return (data || []).filter(pet =>
    typeof pet.icone === 'string' && /^https?:\/\//i.test(pet.icone.trim())
  );
}

export async function salvarTurma(novaTurma) {
  if (!novaTurma?.professorId) {
    throw new Error('O ID do professor é necessário para criar uma turma.');
  }
  if (!novaTurma?.petId) {
    throw new Error('Selecione um PET disponível para criar a turma.');
  }

  const { data: turmaData, error: turmaError } = await supabase
    .from('turmas')
    .insert([{
      nome: novaTurma.nome,
      codigo: novaTurma.codigo,
      professor_id: novaTurma.professorId,
    }])
    .select()
    .single();

  if (turmaError) throw turmaError;

  const { data: petVinculado, error: petError } = await supabase
    .from('pets')
    .update({ turma_id: turmaData.id, cor: novaTurma.cor })
    .eq('id', novaTurma.petId)
    .is('turma_id', null)
    .select('id, icone, estagio, xp, progresso, emocao, cor, cosmetico, turma_id')
    .maybeSingle();

  if (petError || !petVinculado) {
    const { error: rollbackError } = await supabase
      .from('turmas')
      .delete()
      .eq('id', turmaData.id)
      .eq('professor_id', novaTurma.professorId);

    if (rollbackError) console.error('Erro ao desfazer criação parcial da turma:', rollbackError);
    if (petError) throw petError;
    throw new Error('Este PET já foi vinculado a outra turma. Atualize a lista e escolha outro PET.');
  }

  return { ...turmaData, pet: petVinculado };
}

export async function atualizarTurma(id, dadosAtualizados) {
  try {
    // Atualiza nome da turma
    await supabase.from('turmas').update({ nome: dadosAtualizados.nome }).eq('id', id);
    
    // Atualiza dados do pet se existir o ID dele
    if (dadosAtualizados.petId) {
      await supabase.from('pets').update({
        icone: dadosAtualizados.pet,
        cor: dadosAtualizados.cor
      }).eq('id', dadosAtualizados.petId);
    }
  } catch (error) {
    console.error('Erro ao atualizar turma:', error.message);
  }
}

export async function removerTurmaStorage(id, professorId) {
  if (!professorId) {
    throw new Error('O ID do professor é necessário para excluir uma turma.');
  }

  const { data, error } = await supabase
    .from('turmas')
    .delete()
    .eq('id', id)
    .eq('professor_id', professorId)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Turma não encontrada ou não pertence a este professor.');
}

// ── Missões e Conquistas (NOVOS) ─────────────────────────────────────────

export async function listarMissoes(professorId) {
  const { data, error } = await supabase.from('missoes').select('*').eq('professorId', professorId).order('id', { ascending: false });
  if (error) throw error;
  const ids = (data || []).map(m => m.id);
  const { data: vinculos, error: vinculosError } = ids.length
    ? await supabase.from('missoes_turmas').select('missao_id, turma_id').in('missao_id', ids)
    : { data: [], error: null };
  if (vinculosError) throw vinculosError;
  const porMissao = new Map();
  (vinculos || []).forEach(v => porMissao.set(String(v.missao_id), [...(porMissao.get(String(v.missao_id)) || []), v.turma_id]));
  return (data || []).map(m => ({ ...m, name: m.nome, icon: m.icone, active: m.ativa, turmaIds: porMissao.get(String(m.id)) || [] }));
}

export async function listarIconesMissoes() {
  const { data, error } = await supabase.from('icones_missoes').select('id, nome, icone').eq('ativo', true).order('id');
  if (error) throw error;
  return data || [];
}

export async function salvarMissao(missao) {
  const { data: id, error } = await supabase.rpc('salvar_missao_com_turmas', {
    p_missao_id: missao.id || null,
    p_professor_id: missao.professorId,
    p_nome: missao.nome,
    p_descricao: missao.descricao,
    p_xp: missao.xp,
    p_dificuldade: missao.dificuldade,
    p_icone: missao.icone,
    p_ativa: missao.ativa ?? true,
    p_turmas_ids: missao.turmasIds,
  });
  if (error) throw error;
  const { data, error: fetchError } = await supabase.from('missoes').select('*').eq('id', id).single();
  if (fetchError) throw fetchError;
  return { ...data, name: data.nome, icon: data.icone, active: data.ativa, turmaIds: missao.turmasIds };
}

export async function atualizarMissao(id, dados) {
  if (dados.nome !== undefined || dados.turmasIds !== undefined) return salvarMissao({ ...dados, id });
  const { data, error } = await supabase.from('missoes').update(dados).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function definirTurmasMissao(id, professorId, turmasIds) {
  const { error } = await supabase.rpc('definir_turmas_missao', { p_missao_id: id, p_professor_id: professorId, p_turmas_ids: turmasIds });
  if (error) throw error;
}

export async function listarStatusMissoes() {
  const { data, error } = await supabase.from('alunos_missoes').select('aluno_id, missao_id, status');
  if (error) throw error;
  return data || [];
}

export async function removerMissaoStorage(id) {
  const { error } = await supabase.from('missoes').delete().eq('id', id)
  if (error) throw error
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

// Procura todas as missões no banco de dados
export const buscarMissoes = async () => {
  const { data, error } = await supabase
    .from('missoes')
    .select('*')
    .order('id', { ascending: false });

  if (error) {
    console.error('Erro ao buscar missões:', error.message);
    throw error;
  }
  return data;
};

// Insere uma nova missão
export const criarMissao = async (novaMissao) => {
  const { data, error } = await supabase
    .from('missoes')
    .insert([novaMissao])
    .select();

  if (error) {
    console.error('Erro ao criar missão:', error.message);
    throw error;
  }
  return data;
};

// Atualiza o estado da missão (ativa/pausada)
export const atualizarStatusMissao = async (id, status) => {
  const { data, error } = await supabase
    .from('missoes')
    .update({ status })
    .eq('id', id);

  if (error) {
    console.error('Erro ao atualizar status da missão:', error.message);
    throw error;
  }
  return data;
};

// Atualiza o estado da entrega de um aluno específico
export const atualizarStatusAlunoMissao = async (missaoId, alunoId, novoStatus) => {
  const { data, error } = await supabase
    .from('alunos_missoes')
    .upsert({ missao_id: missaoId, aluno_id: alunoId, status: novoStatus }, { onConflict: 'aluno_id,missao_id' })
    .select()
    .single();

  if (error) {
    console.error('Erro ao atualizar entrega do aluno:', error.message);
    throw error;
  }
  return data;
};
