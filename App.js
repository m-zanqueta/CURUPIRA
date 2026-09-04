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
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from './theme';

import Login from './screens/Login';
import CriarPerfil from './screens/CriarPerfil';
import LoginProfessor from './screens/LoginProfessor';
import DashboardScreen from './screens/DashboardScreen';
import PetScreen from './screens/PetScreen';

export default function App() {
  const [tela, setTela] = useState('login');
  const [alunoLogado, setAlunoLogado] = useState(null);

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
        onLogin={(aluno) => { setAlunoLogado(aluno); setTela('pet') }}
        onCriarPerfil={() => setTela('criarPerfil')}
        onSouProfessor={() => setTela('loginProfessor')}
      />
    );
  }

  if (tela === 'criarPerfil') {
    return (
      <CriarPerfil
        onVoltar={() => setTela('login')}
        onCriado={(aluno) => { setAlunoLogado(aluno); setTela('pet') }}
      />
    );
  }

  if (tela === 'loginProfessor') {
    return (
      <LoginProfessor
        onLogin={() => setTela('dashboard')}
        onSouAluno={() => setTela('login')}
      />
    );
  }

  if (tela === 'pet') {
    return (
      <SafeAreaProvider>
        <PetScreen
          aluno={alunoLogado}
          onVoltar={() => setTela('login')}
        />
      </SafeAreaProvider>
    );
  }

  if (tela === 'dashboard') {
    return (
      <SafeAreaProvider>
        <DashboardScreen onLogout={() => setTela('login')} />
      </SafeAreaProvider>
    );
  }

  return null;
}
