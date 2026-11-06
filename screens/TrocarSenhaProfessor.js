import { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { colors, fonts } from '../theme'
import { alterarMinhaSenhaStaff } from '../services/storage'

export default function TrocarSenhaProfessor({ usuario, onConcluido }) {
  const [senhaAtual, setSenhaAtual] = useState('')
  const [senhaNova, setSenhaNova] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  async function salvar() {
    if (!senhaAtual) { setErro('Digite a senha temporária recebida por e-mail.'); return }
    if (senhaNova.length < 8 || !/[A-Z]/.test(senhaNova) || !/[a-z]/.test(senhaNova) || !/[0-9]/.test(senhaNova) || !/[^A-Za-z0-9]/.test(senhaNova)) {
      setErro('Use pelo menos 8 caracteres, com maiúscula, minúscula, número e símbolo.')
      return
    }
    if (senhaNova !== confirmacao) { setErro('A confirmação não corresponde à nova senha.'); return }

    setErro('')
    setCarregando(true)
    try {
      await alterarMinhaSenhaStaff(senhaAtual, senhaNova)
      onConcluido?.()
    } catch (error) {
      setErro(error?.message || 'Não foi possível alterar a senha. Tente novamente.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.icon}>🔐</Text>
          <Text style={styles.title}>Crie sua nova senha</Text>
          <Text style={styles.subtitle}>Olá, {usuario?.nome || 'professor(a)'}. Por segurança, altere a senha temporária antes de continuar.</Text>

          <Text style={styles.label}>Senha temporária</Text>
          <TextInput style={styles.input} value={senhaAtual} onChangeText={setSenhaAtual} secureTextEntry autoCapitalize="none" editable={!carregando} />

          <Text style={styles.label}>Nova senha</Text>
          <TextInput style={styles.input} value={senhaNova} onChangeText={setSenhaNova} secureTextEntry autoCapitalize="none" editable={!carregando} />

          <Text style={styles.label}>Confirme a nova senha</Text>
          <TextInput style={styles.input} value={confirmacao} onChangeText={setConfirmacao} secureTextEntry autoCapitalize="none" editable={!carregando} />
          <Text style={styles.hint}>Mínimo de 8 caracteres, com letra maiúscula, minúscula, número e símbolo.</Text>

          {!!erro && <Text accessibilityRole="alert" style={styles.error}>{erro}</Text>}
          <TouchableOpacity style={[styles.button, carregando && styles.disabled]} onPress={salvar} disabled={carregando}>
            {carregando ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Salvar nova senha</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 480, alignSelf: 'center', backgroundColor: colors.white, borderRadius: 18, padding: 24, gap: 8, borderWidth: 1, borderColor: colors.border },
  icon: { fontSize: 34, textAlign: 'center', marginBottom: 4 },
  title: { color: colors.dark, fontFamily: fonts.extrabold, fontSize: 22, textAlign: 'center' },
  subtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, textAlign: 'center', marginBottom: 10 },
  label: { color: colors.dark, fontFamily: fonts.semibold, fontSize: 12, marginTop: 5 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: colors.cream, color: colors.dark, paddingHorizontal: 12, paddingVertical: 12, fontFamily: fonts.regular, fontSize: 14 },
  hint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 17 },
  error: { color: '#b3261e', fontFamily: fonts.semibold, fontSize: 12, marginTop: 4 },
  button: { backgroundColor: colors.green, borderRadius: 10, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  buttonText: { color: colors.white, fontFamily: fonts.bold, fontSize: 14 },
  disabled: { opacity: 0.65 },
})
