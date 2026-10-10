import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Image, ActivityIndicator,
} from 'react-native'
import { supabase } from '../services/supabase'
import { atualizarAluno } from '../services/storage'
import { fonts } from '../theme'
import { cores } from '../constants/cores'

const VERDE = cores.verdePrimario || '#009D25'

export default function EntrarTurma({ aluno, onEntrou, onPular }) {
  const [codigo,  setCodigo]  = useState('')
  const [erro,    setErro]    = useState('')
  const [loading, setLoading] = useState(false)

  async function handleEntrar() {
    if (!codigo.trim()) { setErro('Digite o código da turma.'); return }
    setErro('')
    setLoading(true)
    try {
      const { data: turma, error } = await supabase
        .from('turmas')
        .select('id, nome, codigo, professor_id')
        .eq('codigo', codigo.trim().toUpperCase())
        .maybeSingle()

      if (error) throw error
      if (!turma) { setErro('Código inválido. Verifique com seu professor.'); return }

      await atualizarAluno(aluno.id, { turmaId: turma.id })
      onEntrou({ ...aluno, turmaId: turma.id }, turma)
    } catch(e) {
      console.error(e)
      setErro('Erro ao entrar na turma. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Topo verde */}
        <View style={s.topo}>
          <Image source={require('../assets/logo.png')} style={s.logo} resizeMode="contain" />
          <Text style={s.appNome}>CURUPIRA</Text>
          <Text style={s.tagline}>Atividades extracurriculares gamificadas</Text>
        </View>

        {/* Card branco */}
        <View style={s.card}>
          <View style={s.iconeWrap}>
            <Text style={s.icone}>🔑</Text>
          </View>

          <Text style={s.titulo}>Entre na sua turma</Text>
          <Text style={s.sub}>
            Olá, <Text style={s.subNome}>{aluno?.nome || aluno?.usuario}!</Text>{'\n'}
            Peça o código da turma ao seu professor para liberar o seu pet.
          </Text>

          <Text style={s.label}>Código da Turma</Text>
          <TextInput
            style={s.inputCodigo}
            placeholder="Ex: TURMA2A"
            placeholderTextColor="#bbb"
            autoCapitalize="characters"
            autoCorrect={false}
            value={codigo}
            onChangeText={t => { setCodigo(t.toUpperCase()); setErro('') }}
            maxLength={12}
          />

          {erro ? (
            <View style={s.erroWrap}>
              <Text style={s.erroTxt}>⚠️ {erro}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[s.btnEntrar, loading && { opacity: 0.7 }]}
            onPress={handleEntrar} disabled={loading} activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnEntrarTxt}>Entrar na turma →</Text>
            }
          </TouchableOpacity>

          {onPular && (
            <TouchableOpacity style={s.btnPular} onPress={onPular}>
              <Text style={s.btnPularTxt}>Fazer isso depois</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: VERDE },
  scroll:      { flexGrow: 1 },
  topo:        { alignItems: 'center', paddingTop: 50, paddingBottom: 28, gap: 8 },
  logo:        { width: 80, height: 80, borderRadius: 40 },
  appNome:     { fontSize: 24, fontFamily: fonts.extrabold, color: '#fff', letterSpacing: 3 },
  tagline:     { fontSize: 12, fontFamily: fonts.regular, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  card:        { backgroundColor: '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32, flex: 1, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 48 },
  iconeWrap:   { width: 72, height: 72, borderRadius: 36, backgroundColor: '#f0fff4', borderWidth: 2, borderColor: VERDE + '40', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16 },
  icone:       { fontSize: 34 },
  titulo:      { fontSize: 22, fontFamily: fonts.extrabold, color: '#111', textAlign: 'center', marginBottom: 8 },
  sub:         { fontSize: 14, fontFamily: fonts.regular, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  subNome:     { fontFamily: fonts.bold, color: '#111' },
  label:       { fontSize: 13, fontFamily: fonts.semibold, color: '#444', marginBottom: 8 },
  inputCodigo: { borderWidth: 2, borderColor: VERDE, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 16, fontSize: 24, fontFamily: fonts.bold, color: '#111', letterSpacing: 6, textAlign: 'center', backgroundColor: '#f8fff8', marginBottom: 16 },
  erroWrap:    { backgroundColor: '#fff0f0', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#ffcccc' },
  erroTxt:     { fontSize: 13, fontFamily: fonts.semibold, color: '#c0392b', textAlign: 'center' },
  btnEntrar:   { backgroundColor: VERDE, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginBottom: 12, elevation: 4, shadowColor: VERDE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  btnEntrarTxt:{ fontSize: 16, fontFamily: fonts.bold, color: '#fff' },
  btnPular:    { alignItems: 'center', paddingVertical: 10 },
  btnPularTxt: { fontSize: 13, fontFamily: fonts.medium, color: '#aaa' },
})
