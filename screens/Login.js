import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native'
import { buscarUsuario } from '../services/storage'

export default function Login({ onLogin, onCriarPerfil, onSouProfessor }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erro, setErro] = useState('')

  function validarEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  async function handleLogin() {
    if (!email || !senha) {
      setErro('Preencha e-mail e senha para continuar.')
      return
    }
    if (!validarEmail(email)) {
      setErro('Informe um e-mail válido.')
      return
    }
    const encontrado = await buscarUsuario(email)
    if (!encontrado || encontrado.senha !== senha) {
      setErro('Email ou senha incorretos.')
      return
    }
    setErro('')
    onLogin()
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.titulo}>Entrar</Text>
          <TouchableOpacity onPress={onCriarPerfil}>
            <Text style={styles.criarPerfil}>Criar Perfil</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.campos}>
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

          <TouchableOpacity onPress={onSouProfessor}>
            <Text style={styles.souProfessor}>Sou professor</Text>
          </TouchableOpacity>

          {erro ? <Text style={styles.erro}>{erro}</Text> : null}
        </View>

        <TouchableOpacity style={styles.btnLogar} onPress={handleLogin}>
          <Text style={styles.btnLogarTxt}>Logar</Text>
        </TouchableOpacity>

        <TouchableOpacity>
          <Text style={styles.esqueceu}>Esqueceu sua senha?</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, paddingHorizontal: 24, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 },
  titulo: { fontSize: 24, fontWeight: 'bold', color: '#000' },
  criarPerfil: { fontSize: 15, color: '#22A45D', fontWeight: '500' },
  campos: { gap: 14, marginBottom: 32 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 15, color: '#000' },
  senhaWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 14 },
  inputSenha: { flex: 1, paddingVertical: 14, fontSize: 15, color: '#000' },
  mostrar: { color: '#22A45D', fontWeight: '500', fontSize: 14 },
  souProfessor: { fontSize: 12, color: '#aaa', textAlign: 'left' },
  erro: { color: 'red', fontSize: 13, marginTop: 4 },
  btnLogar: { backgroundColor: '#22A45D', borderRadius: 30, paddingVertical: 16, alignItems: 'center', marginBottom: 16 },
  btnLogarTxt: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  esqueceu: { textAlign: 'center', color: '#22A45D', fontSize: 14 },
})