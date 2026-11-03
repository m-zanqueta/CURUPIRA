import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

const TABELAS_ADMIN = new Set(['professores', 'alunos', 'pets', 'icones_missoes', 'acessorios'])  // lista fechada TAMBÉM no servidor (admin_*)
const CHAVE_SESSAO_APP = 'curupira_sessao_app'
// Token de sessão do aluno (emitido por login_aluno no Supabase). Fica separado
// do objeto de sessão para nunca ser copiado junto com os dados do aluno.
const CHAVE_TOKEN_ALUNO = 'curupira_token_aluno'
// Token de sessão de PROFESSOR/COORDENADOR/ADMIN (emitido por login_staff). O papel NUNCA é confiado ao JSON
// da sessão local: cada RPC de staff valida o token no servidor e deriva papel e id dele.
const CHAVE_TOKEN_STAFF = 'curupira_token_staff'

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
  const tokenStaff = await obterTokenStaff()
  if (tokenStaff) {
    await Promise.race([
      supabase.rpc('logout_staff', { p_token: tokenStaff }).then(() => {}, () => {}),
      new Promise(resolve => setTimeout(resolve, 3000)),
    ])
  }
  await AsyncStorage.removeItem(CHAVE_TOKEN_ALUNO)
  await AsyncStorage.removeItem(CHAVE_TOKEN_STAFF)
  await AsyncStorage.removeItem(CHAVE_SESSAO_APP)
}

export async function listarDadosAdmin(tabela) {
  if (!TABELAS_ADMIN.has(tabela)) throw new Error('Tabela não permitida para edição administrativa.')
  const dados = await rpcStaff('admin_listar', { p_tabela: tabela })
  // alunos/professores nunca trazem senha; o campo "senha" do painel vira "nova senha" (vazio = manter)
  return (dados || []).map(r => (tabela === 'professores' || tabela === 'alunos') ? { ...r, senha: '' } : r)
}

export async function atualizarDadoAdmin(tabela, id, dados) {
  if (!TABELAS_ADMIN.has(tabela)) throw new Error('Tabela não permitida para edição administrativa.')
  if (id === null || id === undefined) throw new Error('O registro não possui um ID válido.')
  const { senha, ...resto } = dados || {}
  if (Object.keys(resto).length) await rpcStaff('admin_atualizar', { p_tabela: tabela, p_id: id, p_dados: resto })
  if (typeof senha === 'string' && senha !== '') await rpcStaff('admin_definir_senha', { p_tabela: tabela, p_id: id, p_senha: senha })
}

export async function excluirDadoAdmin(tabela, id) {
  if (!TABELAS_ADMIN.has(tabela)) throw new Error('Tabela não permitida para edição administrativa.')
  if (id === null || id === undefined) throw new Error('O registro não possui um ID válido.')
  try {
    await rpcStaff('admin_excluir', { p_tabela: tabela, p_id: id })
  } catch (error) {
    if (error.code === '23503' && tabela === 'acessorios') {
      throw new Error('Este item já foi comprado por alunos e não pode ser excluído (o histórico é preservado). Desative-o (ativo = false) para tirá-lo da loja.')
    }
    throw error
  }
}

export async function listarTarefasAdmin() {
  // Leitura por RPC (papel e escopo vêm do token; só o admin usa esta tela). Sem leitura direta da tabela.
  const lista = (await rpcStaff('staff_listar_missoes')) || []
  return lista.map(({ vinculos, ...missao }) => missao)
}

