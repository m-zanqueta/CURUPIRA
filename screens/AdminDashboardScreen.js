import { useState } from 'react'
import {
  ActivityIndicator, Modal, SafeAreaView, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { colors, fonts } from '../theme'
import { salvarIconeMissao, salvarPetAdmin, salvarProfessor } from '../services/storage'

const FORMULARIOS = {
  pet: {
    titulo: 'Adicionar PET',
    campos: [
      { id: 'icone', label: 'URL pública da imagem do PET', placeholder: 'https://…', required: true },
      { id: 'estagio', label: 'Estágio inicial', placeholder: 'Filhote' },
      { id: 'cor', label: 'Cor do PET', placeholder: '#009D25' },
    ],
  },
  professor: {
    titulo: 'Adicionar professor',
    campos: [
      { id: 'nome', label: 'Nome', placeholder: 'Nome do professor', required: true },
      { id: 'email', label: 'E-mail', placeholder: 'professor@escola.com', required: true, email: true },
      { id: 'senha', label: 'Senha', placeholder: 'Crie uma senha', required: true, secure: true },
    ],
  },
  icone: {
    titulo: 'Adicionar ícone de missão',
    campos: [
      { id: 'nome', label: 'Nome do ícone', placeholder: 'Ex.: Livro', required: true },
      { id: 'icone', label: 'URL pública da imagem', placeholder: 'https://…', required: true },
    ],
  },
}

const DADOS_INICIAIS = {
  pet: { icone: '', estagio: 'Filhote', cor: '#009D25' },
  professor: { nome: '', email: '', senha: '' },
  icone: { nome: '', icone: '' },
}

export default function AdminDashboardScreen({ usuario, onLogout }) {
  const [formulario, setFormulario] = useState(null)
  const [dados, setDados] = useState(DADOS_INICIAIS.pet)
  const [erros, setErros] = useState({})
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  function abrirFormulario(tipo) {
    setDados({ ...DADOS_INICIAIS[tipo] })
    setErros({})
    setMensagem('')
    setFormulario(tipo)
  }

  function atualizarCampo(campo, valor) {
    setDados(prev => ({ ...prev, [campo]: valor }))
    setErros(prev => ({ ...prev, [campo]: '' }))
  }

  async function salvar() {
    const config = FORMULARIOS[formulario]
    const novosErros = {}
    config.campos.forEach(campo => {
      const valor = String(dados[campo.id] || '').trim()
      if (campo.required && !valor) novosErros[campo.id] = `Preencha ${campo.label.toLowerCase()}.`
      else if (campo.email && valor && !/^\S+@\S+\.\S+$/.test(valor)) novosErros[campo.id] = 'Informe um e-mail válido.'
      else if (campo.id === 'icone' && valor && !/^https?:\/\//i.test(valor)) novosErros[campo.id] = 'Informe uma URL pública iniciada com http:// ou https://.'
    })
    setErros(novosErros)
    if (Object.keys(novosErros).length) return

    setSalvando(true)
    try {
      if (formulario === 'pet') await salvarPetAdmin(dados)
      if (formulario === 'professor') await salvarProfessor(dados)
      if (formulario === 'icone') await salvarIconeMissao(dados)
      setFormulario(null)
      setMensagem(`${config.titulo.replace('Adicionar ', '')} cadastrado com sucesso.`)
      setDados({ ...DADOS_INICIAIS[formulario] })
    } catch (error) {
      setErros({ geral: error?.message || 'Não foi possível salvar. Confira a conexão e tente novamente.' })
    } finally {
      setSalvando(false)
    }
  }

  const config = formulario ? FORMULARIOS[formulario] : null

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.brand}>CURUPIRA · ADMIN</Text>
          <View style={styles.headerRule} />
        </View>

        <View style={styles.welcomeCard}>
          <Text style={styles.greeting}>Olá, {usuario?.nome || 'Administrador'}</Text>
          <Text style={styles.subtitle}>Gerencie os recursos da plataforma.</Text>
        </View>

        {!!mensagem && <Text style={styles.successMessage}>{mensagem}</Text>}

        <View style={styles.actions}>
          <AdminAction icon="🐾" title="Adicionar PET" description="Cadastre uma imagem PET disponível para uma turma." onPress={() => abrirFormulario('pet')} />
          <AdminAction icon="👩‍🏫" title="Adicionar professor" description="Crie um novo acesso para a área do professor." onPress={() => abrirFormulario('professor')} />
          <AdminAction icon="🖼️" title="Adicionar ícone missão" description="Inclua uma imagem no catálogo de ícones das missões." onPress={() => abrirFormulario('icone')} />
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutText}>Sair</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={!!formulario} transparent animationType="fade" onRequestClose={() => !salvando && setFormulario(null)}>
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>{config?.titulo}</Text>
              {formulario === 'pet' && <Text style={styles.hint}>O PET será criado sem turma e ficará disponível para vinculação.</Text>}
              {config?.campos.map(campo => (
                <View key={campo.id} style={styles.field}>
                  <Text style={styles.label}>{campo.label}{campo.required ? ' *' : ''}</Text>
                  <TextInput
                    style={styles.input}
                    value={dados[campo.id]}
                    onChangeText={valor => atualizarCampo(campo.id, valor)}
                    placeholder={campo.placeholder}
                    placeholderTextColor="#9a9a91"
                    autoCapitalize={campo.email ? 'none' : campo.id === 'icone' ? 'none' : 'sentences'}
                    keyboardType={campo.email ? 'email-address' : 'default'}
                    secureTextEntry={campo.secure}
                    autoCorrect={!campo.email && campo.id !== 'icone'}
                  />
                  {!!erros[campo.id] && <Text style={styles.errorText}>{erros[campo.id]}</Text>}
                </View>
              ))}
              {!!erros.geral && <Text style={styles.errorText}>{erros.geral}</Text>}
              <View style={styles.buttons}>
                <TouchableOpacity style={styles.cancelButton} disabled={salvando} onPress={() => setFormulario(null)}>
                  <Text style={styles.cancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveButton, salvando && styles.disabled]} disabled={salvando} onPress={salvar}>
                  {salvando ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveText}>Salvar</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

