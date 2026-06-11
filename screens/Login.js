import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Image,
} from 'react-native'
import { buscarUsuario } from '../services/storage'
import { cores } from '../constants/cores'

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
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Topo verde */}
        <View style={styles.topo}>
          <Image
            source={require('../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.topoNome}>CURUPIRA</Text>
          <Text style={styles.tagline}>Atividades extracurriculares gamificadas</Text>
          <Text style={styles.portalAluno}>Portal do Aluno</Text>
        </View>

        {/* Formulário */}
        <View style={styles.form}>
          <Text style={styles.titulo}>Bem-vindo(a) de volta!</Text>
          <Text style={styles.subtitulo}>Portal exclusivo para alunos</Text>

          <Text style={styles.label}>E-mail</Text>
          <TextInput
            style={styles.input}
            placeholder="seu@email.com"
            placeholderTextColor="#bbb"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>Senha</Text>
          <View style={styles.senhaWrap}>
            <TextInput
              style={styles.inputSenha}
              placeholder="••••••••"
              placeholderTextColor="#bbb"
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

          <TouchableOpacity>
            <Text style={styles.esqueceu}>Esqueci minha senha</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnLogar} onPress={handleLogin}>
            <Text style={styles.btnLogarTxt}>Entrar →</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onCriarPerfil}>
            <Text style={styles.criarPerfil}>Não tem conta? Criar perfil</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.verde },
  scroll: { flexGrow: 1 },
  topo: { backgroundColor: cores.verde, alignItems: 'center', paddingTop: 60, paddingBottom: 40, paddingHorizontal: 28 },
  logo: { width: 90, height: 90, borderRadius: 45, marginBottom: 12 },
  topoNome: { fontSize: 28, fontWeight: 'bold', color: cores.branco, letterSpacing: 2, marginBottom: 6 },
  tagline: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 16, textAlign: 'center' },
  portalAluno: { color: cores.branco, fontSize: 20, fontWeight: '600', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.15)', paddingHorizontal: 20, paddingVertical: 6, borderRadius: 20 },
  form: { backgroundColor: cores.branco, flex: 1, paddingHorizontal: 24, paddingTop: 36, paddingBottom: 40 },
  titulo: { fontSize: 22, fontWeight: 'bold', color: cores.preto, marginBottom: 4 },
  subtitulo: { fontSize: 13, color: '#888', marginBottom: 28 },
  label: { fontSize: 13, color: '#444', marginBottom: 6, fontWeight: '500' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 14, fontSize: 15, color: cores.preto, backgroundColor: '#fff', marginBottom: 16 },
  senhaWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 14, backgroundColor: '#fff', marginBottom: 8 },
  inputSenha: { flex: 1, paddingVertical: 14, fontSize: 15, color: cores.preto },
  mostrar: { color: cores.verde, fontWeight: '500', fontSize: 14 },
  souProfessor: { fontSize: 12, color: '#aaa', textAlign: 'left', marginBottom: 8 },
  erro: { color: 'red', fontSize: 13, marginBottom: 8 },
  esqueceu: { textAlign: 'right', color: cores.verde, fontSize: 13, marginBottom: 24, fontWeight: '500' },
  btnLogar: { backgroundColor: cores.verde, borderRadius: 30, paddingVertical: 16, alignItems: 'center', marginBottom: 16 },
  btnLogarTxt: { color: cores.branco, fontSize: 16, fontWeight: 'bold' },
  criarPerfil: { textAlign: 'center', color: cores.verde, fontSize: 14 },
})