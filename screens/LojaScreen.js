import { useState, useEffect, useRef, useMemo } from 'react'
import {
  View, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Platform, Image, Modal,
} from 'react-native'
import { Appbar, Chip, Text, ActivityIndicator, Surface, Button } from 'react-native-paper'
import { colors, fonts } from '../theme'
import { carregarEstadoLoja, comprarItem, listarAcessoriosLoja, obterResultadoMigracao } from '../services/storage'
import { IconeAcessorio } from '../components/IconeUI'
import TextoContorno from '../components/TextoContorno'

// Texto do aviso de sincronização conforme o estado explícito devolvido por carregarEstadoLoja.
function avisoDeSincronizacao(e) {
  if (!e.nuvem) {
    return e.servidor && e.servidor !== 'ausente'
      ? 'Modo local: suas compras ainda não estão sincronizadas com a nuvem. Saia e entre novamente, com internet, para sincronizar.'
      : null
  }
  const m = e.migracao
  if (!m) return null
  switch (m.estado) {
    case 'pendente_rede': return 'Seu inventário antigo ainda não foi sincronizado (sem conexão). Ele continua salvo neste aparelho e será enviado automaticamente.'
    case 'pendente_configuracao': return 'Não foi possível sincronizar seu inventário antigo (erro de configuração do servidor). Seus dados locais estão preservados; avise seu professor.'
    case 'pendente_sessao': return null
    case 'pendente_reconciliacao':
    case 'pendente': return 'A sincronização do inventário antigo não foi confirmada. Seus dados locais estão preservados e uma nova tentativa será feita.'
    case 'concluida_com_pendencias': {
      const n = m.pendencias
      return `${n} ${n === 1 ? 'item/equipamento do seu inventário antigo não foi migrado' : 'itens/equipamentos do seu inventário antigo não foram migrados'} (saldo insuficiente, item desativado ou conflito com a nuvem). Uma cópia continua salva neste aparelho.`
    }
    default: return null
  }
}

// Uma página (deslizável) por categoria
const CATEGORIAS = [
  { id: 'chapeu', label: 'Chapéus'  },
  { id: 'colar',  label: 'Colares'  },
  { id: 'fundo',  label: 'Cenários' },
]

const RAR_CFG = {
  comum:    { cor: '#CFD8DC', bg: 'rgba(207,216,220,0.18)', label: 'COMUM'    },
  raro:     { cor: '#69F0AE', bg: 'rgba(105,240,174,0.18)', label: 'RARO'     },
  epico:    { cor: '#E0AAFF', bg: 'rgba(224,170,255,0.20)', label: 'ÉPICO'    },
  lendario: { cor: '#FFD54F', bg: 'rgba(255,213,79,0.20)',  label: 'LENDÁRIO' },
}

// Botão "gordinho" 3D (afunda ao tocar)
function BotaoGordo({ face, lip, onPress, disabled, children, style }) {
  const [ap, setAp] = useState(false)
  return (
    <TouchableOpacity
      activeOpacity={1}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => setAp(true)}
      onPressOut={() => setAp(false)}
      style={style}
    >
      <View style={[s.bLip, { backgroundColor: lip, paddingBottom: ap ? 2 : 5, marginTop: ap ? 3 : 0 }]}>
        <View style={[s.bFace, { backgroundColor: face }]}>
          <View style={s.bShine} />
          {children}
        </View>
      </View>
    </TouchableOpacity>
  )
}

