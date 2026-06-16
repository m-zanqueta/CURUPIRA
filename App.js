import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
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

export default function App() {
  const [fontsLoaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.dark }}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }

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

  return (
    <Login
      onLogin={() => setTela('home')}
      onCriarPerfil={() => setTela('criarPerfil')}
      onSouProfessor={() => setTela('loginProfessor')}
    />
  )
}
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Dashboard" component={DashboardScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  ;
