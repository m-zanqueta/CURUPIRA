import { useState } from 'react'
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { colors, fonts } from '../theme'
import { LOGO_CURUPIRA, SLOGAN_CURUPIRA } from '../constants/brand'
import { confirmarRecuperacaoSenha, solicitarRecuperacaoSenha } from '../services/storage'

export default function RecuperarSenha({ papel, onVoltar }) {
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  async function enviarCodigo() {
    const normalizado = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizado)) { setErro('Digite um e-mail válido.'); return }
    setCarregando(true); setErro(''); setSucesso('')
    try {
      const resultado = await solicitarRecuperacaoSenha(normalizado, papel)
      setEmail(normalizado)
      setEnviado(true)
      setSucesso(resultado?.mensagem || 'Se houver uma conta com esse e-mail, enviaremos um código.')
    } catch (e) { setErro(e?.message || 'Não foi possível enviar o código. Tente novamente.') }
    finally { setCarregando(false) }
  }

  async function trocarSenha() {
    if (!/^\d{6}$/.test(codigo.trim())) { setErro('Digite o código de 6 números recebido por e-mail.'); return }
    if (senha.length < 8 || !/[A-Z]/.test(senha) || !/[a-z]/.test(senha) || !/\d/.test(senha) || !/[^A-Za-z0-9]/.test(senha)) {
      setErro('Use 8 caracteres ou mais, com maiúscula, minúscula, número e símbolo.'); return
    }
    if (senha !== confirmacao) { setErro('As senhas não correspondem.'); return }
    setCarregando(true); setErro(''); setSucesso('')
    try {
      await confirmarRecuperacaoSenha(email, papel, codigo, senha)
      setSucesso('Senha alterada! Entre com sua nova senha.')
    } catch (e) { setErro(e?.message || 'Não foi possível alterar a senha. Peça um novo código e tente novamente.') }
    finally { setCarregando(false) }
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.topo}>
          <Image source={LOGO_CURUPIRA} style={s.logo} resizeMode="contain" />
          <Text style={s.nome}>CURUPIRA</Text><Text style={s.slogan}>{SLOGAN_CURUPIRA}</Text>
        </View>
        <View style={s.card}>
          <Text style={s.titulo}>{sucesso.startsWith('Senha alterada') ? 'Tudo certo!' : 'Recuperar senha'}</Text>
          <Text style={s.sub}>{enviado ? `Se houver uma conta, o código foi enviado para ${email}. Confira também o spam.` : 'Vamos enviar um código para o e-mail da sua conta.'}</Text>
          {!enviado && <><Text style={s.label}>E-mail</Text><TextInput style={s.input} value={email} onChangeText={v => { setEmail(v); setErro('') }} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} editable={!carregando} placeholder="seu@email.com" /></>}
          {enviado && !sucesso.startsWith('Senha alterada') && <>
            <Text style={s.label}>Código de 6 números</Text><TextInput style={s.input} value={codigo} onChangeText={v => { setCodigo(v.replace(/\D/g, '').slice(0, 6)); setErro('') }} keyboardType="number-pad" editable={!carregando} placeholder="000000" />
            <Text style={s.label}>Nova senha</Text><TextInput style={s.input} value={senha} onChangeText={v => { setSenha(v); setErro('') }} secureTextEntry editable={!carregando} />
            <Text style={s.label}>Confirme a nova senha</Text><TextInput style={s.input} value={confirmacao} onChangeText={v => { setConfirmacao(v); setErro('') }} secureTextEntry editable={!carregando} />
          </>}
          {!!erro && <Text accessibilityRole="alert" style={s.erro}>{erro}</Text>}
          {!!sucesso && <Text style={s.sucesso}>{sucesso}</Text>}
          {!sucesso.startsWith('Senha alterada') && <TouchableOpacity style={s.botao} onPress={enviado ? trocarSenha : enviarCodigo} disabled={carregando}>
            {carregando ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoTexto}>{enviado ? 'Salvar nova senha' : 'Enviar código'}</Text>}
          </TouchableOpacity>}
          {enviado && !sucesso.startsWith('Senha alterada') && <TouchableOpacity onPress={enviarCodigo} disabled={carregando}><Text style={s.link}>Reenviar código</Text></TouchableOpacity>}
          <TouchableOpacity onPress={onVoltar} disabled={carregando}><Text style={s.link}>Voltar ao login</Text></TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream }, scroll: { flexGrow: 1, paddingBottom: 24 },
  topo: { backgroundColor: colors.green, alignItems: 'center', paddingTop: 28, paddingBottom: 24, gap: 4 }, logo: { width: 82, height: 82 },
  nome: { color: '#fff', fontSize: 22, fontFamily: fonts.extrabold, letterSpacing: 2 }, slogan: { color: '#ffffffd0', fontSize: 13, fontFamily: fonts.medium },
  card: { width: '100%', maxWidth: 500, alignSelf: 'center', padding: 22, gap: 9 }, titulo: { color: colors.dark, fontSize: 23, fontFamily: fonts.extrabold },
  sub: { color: colors.muted, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular, marginBottom: 6 }, label: { color: colors.dark, fontSize: 12, fontFamily: fonts.semibold },
  input: { borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 13, color: colors.dark, fontSize: 15 },
  erro: { color: '#b3261e', fontFamily: fonts.semibold, fontSize: 12 }, sucesso: { color: colors.green, fontFamily: fonts.semibold, fontSize: 13, lineHeight: 19 },
  botao: { backgroundColor: colors.green, borderRadius: 13, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 8 }, botaoTexto: { color: '#fff', fontFamily: fonts.extrabold, fontSize: 15 },
  link: { color: colors.green, textAlign: 'center', padding: 8, fontSize: 13, fontFamily: fonts.bold },
})