// Tarefa GLOBAL (etapas + moedas): criar/editar é só do administrador e é validado no servidor (staff_salvar_tarefa_global).
// O cliente não define dono, xp total, dificuldade nem turma (o servidor fixa xp=0: o XP vem das etapas, uma única vez).
export async function salvarTarefaAdmin(tarefa) {
  const etapas = (tarefa.etapas || []).map(etapa => ({ titulo: String(etapa.titulo || '').trim(), xp: Number(etapa.xp) }))
  return rpcStaff('staff_salvar_tarefa_global', {
    p_missao_id: tarefa.id ?? null,
    p_nome: String(tarefa.nome || '').trim(),
    p_descricao: String(tarefa.descricao || '').trim(),
    p_etapas: etapas,
    p_moedas: Number(tarefa.moedas) || 0,
    p_icone: tarefa.icone ?? null,
    p_ativa: tarefa.ativa ?? true,
  })
}

// ── Init ─────────────────────────────────────────────────

// Como os dados agora são reais e estão na nuvem, não precisamos mais 
// criar os dados padrão no AsyncStorage na inicialização.
export async function inicializarProfessores() {
  console.log('App conectado ao Supabase. Inicialização local ignorada.')
}

// ── Professores ───────────────────────────────────────────

// Compatibilidade: login de professor/coordenador/admin agora é UMA chamada de servidor (loginStaff).
export async function buscarProfessor(emailDigitado, senhaDigitada) {
  return loginStaff(emailDigitado, senhaDigitada)
}

// Compatibilidade: o coordenador também entra por login_staff (papel decidido pelo servidor).
export async function buscarCoordenador(emailDigitado, senhaDigitada) {
  return loginStaff(emailDigitado, senhaDigitada)
}

export async function salvarProfessor(dados) {
  const r = await rpcStaff('admin_inserir', { p_tabela: 'professores', p_dados: {
    nome: dados.nome.trim(), email: dados.email.trim().toLowerCase(), senha: dados.senha } })
  return r
}

// ── Imagens (pets-images) — TODA escrita/remoção passa pela Edge Function "imagens-admin" ─────────────────
// O app NÃO grava nem apaga no Storage com a chave anon (sem fallback: se a função falhar, a operação falha com a mensagem do servidor).
// O servidor valida token + papel admin + tipo REAL do arquivo + tamanho e GERA o nome do objeto; o app só recebe o caminho e a URL pública.
const TEXTOS_IMAGEM = {
  sessao_invalida: 'Sua sessão expirou. Entre novamente.',
  sem_permissao: 'Somente o administrador pode enviar ou remover imagens.',
  objeto_em_uso: 'Esta imagem está em uso e não pode ser removida.',
  pedido_invalido: 'Pedido de imagem inválido.',
  arquivo_grande: 'A imagem excede o limite de 2 MB.',
  tipo_nao_suportado: 'Formato não permitido. Use PNG, JPEG, WEBP ou GIF.',
  tipo_divergente: 'O conteúdo do arquivo não corresponde ao formato informado.',
  arquivo_invalido: 'Arquivo de imagem inválido.',
  muitas_tentativas: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
}

async function chamarImagensAdmin({ operacao, pasta, blob, nomeArquivo, caminho }) {
  const token = await obterTokenStaff()
  if (!token) {
    const e = new Error(TEXTOS_STAFF.sessao_invalida); e.codigo = 'sessao_invalida'
    ouvinteSessaoInvalida?.()
    throw e
  }
  const form = new FormData()
  form.append('token', token)
  form.append('operacao', operacao)
  form.append('pasta', pasta)
  if (caminho) form.append('caminho', caminho)
  if (blob) form.append('arquivo', blob, nomeArquivo || 'imagem')
  let resposta
  try { resposta = await supabase.functions.invoke('imagens-admin', { body: form }) }
  catch { const e = new Error(TEXTOS_STAFF.rede); e.codigo = 'rede'; throw e }
  if (resposta.error || !resposta.data?.ok) {
    let codigo = 'falha_no_servidor'
    try { const corpo = await resposta.error?.context?.json?.(); if (corpo?.erro) codigo = corpo.erro } catch {}
    if (codigo === 'falha_no_servidor' && resposta.data?.erro) codigo = resposta.data.erro
    const e = new Error(TEXTOS_IMAGEM[codigo] || 'Não foi possível processar a imagem agora. Tente novamente.')
    e.codigo = codigo
    if (codigo === 'sessao_invalida') { await AsyncStorage.removeItem(CHAVE_TOKEN_STAFF).catch(() => {}); ouvinteSessaoInvalida?.() }
    throw e
  }
  return resposta.data
}

