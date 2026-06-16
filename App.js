import { useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
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
import Login from './screens/Login'
import CriarPerfil from './screens/CriarPerfil'
import LoginProfessor from './screens/LoginProfessor'
import Home from './screens/Home'
import DashboardScreen from './screens/DashboardScreen'

export default function App() {
  const [tela, setTela] = useState('login')

  const [fontsLoaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
  })

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.dark }}>
        <ActivityIndicator color={colors.yellow} size="large" />
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
          onLogin={() => setTela('dashboardProfessor')}
          onSouAluno={() => setTela('login')}
        />
      </SafeAreaProvider>
    )
  }

  if (tela === 'dashboardProfessor') {
    return (
      <SafeAreaProvider>
        <DashboardScreen />
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