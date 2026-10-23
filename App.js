import { useState, useEffect, useRef, Component } from 'react'
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
import { PaperProvider, MD3DarkTheme } from 'react-native-paper'

const tema = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary:          '#009D25', // colors.green
    primaryContainer: '#e6f7ea', // colors.greenLight
    secondary:        '#DBB407', // colors.yellow
    secondaryContainer: '#fdf7dc', // colors.yellowLight
    tertiary:         '#6A109E', // colors.purple
    tertiaryContainer:'#f0e6f9', // colors.purpleLight
    background:       '#090C0E', // colors.dark
    surface:          '#111a11',
    surfaceVariant:   '#1a2a1a',
    onPrimary:        '#F5F4D9', // colors.cream
    onBackground:     '#F5F4D9',
    onSurface:        '#F5F4D9',
    error:            '#fde8e8', // colors.red
    outline:          '#e2dfcc', // colors.border
  },
  fonts: {
    ...MD3DarkTheme.fonts,
    bodySmall:   { fontFamily: 'Montserrat_400Regular', fontSize: 12 },
    bodyMedium:  { fontFamily: 'Montserrat_400Regular', fontSize: 14 },
    bodyLarge:   { fontFamily: 'Montserrat_500Medium',  fontSize: 16 },
    labelSmall:  { fontFamily: 'Montserrat_600SemiBold',fontSize: 11 },
    labelMedium: { fontFamily: 'Montserrat_600SemiBold',fontSize: 12 },
    labelLarge:  { fontFamily: 'Montserrat_700Bold',    fontSize: 14 },
    titleSmall:  { fontFamily: 'Montserrat_700Bold',    fontSize: 14 },
    titleMedium: { fontFamily: 'Montserrat_700Bold',    fontSize: 16 },
    titleLarge:  { fontFamily: 'Montserrat_800ExtraBold',fontSize: 20 },
    headlineSmall: { fontFamily: 'Montserrat_800ExtraBold', fontSize: 24 },
  },
}
import { colors } from './theme'
import { inicializarProfessores, buscarTurmaDoAluno, consultarProgressoGeral, salvarSessaoApp, obterSessaoApp, limparSessaoApp } from './services/storage'
import Login from './screens/Login'
import CriarPerfil from './screens/CriarPerfil'
import LoginProfessor from './screens/LoginProfessor'
import EntrarTurma from './screens/EntrarTurma'
import DashboardScreen from './screens/DashboardScreen'
import AdminDashboardScreen from './screens/AdminDashboardScreen'
import PetScreen from './screens/PetScreen'
import LojaScreen from './screens/LojaScreen'
import ErroScreen from './screens/ErroScreen'

// Todo destino que o app sabe navegar. navegarCom() usa isso pra decidir
// se o destino pedido é válido ou se deve cair na tela de erro (404).
const TELAS_VALIDAS = new Set([
  'splash', 'splashLogin', 'login', 'criarPerfil', 'entrarTurma',
  'loginProfessor', 'dashboardAdmin', 'dashboardProfessor', 'pet', 'loja', 'erro404',
])

// Captura qualquer erro de render não tratado em qualquer tela do Curupira
// e mostra a mesma tela de erro genérica (ErroScreen), em vez de deixar a
// tela em branco/travada. "Tentar novamente" só reseta o boundary — se o
// erro era de um estado específico (ex: tela do pet depois de um clique
// ruim), o app volta a renderizar normalmente a partir daqui.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { comErro: false }
  }
  static getDerivedStateFromError() {
    return { comErro: true }
  }
  componentDidCatch(erro, info) {
    console.error('Erro não tratado no Curupira:', erro, info?.componentStack)
  }
  render() {
    if (this.state.comErro) {
      return (
        <ErroScreen
          titulo="Algo deu errado"
          mensagem="O Curupira encontrou um erro inesperado nessa tela. Você pode tentar novamente."
          textoBotao="Tentar novamente"
          onVoltar={() => this.setState({ comErro: false })}
        />
      )
    }
    return this.props.children
  }
}

