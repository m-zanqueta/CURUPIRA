import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

const TABELAS_ADMIN = new Set(['professores', 'alunos', 'pets'])

export async function listarDadosAdmin(tabela) {
  if (!TABELAS_ADMIN.has(tabela)) throw new Error('Tabela não permitida para edição administrativa.')

  const { data, error } = await supabase
    .from(tabela)
    .select('*')
    .order('id', { ascending: true })

  if (error) throw error
  return data || []
}

export async function atualizarDadoAdmin(tabela, id, dados) {
  if (!TABELAS_ADMIN.has(tabela)) throw new Error('Tabela não permitida para edição administrativa.')
  if (id === null || id === undefined) throw new Error('O registro não possui um ID válido.')

  const { data, error } = await supabase
    .from(tabela)
    .update(dados)
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Nenhum registro foi alterado. Confira se ele ainda existe e se as políticas RLS permitem a edição.')
}

export async function excluirDadoAdmin(tabela, id) {
  if (!TABELAS_ADMIN.has(tabela)) throw new Error('Tabela não permitida para edição administrativa.')
  if (id === null || id === undefined) throw new Error('O registro não possui um ID válido.')

  const { data, error } = await supabase
    .from(tabela)
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Nenhum registro foi excluído. Confira se ele ainda existe e se as políticas RLS permitem a exclusão.')
}

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
  if (!dados?.imagem) throw new Error('Selecione uma imagem para o PET.');

  const arquivo = dados.imagem;
  const resposta = await fetch(arquivo.uri);
  if (!resposta.ok) throw new Error('Não foi possível ler a imagem selecionada.');
  const blob = await resposta.blob();
  const tipoMime = arquivo.mimeType || blob.type || 'image/jpeg';
  const extensao = tipoMime.split('/')[1]?.split(';')[0] || 'jpg';
  const caminho = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extensao}`;

  const { data: arquivoEnviado, error: erroUpload } = await supabase.storage
    .from('pets-images')
    .upload(caminho, blob, { contentType: tipoMime, cacheControl: '3600', upsert: false });
  if (erroUpload) throw erroUpload;

  const { data: urlPublica } = supabase.storage.from('pets-images').getPublicUrl(arquivoEnviado.path);
  const { error } = await supabase
    .from('pets')
    .insert([{
      nome: dados.nome.trim(),
      icone: urlPublica.publicUrl,
      estagio: dados.estagio,
      xp: 0,
      emocao: null,
      turma_id: null,
    }]);
  if (error) {
    await supabase.storage.from('pets-images').remove([arquivoEnviado.path]);
    throw error;
  }
  return {
    nome: dados.nome.trim(),
    icone: urlPublica.publicUrl,
    estagio: dados.estagio,
    xp: 0,
    emocao: null,
    turma_id: null,
  };
}

async function enviarImagemAdmin(imagem, pasta) {
  if (!imagem) throw new Error('Selecione uma imagem para enviar.')

  const resposta = await fetch(imagem.uri)
  if (!resposta.ok) throw new Error('Não foi possível ler a imagem selecionada.')
  const blob = await resposta.blob()
  const tipoMime = imagem.mimeType || blob.type || 'image/png'
  const extensao = tipoMime.split('/')[1]?.split(';')[0] || 'png'
  const nomeArquivo = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extensao}`
  const caminho = `${pasta}/${nomeArquivo}`

  const { data, error } = await supabase.storage
    .from('pets-images')
    .upload(caminho, blob, { contentType: tipoMime, cacheControl: '3600', upsert: false })
  if (error) throw error

  const { data: urlPublica } = supabase.storage.from('pets-images').getPublicUrl(data.path)
  return { path: data.path, url: urlPublica.publicUrl }
}

export async function salvarIconeMissao(dados) {
  const imagem = await enviarImagemAdmin(dados.imagem, 'icones-missoes')
  const registro = { nome: dados.nome.trim(), icone: imagem.url, ativo: true }
  const { error } = await supabase.from('icones_missoes').insert([registro])
  if (error) {
    await supabase.storage.from('pets-images').remove([imagem.path])
    throw error
  }
  return registro
}

