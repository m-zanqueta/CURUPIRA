import { useEffect, useState } from 'react'
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { listarIconesMissoes, listarTarefasAdmin, salvarTarefaAdmin, removerMissaoStorage } from '../services/storage'
import { colors, fonts } from '../theme'

const VAZIA = { nome: '', descricao: '', moedas: '0', icone: '', imagensEstagio: [null, null, null, null, null], etapas: [{ titulo: '', descricao: '', moedas: '0' }] }
const ROTULOS_ESTAGIO = ['0% · Solo', '25% · Semente', '50% · Broto', '75% · Árvore jovem', '100% · Árvore imensa']
export default function AdminTarefasManager({ visible, onClose }) {
  const [tarefas, setTarefas] = useState([])
  const [icones, setIcones] = useState([])
  const [form, setForm] = useState(VAZIA)
  const [editando, setEditando] = useState(false)
  const [imagemInsignia, setImagemInsignia] = useState(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const imagensInsignias = icones.filter(item => /^https?:\/\//i.test(item.icone || ''))

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

  useEffect(() => { if (visible) { setForm(VAZIA); setImagemInsignia(null); setEditando(false); setConfirmandoExclusao(false); carregar() } }, [visible])

  function editar(tarefa) {
    setForm({
      id: tarefa.id,
      nome: tarefa.nome || '',
      descricao: tarefa.descricao || '',
      moedas: String(tarefa.moedas ?? 0),
      icone: tarefa.icone || '',
      imagensEstagio: Array.isArray(tarefa.imagensEstagio) && tarefa.imagensEstagio.length === 5 ? tarefa.imagensEstagio : [null, null, null, null, null],
      ativa: tarefa.ativa ?? true,
      etapas: Array.isArray(tarefa.etapas) && tarefa.etapas.length
        ? tarefa.etapas.map(etapa => ({ titulo: etapa.titulo || '', descricao: etapa.descricao || '', moedas: String(etapa.moedas ?? 0) }))
        : [{ titulo: '', descricao: '', moedas: '0' }],
    })
    setErro('')
    setImagemInsignia(null)
    setConfirmandoExclusao(false)
    setEditando(true)
  }

  async function salvar() {
    const moedas = Number(form.moedas)
    const imagensEstagioValidas = Array.isArray(form.imagensEstagio) && form.imagensEstagio.length === 5 && form.imagensEstagio.every(imagem => (typeof imagem === 'string' && /^https:\/\//i.test(imagem)) || (imagem && typeof imagem === 'object' && imagem.uri))
    const etapasValidas = form.etapas.every(e => e.titulo.trim() && e.descricao.trim() && String(e.moedas ?? '').trim() !== '' && Number.isSafeInteger(Number(e.moedas)) && Number(e.moedas) >= 0 && Number(e.moedas) <= 100000)
    if (!form.nome.trim()) return setErro('Preencha o título da trilha.')
    if (!form.descricao.trim()) return setErro('Preencha a descrição da trilha.')
    if (!imagemInsignia && !/^https?:\/\//i.test(form.icone || '')) return setErro('Escolha uma imagem para a insígnia da trilha. Esse campo é obrigatório.')
    if (!imagensEstagioValidas) return setErro('Escolha as 5 imagens de crescimento, dos estágios de 0% a 100%.')
    if (String(form.moedas).trim() === '' || !Number.isSafeInteger(moedas) || moedas < 0 || moedas > 100000) return setErro('Informe um bônus inteiro entre 0 e 100.000 moedas.')
    if (!form.etapas.length || !etapasValidas) return setErro('Preencha título, descrição e moedas inteiras entre 0 e 100.000 para cada tarefa.')
    setSalvando(true)
    setErro('')
    try {
      await salvarTarefaAdmin({ ...form, imagemInsignia, moedas })
      setForm(VAZIA)
      setImagemInsignia(null)
      setEditando(false)
      setConfirmandoExclusao(false)
      await carregar()
    } catch (e) { setErro(e?.message || 'Não foi possível salvar. Verifique as políticas do Supabase.') }
    finally { setSalvando(false) }
  }

  async function escolherImagemInsignia() {
    try {
      const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permissao.granted) return setErro('Permita o acesso à galeria para escolher a imagem.')
      const resultado = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.85 })
      if (resultado.canceled) return
      const imagem = resultado.assets?.[0]
      if (!imagem) return
      if (imagem.fileSize && imagem.fileSize > 2 * 1024 * 1024) return setErro('A imagem da insígnia precisa ter no máximo 2 MB.')
      setImagemInsignia(imagem)
      setErro('')
    } catch (e) { setErro(e?.message || 'Não foi possível abrir a galeria de imagens.') }
  }

  async function escolherImagemEstagio(indice) {
    try {
      const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permissao.granted) return setErro('Permita o acesso à galeria para escolher as imagens do bioma.')
      const resultado = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.8 })
      if (resultado.canceled) return
      const imagem = resultado.assets?.[0]
      if (!imagem) return
      if (imagem.fileSize && imagem.fileSize > 2 * 1024 * 1024) return setErro('Cada imagem de crescimento pode ter no máximo 2 MB.')
      setForm(v => ({ ...v, imagensEstagio: v.imagensEstagio.map((atual, i) => i === indice ? imagem : atual) }))
      setErro('')
    } catch (e) { setErro(e?.message || 'Não foi possível abrir a galeria de imagens.') }
  }

  async function excluirTarefa() {
    if (!form.id) return
    setSalvando(true)
    setErro('')
    try {
      await removerMissaoStorage(form.id, [form.icone, ...(form.imagensEstagio || [])])
      setConfirmandoExclusao(false)
      setForm(VAZIA)
      setEditando(false)
      await carregar()
    } catch (e) {
      setErro(e?.message || 'Não foi possível excluir a trilha e estornar as moedas.')
    } finally { setSalvando(false) }
  }

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={s.overlay}><View style={s.panel}>
      <View style={s.header}>
        <View style={{ flex: 1 }}><Text style={s.title}>Gerenciar tarefas</Text><Text style={s.sub}>Edite as tarefas disponíveis para as turmas.</Text></View>
        <TouchableOpacity onPress={onClose}><Text style={s.close}>×</Text></TouchableOpacity>
      </View>
      {editando ? <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => { setEditando(false); setForm(VAZIA); setImagemInsignia(null); setErro(''); setConfirmandoExclusao(false) }}><Text style={s.back}>‹ Voltar à lista</Text></TouchableOpacity>
        <Text style={s.label}>Título da trilha *</Text><TextInput value={form.nome} onChangeText={nome => setForm(v => ({ ...v, nome }))} style={s.input} placeholder="Ex.: Horta Caseira" />
        <Text style={s.label}>Descrição da trilha *</Text><TextInput value={form.descricao} onChangeText={descricao => setForm(v => ({ ...v, descricao }))} style={[s.input, { minHeight: 68 }]} multiline placeholder="Conte do que se trata esta trilha" />
        <Text style={s.label}>Insígnia da tarefa *</Text>
        {!!imagensInsignias.length && <><Text style={s.muted}>Escolha uma imagem já cadastrada ou envie outra.</Text><View style={s.choices}>{imagensInsignias.map(item => <TouchableOpacity key={item.id} onPress={() => { setForm(v => ({ ...v, icone: item.icone })); setImagemInsignia(null) }} style={[s.badgeChoice, form.icone === item.icone && !imagemInsignia && s.choiceActive]} accessibilityRole="button" accessibilityLabel={item.nome}><Image source={{ uri: item.icone }} style={s.badgeChoiceImage} resizeMode="contain" /><Text style={s.choiceText} numberOfLines={1}>{item.nome}</Text></TouchableOpacity>)}</View></>}
        <TouchableOpacity style={s.imagePicker} onPress={escolherImagemInsignia}>
          {(imagemInsignia?.uri || /^https?:\/\//i.test(form.icone || ''))
            ? <Image source={{ uri: imagemInsignia?.uri || form.icone }} style={s.badgePreview} resizeMode="contain" />
            : <Text style={s.imagePickerText}>＋ Escolher imagem da insígnia</Text>}
          {!!imagemInsignia && <Text style={s.choiceText}>Nova insígnia selecionada · toque para trocar</Text>}
        </TouchableOpacity>
        {!!imagemInsignia && <TouchableOpacity onPress={() => setImagemInsignia(null)}><Text style={s.remove}>Remover imagem nova</Text></TouchableOpacity>}
        <Text style={s.muted}>Obrigatório. PNG, JPEG, WEBP ou GIF até 2 MB. Também é possível adicionar uma insígnia ao editar trilhas antigas.</Text>
        <Text style={s.label}>Imagens do crescimento do bioma *</Text>
        <Text style={s.muted}>Envie 5 imagens. A cena muda conforme as tarefas forem concluídas: 0%, 25%, 50%, 75% e 100%.</Text>
        <View style={s.ecoImageGrid}>{form.imagensEstagio.map((imagem, index) => {
          const uri = typeof imagem === 'string' ? imagem : imagem?.uri
          return <View key={index} style={s.ecoImageItem}>
            <Text style={s.ecoImageLabel}>{ROTULOS_ESTAGIO[index]}</Text>
            <TouchableOpacity style={s.ecoImagePicker} onPress={() => escolherImagemEstagio(index)} accessibilityRole="button" accessibilityLabel={`Escolher imagem do estágio ${ROTULOS_ESTAGIO[index]}`}>
              {uri ? <Image source={{ uri }} style={s.ecoImagePreview} resizeMode="cover" /> : <Text style={s.ecoImagePlaceholder}>＋ Imagem</Text>}
            </TouchableOpacity>
            {!!imagem && typeof imagem === 'object' && <Text style={s.ecoImagePending}>Nova imagem selecionada</Text>}
          </View>
        })}</View>
        <Text style={s.muted}>Obrigatórias. PNG, JPEG, WEBP ou GIF até 2 MB cada. Ao salvar, as imagens anteriores substituídas são removidas do Storage.</Text>
        <Text style={s.label}>Bônus ao concluir a trilha (moedas) *</Text><Text style={s.muted}>Recebido após a coordenação aprovar a trilha.</Text><TextInput value={form.moedas} onChangeText={moedas => setForm(v => ({ ...v, moedas }))} style={s.input} keyboardType="number-pad" />
        <Text style={s.label}>Tarefas da trilha</Text>
        {form.etapas.map((etapa, index) => <View key={index} style={s.stage}>
          <Text style={s.stageTitle}>Tarefa {index + 1}</Text>
          <Text style={s.label}>Título da tarefa *</Text>
          <TextInput value={etapa.titulo} onChangeText={titulo => setForm(v => ({ ...v, etapas: v.etapas.map((e, i) => i === index ? { ...e, titulo } : e) }))} style={s.input} placeholder="Ex.: Encher a caixa de terra" />
          <Text style={s.label}>Descrição da tarefa *</Text>
          <TextInput value={etapa.descricao} onChangeText={descricao => setForm(v => ({ ...v, etapas: v.etapas.map((e, i) => i === index ? { ...e, descricao } : e) }))} style={[s.input, { minHeight: 60 }]} multiline placeholder="Explique o que o aluno deve fazer" />
          <Text style={s.label}>Moedas ao concluir esta tarefa *</Text>
          <View style={s.coinRow}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Diminuir moedas" style={s.coinStep} onPress={() => setForm(v => ({ ...v, etapas: v.etapas.map((e, i) => i === index ? { ...e, moedas: String(Math.max(0, (Number(e.moedas) || 0) - 1)) } : e) }))}><Text style={s.coinStepText}>−</Text></TouchableOpacity>
            <TextInput value={etapa.moedas} onChangeText={moedas => setForm(v => ({ ...v, etapas: v.etapas.map((e, i) => i === index ? { ...e, moedas: moedas.replace(/[^0-9]/g, '') } : e) }))} style={[s.input, s.coinInput]} keyboardType="number-pad" selectTextOnFocus />
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Aumentar moedas" style={s.coinStep} onPress={() => setForm(v => ({ ...v, etapas: v.etapas.map((e, i) => i === index ? { ...e, moedas: String((Number(e.moedas) || 0) + 1) } : e) }))}><Text style={s.coinStepText}>+</Text></TouchableOpacity>
          </View>
          {form.etapas.length > 1 && <TouchableOpacity onPress={() => setForm(v => ({ ...v, etapas: v.etapas.filter((_, i) => i !== index) }))}><Text style={s.remove}>Remover tarefa</Text></TouchableOpacity>}
        </View>)}
        <TouchableOpacity style={s.secondary} onPress={() => setForm(v => ({ ...v, etapas: [...v.etapas, { titulo: '', descricao: '', moedas: '0' }] }))}><Text style={s.secondaryText}>+ Adicionar tarefa à trilha</Text></TouchableOpacity>
        {form.id && <>
          {!confirmandoExclusao ? (
            <TouchableOpacity style={s.deleteButton} disabled={salvando} onPress={() => setConfirmandoExclusao(true)}>
              <Text style={s.deleteText}>Excluir trilha e tarefas</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.confirmCard}>
              <Text style={s.confirmTitle}>Excluir esta trilha de todas as turmas?</Text>
              <Text style={s.confirmText}>A trilha e suas tarefas serão removidas. Os créditos por tarefa e o bônus final serão estornados dos alunos conforme o histórico.</Text>
              <View style={s.confirmActions}>
                <TouchableOpacity style={s.cancelDelete} disabled={salvando} onPress={() => setConfirmandoExclusao(false)}><Text style={s.cancelDeleteText}>Manter tarefa</Text></TouchableOpacity>
                <TouchableOpacity style={[s.confirmDelete, salvando && { opacity: 0.6 }]} disabled={salvando} onPress={excluirTarefa}>
                  {salvando ? <ActivityIndicator color="#fff" /> : <Text style={s.confirmDeleteText}>Excluir e estornar</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>}
        {!!erro && <Text style={s.error}>{erro}</Text>}
        <TouchableOpacity style={s.primary} onPress={salvar} disabled={salvando || confirmandoExclusao}>{salvando ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>{form.id ? 'Salvar tarefa' : 'Criar tarefa'}</Text>}</TouchableOpacity>
      </ScrollView> : <>
        <TouchableOpacity style={s.primary} onPress={() => { setForm({ ...VAZIA }); setImagemInsignia(null); setEditando(true); setErro('') }}><Text style={s.primaryText}>+ Nova tarefa</Text></TouchableOpacity>
        {carregando ? <ActivityIndicator style={{ margin: 24 }} color={colors.green} /> : <ScrollView style={s.list}>
          {tarefas.map(t => <TouchableOpacity key={t.id} style={s.task} onPress={() => editar(t)}>
            <View style={s.taskHeading}>
              {typeof t.icone === 'string' && /^https?:\/\//i.test(t.icone) ? <Image source={{ uri: t.icone }} style={{ width: 28, height: 28 }} resizeMode="contain" /> : <View style={s.badgePlaceholder} />}
              <Text style={s.taskName}>{t.nome}</Text>
            </View>
            <Text style={s.muted}>{(t.etapas || []).length} tarefas · bônus final {t.moedas || 0} moedas</Text>
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
  body: { paddingBottom: 12 }, list: { marginTop: 12 }, task: { padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, marginTop: 8 }, taskHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 }, taskName: { color: colors.dark, fontFamily: fonts.bold, fontSize: 16, flex: 1 },
  label: { marginTop: 12, marginBottom: 5, color: colors.dark, fontFamily: fonts.semibold }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.cream, padding: 10, color: colors.dark, fontFamily: fonts.regular, minWidth: 0 },
  coinRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, coinInput: { flex: 1, textAlign: 'center' }, coinStep: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.greenLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }, coinStepText: { color: colors.green, fontSize: 22, fontFamily: fonts.bold },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, choice: { borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 }, choiceActive: { borderColor: colors.green, backgroundColor: colors.greenLight }, choiceText: { color: colors.dark, fontFamily: fonts.regular },
  badgeChoice: { width: 104, minHeight: 92, borderWidth: 1, borderColor: colors.border, padding: 7, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4 }, badgeChoiceImage: { width: 52, height: 52 }, badgePlaceholder: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.border },
  imagePicker: { minHeight: 94, padding: 10, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.green, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', gap: 6 }, imagePickerText: { color: colors.green, fontFamily: fonts.semibold }, badgePreview: { width: 72, height: 72 },
  ecoImageGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginTop: 8 }, ecoImageItem: { width: '48%', marginBottom: 5 }, ecoImageLabel: { color: colors.dark, fontSize: 12, fontFamily: fonts.semibold, marginBottom: 5 }, ecoImagePicker: { height: 116, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.green, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, ecoImagePreview: { width: '100%', height: '100%' }, ecoImagePlaceholder: { color: colors.green, fontFamily: fonts.semibold }, ecoImagePending: { color: colors.green, fontSize: 10, fontFamily: fonts.semibold, marginTop: 4 },
  stage: { padding: 10, backgroundColor: '#f8f6df', borderRadius: 12, marginTop: 8, gap: 6 }, stageTitle: { fontFamily: fonts.semibold, color: colors.dark }, muted: { color: colors.muted, fontFamily: fonts.regular, marginTop: 5 }, error: { color: '#c0392b', fontFamily: fonts.semibold, marginTop: 10 },
  primary: { marginTop: 12, minHeight: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.green, padding: 11, borderRadius: 10 }, primaryText: { color: '#fff', fontFamily: fonts.bold }, secondary: { marginTop: 8, alignItems: 'center', padding: 10 }, secondaryText: { color: colors.green, fontFamily: fonts.semibold },
  deleteButton: { marginTop: 18, minHeight: 42, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e3a5a5', borderRadius: 10, padding: 10 }, deleteText: { color: '#bd2727', fontFamily: fonts.bold },
  confirmCard: { marginTop: 10, padding: 12, gap: 8, backgroundColor: '#fff5f5', borderColor: '#e8aaaa', borderWidth: 1, borderRadius: 10 }, confirmTitle: { color: '#a61b1b', fontFamily: fonts.bold }, confirmText: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 }, confirmActions: { flexDirection: 'row', gap: 8, marginTop: 4 }, cancelDelete: { flex: 1, minHeight: 40, justifyContent: 'center', alignItems: 'center', borderColor: colors.border, borderWidth: 1, borderRadius: 8 }, cancelDeleteText: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 12 }, confirmDelete: { flex: 1, minHeight: 40, justifyContent: 'center', alignItems: 'center', backgroundColor: '#bd2727', borderRadius: 8, paddingHorizontal: 6 }, confirmDeleteText: { color: '#fff', fontFamily: fonts.bold, fontSize: 12 },
  back: { color: colors.green, fontFamily: fonts.semibold, marginTop: 7 }, remove: { color: '#c0392b', fontFamily: fonts.semibold, padding: 7 },
})