function AdminAction({ icon, title, description, onPress }) {
  return (
    <TouchableOpacity style={styles.actionCard} onPress={onPress} activeOpacity={0.82}>
      <View style={styles.actionIcon}><Text style={styles.actionEmoji}>{icon}</Text></View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionDescription}>{description}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { flexGrow: 1, width: '100%', maxWidth: 760, alignSelf: 'center', padding: 24, paddingTop: 34, gap: 18 },
  header: { marginBottom: 10 },
  brand: { color: colors.green, fontFamily: fonts.extrabold, letterSpacing: 2, fontSize: 13 },
  headerRule: { height: 2, backgroundColor: colors.green, opacity: 0.25, marginTop: 12 },
  welcomeCard: { backgroundColor: colors.white, borderRadius: 16, padding: 22, borderWidth: 1, borderColor: colors.border },
  greeting: { color: colors.dark, fontFamily: fonts.bold, fontSize: 26 },
  subtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14, marginTop: 6 },
  actions: { gap: 12 },
  actionCard: { backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1, borderRadius: 14, minHeight: 88, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  actionIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.greenLight, alignItems: 'center', justifyContent: 'center' },
  actionEmoji: { fontSize: 24 },
  actionCopy: { flex: 1 },
  actionTitle: { color: colors.dark, fontFamily: fonts.bold, fontSize: 15 },
  actionDescription: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 4 },
  chevron: { color: colors.green, fontFamily: fonts.bold, fontSize: 28 },
  logoutButton: { backgroundColor: colors.dark, borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 'auto' },
  logoutText: { color: colors.white, fontFamily: fonts.bold, fontSize: 14 },
  successMessage: { color: colors.green, fontFamily: fonts.semibold, backgroundColor: colors.greenLight, padding: 12, borderRadius: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(9,12,14,0.55)', justifyContent: 'center', padding: 18 },
  modalScroll: { flexGrow: 1, justifyContent: 'center' },
  modal: { width: '100%', maxWidth: 500, alignSelf: 'center', backgroundColor: colors.white, borderRadius: 16, padding: 22, gap: 14 },
  modalTitle: { color: colors.dark, fontFamily: fonts.bold, fontSize: 20 },
  hint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: -8 },
  field: { gap: 6 },
  label: { color: colors.dark, fontFamily: fonts.semibold, fontSize: 12 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: colors.cream, color: colors.dark, paddingHorizontal: 12, paddingVertical: 11, fontFamily: fonts.regular, fontSize: 14 },
  errorText: { color: '#c62828', fontFamily: fonts.semibold, fontSize: 12 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelButton: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 9, alignItems: 'center', justifyContent: 'center', padding: 12 },
  cancelText: { color: colors.muted, fontFamily: fonts.semibold },
  saveButton: { flex: 1, backgroundColor: colors.green, borderRadius: 9, alignItems: 'center', justifyContent: 'center', padding: 12 },
  saveText: { color: colors.white, fontFamily: fonts.bold },
  disabled: { opacity: 0.6 },
})