async function enviarImagemAdmin(imagem, pasta) {
  if (!imagem) throw new Error('Selecione uma imagem para enviar.')
  const resposta = await fetch(imagem.uri)
  if (!resposta.ok) throw new Error('Não foi possível ler a imagem selecionada.')
  const blob = await resposta.blob()
  const dados = await chamarImagensAdmin({ operacao: 'upload', pasta, blob, nomeArquivo: imagem.fileName || 'imagem' })
  const { data: urlPublica } = supabase.storage.from('pets-images').getPublicUrl(dados.caminho)   // só monta a URL pública (não depende de política)
  return { path: dados.caminho, url: urlPublica.publicUrl }
}

// Limpeza best-effort quando o registro no banco falha depois do upload: o objeto ainda não está em uso, então o servidor permite remover.
// Se a limpeza também falhar, o objeto fica órfão (inofensivo, não referenciado) — registrado no console para a manutenção.
async function descartarImagemEnviada(pasta, caminho) {
  try { await chamarImagensAdmin({ operacao: 'remover', pasta, caminho }) }
  catch (e) { console.warn('Imagem órfã no Storage (não foi possível remover agora):', caminho, e?.codigo) }
}

export async function salvarPetAdmin(dados) {
  if (!dados?.imagem) throw new Error('Selecione uma imagem para o PET.')
  const imagem = await enviarImagemAdmin(dados.imagem, 'pets')
  const registro = { nome: dados.nome.trim(), icone: imagem.url, estagio: 'infantil', xp: 0, emocao: null, turma_id: null }
  try {
    await rpcStaff('admin_inserir', { p_tabela: 'pets', p_dados: registro })
  } catch (error) {
    await descartarImagemEnviada('pets', imagem.path)
    throw error
  }
  return registro
}

