import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView,
} from 'react-native'
import { buscarUsuario } from '../services/storage'

export default function LoginProfessor({ onLogin, onSouAluno }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
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
    if (senha.length < 8 || !/[A-Z]/.test(senha) || !/[0-9]/.test(senha)) {
      setErro('A senha deve ter mínimo 8 caracteres, 1 maiúscula e 1 número.')
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
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Topo escuro */}
        <View style={styles.topo}>
          <View style={styles.logoPlaceholder} />

          <Text style={styles.tagline}>Atividades extracurriculares gamificadas</Text>

          <View style={styles.features}>
            <View style={styles.featureRow}>
              <View style={[styles.dot, { backgroundColor: '#22A45D' }]}>
                <Text style={styles.dotTxt}>✓</Text>
              </View>
              <Text style={styles.featureTxt}>Acompanhe o progresso dos alunos</Text>
            </View>
            <View style={styles.featureRow}>
              <View style={[styles.dot, { backgroundColor: '#DBB407' }]}>
                <Text style={[styles.dotTxt, { color: '#333' }]}>✓</Text>
              </View>
              <Text style={styles.featureTxt}>Crie missões e recompensas</Text>
            </View>
            <View style={styles.featureRow}>
              <View style={[styles.dot, { backgroundColor: '#6A109E' }]}>
                <Text style={styles.dotTxt}>✓</Text>
              </View>
              <Text style={styles.featureTxt}>Engaje turmas com rankings</Text>
            </View>
          </View>
        </View>

        {/* Formulário */}
        <View style={styles.form}>
          <Text style={styles.titulo}>Bem-vindo(a) de volta!</Text>
          <Text style={styles.subtitulo}>Portal exclusivo para professores</Text>

          <Text style={styles.label}>E-mail institucional</Text>
          <TextInput
            style={styles.input}
            placeholder="seu@escola.edu.br"
            placeholderTextColor="#bbb"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>Senha</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#bbb"
            secureTextEntry
            value={senha}
            onChangeText={setSenha}
          />

          <TouchableOpacity onPress={onSouAluno}>
            <Text style={styles.souAluno}>Sou aluno</Text>
          </TouchableOpacity>

          {erro ? <Text style={styles.erro}>{erro}</Text> : null}

          <TouchableOpacity>
            <Text style={styles.esqueceu}>Esqueci minha senha</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnEntrar} onPress={handleLogin}>
            <Text style={styles.btnEntrarTxt}>Entrar na plataforma →</Text>
          </TouchableOpacity>

          <Text style={styles.rodape}>Plataforma exclusiva para escolas parceiras.</Text>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  scroll: { flexGrow: 1 },
  topo: {
    backgroundColor: '#111',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 48,
    paddingHorizontal: 28,
  },
  logoPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#222',
    marginBottom: 20,
  },
  tagline: { color: '#888', fontSize: 13, marginBottom: 32, textAlign: 'center', letterSpacing: 0.2 },
  features: { gap: 16, width: '100%' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dotTxt: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  featureTxt: { color: '#fff', fontSize: 15, fontWeight: '600' },
  form: {
    backgroundColor: '#f0ead6',
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 40,
  },
  titulo: { fontSize: 22, fontWeight: 'bold', color: '#111', marginBottom: 4 },
  subtitulo: { fontSize: 13, color: '#888', marginBottom: 28 },
  label: { fontSize: 13, color: '#444', marginBottom: 6, fontWeight: '500' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  souAluno: { fontSize: 12, color: '#888', textAlign: 'left', marginBottom: 8 },
  erro: { color: 'red', fontSize: 13, marginBottom: 8 },
  esqueceu: { textAlign: 'right', color: '#22A45D', fontSize: 13, marginBottom: 24, fontWeight: '500' },
  btnEntrar: {
    backgroundColor: '#22A45D',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  btnEntrarTxt: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  rodape: { textAlign: 'center', color: '#aaa', fontSize: 12 },
})