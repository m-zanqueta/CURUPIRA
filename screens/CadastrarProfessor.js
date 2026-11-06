import { useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { colors, fonts } from '../theme'
import { convidarProfessorPorEmail } from '../services/storage'

export default function CadastrarProfessor() {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  async function enviarConvite() {
    const nomeLimpo = nome.trim()
    const emailLimpo = email.trim().toLowerCase()
    if (nomeLimpo.length < 3 || nomeLimpo.length > 100) {
      setErro('Informe um nome entre 3 e 100 caracteres.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailLimpo)) {
      setErro('Informe um e-mail válido.')
      return
    }

    setErro('')
    setSucesso('')
    setCarregando(true)
    try {
      const resposta = await convidarProfessorPorEmail({ nome: nomeLimpo, email: emailLimpo })
      setSucesso(resposta?.mensagem || `Convite enviado para ${emailLimpo}.`)
      setNome('')
      setEmail('')
    } catch (error) {
      setErro(error?.message || 'Não foi possível enviar o convite. Tente novamente.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cadastrar professor</Text>
      <Text style={styles.subtitle}>Enviaremos ao professor um convite com uma senha temporária. No primeiro acesso, ele deverá criar uma nova senha antes de usar o sistema.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Nome do professor</Text>
        <TextInput
          style={styles.input}
          value={nome}
          onChangeText={valor => { setNome(valor); setErro(''); setSucesso('') }}
          placeholder="Nome completo"
          placeholderTextColor="#9a9a91"
          autoCapitalize="words"
          editable={!carregando}
        />

        <Text style={styles.label}>E-mail</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={valor => { setEmail(valor); setErro(''); setSucesso('') }}
          placeholder="professor@escola.com"
          placeholderTextColor="#9a9a91"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!carregando}
        />

        {!!erro && <Text accessibilityRole="alert" style={styles.error}>{erro}</Text>}
        {!!sucesso && <Text style={styles.success}>{sucesso}</Text>}

        <TouchableOpacity style={[styles.button, carregando && styles.disabled]} onPress={enviarConvite} disabled={carregando}>
          {carregando
            ? <ActivityIndicator color={colors.white} />
            : <Text style={styles.buttonText}>Enviar convite por e-mail</Text>}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 8 },
  title: { color: colors.dark, fontFamily: fonts.extrabold, fontSize: 24 },
  subtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, marginBottom: 10 },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 22, borderWidth: 1, borderColor: colors.border, gap: 8 },
  label: { color: colors.dark, fontFamily: fonts.semibold, fontSize: 13, marginTop: 5 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: colors.cream, color: colors.dark, paddingHorizontal: 12, paddingVertical: 12, fontFamily: fonts.regular, fontSize: 14 },
  error: { color: '#b3261e', fontFamily: fonts.semibold, fontSize: 13, marginTop: 4 },
  success: { color: colors.green, fontFamily: fonts.semibold, fontSize: 13, marginTop: 4 },
  button: { backgroundColor: colors.green, borderRadius: 10, minHeight: 48, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  buttonText: { color: colors.white, fontFamily: fonts.bold, fontSize: 14 },
  disabled: { opacity: 0.65 },
})
