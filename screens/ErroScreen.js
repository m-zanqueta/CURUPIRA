import { View, StyleSheet, Image } from 'react-native'
import { Text, Button, Surface } from 'react-native-paper'
import { colors, fonts } from '../theme'

// Tela de erro genérica do Curupira (Semana 42 — Washington).
//
// Pra onde TODO erro do app deve cair:
//   1) destino de navegação inválido (App.js redireciona aqui via
//      navegarCom() quando `tela` não existe no conjunto TELAS_VALIDAS);
//   2) qualquer erro de render não tratado em qualquer tela (capturado
//      pelo ErrorBoundary em App.js, que renderiza este componente no
//      lugar da árvore que quebrou).
//
// Não depende de nenhuma lib de rotas — é só mais um componente, igual
// aos outros em screens/. `onVoltar` decide pra onde volta; quem chama
// (App.js) escolhe o destino certo (login do aluno, login do professor,
// ou só "tentar de novo" quando foi um erro de render).
export default function ErroScreen({
  titulo = 'Essa página não existe',
  mensagem = 'O caminho que você tentou abrir não foi encontrado, ou algo deu errado no Curupira.',
  textoBotao = 'Voltar para o início',
  onVoltar,
}) {
  return (
    <View style={s.root}>
      <View style={s.bg} />
      <Surface style={s.card} elevation={3}>
        <Image source={require('../assets/logo.png')} style={s.logo} resizeMode="contain" />

        <Text style={s.codigo}>404</Text>
        <Text variant="titleLarge" style={s.titulo}>{titulo}</Text>
        <Text variant="bodyMedium" style={s.mensagem}>{mensagem}</Text>

        {onVoltar && (
          <Button
            mode="contained"
            onPress={onVoltar}
            buttonColor={colors.green}
            textColor="#fff"
            style={s.btn}
            labelStyle={s.btnLabel}
          >
            {textoBotao}
          </Button>
        )}
      </Surface>
    </View>
  )
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center', padding: 24 },
  bg:        { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.dark },
  card:      { width: '100%', maxWidth: 420, borderRadius: 24, backgroundColor: 'rgba(245,244,217,0.05)', borderWidth: 1.5, borderColor: 'rgba(245,244,217,0.1)', padding: 32, alignItems: 'center', gap: 6 },
  logo:      { width: 64, height: 64, borderRadius: 32, marginBottom: 12, opacity: 0.9 },
  codigo:    { fontSize: 46, fontFamily: fonts.extrabold, color: colors.green, letterSpacing: 2, marginBottom: 4 },
  titulo:    { fontFamily: fonts.extrabold, color: colors.cream, textAlign: 'center', marginBottom: 8 },
  mensagem:  { fontFamily: fonts.regular, color: 'rgba(245,244,217,0.6)', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  btn:       { borderRadius: 24, width: '100%' },
  btnLabel:  { fontSize: 14, fontFamily: fonts.bold, paddingVertical: 2 },
})
