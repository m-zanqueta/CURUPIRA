import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import { salvarUsuario, buscarUsuario } from '../services/storage'

export default function CriarPerfil({ onVoltar }) {
  const [usuario, setUsuario] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [receberInfo, setReceberInfo] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)

  function validarEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  function validarSenha(senha) {
    return senha.length >= 8 && /[A-Z]/.test(senha) && /[0-9]/.test(senha)
  }

  async function handleCriar() {
    if (!usuario || !email || !senha) {
      setErro('Preencha todos os campos para continuar.')
      return
    }
    if (usuario.length < 3) {
      setErro('O usuário deve ter no mínimo 3 caracteres.')
      return
    }
    if (!validarEmail(email)) {
      setErro('Informe um e-mail válido.')
      return
    }
    if (!validarSenha(senha)) {
      setErro('A senha deve ter mínimo 8 caracteres, 1 maiúscula e 1 número.')
      return
    }
    const existente = await buscarUsuario(email)
    if (existente) {
      setErro('Já existe uma conta com esse e-mail.')
      return
    }
    await salvarUsuario({ usuario, email, senha, receberInfo })
    setErro('')
    setSucesso(true)
  }

  if (sucesso) {
    return (
      <View style={styles.sucessoContainer}>
        <Text style={styles.sucessoIcon}>✅</Text>
        <Text style={styles.sucessoTitulo}>Conta criada!</Text>
        <Text style={styles.sucessoTexto}>
          Seu perfil foi criado com sucesso. Faça login para continuar.
        </Text>
        <TouchableOpacity style={styles.btnCriar} onPress={onVoltar}>
          <Text style={styles.btnCriarTxt}>Login</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.titulo}>Criar Perfil</Text>
          <TouchableOpacity onPress={onVoltar}>
            <Text style={styles.entrar}>Entrar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.campos}>
          <TextInput
            style={styles.input}
            placeholder="Usuário"
            placeholderTextColor="#aaa"
            autoCapitalize="none"
            value={usuario}
            onChangeText={setUsuario}
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#aaa"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
          <View style={styles.senhaWrap}>
            <TextInput
              style={styles.inputSenha}
              placeholder="Senha"
              placeholderTextColor="#aaa"
              secureTextEntry={!mostrarSenha}
              value={senha}
              onChangeText={setSenha}
            />
            <TouchableOpacity onPress={() => setMostrarSenha(!mostrarSenha)}>
              <Text style={styles.mostrar}>{mostrarSenha ? 'Ocultar' : 'Mostrar'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.checkRow}
            onPress={() => setReceberInfo(!receberInfo)}
          >
            <View style={[styles.checkbox, receberInfo && styles.checkboxAtivo]}>
              {receberInfo && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkLabel}>
              Eu gostaria de receber mais informações sobre o projeto por email
            </Text>
          </TouchableOpacity>

          {erro ? <Text style={styles.erro}>{erro}</Text> : null}
        </View>

        <TouchableOpacity style={styles.btnCriar} onPress={handleCriar}>
          <Text style={styles.btnCriarTxt}>Criar</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onVoltar}>
          <Text style={styles.esqueceu}>Esqueceu sua senha?</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 },
  titulo: { fontSize: 24, fontWeight: 'bold', color: '#000' },
  entrar: { fontSize: 15, color: '#22A45D', fontWeight: '500' },
  campos: { gap: 14, marginBottom: 32 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 15, color: '#000' },
  senhaWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 14 },
  inputSenha: { flex: 1, paddingVertical: 14, fontSize: 15, color: '#000' },
  mostrar: { color: '#22A45D', fontWeight: '500', fontSize: 14 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: { width: 18, height: 18, borderWidth: 1, borderColor: '#aaa', borderRadius: 3, marginTop: 2, alignItems: 'center', justifyContent: 'center' },
  checkboxAtivo: { backgroundColor: '#22A45D', borderColor: '#22A45D' },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  checkLabel: { flex: 1, fontSize: 13, color: '#555', lineHeight: 20 },
  erro: { color: 'red', fontSize: 13, marginTop: 4 },
  btnCriar: { backgroundColor: '#22A45D', borderRadius: 30, paddingVertical: 16, alignItems: 'center', marginBottom: 16 },
  btnCriarTxt: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  esqueceu: { textAlign: 'center', color: '#22A45D', fontSize: 14 },
  sucessoContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, backgroundColor: '#fff' },
  sucessoIcon: { fontSize: 64, marginBottom: 16 },
  sucessoTitulo: { fontSize: 28, fontWeight: 'bold', color: '#000', marginBottom: 12 },
  sucessoTexto: { fontSize: 15, color: '#555', textAlign: 'center', marginBottom: 32, lineHeight: 22 },
})