export async function salvarIconeMissao(dados) {
  const imagem = await enviarImagemAdmin(dados.imagem, 'icones-missoes')
  const registro = { nome: dados.nome.trim(), icone: imagem.url, ativo: true }
  try {
    await rpcStaff('admin_inserir', { p_tabela: 'icones_missoes', p_dados: registro })
  } catch (error) {
    await descartarImagemEnviada('icones-missoes', imagem.path)
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
  try {
    await rpcStaff('admin_inserir', { p_tabela: 'acessorios', p_dados: registro })
  } catch (error) {
    await descartarImagemEnviada('acessorios', imagem.path)
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
    // O servidor decide o escopo pelo TOKEN (professor: as próprias turmas; coordenação/admin: todas). Os parâmetros
    // professorId/incluirTodas só existem por compatibilidade com as telas e NÃO são enviados nem usados como autorização.
    const turmas = (await rpcStaff('staff_listar_turmas')) || [];
    return turmas.map(turma => {
      const pet = turma.pet || null;
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
  return (await rpcStaff('staff_listar_professores')) || []
}

export async function listarPetsParaTurma() {
  const pets = (await rpcStaff('staff_listar_pets')) || [];

  // A coluna icone deve conter a URL pública da imagem no Supabase Storage.
  return pets
    .filter(pet => typeof pet.icone === 'string' && /^https?:\/\//i.test(pet.icone.trim()))
    .map(({ turma_nome, ...pet }) => ({
      ...pet,
      turmaNome: pet.turma_id == null ? null : turma_nome || `Turma ${pet.turma_id}`,
      disponivel: pet.turma_id == null,
    }));
}

export async function salvarTurma(novaTurma) {
  if (!novaTurma?.professorId) throw new Error('O ID do professor é necessário para criar uma turma.');
  if (!novaTurma?.petId) throw new Error('Selecione um PET disponível para criar a turma.');
  // Turma + vínculo do PET numa única transação no servidor (sem "turma parcial"); só coordenador/admin.
  return rpcStaff('staff_criar_turma', {
    p_nome: novaTurma.nome, p_codigo: novaTurma.codigo, p_professor_id: novaTurma.professorId,
    p_cor: novaTurma.cor ?? null, p_pet_id: novaTurma.petId,
  });
}

export async function removerTurmaStorage(id, _professorId) {
  // O dono vem do token (professor: só a própria turma; admin: qualquer). O 2º parâmetro é ignorado de propósito.
  await rpcStaff('staff_excluir_turma', { p_turma_id: id })
}

// ── Missões e Conquistas (NOVOS) ─────────────────────────────────────────

export async function listarMissoes(professorId, incluirTodas = false) {
  if (!professorId) return [];
  // Escopo definido no servidor pelo TOKEN (professor: suas tarefas e as ligadas às suas turmas; coordenação/admin: todas).
  // professorId/incluirTodas não são enviados e não autorizam nada.
  const data = (await rpcStaff('staff_listar_missoes')) || [];
  return data.map(({ vinculos, ...m }) => {
    const lista = vinculos || [];
    const turmaAtivas = {};
    lista.forEach(v => { turmaAtivas[String(v.turma_id)] = v.ativa ?? true; });
    return { ...m, professorId: m.professorId, name: m.nome, icon: m.icone, active: m.ativa, turmaIds: lista.map(v => v.turma_id), turmaAtivas };
  });
}

export async function listarIconesMissoes() {
  const { data, error } = await supabase.from('icones_missoes').select('id, nome, icone').eq('ativo', true).order('id');
  if (error) throw error;
  return data || [];
}

export async function salvarMissao(missao) {
  const id = await rpcStaff('staff_salvar_missao', {
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
  const atualizadas = await listarMissoes(missao.professorId);
  const salva = atualizadas.find(item => String(item.id) === String(id));
  if (!salva) throw new Error('A missão foi salva, mas não foi possível recarregar seus vínculos com as turmas.');
  return salva;
}

export async function atualizarMissao(id, dados) {
  // Só edição completa (nome/turmas) passa por aqui; não há escrita direta em "missoes" pelo cliente.
  if (dados.nome !== undefined || dados.turmasIds !== undefined) return salvarMissao({ ...dados, id })
  throw new Error('Operação não suportada: a missão só pode ser editada por salvarMissao (servidor).')
}

export async function definirTurmasMissao(id, professorId, turmasIds) {
  await rpcStaff('staff_definir_turmas_missao', { p_missao_id: id, p_professor_id: professorId, p_turmas_ids: turmasIds })
}

export async function atribuirTarefaGlobal(missaoId, turmaId) {
  await rpcStaff('staff_atribuir_tarefa_global', { p_missao_id: missaoId, p_turma_id: turmaId })
}

export async function definirAtivaMissaoTurma(missaoId, professorId, turmaId, ativa) {
  await rpcStaff('staff_definir_ativa_missao_turma', {
    p_missao_id: missaoId, p_professor_id: professorId, p_turma_id: turmaId, p_ativa: ativa,
  })
}

export async function removerMissaoDaTurma(missaoId, professorId, turmaId) {
  await rpcStaff('staff_remover_missao_da_turma', { p_missao_id: missaoId, p_professor_id: professorId, p_turma_id: turmaId })
}

export async function listarStatusMissoes() {
  // Progresso dos alunos visível ao staff conforme o papel (professor: só os alunos das próprias turmas) — decidido no servidor.
  return (await rpcStaff('staff_listar_status_missoes')) || [];
}

export async function removerMissaoStorage(id) {
  await rpcStaff('staff_excluir_missao', { p_missao_id: id })
}

// ── Alunos ────────────────────────────────────────────────

export async function listarAlunos() {
  try {
    return (await rpcStaff('staff_listar_alunos')) || []
  } catch (error) {
    console.error('Erro ao listar alunos:', error.message)
    if (error.codigo === 'sessao_invalida') throw error
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

  // Sem a migration não existe mais login direto na tabela (ele mandava a senha na URL e exigia leitura anônima
  // de alunos.senha). A função ausente é erro explícito: aplique a migration V3 antes de publicar o app.
  await AsyncStorage.removeItem(CHAVE_TOKEN_ALUNO)
  throw Object.assign(new Error('migration_ausente'), { codigo: 'migration_ausente' })
}

export async function buscarUsuario(email) {
  try {
    const { data, error } = await supabase.rpc('email_aluno_existe', { p_email: email.trim().toLowerCase() })
    if (error) throw error
    return data ? { email: email.trim().toLowerCase() } : null
  } catch (error) {
    return null
  }
}

// Cadastro de aluno: o servidor valida e cria (xp=0, sem turma). O cliente não envia xp/turma/id.
// Lança Error com .codigo em caso de falha (antes: engolia o erro e o app mostrava "sucesso").
export async function salvarUsuario(dados) {
  let resposta
  try {
    resposta = await supabase.rpc('cadastrar_aluno', {
      p_nome: dados.usuario, p_email: dados.email.toLowerCase().trim(), p_senha: dados.senha })
  } catch { const e = new Error(TEXTOS_STAFF.rede); e.codigo = 'rede'; throw e }
  if (resposta.error) throw erroStaff(resposta.error)
  if (resposta.data?.erro) { const e = new Error(TEXTOS_STAFF[resposta.data.erro] || resposta.data.erro); e.codigo = resposta.data.erro; throw e }
  return resposta.data
}

// Atualizações de aluno feitas pelo STAFF, em lista fechada: só nome/iniciais ou remover da turma.
// Qualquer outro campo (xp, senha, e-mail, turma != null) é recusado no cliente E não existe no servidor.
export async function atualizarAluno(id, novos) {
  try {
    const chaves = Object.keys(novos || {})
    if (chaves.length && chaves.every(c => c === 'nome' || c === 'initials')) {
      await rpcStaff('staff_atualizar_aluno', { p_aluno_id: id, p_nome: novos.nome, p_initials: novos.initials ?? '' })
    } else if (chaves.length === 1 && chaves[0] === 'turmaId' && novos.turmaId === null) {
      await rpcStaff('staff_remover_aluno_da_turma', { p_aluno_id: id })
    } else {
      throw new Error('Atualização não suportada para aluno.')
    }
    return true
  } catch (error) {
    console.error('Erro ao atualizar aluno:', error.message)
    return false
  }
}

// O próprio aluno entra na turma pelo código (a turma e o aluno são decididos no servidor).
// Retorna { turma } ou lança Error com .codigo (codigo_invalido, turma_sem_pet, ja_em_turma, muitas_tentativas, ...).
export async function entrarNaTurma(codigo) {
  const r = await rpcAluno('entrar_na_turma', { p_codigo: String(codigo || '').trim() })
  if (r?.erro) {
    const textos = { codigo_invalido: 'Código inválido. Verifique com seu professor.',
      turma_sem_pet: 'Essa turma ainda não tem pet configurado. Fale com seu professor.',
      ja_em_turma: 'Você já está em uma turma. Peça ao seu professor para removê-lo antes de trocar.' }
    const e = new Error(textos[r.erro] || r.erro); e.codigo = r.erro; throw e
  }
  return r
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

// ── Sessão de staff (professor / coordenador / admin) ─────────────────────
// O servidor emite o token em login_staff e valida papel+escopo em CADA RPC. Nada daqui decide permissão:
// são só conveniências de transporte. Um papel gravado no localStorage não autentica nada.
async function obterTokenStaff() {
  try { return await AsyncStorage.getItem(CHAVE_TOKEN_STAFF) } catch { return null }
}
export async function temTokenStaff() { return !!(await obterTokenStaff()) }

const TEXTOS_STAFF = {
  sem_permissao: 'Você não tem permissão para esta operação.',
  sessao_invalida: 'Sua sessão expirou. Entre novamente.',
  muitas_tentativas: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  migration_ausente: 'O servidor ainda não foi atualizado para esta versão do app. Avise o administrador.',
  configuracao: 'Erro de configuração do servidor. Avise o administrador do app.',
  rede: 'Não foi possível conectar ao servidor. Verifique a internet e tente de novo.',
  nao_encontrado: 'Registro não encontrado (ele pode ter sido removido).',
  codigo_em_uso: 'Esse código de turma já está em uso. Gere outro.',
  pet_indisponivel: 'Este PET já foi vinculado a outra turma. Atualize a lista e escolha outro PET.',
  email_ja_cadastrado: 'Já existe uma conta com esse e-mail.',
  senha_fraca: 'A senha não atende aos requisitos de segurança.',
  email_invalido: 'Informe um e-mail válido.',
  nome_invalido: 'Informe um nome válido.',
  campo_nao_permitido: 'Este campo não pode ser alterado por aqui.',
  tabela_nao_permitida: 'Tabela não permitida para edição administrativa.',
  professor_invalido: 'Professor responsável inválido.',
  codigo_invalido: 'Código inválido.',
  cor_invalida: 'Cor inválida.',
  status_invalido: 'Status inválido.',
  transicao_invalida: 'Esta mudança de status não é permitida.',
  dados_invalidos: 'Dados inválidos.',
  tarefa_nao_global: 'Esta tarefa pertence a um professor e não pode ser editada como tarefa global.',
  sem_turma: 'Entre em uma turma antes de iniciar tarefas.',
  tarefa_inativa: 'A tarefa não está ativa para a sua turma.',
  sem_etapas: 'A tarefa não tem etapas disponíveis.',
  turma_sem_pet: 'A turma ainda não tem PET vinculado.',
  etapas_concluidas: 'Todas as etapas já foram concluídas.',
}
// Erros de staff: auth/permissão/rede viram códigos; regras de negócio (RAISE do banco) mantêm a mensagem do servidor.
export function erroStaff(error) {
  const code = error?.code, msg = error?.message || ''
  let codigo
  if (code === 'PT401') codigo = 'sessao_invalida'
  else if (code === 'PT403') codigo = 'sem_permissao'
  else if (code === 'PT429') codigo = 'muitas_tentativas'
  else if (funcaoAusente(error)) codigo = 'migration_ausente'
  else if (/^PT4\d\d$/.test(String(code)) || ['P0001', '23503', '23505', '23514'].includes(String(code))) codigo = msg
  else if (code && !/^(08|57|53|PGRST00[0-3])/.test(String(code))) codigo = 'configuracao'
  else codigo = 'rede'
  const e = new Error(TEXTOS_STAFF[codigo] || codigo)
  e.codigo = codigo
  e.code = code || null
  e.detalhe = code || null
  return e
}

async function rpcStaff(nome, args = {}) {
  const token = await obterTokenStaff()
  if (!token) {
    const e = new Error(TEXTOS_STAFF.sessao_invalida); e.codigo = 'sessao_invalida'
    ouvinteSessaoInvalida?.()
    throw e
  }
  let resposta
  try { resposta = await supabase.rpc(nome, { p_token: token, ...args }) }
  catch { const e = new Error(TEXTOS_STAFF.rede); e.codigo = 'rede'; throw e }
  if (resposta.error) {
    const e = erroStaff(resposta.error)
    if (e.codigo === 'sessao_invalida' || e.codigo === 'migration_ausente') {
      await AsyncStorage.removeItem(CHAVE_TOKEN_STAFF).catch(() => {})
      ouvinteSessaoInvalida?.()
    }
    throw e
  }
  return resposta.data
}

// Login único de professor / coordenador / administrador. A senha é conferida no servidor (bcrypt) e o
// papel devolvido vem do banco. Retorna o usuário ({id, nome, email, tipo}) ou null (credenciais incorretas).
export async function loginStaff(email, senha) {
  let resposta
  try { resposta = await supabase.rpc('login_staff', { p_email: String(email || '').trim().toLowerCase(), p_senha: senha }) }
  catch { const e = new Error(TEXTOS_STAFF.rede); e.codigo = 'rede'; throw e }
  if (resposta.error) throw erroStaff(resposta.error)
  if (!resposta.data) return null
  await AsyncStorage.setItem(CHAVE_TOKEN_STAFF, resposta.data.token)
  return resposta.data.usuario
}

// Restauração de sessão: devolve o perfil AUTÊNTICO (do servidor) ou null se o token não vale mais.
// Lança 'rede'/'configuracao'/'migration_ausente' quando não dá para saber (o App volta ao login).
export async function restaurarSessaoStaff() {
  const token = await obterTokenStaff()
  if (!token) return null
  let resposta
  try { resposta = await supabase.rpc('staff_perfil', { p_token: token }) }
  catch { const e = new Error(TEXTOS_STAFF.rede); e.codigo = 'rede'; throw e }
  if (resposta.error) {
    const e = erroStaff(resposta.error)
    if (e.codigo === 'sessao_invalida') { await AsyncStorage.removeItem(CHAVE_TOKEN_STAFF).catch(() => {}); return null }
    throw e
  }
  return resposta.data
}

// Troca da PRÓPRIA senha. A conta vem do token; o servidor derruba todas as sessões da conta (o app volta ao login).
export async function alterarMinhaSenhaStaff(senhaAtual, senhaNova) {
  const r = await rpcStaff('staff_alterar_minha_senha', { p_senha_atual: senhaAtual, p_senha_nova: senhaNova })
  if (r?.erro) { const e = new Error(r.erro === 'senha_atual_incorreta' ? 'Senha atual incorreta.' : r.erro); e.codigo = r.erro; throw e }
  await AsyncStorage.removeItem(CHAVE_TOKEN_STAFF).catch(() => {})
  return true
}

// Restauração da sessão do ALUNO: o perfil autêntico (xp, turma...) vem do servidor pelo token.
// Retorna null se o token não vale mais; lança 'rede' etc. quando não dá para saber.
export async function restaurarPerfilAluno() {
  if (!(await temTokenAluno())) return null
  try { return await rpcAluno('obter_meu_perfil') }
  catch (e) { if (e?.codigo === 'sessao_invalida') return null; throw e }
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
  const lista = (await rpcStaff('staff_listar_missoes')) || [];
  return lista.map(({ vinculos, ...missao }) => missao);
};

// Aprovação/entrega pelo STAFF (só coordenador/admin aprovam; o servidor decide). O XP é creditado pelos gatilhos do banco.
export const atualizarStatusAlunoMissao = async (missaoId, alunoId, novoStatus) => {
  return rpcStaff('staff_definir_status_missao', { p_missao_id: missaoId, p_aluno_id: alunoId, p_status: novoStatus })
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
    if (!(await temTokenAluno())) return null   // atalho local "loja": não há aluno no servidor
    // A turma é a do ALUNO DO TOKEN; o parâmetro turmaId só serve para o atalho acima e nunca vai ao servidor.
    const dados = await rpcAluno('aluno_minha_turma')
    const turma = dados?.turma
    const pet = dados?.pet
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
    if (!(await temTokenAluno())) return []   // atalho local "loja": não há aluno no servidor
    // Tarefas ativas da turma do ALUNO DO TOKEN + o progresso dele (o parâmetro alunoId é ignorado).
    const missoes = (await rpcAluno('aluno_minhas_missoes')) || []
    return missoes.map(m => ({
      id: m.id,
      nome: m.nome,
      descricao: m.descricao,
      xp: m.xp,
      dificuldade: m.dificuldade,
      icone: m.icone,
      status: m.status || 'pendente', // sem linha em alunos_missoes ainda = pendente
      atualizadoEm: m.atualizado_em || null,
    }))
  } catch (error) {
    console.error('Erro ao listar missões do aluno:', error.message)
    return []
  }
}

// Status de UMA missão específica pra um aluno (undefined se ele nunca
// interagiu com ela — trate como 'pendente' na UI).
export async function buscarProgressoMissao(alunoId, missaoId) {
  try {
    if (!(await temTokenAluno())) return null
    const missoes = (await rpcAluno('aluno_minhas_missoes')) || []
    const m = missoes.find(x => String(x.id) === String(missaoId))
    if (!m || m.atualizado_em == null) return null   // sem linha de progresso = nunca interagiu
    return { missao_id: m.id, status: m.status, xp_aluno: m.xp_aluno, atualizado_em: m.atualizado_em, etapa_atual: m.etapa_atual }
  } catch (error) {
    console.error('Erro ao buscar progresso da missão:', error.message)
    return null
  }
}

// "Iniciar" = o ALUNO (token dele) registra a missão como pendente. Nunca aprova.
// Aluno avança UMA etapa da própria tarefa (o servidor credita o XP da etapa uma única vez e valida turma/PET/ordem).
export async function avancarEtapaTarefa(missaoId) {
  return rpcAluno('aluno_avancar_etapa', { p_missao_id: missaoId })
}

export async function iniciarMissao(_alunoId, missaoId) {
  return rpcAluno('aluno_definir_status_missao', { p_missao_id: missaoId, p_status: 'pendente' })
}

// "Concluir" = o ALUNO entrega para avaliação (pendente -> entregue). Aprovar/creditar XP é só do staff.
export async function concluirMissao(_alunoId, missaoId) {
  return rpcAluno('aluno_definir_status_missao', { p_missao_id: missaoId, p_status: 'entregue' })
}

export const atualizarProgressoMissao = (missaoId, alunoId, status) => atualizarStatusAlunoMissao(missaoId, alunoId, status)

export async function consultarXP(_alunoId) {
  try {
    const perfil = await rpcAluno('obter_meu_perfil')   // o aluno vem do token; o parâmetro é ignorado
    return perfil?.xp || 0
  } catch (error) {
    console.error('Erro ao consultar XP do aluno:', error.message)
    return 0
  }
}

export async function listarConquistasDoAluno(alunoId) {
  try {
    if (!(await temTokenAluno())) return []
    return (await rpcAluno('aluno_minhas_conquistas')) || []   // as do ALUNO DO TOKEN (o parâmetro é ignorado)
  } catch (error) {
    console.error('Erro ao listar conquistas do aluno:', error.message)
    return []
  }
}

export async function consultarProgressoGeral(alunoId) {
  const vazio = { xp: 0, nome: '', turmaId: null, missoesAprovadas: 0, conquistas: 0 }
  try {
    if (!(await temTokenAluno())) return vazio   // atalho local "loja": sem perfil no servidor
    const [perfil, progresso] = await Promise.all([rpcAluno('obter_meu_perfil'), rpcAluno('aluno_meu_progresso_geral')])
    return {
      xp: perfil?.xp || 0,
      nome: perfil?.nome || '',
      turmaId: perfil?.turmaId || null,
      missoesAprovadas: Number(progresso?.missoesAprovadas) || 0,
      conquistas: Number(progresso?.conquistas) || 0,
    }
  } catch (error) {
    console.error('Erro ao consultar progresso geral do aluno:', error.message)
    return vazio
  }
}