// Modal de confirmação de compra
function ModalConfirmarCompra({ item, saldo, processando, erro, onCancelar, onConfirmar }) {
  const visible = !!item
  const saldoApos = item ? saldo - item.preco : saldo
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancelar}>
      <View style={s.confirmBg}>
        <Surface style={s.confirmSheet} elevation={5}>
          {item && (
            <>
              <Text variant="titleMedium" style={s.confirmTitulo}>Confirmar compra</Text>
              <View style={s.confirmItemRow}>
                {item.imagem
                  ? <Image source={{ uri: item.imagem }} style={s.confirmItemImg} resizeMode="contain" />
                  : <View style={s.confirmItemImgPlaceholder} />
                }
                <View style={{ flex: 1 }}>
                  <Text variant="titleSmall" style={s.confirmItemNome} numberOfLines={2}>{item.nome}</Text>
                  <Text variant="bodyMedium" style={s.confirmPreco}>{item.preco} moedas</Text>
                </View>
              </View>
              <View style={s.confirmSaldoBox}>
                <View style={s.confirmSaldoRow}>
                  <Text variant="bodySmall" style={s.confirmSaldoLabel}>Saldo atual</Text>
                  <Text variant="bodySmall" style={s.confirmSaldoValor}>{saldo.toLocaleString('pt-BR')} moedas</Text>
                </View>
                <View style={s.confirmSaldoRow}>
                  <Text variant="bodySmall" style={s.confirmSaldoLabel}>Saldo após a compra</Text>
                  <Text variant="bodySmall" style={[s.confirmSaldoValor, { color: saldoApos < 0 ? '#ff6b6b' : colors.green }]}>
                    {saldoApos.toLocaleString('pt-BR')} moedas
                  </Text>
                </View>
              </View>
              {!!erro && (
                <View style={s.confirmErroBox}>
                  <Text variant="bodySmall" style={s.confirmErroTxt}>{erro}</Text>
                </View>
              )}
              <View style={s.confirmBotoesRow}>
                <Button mode="outlined" onPress={onCancelar} disabled={processando} style={[s.confirmBtn, { borderColor: 'rgba(245,244,217,0.3)' }]} textColor="rgba(245,244,217,0.8)">
                  Cancelar
                </Button>
                <Button mode="contained" onPress={onConfirmar} disabled={processando} loading={processando} buttonColor={colors.green} textColor="#fff" style={s.confirmBtn}>
                  {processando ? 'Processando...' : 'Confirmar compra'}
                </Button>
              </View>
            </>
          )}
        </Surface>
      </View>
    </Modal>
  )
}

