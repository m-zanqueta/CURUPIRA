import { useState, useEffect, useRef } from 'react'
import { View, ActivityIndicator, Image, Text, StyleSheet, Animated } from 'react-native'
import {
  useFonts,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
} from '@expo-google-fonts/montserrat'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { colors } from './theme'
import { inicializarProfessores, buscarTurmaDoAluno, consultarProgressoGeral, salvarSessaoApp, obterSessaoApp, limparSessaoApp } from './services/storage'
import Login from './screens/Login'
import CriarPerfil from './screens/CriarPerfil'
import LoginProfessor from './screens/LoginProfessor'
import DashboardScreen from './screens/DashboardScreen'
import AdminDashboardScreen from './screens/AdminDashboardScreen'
import PetScreen from './screens/PetScreen'
import LojaScreen from './screens/LojaScreen'

export default function App() {
  const [tela, setTela] = useState('splash')
  const [professor, setProfessor] = useState(null)
  const [aluno, setAluno] = useState(null)
  const [turmaAluno, setTurmaAluno] = useState(null)
  const [progressoAluno, setProgressoAluno] = useState(null)
  const fadeAnim = useRef(new Animated.Value(1)).current

  const [fontsLoaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
  });
 
  useEffect(() => {
    let ativo = true
    async function init() {
      try {
        await inicializarProfessores()
        const sessao = await obterSessaoApp()
        if (!ativo) return

        if (sessao?.tipo === 'admin' && sessao.usuario) {
          setProfessor({ ...sessao.usuario, tipo: 'admin' })
          setTela('dashboardAdmin')
          return
        }
        if (sessao?.tipo === 'professor' && sessao.usuario?.id) {
          setProfessor(sessao.usuario)
          setTela('dashboardProfessor')
          return
        }
        if (sessao?.tipo === 'aluno' && sessao.usuario?.id) {
          const alunoSalvo = sessao.usuario
          const [turma, progresso] = await Promise.all([
            buscarTurmaDoAluno(alunoSalvo.turmaId),
            consultarProgressoGeral(alunoSalvo.id),
          ])
          if (!ativo) return
          setAluno(alunoSalvo)
          setTurmaAluno(turma)
          setProgressoAluno(progresso)
          setTela('pet')
          return
        }
        if (sessao?.tipo === 'loja') {
          setTela('loja')
          return
        }

        setTela('login')
      } catch (error) {
        console.error('Não foi possível restaurar a sessão salva:', error)
        if (ativo) setTela('login')
      }
    }
    if (fontsLoaded) init()
    return () => { ativo = false }
  }, [fontsLoaded])

  function navegarCom(destino) {
    Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
      setTela(destino)
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start()
    })
  }

  function usuarioSemSenha(usuario) {
    if (!usuario) return null
    const { senha, ...dados } = usuario
    return dados
  }

  async function entrarAreaProfessor(usuario) {
    const tipo = usuario?.tipo === 'admin' ? 'admin' : 'professor'
    try {
      await salvarSessaoApp({ tipo, usuario: usuarioSemSenha(usuario) })
    } catch (error) {
      console.error('Não foi possível salvar a sessão do professor:', error)
    }
    setProfessor(usuario)
    navegarCom(usuario?.tipo === 'admin' ? 'dashboardAdmin' : 'dashboardProfessor')
  }

      async function handleLoginAluno(alunoLogado) {
        try {
          await salvarSessaoApp({ tipo: 'aluno', usuario: usuarioSemSenha(alunoLogado) })
        } catch (error) {
          console.error('Não foi possível salvar a sessão do aluno:', error)
        }
        const [turma, progresso] = await Promise.all([
          buscarTurmaDoAluno(alunoLogado.turmaId),
          consultarProgressoGeral(alunoLogado.id),
        ])
        setAluno(alunoLogado)
        setTurmaAluno(turma)
        setProgressoAluno(progresso)
        navegarCom('splashLogin')
        setTimeout(() => navegarCom('pet'), 2000)
      }

      async function handleLoginGeral(alunoLogado) {
        if (alunoLogado.email === 'loja@gmail.com') {
          try {
            await salvarSessaoApp({ tipo: 'loja', usuario: usuarioSemSenha(alunoLogado) })
          } catch (error) {
            console.error('Não foi possível salvar a sessão da loja:', error)
          }
          navegarCom('loja')
          return
        }
        await handleLoginAluno(alunoLogado)
      }

  async function sair() {
    try {
      await limparSessaoApp()
    } catch (error) {
      console.error('Não foi possível limpar a sessão salva:', error)
    }
    setProfessor(null)
    setAluno(null)
    setTurmaAluno(null)
    setProgressoAluno(null)
    navegarCom(professor ? 'loginProfessor' : 'login')
  }
  

  if (!fontsLoaded || tela === 'splash' || tela === 'splashLogin') {
    return (
      <Animated.View style={[styles.splash, { opacity: fadeAnim }]}>
        <Image source={require('./assets/logo.png')} style={styles.splashLogo} resizeMode="contain" />
        <Text style={styles.splashNome}>CURUPIRA</Text>
        <Text style={styles.splashTagline}>Atividades extracurriculares gamificadas</Text>
        <ActivityIndicator color={colors.yellow} size="large" style={{ marginTop: 40 }} />
      </Animated.View>
    )
  }

  return (
    <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
      <SafeAreaProvider>
        {tela === 'login' && (
          <Login
            onLogin={handleLoginGeral}
            onCriarPerfil={() => navegarCom('criarPerfil')}
            onSouProfessor={() => navegarCom('loginProfessor')}
          />
        )}
        {tela === 'criarPerfil' && (
          <CriarPerfil onVoltar={() => navegarCom('login')} />
        )}
        {tela === 'loginProfessor' && (
          <LoginProfessor
            onLogin={entrarAreaProfessor}
            onAdminLogin={entrarAreaProfessor}
            onSouAluno={() => navegarCom('login')}
          />
        )}
        {tela === 'dashboardAdmin' && (
          professor?.tipo === 'admin' ? <AdminDashboardScreen usuario={professor} onLogout={sair} /> : <LoginProfessor onLogin={entrarAreaProfessor} onAdminLogin={entrarAreaProfessor} onSouAluno={() => navegarCom('login')} />
        )}
        {tela === 'dashboardProfessor' && (
          professor?.tipo !== 'admin' ? <DashboardScreen professor={professor} onLogout={sair} /> : <AdminDashboardScreen usuario={professor} onLogout={sair} />
        )}
        {tela === 'pet' && (
          <PetScreen aluno={aluno} turma={turmaAluno} progresso={progressoAluno} onLogout={sair} />
        )}
        {tela === 'loja' && (
          <LojaScreen onLogout={sair} />
        )}

      </SafeAreaProvider>
    </Animated.View>
  )
}
 
const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center', gap: 12 },
  splashLogo: { width: 120, height: 120, borderRadius: 60, marginBottom: 8 },
  splashNome: { fontSize: 32, fontFamily: 'Montserrat_800ExtraBold', color: colors.cream, letterSpacing: 4 },
  splashTagline: { fontSize: 13, fontFamily: 'Montserrat_400Regular', color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
})
