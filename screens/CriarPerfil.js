import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Image,
} from 'react-native'
import { salvarUsuario, buscarUsuario } from '../services/storage'
import { cores } from '../constants/cores'

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
        <View style={styles.sucessoTopo}>
          <Image
            source={require('../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.sucessoAppNome}>CURUPIRA</Text>
          <Text style={styles.sucessoTagline}>Atividades extracurriculares gamificadas</Text>
        </View>
        <View style={styles.sucessoCard}>
          <Text style={styles.sucessoBadge}>🎖️ Nova conquista desbloqueada!</Text>
          <Text style={styles.sucessoTitulo}>Bem-vindo(a),{'\n'}{usuario}!</Text>
          <Text style={styles.sucessoTexto}>
            Sua jornada começa agora. Complete missões, ganhe XP e faça seu pet evoluir!
          </Text>
          <View style={styles.sucessoItens}>
            <View style={styles.sucessoItem}>
              <Text style={styles.sucessoItemIcon}>🏆</Text>
              <Text style={styles.sucessoItemTxt}>Missões te esperam</Text>
            </View>
            <View style={styles.sucessoItem}>
              <Text style={styles.sucessoItemIcon}>⭐</Text>
              <Text style={styles.sucessoItemTxt}>Ganhe XP e suba no ranking</Text>
            </View>
            <View style={styles.sucessoItem}>
              <Text style={styles.sucessoItemIcon}>🐾</Text>
              <Text style={styles.sucessoItemTxt}>Evolua seu pet</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.btnCriar} onPress={onVoltar}>
            <Text style={styles.btnCriarTxt}>Começar agora →</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
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
          <Text style={styles.portalLabel}>Criar Perfil</Text>
        </View>

        {/* Formulário */}
        <View style={styles.form}>
          <View style={styles.header}>
            <Text style={styles.titulo}>Crie sua conta</Text>
            <TouchableOpacity onPress={onVoltar}>
              <Text style={styles.entrar}>Já tenho conta</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.campos}>
            <TextInput
              style={styles.input}
              placeholder="Usuário"
              placeholderTextColor="#bbb"
              autoCapitalize="none"
              value={usuario}
              onChangeText={setUsuario}
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#bbb"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
            <View style={styles.senhaWrap}>
              <TextInput
                style={styles.inputSenha}
                placeholder="Senha"
                placeholderTextColor="#bbb"
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
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.verde },
  scroll: { flexGrow: 1 },
  topo: { backgroundColor: cores.verde, alignItems: 'center', paddingTop: 60, paddingBottom: 40, paddingHorizontal: 28 },
  logo: { width: 90, height: 90, borderRadius: 45, marginBottom: 8 },
  topoNome: { fontSize: 28, fontWeight: 'bold', color: cores.branco, letterSpacing: 2, marginBottom: 6 },
  tagline: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 16, textAlign: 'center' },
  portalLabel: { color: cores.branco, fontSize: 20, fontWeight: '600', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.15)', paddingHorizontal: 20, paddingVertical: 6, borderRadius: 20 },
  form: { backgroundColor: cores.branco, flex: 1, paddingHorizontal: 24, paddingTop: 36, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  titulo: { fontSize: 22, fontWeight: 'bold', color: cores.preto },
  entrar: { fontSize: 14, color: cores.verde, fontWeight: '500' },
  campos: { gap: 14, marginBottom: 32 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 14, fontSize: 15, color: cores.preto, backgroundColor: '#fff' },
  senhaWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 14, backgroundColor: '#fff' },
  inputSenha: { flex: 1, paddingVertical: 14, fontSize: 15, color: cores.preto },
  mostrar: { color: cores.verde, fontWeight: '500', fontSize: 14 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: { width: 18, height: 18, borderWidth: 1, borderColor: '#aaa', borderRadius: 3, marginTop: 2, alignItems: 'center', justifyContent: 'center' },
  checkboxAtivo: { backgroundColor: cores.verde, borderColor: cores.verde },
  checkmark: { color: cores.branco, fontSize: 12, fontWeight: 'bold' },
  checkLabel: { flex: 1, fontSize: 13, color: '#555', lineHeight: 20 },
  erro: { color: 'red', fontSize: 13, marginTop: 4 },
  btnCriar: { backgroundColor: cores.verde, borderRadius: 30, paddingVertical: 16, alignItems: 'center', marginBottom: 16 },
  btnCriarTxt: { color: cores.branco, fontSize: 16, fontWeight: 'bold' },
  esqueceu: { textAlign: 'center', color: cores.verde, fontSize: 14 },
  sucessoContainer: { flex: 1, backgroundColor: cores.branco },
  sucessoTopo: { backgroundColor: cores.verde, alignItems: 'center', paddingTop: 70, paddingBottom: 40, paddingHorizontal: 24 },
  sucessoAppNome: { fontSize: 28, fontWeight: 'bold', color: cores.branco, letterSpacing: 2, marginBottom: 6 },
  sucessoTagline: { fontSize: 13, color: 'rgba(255,255,255,0.8)', textAlign: 'center' },
  sucessoCard: { flex: 1, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 40 },
  sucessoBadge: { backgroundColor: cores.amarelo, color: cores.preto, fontSize: 13, fontWeight: 'bold', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 20, overflow: 'hidden' },
  sucessoTitulo: { fontSize: 26, fontWeight: 'bold', color: cores.preto, marginBottom: 12, lineHeight: 34 },
  sucessoTexto: { fontSize: 14, color: '#555', lineHeight: 22, marginBottom: 28 },
  sucessoItens: { gap: 14, marginBottom: 36 },
  sucessoItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sucessoItemIcon: { fontSize: 24 },
  sucessoItemTxt: { fontSize: 15, color: cores.preto, fontWeight: '500' },
})