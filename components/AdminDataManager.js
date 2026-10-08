import { useEffect, useState } from 'react'
import {
  ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native'
import { atualizarDadoAdmin, excluirDadoAdmin, listarDadosAdmin } from '../services/storage'
import { colors, fonts } from '../theme'

const ABAS = [
  { id: 'professores', titulo: 'Professores' },
  { id: 'alunos', titulo: 'Alunos' },
  { id: 'pets', titulo: 'PETs' },
  { id: 'icones_missoes', titulo: 'Ícones de missão' },
  { id: 'acessorios', titulo: 'Itens da loja' },
]

const ROTULOS = {
  id: 'ID', nome: 'Nome', email: 'E-mail', senha: 'Senha', xp: 'XP',
  icone: 'Imagem / ícone', estagio: 'Estágio', emocao: 'Emoção',
  cosmetico: 'Cosmético', turma_id: 'ID da turma', turmaId: 'ID da turma',
  professor_id: 'ID do professor', professorId: 'ID do professor',
  cor: 'Cor', progresso: 'Progresso', ativo: 'Ativo', ativa: 'Ativa',
  slot: 'Tipo de acessório', imagem_path: 'Caminho da imagem', camada: 'Camada', preco: 'Preço em moedas',
}

function rotuloCampo(chave) {
  return ROTULOS[chave] || chave.replace(/([A-Z])/g, ' $1').replaceAll('_', ' ').replace(/^./, letra => letra.toUpperCase())
}

function textoValor(valor) {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'object') return JSON.stringify(valor, null, 2)
  return String(valor)
}

function ehNumero(chave, original) {
  return typeof original === 'number' || /(^id$|_id$|Id$|^xp$|^progresso$)/i.test(chave)
}

function ehBooleano(chave, original) {
  return typeof original === 'boolean' || /^(ativo|ativa|is_)/i.test(chave)
}

function converterValor(chave, valor, original) {
  const limpo = String(valor ?? '').trim()
  if (!limpo) return null

  if (ehBooleano(chave, original)) {
    if (limpo.toLowerCase() === 'true' || limpo.toLowerCase() === 'sim') return true
    if (limpo.toLowerCase() === 'false' || limpo.toLowerCase() === 'não' || limpo.toLowerCase() === 'nao') return false
    throw new Error(`Informe “sim” ou “não” para ${rotuloCampo(chave).toLowerCase()}.`)
  }

  if (ehNumero(chave, original)) {
    const numero = Number(limpo)
    if (!Number.isFinite(numero)) throw new Error(`${rotuloCampo(chave)} precisa ser um número válido.`)
    return numero
  }

  if (original !== null && typeof original === 'object') {
    try { return JSON.parse(limpo) } catch { throw new Error(`${rotuloCampo(chave)} precisa conter JSON válido.`) }
  }

  return valor
}

function tituloRegistro(tabela, registro) {
  if (registro.nome) return String(registro.nome)
  if (registro.email) return String(registro.email)
  const tipo = tabela === 'pets' ? 'PET' : tabela === 'icones_missoes' ? 'Ícone' : 'Item'
  return `${tipo} #${registro.id}`
}

function resumoRegistro(tabela, registro) {
  const campos = tabela === 'professores'
    ? [registro.email]
      : tabela === 'icones_missoes'
        ? [registro.ativo ? 'Ativo' : 'Inativo']
        : tabela === 'acessorios'
          ? [registro.slot, registro.preco != null ? `${registro.preco} moedas` : null, registro.ativo ? 'Ativo' : 'Inativo']
    : tabela === 'alunos'
      ? [registro.email, registro.turmaId != null ? `Turma ${registro.turmaId}` : null, registro.xp != null ? `${registro.xp} XP` : null]
      : [registro.estagio, registro.xp != null ? `${registro.xp} XP` : null, registro.turma_id != null ? `Turma ${registro.turma_id}` : null]
  return campos.filter(Boolean).join(' · ') || `ID ${registro.id}`
}

