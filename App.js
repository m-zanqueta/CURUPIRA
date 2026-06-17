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

// ── Telas existentes do projeto (Matheus / Bruno) ──
import Login           from './screens/Login';
import LoginProfessor  from './screens/LoginProfessor';
import CriarPerfil     from './screens/CriarPerfil';
import Home            from './screens/Home';

// ── Telas do Washington — Módulo de Conquistas ──
import ConquistasScreen       from './screens/ConquistasScreen';
import DetalheConquistaScreen from './screens/DetalheConquistaScreen';
import CriarConquistaScreen   from './screens/CriarConquistaScreen';

const Stack = createNativeStackNavigator();

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

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>

          {/* ── Telas existentes ── */}
          <Stack.Screen name="Login"          component={Login} />
          <Stack.Screen name="LoginProfessor" component={LoginProfessor} />
          <Stack.Screen name="CriarPerfil"    component={CriarPerfil} />
          <Stack.Screen name="Home"           component={Home} />

          {/* ── Washington: Módulo de Conquistas ── */}
          <Stack.Screen name="Conquistas"       component={ConquistasScreen} />
          <Stack.Screen name="DetalheConquista" component={DetalheConquistaScreen} />
          <Stack.Screen name="CriarConquista"   component={CriarConquistaScreen} />

        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
