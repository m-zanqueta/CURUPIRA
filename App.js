import { useState, useEffect } from 'react'
import { View, ActivityIndicator, Image, Text, StyleSheet } from 'react-native'
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
import { inicializarProfessores } from './services/storage'
} from '@expo-google-fonts/montserrat';
import { ActivityIndicator, View } from 'react-native';
import { colors } from './theme';
import DashboardScreen from './screens/DashboardScreen';

const Stack = createNativeStackNavigator();
import { useState } from 'react'
import Login from './screens/Login'
import CriarPerfil from './screens/CriarPerfil'
import LoginProfessor from './screens/LoginProfessor'
import Home from './screens/Home'
import DashboardScreen from './screens/DashboardScreen'

export default function App() {
  const [tela, setTela] = useState('splash')
  const [professor, setProfessor] = useState(null)

export default function App() {
  const [tela, setTela] = useState('login')

  if (tela === 'criarPerfil') {
    return <CriarPerfil onVoltar={() => setTela('login')} />
  }

  if (tela === 'loginProfessor') {
    return (
      <LoginProfessor
        onLogin={() => setTela('home')}
        onSouAluno={() => setTela('login')}
      />
    )
  }

  if (tela === 'home') {
    return <Home />
  }

  const [fontsLoaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
  })

  useEffect(() => {
    async function init() {
      await inicializarProfessores()
      setTimeout(() => setTela('login'), 2500)
    }
    if (fontsLoaded) init()
  }, [fontsLoaded])

  // Splash / carregamento
  if (!fontsLoaded || tela === 'splash') {
    return (
      <View style={styles.splash}>
        <Image
          source={require('./assets/logo.png')}
          style={styles.splashLogo}
          resizeMode="contain"
        />
        <Text style={styles.splashNome}>CURUPIRA</Text>
        <Text style={styles.splashTagline}>Atividades extracurriculares gamificadas</Text>
        <ActivityIndicator color={colors.yellow} size="large" style={{ marginTop: 40 }} />
      </View>
    )
  }

  if (tela === 'criarPerfil') {
    return (
      <SafeAreaProvider>
        <CriarPerfil onVoltar={() => setTela('login')} />
      </SafeAreaProvider>
    )
  }

  if (tela === 'loginProfessor') {
    return (
      <SafeAreaProvider>
        <LoginProfessor
          onLogin={(prof) => { setProfessor(prof); setTela('dashboardProfessor') }}
          onSouAluno={() => setTela('login')}
        />
      </SafeAreaProvider>
    )
  }

  if (tela === 'dashboardProfessor') {
    return (
      <SafeAreaProvider>
        <DashboardScreen professor={professor} onLogout={() => setTela('loginProfessor')} />
      </SafeAreaProvider>
    )
  }

  if (tela === 'home') {
    return (
      <SafeAreaProvider>
        <Home />
      </SafeAreaProvider>
    )
  }

  return (
    <SafeAreaProvider>
      <Login
        onLogin={() => setTela('home')}
        onCriarPerfil={() => setTela('criarPerfil')}
        onSouProfessor={() => setTela('loginProfessor')}
      />
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.dark,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  splashLogo: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 8,
  },
  splashNome: {
    fontSize: 32,
    fontFamily: 'Montserrat_800ExtraBold',
    color: colors.cream,
    letterSpacing: 4,
  },
  splashTagline: {
    fontSize: 13,
    fontFamily: 'Montserrat_400Regular',
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
})
    <View style={styles.container}>
      <Text>Open up App.js to start working on your app!</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
