import { useEffect, useState } from 'react'
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { listarIconesMissoes, listarTarefasAdmin, salvarTarefaAdmin } from '../services/storage'
import { colors, fonts } from '../theme'

const VAZIA = { nome: '', descricao: '', moedas: '0', icone: '', etapas: [{ titulo: '', xp: '5' }] }

export default function AdminTarefasManager({ visible, onClose }) {
  const [tarefas, setTarefas] = useState([])
  const [icones, setIcones] = useState([])
  const [form, setForm] = useState(VAZIA)
  const [editando, setEditando] = useState(false)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)

  async function carregar() {
    setCarregando(true)
    setErro('')
    try {
      const [lista, imagens] = await Promise.all([listarTarefasAdmin(), listarIconesMissoes()])
      setTarefas(lista)
      setIcones(imagens)
    } catch (e) { setErro(e?.message || 'Não foi possível carregar as tarefas.') }
    finally { setCarregando(false) }
  }

  useEffect(() => { if (visible) { setForm(VAZIA); setEditando(false); carregar() } }, [visible])

  function editar(tarefa) {
    setForm({
      id: tarefa.id,
      nome: tarefa.nome || '',
      descricao: tarefa.descricao || '',
      moedas: String(tarefa.moedas ?? 0),
      icone: tarefa.icone || '',
      ativa: tarefa.ativa ?? true,
      etapas: Array.isArray(tarefa.etapas) && tarefa.etapas.length
        ? tarefa.etapas.map(etapa => ({ titulo: etapa.titulo || '', xp: String(etapa.xp ?? 0) }))
        : [{ titulo: '', xp: '5' }],
    })
    setErro('')
    setEditando(true)
  }

  async function salvar() {
    const moedas = Number(form.moedas)
    const etapasValidas = form.etapas.every(e => e.titulo.trim() && String(e.xp ?? '').trim() !== '' && Number.isInteger(Number(e.xp)) && Number(e.xp) >= 0)
    if (!form.nome.trim()) return setErro('Preencha o título da tarefa.')
    if (!form.icone) return setErro('Escolha um ícone cadastrado pelo administrador.')
    if (!Number.isInteger(moedas) || moedas < 0) return setErro('Informe uma recompensa inteira de moedas igual ou maior que zero.')
    if (!form.etapas.length || !etapasValidas) return setErro('Preencha o nome e o XP inteiro de cada etapa.')
    setSalvando(true)
    setErro('')
    try {
      await salvarTarefaAdmin({ ...form, moedas })
      setForm(VAZIA)
      setEditando(false)
      await carregar()
    } catch (e) { setErro(e?.message || 'Não foi possível salvar. Verifique as políticas do Supabase.') }
    finally { setSalvando(false) }
  }

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={s.overlay}><View style={s.panel}>
      <View style={s.header}>
        <View style={{ flex: 1 }}><Text style={s.title}>Tarefas</Text><Text style={s.sub}>O administrador define o conteúdo e as etapas.</Text></View>
        <TouchableOpacity onPress={onClose}><Text style={s.close}>×</Text></TouchableOpacity>
      </View>
      {editando ? <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => { setEditando(false); setForm(VAZIA); setErro('') }}><Text style={s.back}>‹ Voltar à lista</Text></TouchableOpacity>
        <Text style={s.label}>Título *</Text><TextInput value={form.nome} onChangeText={nome => setForm(v => ({ ...v, nome }))} style={s.input} placeholder="Ex.: Composteira caseira" />
        <Text style={s.label}>Descrição</Text><TextInput value={form.descricao} onChangeText={descricao => setForm(v => ({ ...v, descricao }))} style={[s.input, { minHeight: 68 }]} multiline />
        <Text style={s.label}>Ícone *</Text><View style={s.choices}>{icones.map(item => <TouchableOpacity key={item.id} onPress={() => setForm(v => ({ ...v, icone: item.icone }))} style={[s.choice, form.icone === item.icone && s.choiceActive]}><Text style={s.choiceText}>{item.nome}</Text></TouchableOpacity>)}</View>
        {!icones.length && <Text style={s.muted}>Cadastre primeiro um ícone de missão.</Text>}
        <Text style={s.label}>Recompensa ao concluir (moedas)</Text><TextInput value={form.moedas} onChangeText={moedas => setForm(v => ({ ...v, moedas }))} style={s.input} keyboardType="number-pad" />
        <Text style={s.label}>Etapas da trilha</Text>
        {form.etapas.map((etapa, index) => <View key={index} style={s.stage}>
          <Text style={s.stageTitle}>Etapa {index + 1}</Text>
          <TextInput value={etapa.titulo} onChangeText={titulo => setForm(v => ({ ...v, etapas: v.etapas.map((e, i) => i === index ? { ...e, titulo } : e) }))} style={s.input} placeholder="Descrição da etapa" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><TextInput value={etapa.xp} onChangeText={xp => setForm(v => ({ ...v, etapas: v.etapas.map((e, i) => i === index ? { ...e, xp } : e) }))} style={[s.input, { flex: 1 }]} keyboardType="number-pad" placeholder="XP" /><Text style={s.muted}>XP</Text>
            {form.etapas.length > 1 && <TouchableOpacity onPress={() => setForm(v => ({ ...v, etapas: v.etapas.filter((_, i) => i !== index) }))}><Text style={s.remove}>Remover</Text></TouchableOpacity>}
          </View>
        </View>)}
        <TouchableOpacity style={s.secondary} onPress={() => setForm(v => ({ ...v, etapas: [...v.etapas, { titulo: '', xp: '5' }] }))}><Text style={s.secondaryText}>+ Adicionar etapa</Text></TouchableOpacity>
        {!!erro && <Text style={s.error}>{erro}</Text>}
        <TouchableOpacity style={s.primary} onPress={salvar} disabled={salvando}>{salvando ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>{form.id ? 'Salvar tarefa' : 'Criar tarefa'}</Text>}</TouchableOpacity>
      </ScrollView> : <>
        <TouchableOpacity style={s.primary} onPress={() => { setForm({ ...VAZIA }); setEditando(true); setErro('') }}><Text style={s.primaryText}>+ Nova tarefa</Text></TouchableOpacity>
        {carregando ? <ActivityIndicator style={{ margin: 24 }} color={colors.green} /> : <ScrollView style={s.list}>
          {tarefas.map(t => <TouchableOpacity key={t.id} style={s.task} onPress={() => editar(t)}>
            <Text style={s.taskName}>{t.nome}</Text><Text style={s.muted}>{(t.etapas || []).length} etapas · {(t.etapas || []).reduce((a, e) => a + (Number(e.xp) || 0), 0)} XP · {t.moedas || 0} moedas</Text>
            <Text style={s.back}>Editar conteúdo ›</Text>
          </TouchableOpacity>)}
          {!tarefas.length && <Text style={s.muted}>Nenhuma tarefa cadastrada.</Text>}
        </ScrollView>}
        {!!erro && <Text style={s.error}>{erro}</Text>}
      </>}
    </View></View>
  </Modal>
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 12 },
  panel: { backgroundColor: '#fff', borderRadius: 18, maxHeight: '94%', padding: 18, width: '100%', maxWidth: 620, alignSelf: 'center' },
  header: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 14 },
  title: { fontSize: 22, color: colors.dark, fontFamily: fonts.bold }, sub: { color: colors.muted, marginTop: 3, fontFamily: fonts.regular }, close: { fontSize: 28, color: colors.muted },
  body: { paddingBottom: 12 }, list: { marginTop: 12 }, task: { padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, marginTop: 8 }, taskName: { color: colors.dark, fontFamily: fonts.bold, fontSize: 16 },
  label: { marginTop: 12, marginBottom: 5, color: colors.dark, fontFamily: fonts.semibold }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.cream, padding: 10, color: colors.dark, fontFamily: fonts.regular, minWidth: 0 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, choice: { borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 }, choiceActive: { borderColor: colors.green, backgroundColor: colors.greenLight }, choiceText: { color: colors.dark, fontFamily: fonts.regular },
  stage: { padding: 10, backgroundColor: '#f8f6df', borderRadius: 12, marginTop: 8, gap: 6 }, stageTitle: { fontFamily: fonts.semibold, color: colors.dark }, muted: { color: colors.muted, fontFamily: fonts.regular, marginTop: 5 }, error: { color: '#c0392b', fontFamily: fonts.semibold, marginTop: 10 },
  primary: { marginTop: 12, minHeight: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.green, padding: 11, borderRadius: 10 }, primaryText: { color: '#fff', fontFamily: fonts.bold }, secondary: { marginTop: 8, alignItems: 'center', padding: 10 }, secondaryText: { color: colors.green, fontFamily: fonts.semibold },
  back: { color: colors.green, fontFamily: fonts.semibold, marginTop: 7 }, remove: { color: '#c0392b', fontFamily: fonts.semibold, padding: 7 },
})