export default function AdminDataManager({ visible, onClose }) {
  const [aba, setAba] = useState('professores')
  const [registros, setRegistros] = useState([])
  const [selecionado, setSelecionado] = useState(null)
  const [rascunho, setRascunho] = useState({})
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)

  async function carregar(tabela = aba) {
    setCarregando(true)
    setErro('')
    try {
      const dados = await listarDadosAdmin(tabela)
      setRegistros(dados)
    } catch (error) {
      setErro(error?.message || 'Não foi possível carregar os registros. Verifique as permissões do Supabase.')
      setRegistros([])
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    if (visible) {
      setAba('professores')
      setBusca('')
      setSelecionado(null)
      setConfirmandoExclusao(false)
      carregar('professores')
    }
  }, [visible])

  function trocarAba(novaAba) {
    setAba(novaAba)
    setBusca('')
    setSelecionado(null)
    setRascunho({})
    setConfirmandoExclusao(false)
    carregar(novaAba)
  }

  const registrosFiltrados = registros.filter(registro =>
    Object.entries(registro)
      .filter(([chave]) => chave !== 'senha')
      .some(([, valor]) => textoValor(valor).toLowerCase().includes(busca.trim().toLowerCase()))
  )

  function editarRegistro(registro) {
    setSelecionado(registro)
    setRascunho(Object.fromEntries(Object.entries(registro).map(([chave, valor]) => [chave, textoValor(valor)])))
    setConfirmandoExclusao(false)
    setErro('')
  }

  async function salvarEdicao() {
    if (!selecionado) return
    if (aba === 'acessorios' && !['chapeu', 'colar'].includes(rascunho.slot)) {
      setErro('Escolha Chapéu ou Colar para o tipo do acessório.')
      return
    }
    if (aba === 'professores') {
      const email = String(rascunho.email || '').trim()
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        setErro('Informe um e-mail válido, como nome@dominio.com.')
        return
      }
      const senha = String(rascunho.senha || '')
      if (senha && senha !== String(selecionado.senha || '') && (!/[A-Z]/.test(senha) || !/[a-z]/.test(senha) || !/[0-9]/.test(senha) || !/[^A-Za-z0-9]/.test(senha) || senha.length < 8)) {
        setErro('A senha deve ter ao menos 8 caracteres, com maiúscula, minúscula, número e símbolo.')
        return
      }
    }
    const alteracoes = {}
    try {
      Object.keys(selecionado).forEach(chave => {
        if (chave === 'id') return
        const novo = converterValor(chave, rascunho[chave], selecionado[chave])
        const anterior = selecionado[chave]
        const iguais = novo === anterior || (novo !== null && anterior !== null && typeof novo === 'object' && JSON.stringify(novo) === JSON.stringify(anterior))
        if (!iguais) alteracoes[chave] = novo
      })
    } catch (error) {
      setErro(error.message)
      return
    }

    if (!Object.keys(alteracoes).length) {
      setErro('Nenhum dado foi alterado.')
      return
    }

    setSalvando(true)
    setErro('')
    try {
      await atualizarDadoAdmin(aba, selecionado.id, alteracoes)
      setSelecionado(null)
      await carregar(aba)
    } catch (error) {
      setErro(error?.message || 'Não foi possível salvar. Confira as políticas de UPDATE no Supabase.')
    } finally {
      setSalvando(false)
    }
  }

  async function excluirRegistro() {
    if (!selecionado) return
    setSalvando(true)
    setErro('')
    try {
      await excluirDadoAdmin(aba, selecionado.id)
      setSelecionado(null)
      setRascunho({})
      setConfirmandoExclusao(false)
      await carregar(aba)
    } catch (error) {
      setErro(error?.message || 'Não foi possível excluir. Verifique os vínculos do registro e as políticas RLS do Supabase.')
    } finally {
      setSalvando(false)
    }
  }

  function fechar() {
    if (salvando) return
    setSelecionado(null)
    setErro('')
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={fechar}>
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Alterar dados</Text>
              <Text style={styles.subtitle}>Consulte e edite os cadastros da plataforma.</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={fechar} disabled={salvando} accessibilityLabel="Fechar">
              <Text style={styles.closeText}>×</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tabs}>
            {ABAS.map(item => (
              <TouchableOpacity key={item.id} onPress={() => trocarAba(item.id)} style={[styles.tab, aba === item.id && styles.tabActive]}>
                <Text style={[styles.tabText, aba === item.id && styles.tabTextActive]}>{item.titulo}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {selecionado ? (
            <>
              <View style={styles.editHeader}>
                <TouchableOpacity onPress={() => { setSelecionado(null); setConfirmandoExclusao(false); setErro('') }} disabled={salvando}>
                  <Text style={styles.backText}>‹ Voltar à lista</Text>
                </TouchableOpacity>
                <Text style={styles.recordTitle} numberOfLines={1}>{tituloRegistro(aba, selecionado)}</Text>
              </View>
              <ScrollView style={styles.body} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
                {Object.keys(selecionado).map(chave => {
                  const original = selecionado[chave]
                  const booleano = ehBooleano(chave, original)
                  return (
                    <View key={chave} style={styles.field}>
                      <Text style={styles.label}>{rotuloCampo(chave)}{chave === 'id' ? ' · não editável' : ''}</Text>
                      {booleano ? (
                        <View style={styles.booleanOptions}>
                          {[['true', 'Sim'], ['false', 'Não']].map(([valor, texto]) => (
                            <TouchableOpacity key={valor} disabled={chave === 'id' || salvando} onPress={() => setRascunho(prev => ({ ...prev, [chave]: valor }))} style={[styles.booleanOption, rascunho[chave] === valor && styles.booleanOptionActive]}>
                              <Text style={[styles.booleanText, rascunho[chave] === valor && styles.booleanTextActive]}>{texto}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : aba === 'acessorios' && chave === 'slot' ? (
                        <View style={styles.booleanOptions}>
                          {[
                            ['chapeu', 'Chapéu'],
                            ['colar', 'Colar'],
                          ].map(([valor, texto]) => (
                            <TouchableOpacity key={valor} disabled={salvando} onPress={() => setRascunho(prev => ({ ...prev, [chave]: valor }))} style={[styles.booleanOption, rascunho[chave] === valor && styles.booleanOptionActive]}>
                              <Text style={[styles.booleanText, rascunho[chave] === valor && styles.booleanTextActive]}>{texto}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : (
                        <TextInput
                          style={[styles.input, (chave === 'id' || salvando) && styles.inputDisabled, (chave === 'descricao' || chave === 'icone') && styles.multilineInput]}
                          value={rascunho[chave] ?? ''}
                          onChangeText={valor => setRascunho(prev => ({ ...prev, [chave]: valor }))}
                          editable={chave !== 'id' && !salvando}
                          selectTextOnFocus={chave !== 'id'}
                          multiline={chave === 'descricao' || chave === 'icone' || (original !== null && typeof original === 'object')}
                          keyboardType={chave === 'email' ? 'email-address' : ehNumero(chave, original) ? 'numeric' : 'default'}
                          autoCapitalize={chave === 'email' || chave === 'icone' ? 'none' : 'sentences'}
                          secureTextEntry={chave === 'senha'}
                        />
                      )}
                    </View>
                  )
                })}
                {!!erro && <Text style={styles.error}>{erro}</Text>}
                {confirmandoExclusao ? (
                  <View style={styles.confirmCard}>
                    <Text style={styles.confirmTitle}>Excluir este cadastro?</Text>
                    <Text style={styles.confirmText}>O registro “{tituloRegistro(aba, selecionado)}” será removido do banco. Se houver vínculos que impeçam a exclusão, o Supabase informará o motivo.</Text>
                    <View style={styles.formActions}>
                      <TouchableOpacity style={styles.secondaryButton} disabled={salvando} onPress={() => { setConfirmandoExclusao(false); setErro('') }}>
                        <Text style={styles.secondaryText}>Manter cadastro</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.deleteConfirmButton, salvando && styles.disabled]} disabled={salvando} onPress={excluirRegistro}>
                        {salvando ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>Excluir agora</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <>
                    <TouchableOpacity style={styles.deleteButton} disabled={salvando} onPress={() => { setConfirmandoExclusao(true); setErro('') }}>
                      <Text style={styles.deleteText}>Excluir cadastro</Text>
                    </TouchableOpacity>
                    <View style={styles.formActions}>
                      <TouchableOpacity style={styles.secondaryButton} disabled={salvando} onPress={() => { setSelecionado(null); setConfirmandoExclusao(false); setErro('') }}>
                        <Text style={styles.secondaryText}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.primaryButton, salvando && styles.disabled]} disabled={salvando} onPress={salvarEdicao}>
                        {salvando ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>Salvar alterações</Text>}
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </ScrollView>
            </>
          ) : (
            <>
              <View style={styles.listToolbar}>
                <Text style={styles.count}>{registros.length} {registros.length === 1 ? 'registro' : 'registros'}</Text>
                <TouchableOpacity onPress={() => carregar()} disabled={carregando}>
                  <Text style={styles.refreshText}>↻ Atualizar lista</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.searchInput}
                value={busca}
                onChangeText={setBusca}
                placeholder="Buscar por nome, e-mail ou dado…"
                placeholderTextColor="#89897f"
                autoCapitalize="none"
              />
              {!!erro && <Text style={styles.error}>{erro}</Text>}
              {carregando ? (
                <View style={styles.centerState}><ActivityIndicator color={colors.green} /><Text style={styles.stateText}>Carregando dados…</Text></View>
              ) : registrosFiltrados.length ? (
                <ScrollView style={styles.body} contentContainerStyle={styles.list}>
                  {registrosFiltrados.map((registro, indice) => (
                    <TouchableOpacity key={String(registro.id ?? indice)} style={styles.recordCard} onPress={() => editarRegistro(registro)} activeOpacity={0.8}>
                      <View style={styles.recordCopy}>
                        <Text style={styles.recordName} numberOfLines={1}>{tituloRegistro(aba, registro)}</Text>
                        <Text style={styles.recordSummary} numberOfLines={2}>{resumoRegistro(aba, registro)}</Text>
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : (
                <View style={styles.centerState}>
                  <Text style={styles.emptyIcon}>⌕</Text>
                  <Text style={styles.emptyTitle}>Nenhum cadastro encontrado</Text>
                  <Text style={styles.stateText}>Os registros desta aba aparecerão aqui quando existirem no banco.</Text>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(9,12,14,0.58)', justifyContent: 'center', alignItems: 'center', padding: 12 },
  panel: { width: '100%', maxWidth: 720, height: '94%', backgroundColor: colors.white, borderRadius: 18, padding: 18, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16 },
  headerCopy: { flex: 1 },
  title: { color: colors.dark, fontFamily: fonts.bold, fontSize: 21 },
  subtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 4 },
  closeButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.dark, fontFamily: fonts.medium, fontSize: 24, lineHeight: 28 },
  tabs: { flexDirection: 'row', backgroundColor: colors.cream, borderRadius: 11, padding: 4, gap: 4, marginBottom: 12 },
  tab: { flex: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 10 },
  tabActive: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  tabText: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 },
  tabTextActive: { color: colors.green, fontFamily: fonts.bold },
  listToolbar: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  searchInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: '#fffef7', color: colors.dark, paddingHorizontal: 11, paddingVertical: 9, fontFamily: fonts.regular, fontSize: 12, marginBottom: 9 },
  count: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 },
  refreshText: { color: colors.green, fontFamily: fonts.semibold, fontSize: 12 },
  body: { flex: 1 },
  list: { gap: 8, paddingBottom: 12 },
  recordCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fffef7', borderWidth: 1, borderColor: colors.border, borderRadius: 11, padding: 13, gap: 12, minHeight: 66 },
  recordCopy: { flex: 1 },
  recordName: { color: colors.dark, fontFamily: fonts.semibold, fontSize: 14 },
  recordSummary: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, marginTop: 4 },
  chevron: { color: colors.green, fontFamily: fonts.bold, fontSize: 26 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 9 },
  stateText: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, textAlign: 'center' },
  emptyIcon: { color: colors.green, fontSize: 35 },
  emptyTitle: { color: colors.dark, fontFamily: fonts.semibold, fontSize: 15, textAlign: 'center' },
  editHeader: { minHeight: 48, justifyContent: 'center', gap: 3, marginBottom: 5 },
  backText: { color: colors.green, fontFamily: fonts.semibold, fontSize: 12 },
  recordTitle: { color: colors.dark, fontFamily: fonts.bold, fontSize: 15 },
  form: { paddingBottom: 18, gap: 12 },
  field: { gap: 5 },
  label: { color: colors.dark, fontFamily: fonts.semibold, fontSize: 12 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: colors.cream, color: colors.dark, paddingHorizontal: 11, paddingVertical: 10, fontFamily: fonts.regular, fontSize: 13, minHeight: 42 },
  inputDisabled: { opacity: 0.62 },
  multilineInput: { minHeight: 80, textAlignVertical: 'top' },
  booleanOptions: { flexDirection: 'row', gap: 8 },
  booleanOption: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cream, borderRadius: 18, paddingHorizontal: 15, paddingVertical: 8 },
  booleanOptionActive: { borderColor: colors.green, backgroundColor: colors.greenLight },
  booleanText: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 },
  booleanTextActive: { color: colors.green, fontFamily: fonts.bold },
  error: { color: '#c62828', fontFamily: fonts.semibold, fontSize: 12, marginVertical: 6 },
  formActions: { flexDirection: 'row', gap: 9, paddingTop: 4 },
  deleteButton: { borderWidth: 1, borderColor: '#efb9b9', backgroundColor: colors.red, borderRadius: 9, alignItems: 'center', justifyContent: 'center', padding: 11, marginTop: 4 },
  deleteText: { color: '#a61b1b', fontFamily: fonts.bold, fontSize: 12 },
  confirmCard: { borderWidth: 1, borderColor: '#efb9b9', backgroundColor: '#fff8f8', borderRadius: 11, padding: 13, gap: 8, marginTop: 4 },
  confirmTitle: { color: '#a61b1b', fontFamily: fonts.bold, fontSize: 14 },
  confirmText: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  deleteConfirmButton: { flex: 1, backgroundColor: '#bd2727', borderRadius: 9, alignItems: 'center', justifyContent: 'center', padding: 12 },
  secondaryButton: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 9, alignItems: 'center', justifyContent: 'center', padding: 12 },
  secondaryText: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 12 },
  primaryButton: { flex: 1, backgroundColor: colors.green, borderRadius: 9, alignItems: 'center', justifyContent: 'center', padding: 12 },
  primaryText: { color: colors.white, fontFamily: fonts.bold, fontSize: 12 },
  disabled: { opacity: 0.6 },
})
