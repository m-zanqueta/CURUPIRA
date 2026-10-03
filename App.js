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
import { inicializarProfessores, buscarTurmaDoAluno, consultarProgressoGeral } from './services/storage'
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
    async function init() {
      await inicializarProfessores()
      setTimeout(() => navegarCom('login'), 2500)
    }
    if (fontsLoaded) init()
  }, [fontsLoaded])

  function navegarCom(destino) {
    Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
      setTela(destino)
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start()
    })
  }

  function entrarAreaProfessor(usuario) {
    setProfessor(usuario)
    navegarCom(usuario?.tipo === 'admin' ? 'dashboardAdmin' : 'dashboardProfessor')
  }

      async function handleLoginAluno(alunoLogado) {
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
          navegarCom('loja')
          return
        }
        handleLoginAluno(alunoLogado)
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
          professor?.tipo === 'admin' ? <AdminDashboardScreen usuario={professor} onLogout={() => navegarCom('loginProfessor')} /> : <LoginProfessor onLogin={entrarAreaProfessor} onAdminLogin={entrarAreaProfessor} onSouAluno={() => navegarCom('login')} />
        )}
        {tela === 'dashboardProfessor' && (
          professor?.tipo !== 'admin' ? <DashboardScreen professor={professor} onLogout={() => navegarCom('loginProfessor')} /> : <AdminDashboardScreen usuario={professor} onLogout={() => navegarCom('loginProfessor')} />
        )}
        {tela === 'pet' && (
          <PetScreen aluno={aluno} turma={turmaAluno} progresso={progressoAluno} onLogout={() => navegarCom('login')} />
        )}
        {tela === 'loja' && (
          <LojaScreen onLogout={() => navegarCom('login')} />
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