export async function salvarAcessorioAdmin(dados) {
  const imagem = await enviarImagemAdmin(dados.imagem, 'acessorios')
  const registro = {
    nome: dados.nome.trim(),
    slot: dados.slot,
    imagem_path: imagem.path,
    camada: 10,
    ativo: true,
    preco: Number(dados.preco),
  }
  const { error } = await supabase.from('acessorios').insert([registro])
  if (error) {
    await supabase.storage.from('pets-images').remove([imagem.path])
    throw error
  }
  return registro
}

export async function listarAcessoriosLoja() {
  const { data, error } = await supabase
    .from('acessorios')
    .select('id, nome, slot, imagem_path, camada, preco, ativo')
    .eq('ativo', true)
    .order('id', { ascending: true })
  if (error) throw error

  return (data || []).map(item => ({
    ...item,
    imagem: supabase.storage.from('pets-images').getPublicUrl(item.imagem_path).data.publicUrl,
  }))
}

// ── Turmas e Pets (ATUALIZADO) ─────────────────────────────────────────

export async function listarTurmas(professorId) {
  if (!professorId) return [];

  try {
    const { data: turmas, error: turmasError } = await supabase
      .from('turmas')
      .select('id, nome, codigo, professor_id, cor')
      .eq('professor_id', professorId);
    if (turmasError) throw turmasError;
    if (!turmas?.length) return [];

    const { data: pets, error: petsError } = await supabase
      .from('pets')
      .select('id, nome, icone, estagio, xp, emocao, cosmetico, turma_id')
      .in('turma_id', turmas.map(turma => turma.id));
    if (petsError) throw petsError;

    const petPorTurma = new Map((pets || []).map(pet => [String(pet.turma_id), pet]));
    return turmas.map(turma => {
      const pet = petPorTurma.get(String(turma.id));
      return {
      id: turma.id,
      nome: turma.nome,
      cor: turma.cor || '#888888',
      codigo: turma.codigo,
      professorId: turma.professor_id,
      petId: pet?.id || null,
      pet: pet?.icone || null,
      petNome: pet?.nome || null,
      estagio: pet?.estagio || 'infantil',
      xp: Number(pet?.xp) || 0,
      progresso: Math.min(100, Math.floor((Number(pet?.xp) % 1000) / 10)),
      emocao: pet?.emocao ?? null,
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
    .select('id, nome, icone, estagio, xp, emocao, cosmetico, turma_id')
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
      cor: novaTurma.cor,
    }])
    .select()
    .single();

  if (turmaError) throw turmaError;

  const { data: petVinculado, error: petError } = await supabase
    .from('pets')
    .update({ turma_id: turmaData.id })
    .eq('id', novaTurma.petId)
    .is('turma_id', null)
    .select('id, nome, icone, estagio, xp, emocao, cosmetico, turma_id')
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
    await supabase.from('turmas').update({ nome: dadosAtualizados.nome, cor: dadosAtualizados.cor }).eq('id', id);
    
    // Atualiza dados do pet se existir o ID dele
    if (dadosAtualizados.petId) {
      await supabase.from('pets').update({
        icone: dadosAtualizados.pet,
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
  // ⚠️ MOCK — não é dado real do Supabase. Atalho fixo pra abrir a
  // LojaScreen enquanto não existe um botão de navegação real até ela
  // (ex: dentro do PetScreen). Continua aqui porque hoje é a ÚNICA forma
  // de acessar a Loja no app.
  if (email === 'loja@gmail.com' && senha === 'loja123') {
    return { id: 'loja', nome: 'Loja', email: 'loja@gmail.com', senha: 'loja123', turmaId: null, xp: 0, initials: 'LJ', cor: '#009D25' }
  }

  // A partir daqui é busca real, direto na tabela "alunos" do Supabase.
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

// ── Aluno: turma/pet, missões visíveis, progresso, XP e conquistas ──────
//
// Tudo abaixo é consumido pelo lado do ALUNO (App.js, PetScreen.js). Não
// mexe em nada que o Matheus criou pro professor acima — só usa as mesmas
// tabelas. "XP" nunca é escrito diretamente por essas funções: quem
// credita XP de verdade é o trigger do banco (aplicar_xp_aluno_missao),
// disparado quando uma linha de alunos_missoes vira status='aprovado'.
// Isso é proposital — ver observação de segurança no relatório.

// Turma do aluno + o pet dela. "turmas" não guarda mais o pet embutido
// (era assim numa versão antiga do schema) — agora "pets" tem turma_id,
// então busca as duas em paralelo e junta no mesmo formato que
// listarTurmas() já usa pro professor, pra manter as duas pontas iguais.
export async function buscarTurmaDoAluno(turmaId) {
  if (!turmaId) return null // aluno ainda sem turma atribuída

  try {
    const [{ data: turma, error: turmaError }, { data: pet, error: petError }] = await Promise.all([
      supabase.from('turmas').select('id, nome, codigo, professor_id').eq('id', turmaId).maybeSingle(),
      supabase.from('pets').select('id, icone, estagio, xp, progresso, emocao, cor, cosmetico').eq('turma_id', turmaId).maybeSingle(),
    ])
    if (turmaError) throw turmaError
    if (petError) throw petError
    if (!turma) return null

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
    }
  } catch (error) {
    console.error('Erro ao buscar turma do aluno:', error.message)
    return null
  }
}

// Missões que o aluno pode ver: as que estão vinculadas à turma dele em
// "missoes_turmas" (a relação N:N real — ver migrations) e ativas.
//
// ⚠️ Diferença do que foi pedido: a tarefa original descrevia "turmaId
// preenchido = turma específica, turmaId NULL = todas as turmas". Isso
// valia num modelo antigo. No banco atual (migrations do Matheus), toda
// missão OBRIGATORIAMENTE tem pelo menos 1 turma — a própria função
// salvar_missao_com_turmas() rejeita criar missão sem turma nenhuma.
// Não existe mais "missão pra todo mundo" no schema real, então não
// implementei isso pra não fingir um comportamento que o banco não
// sustenta. Se quiserem esse conceito de volta, é mudança de schema, não
// só de código — falar com o Matheus antes.
export async function listarMissoesDoAluno(alunoId) {
  try {
    const { data: aluno, error: alunoError } = await supabase
      .from('alunos').select('turmaId').eq('id', alunoId).maybeSingle()
    if (alunoError) throw alunoError
    if (!aluno?.turmaId) return [] // sem turma, sem missão pra mostrar

    const { data: vinculos, error: vinculosError } = await supabase
      .from('missoes_turmas').select('missao_id').eq('turma_id', aluno.turmaId)
    if (vinculosError) throw vinculosError
    const missaoIds = (vinculos || []).map(v => v.missao_id)
    if (!missaoIds.length) return []

    const { data: missoes, error: missoesError } = await supabase
      .from('missoes').select('*').in('id', missaoIds).eq('ativa', true)
    if (missoesError) throw missoesError

    const { data: progresso, error: progressoError } = await supabase
      .from('alunos_missoes').select('missao_id, status, xp_aluno, atualizado_em')
      .eq('aluno_id', alunoId).in('missao_id', missaoIds)
    if (progressoError) throw progressoError
    const statusPorMissao = new Map((progresso || []).map(p => [String(p.missao_id), p]))

    return (missoes || []).map(m => {
      const p = statusPorMissao.get(String(m.id))
      return {
        id: m.id,
        nome: m.nome,
        descricao: m.descricao,
        xp: m.xp,
        dificuldade: m.dificuldade,
        icone: m.icone,
        status: p?.status || 'pendente', // sem linha em alunos_missoes ainda = pendente
        atualizadoEm: p?.atualizado_em || null,
      }
    })
  } catch (error) {
    console.error('Erro ao listar missões do aluno:', error.message)
    return []
  }
}

// Status de UMA missão específica pra um aluno (undefined se ele nunca
// interagiu com ela — trate como 'pendente' na UI).
export async function buscarProgressoMissao(alunoId, missaoId) {
  try {
    const { data, error } = await supabase
      .from('alunos_missoes').select('*')
      .eq('aluno_id', alunoId).eq('missao_id', missaoId).maybeSingle()
    if (error) throw error
    return data
  } catch (error) {
    console.error('Erro ao buscar progresso da missão:', error.message)
    return null
  }
}

// "Iniciar" = criar/confirmar a linha em alunos_missoes com status
// pendente (deixa registrado que o aluno abriu a missão).
export async function iniciarMissao(alunoId, missaoId) {
  return atualizarStatusAlunoMissao(missaoId, alunoId, 'pendente')
}

// "Concluir" = o aluno entrega a missão pra avaliação. Só isso — quem
// muda pra 'aprovado' (e credita XP de verdade, via trigger do banco) é
// o professor, não o aluno. Não existe função aqui pra aluno se
// autoaprovar; isso é intencional.
export async function concluirMissao(alunoId, missaoId) {
  return atualizarStatusAlunoMissao(missaoId, alunoId, 'entregue')
}

// Alias genérico — não existe campo de "progresso percentual" em
// alunos_missoes, só o status (pendente/entregue/aprovado). "Atualizar
// progresso" na prática é mudar o status.
export const atualizarProgressoMissao = atualizarStatusAlunoMissao

// XP atual do aluno (o valor já fica cacheado em alunos.xp, mantido pelo
// trigger do banco — não precisa somar histórico toda vez).
export async function consultarXP(alunoId) {
  try {
    const { data, error } = await supabase.from('alunos').select('xp').eq('id', alunoId).maybeSingle()
    if (error) throw error
    return data?.xp || 0
  } catch (error) {
    console.error('Erro ao consultar XP do aluno:', error.message)
    return 0
  }
}

// Conquistas do aluno (tabela "conquistas": cada linha já nasce vinculada
// a um alunoId — é o professor concedendo diretamente, não existe uma
// etapa separada de "desbloqueio automático" no schema atual, então não
// tem uma função "verificarConquistas()" aqui: a existência da linha JÁ
// é o desbloqueio).
export async function listarConquistasDoAluno(alunoId) {
  try {
    const { data, error } = await supabase
      .from('conquistas').select('*').eq('alunoId', alunoId).order('id', { ascending: false })
    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Erro ao listar conquistas do aluno:', error.message)
    return []
  }
}

// Resumo pra tela de perfil/dashboard do aluno: XP, quantas missões já
// foram aprovadas e quantas conquistas ele tem.
export async function consultarProgressoGeral(alunoId) {
  try {
    const [alunoRes, missoesRes, conquistasRes] = await Promise.all([
      supabase.from('alunos').select('xp, nome, turmaId').eq('id', alunoId).maybeSingle(),
      supabase.from('alunos_missoes').select('id', { count: 'exact', head: true }).eq('aluno_id', alunoId).eq('status', 'aprovado'),
      supabase.from('conquistas').select('id', { count: 'exact', head: true }).eq('alunoId', alunoId),
    ])
    if (alunoRes.error) throw alunoRes.error
    if (missoesRes.error) throw missoesRes.error
    if (conquistasRes.error) throw conquistasRes.error

    return {
      xp: alunoRes.data?.xp || 0,
      nome: alunoRes.data?.nome || '',
      turmaId: alunoRes.data?.turmaId || null,
      missoesAprovadas: missoesRes.count || 0,
      conquistas: conquistasRes.count || 0,
    }
  } catch (error) {
    console.error('Erro ao consultar progresso geral do aluno:', error.message)
    return { xp: 0, nome: '', turmaId: null, missoesAprovadas: 0, conquistas: 0 }
  }
}