function AppInterno() {
  const [tela,          setTela]          = useState('splash')
  const [professor,     setProfessor]     = useState(null)
  const [aluno,         setAluno]         = useState(null)
  const [turmaAluno,    setTurmaAluno]    = useState(null)
  const [progressoAluno,setProgressoAluno]= useState(null)
  const fadeAnim = useRef(new Animated.Value(1)).current

  const [fontsLoaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
  })

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
        if (['professor', 'coordenador'].includes(sessao?.tipo) && sessao.usuario?.id) {
          setProfessor(sessao.usuario)
          setTela('dashboardProfessor')
          return
        }
        if (sessao?.tipo === 'aluno' && sessao.usuario?.id) {
          const alunoSalvo = sessao.usuario
          setAluno(alunoSalvo)
          if (!alunoSalvo.turmaId) {
            setTela('entrarTurma')
            return
          }
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
          setAluno(sessao.usuario || null)
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

  // Destino desconhecido (nome digitado errado, tela removida, estado
  // inconsistente) nunca deixa `tela` num valor que nenhum bloco abaixo
  // trata — em vez de ficar com a tela em branco, cai na 404.
  function navegarCom(destino) {
    const alvo = TELAS_VALIDAS.has(destino) ? destino : 'erro404'
    if (alvo === 'erro404' && destino !== 'erro404') {
      console.warn(`Destino de navegação inválido: "${destino}". Mostrando tela de erro (404).`)
    }
    Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
      setTela(alvo)
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start()
    })
  }

  function usuarioSemSenha(usuario) {
    if (!usuario) return null
    const { senha, ...dados } = usuario
    return dados
  }  
  // Aluno sem pet (turma sem pet configurado, ou turma inexistente)
  // não fica preso na tela "Pet não encontrado" — cai direto na tela
  // do código da turma, pra poder entrar em outra turma.
  useEffect(() => {
    if (tela !== 'pet') return
    if (turmaAluno?.pet) return
    navegarCom('entrarTurma')
  }, [tela, turmaAluno])

  async function entrarAreaProfessor(usuario) {
    const tipo = ['admin', 'coordenador'].includes(usuario?.tipo) ? usuario.tipo : 'professor'
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
      setAluno(alunoLogado)
      navegarCom('loja')
      return
    }

    setAluno(alunoLogado)
    if (!alunoLogado.turmaId) {
      try {
        await salvarSessaoApp({ tipo: 'aluno', usuario: usuarioSemSenha(alunoLogado) })
      } catch (error) {
        console.error('Não foi possível salvar a sessão do aluno:', error)
      }
      navegarCom('entrarTurma')
      return
    }
    await handleLoginAluno(alunoLogado)
  }

    async function handleEntrarTurma(alunoAtualizado, turma) {
    try {
      await salvarSessaoApp({ tipo: 'aluno', usuario: usuarioSemSenha(alunoAtualizado) })
    } catch (error) {
      console.error('Não foi possível atualizar a sessão do aluno:', error)
    }
    // Refaz a busca pra trazer o objeto turma COMPLETO (com pet aninhado) —
    // o `turma` que o EntrarTurma devolve só tem id/nome/codigo/professor_id.
    const [turmaCompleta, progresso] = await Promise.all([
      buscarTurmaDoAluno(alunoAtualizado.turmaId),
      consultarProgressoGeral(alunoAtualizado.id),
    ])
    setAluno(alunoAtualizado)
    setTurmaAluno(turmaCompleta)
    setProgressoAluno(progresso)
    navegarCom('splashLogin')
    setTimeout(() => navegarCom('pet'), 2000)
  }

  async function pularEntradaNaTurma() {
    setTurmaAluno(null)
    const progresso = aluno?.id ? await consultarProgressoGeral(aluno.id) : null
    setProgressoAluno(progresso)
    navegarCom('pet')
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
      <PaperProvider theme={tema}>
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

        {/* ── NOVO: tela intermediária de código da turma ── */}
        {tela === 'entrarTurma' && (
          <EntrarTurma
            aluno={aluno}
            onEntrou={handleEntrarTurma}
            onPular={pularEntradaNaTurma}
          />
        )}

        {tela === 'loginProfessor' && (
          <LoginProfessor
            onLogin={entrarAreaProfessor}
            onAdminLogin={entrarAreaProfessor}
            onSouAluno={() => navegarCom('login')}
          />
        )}

        {tela === 'dashboardAdmin' && (
          professor?.tipo === 'admin'
            ? <AdminDashboardScreen usuario={professor} onLogout={sair} />
            : <LoginProfessor onLogin={entrarAreaProfessor} onAdminLogin={entrarAreaProfessor} onSouAluno={() => navegarCom('login')} />
        )}

        {tela === 'dashboardProfessor' && (
          professor?.tipo !== 'admin'
            ? <DashboardScreen professor={professor} onLogout={sair} />
            : <AdminDashboardScreen usuario={professor} onLogout={sair} />
        )}

        {tela === 'pet' && (
          <PetScreen
            aluno={aluno}
            turma={turmaAluno}
            progresso={progressoAluno}
            onLogout={sair}
            onLoja={() => navegarCom('loja')}
          />
        )}

        {tela === 'loja' && (
          <LojaScreen
            aluno={aluno}
            turma={turmaAluno}
            onLogout={() => aluno?.email === 'loja@gmail.com' ? sair() : navegarCom('pet')}
          />
        )}

        {tela === 'erro404' && (
          <ErroScreen
            onVoltar={() => navegarCom(professor ? 'loginProfessor' : 'login')}
          />
        )}

      </SafeAreaProvider>
      </PaperProvider>
    </Animated.View>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInterno />
    </ErrorBoundary>
  )
}

const styles = StyleSheet.create({
  splash:       { flex: 1, backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center', gap: 12 },
  splashLogo:   { width: 120, height: 120, borderRadius: 60, marginBottom: 8 },
  splashNome:   { fontSize: 32, fontFamily: 'Montserrat_800ExtraBold', color: colors.cream, letterSpacing: 4 },
  splashTagline:{ fontSize: 13, fontFamily: 'Montserrat_400Regular', color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
})
