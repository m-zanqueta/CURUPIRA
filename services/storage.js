import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

const TABELAS_ADMIN = new Set(['professores', 'alunos', 'pets', 'icones_missoes', 'acessorios'])
const CHAVE_SESSAO_APP = 'curupira_sessao_app'
// Token de sessão do aluno (emitido por login_aluno no Supabase). Fica separado
// do objeto de sessão para nunca ser copiado junto com os dados do aluno.
const CHAVE_TOKEN_ALUNO = 'curupira_token_aluno'

export async function salvarSessaoApp(sessao) {
  await AsyncStorage.setItem(CHAVE_SESSAO_APP, JSON.stringify(sessao))
}

export async function obterSessaoApp() {
  const valor = await AsyncStorage.getItem(CHAVE_SESSAO_APP)
  if (!valor) return null
  try {
    return JSON.parse(valor)
  } catch {
    await AsyncStorage.removeItem(CHAVE_SESSAO_APP)
    return null
  }
}

export async function limparSessaoApp() {
  // Revoga o token no servidor (best-effort, no máximo 3 s: logout offline não
  // pode travar). Sem rede o token continua válido até expirar (30 dias) — risco
  // residual documentado. O token NUNCA é logado.
  const token = await obterTokenAluno()
  if (token) {
    await Promise.race([
      supabase.rpc('logout_aluno', { p_token: token }).then(() => {}, () => {}),
      new Promise(resolve => setTimeout(resolve, 3000)),
    ])
  }
  await AsyncStorage.removeItem(CHAVE_TOKEN_ALUNO)
  await AsyncStorage.removeItem(CHAVE_SESSAO_APP)
}

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

  if (error) {
    if (error.code === '23503' && tabela === 'acessorios') {
      throw new Error('Este item já foi comprado por alunos e não pode ser excluído (o histórico é preservado). Desative-o (ativo = false) para tirá-lo da loja.')
    }
    throw error
  }
  if (!data) throw new Error('Nenhum registro foi excluído. Confira se ele ainda existe e se as políticas RLS permitem a exclusão.')
}

export async function listarTarefasAdmin() {
  const { data, error } = await supabase.from('missoes').select('*').order('id', { ascending: false })
  if (error) throw error
  return data || []
}

export async function salvarTarefaAdmin(tarefa) {
  const etapas = (tarefa.etapas || []).map((etapa, index) => ({
    titulo: String(etapa.titulo || '').trim(),
    xp: Number(etapa.xp),
    ordem: index + 1,
  }))
  const registro = {
    nome: String(tarefa.nome || '').trim(),
    descricao: String(tarefa.descricao || '').trim(),
    etapas,
    moedas: Number(tarefa.moedas) || 0,
    // As recompensas são lançadas etapa por etapa pelo banco; a aprovação final
    // da tarefa não deve creditar o total novamente.
    xp: 0,
    dificuldade: 'media',
    icone: tarefa.icone,
    ativa: tarefa.ativa ?? true,
    'professorId': null,
    'turmaId': null,
  }
  const query = tarefa.id
    ? supabase.from('missoes').update(registro).eq('id', tarefa.id)
    : supabase.from('missoes').insert([registro])
  const { data, error } = await query.select().single()
  if (error) throw error
  return data
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
    const { data, error } = await supabase.rpc('login_professor', {
      p_email: emailDigitado.trim().toLowerCase(),
      p_senha: senhaDigitada,
    })
    if (error) throw error
    return data
  } catch (error) {
    console.error('Erro ao buscar professor:', error.message)
    return null
  }
}

