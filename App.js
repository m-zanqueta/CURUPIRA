import { useState } from 'react';
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

import Login from './screens/Login';
import CriarPerfil from './screens/CriarPerfil';
import LoginProfessor from './screens/LoginProfessor';
import Home from './screens/Home';
import DashboardScreen from './screens/DashboardScreen';

export default function App() {
  const [tela, setTela] = useState('login');

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

  if (tela === 'login') {
    return (
      <Login
        onLogin={() => setTela('home')}
        onCriarPerfil={() => setTela('criarPerfil')}
        onSouProfessor={() => setTela('loginProfessor')}
      />
    );
  }

  if (tela === 'criarPerfil') {
    return <CriarPerfil onVoltar={() => setTela('login')} />;
  }

  if (tela === 'loginProfessor') {
    return (
      <LoginProfessor
        onLogin={() => setTela('dashboard')}
        onSouAluno={() => setTela('login')}
      />
    );
  }

  if (tela === 'home') {
    return <Home />;
  }

  if (tela === 'dashboard') {
    return <DashboardScreen onLogout={() => setTela('login')} />;
  }

  return null;
}