export default function LojaScreen({ onLogout, aluno, turma }) {
  const [cat,          setCat]          = useState('todos')
  const [comprados,    setComprados]    = useState([])
  const [produtos,     setProdutos]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [pendente,     setPendente]     = useState(null)
  const [processando,  setProcessando]  = useState(false)
  const [erroCompra,   setErroCompra]   = useState(null)
  const [saldoServidor, setSaldoServidor] = useState(null)
  const [aviso,        setAviso]        = useState(null)
  const travaCompra = useRef(false)

  const [idx,       setIdx]       = useState(0)
  const [pager,     setPager]     = useState({ w: 0, h: 0 })
  const pagerRef = useRef(null)

  useEffect(() => {
    if (!aluno?.id) { setComprados([]); return }
    let ativo = true
    carregarEstadoLoja(aluno.id)
      .then(e => {
        if (!ativo) return
        setComprados(e.comprados)
        setSaldoServidor(e.saldo)
        setAviso(avisoDeSincronizacao(e))
      })
      .catch(erro => {
        console.error('Erro ao carregar inventário:', erro?.codigo || erro?.message)
        if (!ativo || erro?.codigo === 'sessao_invalida') return
        setAviso(erro?.codigo === 'configuracao' || erro?.codigo === 'migration_ausente'
          ? 'Erro de configuração do servidor ao carregar seu inventário. Avise seu professor.'
          : 'Não foi possível carregar seu inventário agora. Verifique a conexão e tente novamente.')
      })
    return () => { ativo = false }
  }, [aluno?.id])

  useEffect(() => {
    listarAcessoriosLoja()
      .then(itens => setProdutos(itens || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const cardW = Math.max(120, (pager.w - 28 - 10) / 2)

  const saldoBase = aluno?.xp ?? 1000
  const totalGasto = useMemo(
    () => produtos
      .filter(p => comprados.includes(p.id))
      .reduce((soma, p) => soma + (Number(p.preco) || 0), 0),
    [produtos, comprados]
  )
  const saldo = Math.max(0, saldoServidor != null ? saldoServidor : saldoBase - totalGasto)

  function irPara(i) {
    setIdx(i)
    pagerRef.current?.scrollTo({ x: i * pager.w, y: 0, animated: true })
  }
  
  function aoTerminarArraste(e) {
    if (!pager.w) return
    setIdx(Math.round(e.nativeEvent.contentOffset.x / pager.w))
  }

  function handleComprar(p) {
    if (comprados.includes(p.id)) return
    setErroCompra(null)
    setPendente(p)
  }

  async function confirmarCompra(p) {
    if (travaCompra.current) return
    travaCompra.current = true
    setProcessando(true)
    setErroCompra(null)
    
    try {
      const r = await comprarItem(aluno.id, p.id)
      if (r?.saldo != null) {
        setSaldoServidor(r.saldo)
        setComprados(prev => (prev.some(id => String(id) === String(p.id)) ? prev : [...prev, p.id]))
      }
      setPendente(null)
      try {
        const atualizado = await carregarEstadoLoja(aluno.id)
        setComprados(atualizado.comprados)
        setSaldoServidor(atualizado.saldo)
      } catch (e) { console.error('Compra confirmada; falha ao reler o estado:', e?.codigo || e?.message) }
    } catch (erro) {
      console.error('Erro ao comprar item:', erro?.codigo || erro?.message)
      setErroCompra(
        erro?.codigo === 'saldo_insuficiente' ? 'Saldo insuficiente para concluir esta compra.'
        : erro?.codigo === 'item_indisponivel' ? 'Este item não está mais disponível.'
        : erro?.codigo === 'rede' ? 'Sem conexão com o servidor. Nada foi cobrado; tente novamente.'
        : erro?.codigo === 'configuracao' || erro?.codigo === 'migration_ausente' ? 'Erro de configuração do servidor. Nada foi cobrado; avise seu professor.'
        : 'Não foi possível concluir a compra. Tente novamente.')
    } finally {
      travaCompra.current = false
      setProcessando(false)
    }
  }

  function renderCard(p) {
    const comprado  = comprados.includes(p.id)
    const semMoedas = !comprado && saldo < p.preco
    const rar       = RAR_CFG[p.raridade?.toLowerCase()] || RAR_CFG.comum
    const fundo     = p.slot === 'fundo'
    const face = comprado ? '#4CD137' : semMoedas ? '#9AA5B1' : '#FFC928'
    const lip  = comprado ? '#2E8B1E' : semMoedas ? '#5F6B7A' : '#C47F00'
    const imgW = cardW - 28
    
    return (
      <View key={p.id} style={[s.prodCard, { width: cardW }, comprado && { borderColor: '#69F0AE' }]}>
        <View style={[s.rarBadge, { backgroundColor: rar.bg }]}>
          <Text variant="labelSmall" style={[s.rarLabel, { color: rar.cor }]}>{rar.label}</Text>
        </View>
        <View style={{ width: imgW, height: fundo ? imgW * 1.2 : imgW, alignItems: 'center', justifyContent: 'center' }}>
          {p.imagem
            ? <Image source={{ uri: p.imagem }} style={{ width: '100%', height: '100%', borderRadius: fundo ? 12 : 0 }} resizeMode={fundo ? 'cover' : 'contain'} />
            : <View style={s.prodImgPlaceholder} />}
        </View>
        <Text style={s.prodNome} numberOfLines={2}>{p.nome}</Text>
        <BotaoGordo face={face} lip={lip} disabled={comprado} onPress={() => handleComprar(p)} style={{ width: '100%' }}>
          {comprado
            ? <TextoContorno size={13}>No inventário</TextoContorno>
            : <>
                <Text style={{ fontSize: 20 }}>💰</Text>
                <TextoContorno size={15}>{String(p.preco)}</TextoContorno>
              </>}
        </BotaoGordo>
      </View>
    )
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0E3B2A" />
      <View style={s.bgBase} />
      <View style={s.bgCard} />

      <Appbar.Header style={[s.appBar, { backgroundColor: 'transparent' }]} statusBarHeight={Platform.OS === 'android' ? 0 : undefined}>
        <Appbar.BackAction onPress={onLogout} color="#fff" />
        <Appbar.Content title="Loja" titleStyle={s.appBarTitle} />
        <Chip style={s.moedasChip} textStyle={s.moedasVal} icon={() => <Text style={{ fontSize: 14 }}>⭐</Text>} compact>
          {saldo.toLocaleString('pt-BR')}
        </Chip>
      </Appbar.Header>

      {aviso ? (
        <Text variant="labelSmall" style={{ color: '#ffb74d', textAlign: 'center', paddingHorizontal: 16, paddingBottom: 6 }}>{aviso}</Text>
      ) : null}

      <Surface style={s.heroCard} elevation={2}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="titleMedium" style={s.heroTitle}>Loja do Curupira</Text>
          <Text variant="bodySmall" style={s.heroSub}>
            {comprados.length} {comprados.length === 1 ? 'item' : 'itens'} no inventário
          </Text>
          <Text variant="labelSmall" style={s.heroDica}>Itens comprados aparecem no seu pet</Text>
        </View>
        <View style={s.heroPetCircle}>
          {turma?.pet
            ? <Image source={{ uri: turma.pet }} style={{ width: 42, height: 42 }} resizeMode="contain" />
            : <Image source={require('../assets/logo.png')} style={{ width: 36, height: 36 }} resizeMode="contain" />
          }
        </View>
      </Surface>

            {/* Filter Chips — react-native-paper Chip */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtrosRow}>
        {CATEGORIAS.map((c, i) => (
          <Chip
            key={c.id}
            selected={idx === i}
            onPress={() => irPara(i)}
            style={[s.filterChip, idx === i && s.filterChipAtivo]}
            textStyle={[s.filterChipLabel, idx === i && { color: '#00C853' }]}
            selectedColor="#00C853"
            showSelectedCheck
            compact
          >
            {c.label}
          </Chip>
        ))}
      </ScrollView>

      <View style={{ flex: 1 }} onLayout={e => setPager({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {loading ? (
          <View style={s.centralWrap}>
            <ActivityIndicator animating color="#69F0AE" size="large" />
            <Text variant="bodyMedium" style={s.centralTxt}>Carregando itens...</Text>
          </View>
        ) : pager.w > 0 && (
          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={aoTerminarArraste}
            style={{ flex: 1 }}
          >
            {CATEGORIAS.map(c => {
              const lista = produtos.filter(p => p.slot === c.id)
              return (
                <View key={c.id} style={{ width: pager.w, height: pager.h }}>
                  {lista.length === 0 ? (
                    <View style={s.centralWrap}>
                      <IconeAcessorio slot={c.id} size={64} />
                      <Text variant="titleMedium" style={s.centralTitulo}>Nada por aqui ainda</Text>
                      <Text variant="bodyMedium" style={s.centralTxt}>Novos itens em breve!</Text>
                    </View>
                  ) : (
                    <ScrollView contentContainerStyle={s.grade} showsVerticalScrollIndicator={false}>
                      {lista.map(renderCard)}
                      <View style={{ width: '100%', height: 24 }} />
                    </ScrollView>
                  )}
                </View>
              )
            })}
          </ScrollView>
        )}
      </View>

      <ModalConfirmarCompra
        item={pendente}
        saldo={saldo}
        processando={processando}
        erro={erroCompra}
        onCancelar={() => { if (!processando) { setPendente(null); setErroCompra(null); } }}
        onConfirmar={() => confirmarCompra(pendente)}
      />
    </View>
  )
}

const s = StyleSheet.create({
  root:               { flex: 1, ...(Platform.OS === 'web' ? { height: '100vh', overflow: 'hidden' } : {}) },
  bgBase:             { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0E3B2A' },
  bgCard:             { position: 'absolute', top: '15%', left: 0, right: 0, bottom: 0, backgroundColor: '#165238', borderTopLeftRadius: 32, borderTopRightRadius: 32 },
  appBar:             { elevation: 0 },
  appBarTitle:        { fontSize: 20, fontFamily: fonts.extrabold, color: '#fff', letterSpacing: 0.5 },
  moedasChip:         { backgroundColor: colors.yellowLight + '22', borderColor: colors.yellow + '66', borderWidth: 1.5, marginRight: 8 },
  moedasVal:          { fontSize: 13, fontFamily: fonts.bold, color: colors.yellow },
  heroCard:           { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 12, backgroundColor: '#FFF8E1', borderRadius: 22, borderWidth: 3.5, borderColor: '#1B5E20', borderBottomWidth: 8, padding: 12 },
  heroPetCircle:      { width: 62, height: 62, borderRadius: 31, backgroundColor: '#E6F7EA', borderWidth: 3.5, borderColor: '#1B5E20', alignItems: 'center', justifyContent: 'center' },
  heroTitle:          { fontFamily: fonts.extrabold, fontSize: 21, color: '#1B5E20' },
  heroSub:            { fontFamily: fonts.regular, fontSize: 13, color: '#5D4037' },
  heroDica:           { fontFamily: fonts.semibold, fontSize: 12, color: '#5D4037' },
  filtrosRow:         { paddingHorizontal: 16, gap: 8, paddingBottom: 10 },
  filterChip:         { backgroundColor: 'rgba(255,255,255,0.1)' },
  filterChipAtivo:    { backgroundColor: 'rgba(0,200,83,0.2)' },
  filterChipLabel:    { color: 'rgba(255,255,255,0.7)', fontFamily: fonts.semibold },
  grade:              { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 4 },
  prodCard:           { borderRadius: 20, borderWidth: 2, borderColor: 'rgba(245,244,217,0.18)', backgroundColor: 'rgba(255,255,255,0.09)', padding: 14, alignItems: 'center', gap: 8 },
  rarBadge:           { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, alignSelf: 'center' },
  rarLabel:           { fontSize: 11, fontFamily: fonts.bold, letterSpacing: 1 },
  prodImgPlaceholder: { width: '100%', height: '100%', backgroundColor: 'rgba(245,244,217,0.06)', borderRadius: 12 },
  prodNome:           { fontFamily: fonts.bold, fontSize: 15, color: '#FFFFFF', textAlign: 'center' },
  bLip:               { borderRadius: 16, borderWidth: 3, borderColor: '#1B1030', paddingBottom: 5 },
  bFace:              { height: 42, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden', paddingHorizontal: 8 },
  bShine:             { position: 'absolute', top: 0, left: 0, right: 0, height: '45%', backgroundColor: 'rgba(255,255,255,0.3)' },
  centralWrap:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  centralTitulo:      { fontFamily: fonts.bold, color: colors.cream },
  centralTxt:         { fontFamily: fonts.regular, color: 'rgba(245,244,217,0.75)' },
  confirmBg:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  confirmSheet:       { width: '100%', maxWidth: 400, backgroundColor: '#1B432D', borderRadius: 24, padding: 24, gap: 16, borderWidth: 2, borderColor: 'rgba(245,244,217,0.1)' },
  confirmTitulo:      { fontFamily: fonts.bold, color: '#FFF8E1', textAlign: 'center', marginBottom: 4 },
  confirmItemRow:     { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 16 },
  confirmItemImg:     { width: 60, height: 60, borderRadius: 8 },
  confirmItemImgPlaceholder: { width: 60, height: 60, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)' },
  confirmItemNome:    { color: '#FFF8E1', fontFamily: fonts.bold },
  confirmPreco:       { color: colors.yellow, fontFamily: fonts.semibold },
  confirmSaldoBox:    { backgroundColor: 'rgba(0,0,0,0.15)', padding: 12, borderRadius: 12, gap: 8 },
  confirmSaldoRow:    { flexDirection: 'row', justifyContent: 'space-between' },
  confirmSaldoLabel:  { color: 'rgba(245,244,217,0.6)' },
  confirmSaldoValor:  { color: '#FFF8E1', fontFamily: fonts.bold },
  confirmErroBox:     { backgroundColor: 'rgba(255,107,107,0.15)', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,107,107,0.3)' },
  confirmErroTxt:     { color: '#ff6b6b', textAlign: 'center' },
  confirmBotoesRow:   { flexDirection: 'row', gap: 12, marginTop: 8 },
  confirmBtn:         { flex: 1 },
})