export async function buscarCoordenador(emailDigitado, senhaDigitada) {
  const { data, error } = await supabase.rpc('login_coordenador', {
    p_email: emailDigitado.trim().toLowerCase(),
    p_senha: senhaDigitada,
  })

  if (error) throw error
  return Array.isArray(data) ? data[0] || null : data || null
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
      estagio: 'infantil',
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
    estagio: 'infantil',
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

export async function listarTurmas(professorId, incluirTodas = false) {
  if (!professorId) return [];

  try {
    let consultaTurmas = supabase
      .from('turmas')
      .select('id, nome, codigo, professor_id, cor');
    if (!incluirTodas) consultaTurmas = consultaTurmas.eq('professor_id', professorId);
    const { data: turmas, error: turmasError } = await consultaTurmas;
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

export async function listarProfessoresParaTurma() {
  const { data, error } = await supabase
    .from('professores')
    .select('id, nome, email')
    .order('nome', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function listarPetsParaTurma() {
  const [petsResult, turmasResult] = await Promise.all([
    supabase
      .from('pets')
      .select('id, nome, icone, estagio, xp, emocao, cosmetico, turma_id')
      .order('id', { ascending: true }),
    supabase
      .from('turmas')
      .select('id, nome'),
  ]);

  if (petsResult.error) throw petsResult.error;
  if (turmasResult.error) throw turmasResult.error;

  const turmaPorId = new Map((turmasResult.data || []).map(turma => [String(turma.id), turma.nome]));

  // A coluna icone deve conter a URL pública da imagem no Supabase Storage.
  return (petsResult.data || [])
    .filter(pet => typeof pet.icone === 'string' && /^https?:\/\//i.test(pet.icone.trim()))
    .map(pet => ({
      ...pet,
      turmaNome: pet.turma_id == null ? null : turmaPorId.get(String(pet.turma_id)) || `Turma ${pet.turma_id}`,
      disponivel: pet.turma_id == null,
    }));
}

export async function salvarTurma(novaTurma) {
  if (!novaTurma?.professorId) {
    throw new Error('O ID do professor é necessário para criar uma turma.');
  }
  if (!novaTurma?.petId) {
    throw new Error('Selecione um PET disponível para criar a turma.');
  }

  const dadosTurma = {
    nome: novaTurma.nome,
    codigo: novaTurma.codigo,
    professor_id: novaTurma.professorId,
    cor: novaTurma.cor,
  };
  let { data: turmaData, error: turmaError } = await supabase
    .from('turmas').insert([dadosTurma]).select().single();

  // Compatibilidade com bancos onde a migration da cor da turma ainda não foi aplicada.
  const colunaCorAusente = turmaError && (
    turmaError.code === '42703' || turmaError.code === 'PGRST204'
  ) && /cor/i.test(turmaError.message || '');
  if (colunaCorAusente) {
    const dadosSemCor = { ...dadosTurma };
    delete dadosSemCor.cor;
    ({ data: turmaData, error: turmaError } = await supabase
      .from('turmas').insert([dadosSemCor]).select().single());
  }
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

export async function listarMissoes(professorId, incluirTodas = false) {
  if (!professorId) return [];
  let idsTarefasVisiveis = null
  if (!incluirTodas) {
    const { data: minhasTurmas, error: turmasError } = await supabase.from('turmas').select('id').eq('professor_id', professorId)
    if (turmasError) throw turmasError
    const idsTurmas = (minhasTurmas || []).map(t => t.id)
    const { data: vinculosProfessor, error: vinculosProfessorError } = idsTurmas.length
      ? await supabase.from('missoes_turmas').select('missao_id').in('turma_id', idsTurmas)
      : { data: [], error: null }
    if (vinculosProfessorError) throw vinculosProfessorError
    idsTarefasVisiveis = [...new Set((vinculosProfessor || []).map(v => String(v.missao_id)))]
  }
  let consultaMissoes = supabase.from('missoes').select('*')
  let data
  if (!incluirTodas) {
    const { data: minhasTarefas, error: minhasTarefasError } = await consultaMissoes.eq('professorId', professorId).order('id', { ascending: false })
    if (minhasTarefasError) throw minhasTarefasError
    const idsExistentes = new Set((minhasTarefas || []).map(m => String(m.id)))
    const idsExtras = (idsTarefasVisiveis || []).filter(id => !idsExistentes.has(id))
    const { data: tarefasGlobais, error: tarefasError } = idsExtras.length
      ? await supabase.from('missoes').select('*').in('id', idsExtras)
      : { data: [], error: null }
    if (tarefasError) throw tarefasError
    data = [...(minhasTarefas || []), ...(tarefasGlobais || [])].sort((a, b) => Number(b.id) - Number(a.id))
  } else {
    const { data: todas, error } = await consultaMissoes.order('id', { ascending: false })
    if (error) throw error
    data = todas
  }
  const ids = (data || []).map(m => m.id);
  const { data: vinculos, error: vinculosError } = ids.length
    ? await supabase.from('missoes_turmas').select('missao_id, turma_id, ativa').in('missao_id', ids)
    : { data: [], error: null };
  if (vinculosError) throw vinculosError;
  const porMissao = new Map();
  const statusPorMissao = new Map();
  (vinculos || []).forEach(v => {
    porMissao.set(String(v.missao_id), [...(porMissao.get(String(v.missao_id)) || []), v.turma_id]);
    statusPorMissao.set(String(v.missao_id), { ...(statusPorMissao.get(String(v.missao_id)) || {}), [String(v.turma_id)]: v.ativa ?? true });
  });
  return (data || []).map(m => ({ ...m, professorId: m.professorId, name: m.nome, icon: m.icone, active: m.ativa, turmaIds: porMissao.get(String(m.id)) || [], turmaAtivas: statusPorMissao.get(String(m.id)) || {} }));
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
  const atualizadas = await listarMissoes(missao.professorId);
  const salva = atualizadas.find(item => String(item.id) === String(id));
  if (!salva) throw new Error('A missão foi salva, mas não foi possível recarregar seus vínculos com as turmas.');
  return salva;
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

export async function atribuirTarefaGlobal(missaoId, turmaId) {
  const { error } = await supabase.from('missoes_turmas').insert([{ missao_id: missaoId, turma_id: turmaId, ativa: true }])
  if (error && error.code !== '23505') throw error
}

export async function definirAtivaMissaoTurma(missaoId, professorId, turmaId, ativa) {
  const { error } = await supabase.from('missoes_turmas').update({ ativa }).eq('missao_id', missaoId).eq('turma_id', turmaId)
  if (error) throw error;
}

export async function removerMissaoDaTurma(missaoId, professorId, turmaId) {
  const { error: progressoError } = await supabase.from('alunos_missoes').delete().eq('missao_id', missaoId).eq('turma_id', turmaId)
  if (progressoError) throw progressoError
  const { error } = await supabase.from('missoes_turmas').delete().eq('missao_id', missaoId).eq('turma_id', turmaId)
  if (error) throw error
}

export async function listarStatusMissoes() {
  const { data, error } = await supabase.from('alunos_missoes').select('aluno_id, missao_id, status, etapa_atual');
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

  // Login seguro: a senha é verificada no servidor (RPC login_aluno), que devolve
  // um token de sessão. Se a migration ainda não foi aplicada no banco, o RPC não
  // existe e caímos no login antigo (modo legado, inventário só local).
  try {
    const { data, error } = await supabase.rpc('login_aluno', { p_email: email.trim().toLowerCase(), p_senha: senha })
    if (!error) {
      if (!data) return null // e-mail ou senha incorretos
      await salvarTokenAluno(data.token)
      return data.aluno
    }
    // Só "função inexistente" (migration não aplicada) autoriza o modo legado. Qualquer outro erro
    // (rede, 429, permissão/schema) é reportado — nada de cair para o login antigo às cegas.
    if (!funcaoAusente(error)) throw erroNuvem(error)
  } catch (error) {
    if (error?.codigo) throw error
    throw Object.assign(new Error('rede'), { codigo: 'rede' })
  }

  // ── Modo legado (RPCs ainda não aplicadas) ──
  await AsyncStorage.removeItem(CHAVE_TOKEN_ALUNO)
  try {
    const { data, error } = await supabase
      .from('alunos')
      .select('*')
      .eq('email', email.trim().toLowerCase())
      .eq('senha', senha)
      .maybeSingle()

    if (error) throw error
    return data
  } catch (error) {
    console.log('Aluno não encontrado:', error.message)
    return null
  }
}

// Só verifica se o e-mail já existe (CriarPerfil). Não traz a linha inteira: ela inclui a senha.
export async function buscarUsuario(email) {
  try {
    const { data, error } = await supabase
      .from('alunos')
      .select('id, email')
      .eq('email', email.trim().toLowerCase())
      .limit(1)

    if (error) throw error
    return data?.[0] || null
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
        // 'initials' removido daqui
      }])
      .select()
      .single()

    if (error) {
      console.error('Erro no Supabase ao criar perfil:', error.message);
      return null;
    }
    
    return data || { email: dados.email.trim().toLowerCase() };
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
    return true
  } catch (error) {
    console.error('Erro ao atualizar aluno:', error.message)
    return false // quem precisa saber se gravou (ex: EntrarTurma) confere; os demais ignoram
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
// estão sendo salvos apenas no dispositivo físico (cache local) — não
// existe tabela de inventário no Supabase pra isso ainda.
//
// ⚠️ CORRIGIDO (Semana 42): a chave antiga 'itens_comprados' era GLOBAL
// no dispositivo — qualquer aluno que usasse o mesmo celular/navegador via
// o inventário de qualquer outro. Agora a chave é por aluno
// ('itens_comprados_<alunoId>'), exigindo alunoId. Isso é pré-requisito
// pra equipar com segurança (Tarefa 2 da Semana 42): sem isso, um aluno
// podia equipar item que outro aluno comprou.
function chaveComprados(alunoId) {
  if (!alunoId) throw new Error('listarItensComprados/comprarItem precisam de um alunoId.')
  return `itens_comprados_${alunoId}`
}

async function listarItensCompradosLocal(alunoId) {
  const dados = await AsyncStorage.getItem(chaveComprados(alunoId))
  return dados ? JSON.parse(dados) : []
}

async function comprarItemLocal(alunoId, itemId) {
  const itens = await listarItensCompradosLocal(alunoId)
  if (!itens.includes(itemId)) {
    itens.push(itemId)
    await AsyncStorage.setItem(chaveComprados(alunoId), JSON.stringify(itens))
  }
}

// ── Acessórios equipados no PET (Semana 42 — Tarefas 2 e 3) ─────────────
//
// Não existe coluna/tabela no Supabase real pra "o que está equipado
// agora" (só existem turmas.cor, pets.icone/estagio/xp e a tabela
// acessorios do catálogo da loja — ver migrations). Criar uma tabela nova
// só pra isso seria mudança de schema sem necessidade pra um protótipo, e
// a regra da tarefa é clara: se não existir persistência no banco pra
// isso, usar uma local compatível com o protótipo atual. Por isso isso
// aqui é AsyncStorage, igual aos itens comprados — e, IMPORTANTE: isso
// NÃO é sincronizado com o Supabase, só fica salvo neste dispositivo.
//
// A chave combina alunoId + petId (não só alunoId) porque o pet "atual"
// do aluno é o da turma dele — se ele trocar de turma (outro código),
// passa a ter outro pet, e o que estava equipado no pet antigo não deve
// vazar pro pet novo.
//
// Aluno SEM turma/pet carregado (turma null — ex: turma apagada ou falha ao
// buscá-la; a tela do pet mostra "Meu Pet"): antes isso retornava null e o
// que ele equipava sumia ao sair e voltar da loja. Agora usa a chave
// 'semturma' pra ele continuar persistindo (só neste dispositivo). Se o aluno
// entrar numa turma depois, passa a valer a chave daquele pet.
function chaveEquipados(alunoId, petId) {
  if (!alunoId) return null // sem aluno real (ex: atalho da loja) — nada pra persistir
  return `equipados_${alunoId}_${petId ?? 'semturma'}`
}

// fundo = cenário (slot 'fundo' do catálogo de acessórios).
const EQUIPADOS_PADRAO = { chapeu: null, colar: null, fundo: null }

async function listarEquipadosLocal(alunoId, petId) {
  const chave = chaveEquipados(alunoId, petId)
  if (!chave) return { ...EQUIPADOS_PADRAO }
  try {
    const dados = await AsyncStorage.getItem(chave)
    return dados ? { ...EQUIPADOS_PADRAO, ...JSON.parse(dados) } : { ...EQUIPADOS_PADRAO }
  } catch (error) {
    console.error('Erro ao ler acessórios equipados:', error.message)
    return { ...EQUIPADOS_PADRAO }
  }
}

// slot: 'chapeu' | 'colar' | 'fundo'. itemId: id do acessório, ou null pra desequipar.
//
// As escritas de uma mesma chave são ENFILEIRADAS: o ciclo ler → mesclar →
// gravar não é atômico, então duas chamadas seguidas (ex: trocar chapéu e
// cenário rápido) liam o mesmo estado antigo e uma sobrescrevia a outra.
// Se a LEITURA falhar, não grava nada (antes gravaria só o slot novo sobre
// os valores padrão, apagando os outros slots salvos).
const filaEquipados = new Map()

function atualizarEquipadoLocal(alunoId, petId, slot, itemId) {
  const chave = chaveEquipados(alunoId, petId)
  if (!chave) return Promise.resolve() // sem aluno identificado — equipar fica só na sessão, não persiste
  const anterior = filaEquipados.get(chave) || Promise.resolve()
  const proxima = anterior.catch(() => {}).then(async () => {
    const dados = await AsyncStorage.getItem(chave) // se falhar, rejeita e não grava
    let atuais = { ...EQUIPADOS_PADRAO }
    try { if (dados) atuais = { ...EQUIPADOS_PADRAO, ...JSON.parse(dados) } } catch { /* JSON corrompido: recomeça do padrão */ }
    const novos = { ...atuais, [slot]: itemId }
    await AsyncStorage.setItem(chave, JSON.stringify(novos))
    return novos
  })
  filaEquipados.set(chave, proxima)
  return proxima
}

// ── Persistência em nuvem: inventário, saldo e equipados por aluno ─────────
//
// Fonte da verdade = Supabase (tabelas alunos_itens / alunos_equipados, só
// acessíveis por RPC — ver supabase/migrations/20261016_*.sql). A identidade vem
// do TOKEN de sessão emitido por login_aluno; o app nunca envia "aluno_id".
// Sem token (aluno do atalho 'loja', ou banco ainda sem a migration = modo
// legado) tudo continua funcionando só com o armazenamento local de antes.
//
// Em modo nuvem NÃO há fallback silencioso para o local: falha de rede vira
// erro (com .codigo = 'rede') para a tela tratar, senão os dispositivos
// divergiriam sem ninguém perceber.

async function obterTokenAluno() {
  try { return await AsyncStorage.getItem(CHAVE_TOKEN_ALUNO) } catch { return null }
}
async function salvarTokenAluno(token) {
  await AsyncStorage.setItem(CHAVE_TOKEN_ALUNO, token)
}
export async function temTokenAluno() {
  return !!(await obterTokenAluno())
}

// Códigos de erro (e.codigo) que o app distingue:
//   erros de regra do servidor (CODIGOS_NUVEM), 'sessao_invalida' (token ausente/expirado/revogado),
//   'muitas_tentativas' (HTTP 429), 'rede' (sem resposta / erro transitório do gateway),
//   'configuracao' (o servidor respondeu com erro de schema/permissão: migration incompleta, GRANT, RLS...),
//   'migration_ausente' (as funções da migration não existem no banco).
const CODIGOS_NUVEM = new Set([
  'saldo_insuficiente', 'item_indisponivel', 'item_nao_comprado', 'sessao_invalida',
  'muitas_tentativas', 'slot_invalido', 'slot_incompativel', 'pet_fora_da_turma_do_aluno',
  'lista_grande_demais',
])
function erroNuvem(error) {
  const msg = error?.message || ''
  let codigo
  if (CODIGOS_NUVEM.has(msg)) codigo = msg
  else if (error?.code === 'PT401') codigo = 'sessao_invalida'
  else if (error?.code === 'PT429') codigo = 'muitas_tentativas'
  else if (funcaoAusente(error)) codigo = 'migration_ausente'
  // O PostgREST devolveu um código SQL/PGRST (ex.: 42501 permissão, 42703 coluna, PGRST1xx/3xx):
  // é configuração/segurança, não "internet fora" — não deve ser tratado como falha transitória.
  else if (error?.code && !/^(08|57|53|PGRST00[0-3])/.test(String(error.code))) codigo = 'configuracao'
  else codigo = 'rede'
  const e = new Error(codigo)
  e.codigo = codigo
  e.detalhe = error?.code || null // só o código, nunca mensagem/credenciais
  return e
}
// PostgREST responde PGRST202 (HTTP 404) quando a função RPC não existe no banco.
function funcaoAusente(error) {
  return error?.code === 'PGRST202' || error?.code === '42883' ||
    /could not find the function/i.test(error?.message || '')
}

// Sessão inválida/expirada/revogada no servidor: o App registra aqui o que fazer
// (limpar estado e voltar ao login).
let ouvinteSessaoInvalida = null
export function aoSessaoInvalida(fn) {
  ouvinteSessaoInvalida = fn
  return () => { if (ouvinteSessaoInvalida === fn) ouvinteSessaoInvalida = null }
}

async function rpcAluno(nome, args = {}) {
  const token = await obterTokenAluno()
  if (!token) throw Object.assign(new Error('sessao_invalida'), { codigo: 'sessao_invalida' })
  const { data, error } = await supabase.rpc(nome, { p_token: token, ...args })
  if (error) {
    const e = erroNuvem(error)
    // migration_ausente com token: a migration foi desfeita no banco; o token não vale mais.
    if (e.codigo === 'sessao_invalida' || e.codigo === 'migration_ausente') {
      await AsyncStorage.removeItem(CHAVE_TOKEN_ALUNO).catch(() => {})
      ouvinteSessaoInvalida?.()
    }
    throw e
  }
  return data
}

async function usaNuvem(alunoId) {
  return alunoId != null && alunoId !== 'loja' && await temTokenAluno()
}

// O banco já tem a migration? Sonda com um token falso:
//   'disponivel'  = a função existe (respondeu PT401);
//   'ausente'     = PGRST202/42883 (migration não aplicada => modo legado);
//   'configuracao'= o servidor respondeu com erro de schema/permissão (NÃO cair em modo legado às cegas);
//   'rede'        = sem resposta / erro transitório (não sei; tenta de novo na próxima vez).
// Só 'disponivel' e 'ausente' ficam em cache.
let sondaNuvem = null
export function estadoNuvemServidor() {
  if (!sondaNuvem) {
    sondaNuvem = supabase.rpc('obter_estado_loja', { p_token: '0'.repeat(40) })
      .then(({ error }) => {
        if (!error) return 'disponivel'
        const e = erroNuvem(error)
        if (e.codigo === 'sessao_invalida') return 'disponivel'
        if (e.codigo === 'migration_ausente') return 'ausente'
        sondaNuvem = null
        return e.codigo === 'configuracao' ? 'configuracao' : 'rede'
      }, () => { sondaNuvem = null; return 'rede' })
  }
  return sondaNuvem
}
export async function nuvemDisponivel() {
  return (await estadoNuvemServidor()) === 'disponivel'
}

// ── Migração do que já existe no dispositivo (localStorage/AsyncStorage) ──
// Importa para a nuvem (importar_estado_local é idempotente e limitada pelo
// saldo), RECONCILIA (cada item local precisa estar no inventário da nuvem ou
// ter sido rejeitado com motivo) e só então move as chaves locais para
// "backup_<chave>" (nunca apaga o backup) e grava a marca migrado_nuvem_<id>.
// Qualquer falha antes disso deixa o local intacto e tenta de novo depois.
const SLOTS_EQUIPAVEIS = ['chapeu', 'colar', 'fundo']
function idsLocais(bruto) {
  try {
    const lista = JSON.parse(bruto || '[]')
    if (!Array.isArray(lista)) return []
    return [...new Set(lista.map(Number).filter(n => Number.isInteger(n) && n > 0))]
  } catch { return [] }
}

async function migrarLocalParaNuvem(alunoId) {
  const chaveMarca = `migrado_nuvem_${alunoId}`
  if (await AsyncStorage.getItem(chaveMarca)) return

  const brutoItens = await AsyncStorage.getItem(chaveComprados(alunoId))
  const itens = idsLocais(brutoItens)
  const prefixo = `equipados_${alunoId}_`
  const chavesEq = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(prefixo))
  const equipados = []
  const chavesMigraveis = [] // só as de PET real; 'semturma' não tem pet na nuvem e fica como está
  for (const chave of chavesEq) {
    const petId = Number(chave.slice(prefixo.length)) // 'semturma' => NaN => ignorado
    if (!Number.isInteger(petId)) continue
    chavesMigraveis.push(chave)
    let dados = {}
    try { dados = JSON.parse(await AsyncStorage.getItem(chave) || '{}') } catch { /* ignora */ }
    for (const slot of SLOTS_EQUIPAVEIS) {
      const id = Number(dados?.[slot])
      if (dados?.[slot] != null && Number.isInteger(id) && id > 0) equipados.push({ pet_id: petId, slot, acessorio_id: id })
    }
  }

  const agora = new Date().toISOString()
  if (!itens.length && !equipados.length && brutoItens == null && chavesMigraveis.length === 0) {
    await AsyncStorage.setItem(chaveMarca, JSON.stringify({ em: agora, vazio: true }))
    return
  }

  const resultado = await rpcAluno('importar_estado_local', { p_itens: itens, p_equipados: equipados })
  const estado = await rpcAluno('obter_estado_loja')

  const naNuvem = new Set((estado.comprados || []).map(Number))
  const rejeitados = new Map((resultado.rejeitados || []).map(r => [Number(r.id), r.motivo]))
  const naoConciliados = itens.filter(id => !naNuvem.has(id) && !rejeitados.has(id))
  if (naoConciliados.length) {
    throw Object.assign(new Error('Importação não conciliada'), { codigo: 'reconciliacao' })
  }
  const equipadosNuvem = new Set((estado.equipados || []).map(e => `${e.pet_id}:${e.slot}`))
  const equipadosNaoMigrados = equipados.filter(e => !equipadosNuvem.has(`${e.pet_id}:${e.slot}`)).length

  // Só aqui o local é substituído — e sempre com backup.
  for (const chave of [chaveComprados(alunoId), ...chavesMigraveis]) {
    const valor = await AsyncStorage.getItem(chave)
    if (valor == null) continue
    await AsyncStorage.setItem(`backup_${chave}`, valor)
    await AsyncStorage.removeItem(chave)
  }
  await AsyncStorage.setItem(chaveMarca, JSON.stringify({
    em: agora,
    importados: resultado.importados || [],
    rejeitados: resultado.rejeitados || [],
    equipados_importados: resultado.equipados_importados || 0,
    equipados_nao_migrados: equipadosNaoMigrados,
  }))
}

const migracoes = new Map()
const falhasMigracao = new Map() // alunoId -> { estado, codigo }
// Nunca rejeita: se falhar, registra o MOTIVO (obterEstadoMigracao) e libera nova tentativa na próxima chamada.
// Os dados locais só são movidos para backup depois da conciliação (ver migrarLocalParaNuvem).
export function garantirMigracaoLocal(alunoId) {
  const k = String(alunoId)
  if (!migracoes.has(k)) {
    migracoes.set(k, migrarLocalParaNuvem(alunoId).then(() => { falhasMigracao.delete(k) }).catch(e => {
      migracoes.delete(k)
      const codigo = e?.codigo || 'desconhecido'
      const estado = codigo === 'rede' ? 'pendente_rede'
        : codigo === 'sessao_invalida' ? 'pendente_sessao'
        : (codigo === 'configuracao' || codigo === 'migration_ausente') ? 'pendente_configuracao'
        : codigo === 'reconciliacao' ? 'pendente_reconciliacao'
        : 'pendente'
      falhasMigracao.set(k, { estado, codigo })
      console.error('Migração do inventário local pendente:', estado, codigo)
    }))
  }
  return migracoes.get(k)
}

// Resultado da migração deste dispositivo (itens rejeitados por saldo etc.), p/ aviso na UI.
export async function obterResultadoMigracao(alunoId) {
  try {
    const bruto = await AsyncStorage.getItem(`migrado_nuvem_${alunoId}`)
    return bruto ? JSON.parse(bruto) : null
  } catch { return null }
}

// Estado explícito da migração local→nuvem deste aluno neste dispositivo:
//   'concluida'                 importada e conciliada; nada pendente
//   'concluida_com_pendencias'  conciliada, mas houve itens/equipados NÃO migrados (saldo, item desativado,
//                               conflito com a nuvem): continuam em backup_<chave> neste dispositivo
//   'pendente_rede' | 'pendente_sessao' | 'pendente_configuracao' | 'pendente_reconciliacao' | 'pendente'
//                               a importação não foi confirmada; o local está INTACTO e será tentado de novo
//   'nao_iniciada'              ainda não houve tentativa nesta execução
export async function obterEstadoMigracao(alunoId) {
  const marca = await obterResultadoMigracao(alunoId)
  if (marca) {
    const pend = (marca.rejeitados?.length || 0) + (marca.equipados_nao_migrados || 0)
    return { estado: pend ? 'concluida_com_pendencias' : 'concluida', pendencias: pend, detalhe: marca }
  }
  const f = falhasMigracao.get(String(alunoId))
  return f ? { estado: f.estado, codigo: f.codigo, pendencias: 0 } : { estado: 'nao_iniciada', pendencias: 0 }
}

async function estadoNuvem(alunoId) {
  await garantirMigracaoLocal(alunoId)
  return rpcAluno('obter_estado_loja')
}

// { nuvem, comprados:[ids], saldo } — saldo vem do servidor (null no modo local).
export async function carregarEstadoLoja(alunoId) {
  if (!(await usaNuvem(alunoId))) {
    // 'servidor' diz à tela se este modo local é o legado esperado ('ausente') ou um estado a avisar
    // (sessão sem token com a nuvem disponível/instável): nesse caso as compras NÃO estão sincronizadas.
    const servidor = alunoId == null || alunoId === 'loja' ? 'ausente' : await estadoNuvemServidor()
    return { nuvem: false, comprados: await listarItensCompradosLocal(alunoId), saldo: null, servidor }
  }
  const e = await estadoNuvem(alunoId)
  return { nuvem: true, comprados: (e.comprados || []).map(Number), saldo: Number(e.saldo), migracao: await obterEstadoMigracao(alunoId) }
}

export async function listarItensComprados(alunoId) {
  return (await carregarEstadoLoja(alunoId)).comprados
}

// Compra atômica no servidor. Recompra é idempotente (jaPossuia:true, sem cobrar).
// Erros: .codigo = 'saldo_insuficiente' | 'item_indisponivel' | 'sessao_invalida' | 'rede'.
export async function comprarItem(alunoId, itemId) {
  if (!(await usaNuvem(alunoId))) {
    await comprarItemLocal(alunoId, itemId)
    return { saldo: null, jaPossuia: false }
  }
  await garantirMigracaoLocal(alunoId)
  const r = await rpcAluno('comprar_acessorio', { p_acessorio_id: itemId })
  return { saldo: Number(r.saldo), jaPossuia: !!r.ja_possuia }
}

export async function listarEquipados(alunoId, petId) {
  if (petId == null || !(await usaNuvem(alunoId))) return listarEquipadosLocal(alunoId, petId)
  const e = await estadoNuvem(alunoId)
  const res = { ...EQUIPADOS_PADRAO }
  for (const x of e.equipados || []) {
    if (String(x.pet_id) === String(petId) && x.slot in res) res[x.slot] = Number(x.acessorio_id)
  }
  return res
}

// Escritas do mesmo aluno+pet entram numa fila: a troca rápida de acessórios
// chega ao servidor na mesma ordem em que o usuário clicou.
const filaNuvem = new Map()
export function atualizarEquipado(alunoId, petId, slot, itemId) {
  if (!alunoId) return Promise.resolve() // sem aluno identificado — só na sessão
  const chave = `${alunoId}_${petId}`
  const anterior = filaNuvem.get(chave) || Promise.resolve()
  const proxima = anterior.catch(() => {}).then(async () => {
    if (petId == null || !(await usaNuvem(alunoId))) return atualizarEquipadoLocal(alunoId, petId, slot, itemId)
    await garantirMigracaoLocal(alunoId)
    await rpcAluno('equipar_acessorio', { p_pet_id: petId, p_slot: slot, p_acessorio_id: itemId })
  })
  filaNuvem.set(chave, proxima)
  return proxima
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
      supabase.from('pets').select('id, nome, icone, estagio, xp, emocao, cosmetico').eq('turma_id', turmaId).maybeSingle(),
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
      petNome: pet?.nome || null, // espécie do pet (ver detectarCfg em PetScreen.js)
      estagio: pet?.estagio || 'Filhote',
      xp: Number(pet?.xp) || 0,
      progresso: 0,
      emocao: pet?.emocao || '😐',
      cosmetico: pet?.cosmetico || null,
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
      .from('missoes_turmas').select('missao_id').eq('turma_id', aluno.turmaId).eq('ativa', true)
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

