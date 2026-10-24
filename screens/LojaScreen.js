import { useState, useEffect, useRef } from 'react'
import {
  View, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Platform, Image, Modal,
} from 'react-native'
import { Appbar, Chip, Text, ActivityIndicator } from 'react-native-paper'
import { colors, fonts } from '../theme'
import { carregarEstadoLoja, comprarItem, listarAcessoriosLoja, obterResultadoMigracao } from '../services/storage'

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
    case 'pendente_sessao': return null // a sessão inválida volta ao login (tratado em App.js)
    case 'pendente_reconciliacao':
    case 'pendente': return 'A sincronização do inventário antigo não foi confirmada. Seus dados locais estão preservados e uma nova tentativa será feita.'
    case 'concluida_com_pendencias': {
      const n = m.pendencias
      return `${n} ${n === 1 ? 'item/equipamento do seu inventário antigo não foi migrado' : 'itens/equipamentos do seu inventário antigo não foram migrados'} (saldo insuficiente, item desativado ou conflito com a nuvem). Uma cópia continua salva neste aparelho.`
    }
    default: return null
  }
}
import { IconeAcessorio } from '../components/IconeUI'
import TextoContorno from '../components/TextoContorno'
import { listarItensComprados, comprarItem, listarAcessoriosLoja } from '../services/storage'

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

// Modal de confirmação de compra — substitui window.confirm/Alert.alert
// (que na web, depois que o navegador "lembra" a escolha de não mostrar
// mais diálogos, simplesmente para de abrir — travando a compra). Usa
// react-native Modal, que já funciona tanto na web quanto no nativo (é o
// mesmo componente usado em ModalItens na tela do pet).
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
                <Button
                  mode="outlined"
                  onPress={onCancelar}
                  disabled={processando}
                  style={[s.confirmBtn, { borderColor: 'rgba(245,244,217,0.3)' }]}
                  textColor="rgba(245,244,217,0.8)"
                >
                  Cancelar
                </Button>
                <Button
                  mode="contained"
                  onPress={onConfirmar}
                  disabled={processando}
                  loading={processando}
                  buttonColor={colors.green}
                  textColor="#fff"
                  style={s.confirmBtn}
                >
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
  const [pendente,     setPendente]     = useState(null)  // item aguardando confirmação no modal
  const [processando,  setProcessando]  = useState(false) // true durante a chamada de comprarItem (evita cliques repetidos)
  const [erroCompra,   setErroCompra]   = useState(null)
  // Saldo vindo do servidor (null = modo local/legado, saldo derivado do XP do login).
  const [saldoServidor, setSaldoServidor] = useState(null)
  const [aviso,        setAviso]        = useState(null)  // falha ao carregar / itens não migrados
  // Trava síncrona: o state `processando` só atualiza no próximo render, então
  // dois cliques no mesmo tick passariam pelo `if (processando)`. O ref fecha essa janela.
  const travaCompra = useRef(false)

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
        // sessao_invalida é tratada globalmente (volta ao login); aqui só avisa falha de rede.
        if (!ativo || erro?.codigo === 'sessao_invalida') return
        setAviso(erro?.codigo === 'configuracao' || erro?.codigo === 'migration_ausente'
          ? 'Erro de configuração do servidor ao carregar seu inventário. Avise seu professor.'
          : 'Não foi possível carregar seu inventário agora. Verifique a conexão e tente novamente.')
      })
    return () => { ativo = false }
  }, [aluno?.id])
  const [moedas,    setMoedas]    = useState(aluno?.moedas || aluno?.xp || 0)
  const [comprados, setComprados] = useState([])
  const [produtos,  setProdutos]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [idx,       setIdx]       = useState(0)
  const [pager,     setPager]     = useState({ w: 0, h: 0 })
  const [dialogo,   setDialogo]   = useState(null)
  const pagerRef = useRef(null)

  useEffect(() => { listarItensComprados().then(setComprados) }, [])
  useEffect(() => {
    listarAcessoriosLoja()
      .then(itens => setProdutos(itens || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const cardW = Math.max(120, (pager.w - 28 - 10) / 2)

  // O saldo NÃO é um valor próprio persistido — é derivado do XP do aluno
  // (vindo do Supabase) menos o custo dos itens que ele já comprou (lista
  // persistida em AsyncStorage, ver services/storage.js). Isso garante que
  // o saldo exibido sempre bate com o inventário real depois de um
  // recarregamento (F5/Ctrl+R): como "comprados" é recarregado do
  // AsyncStorage no mount, o saldo recalculado aqui já sai correto, sem
  // precisar guardar "moedas restantes" em nenhum lugar separado.
  const saldoBase = aluno?.xp ?? 1000
  const totalGasto = useMemo(
    () => produtos
      .filter(p => comprados.includes(p.id))
      .reduce((soma, p) => soma + (Number(p.preco) || 0), 0),
    [produtos, comprados]
  )
  // Com nuvem, o saldo é o do servidor; sem nuvem, o derivado de antes. Em ambos, nunca negativo na tela.
  // Saldo real negativo (XP caiu depois de compras) é permitido no servidor; a tela sempre mostra 0 e bloqueia novas compras.
  const saldo = Math.max(0, saldoServidor != null ? saldoServidor : saldoBase - totalGasto)
  function irPara(i) {
    setIdx(i)
    pagerRef.current?.scrollTo({ x: i * pager.w, y: 0, animated: true })
  }
  function aoTerminarArraste(e) {
    if (!pager.w) return
    setIdx(Math.round(e.nativeEvent.contentOffset.x / pager.w))
  }

  // Alert.alert não funciona no navegador (web), por isso a confirmação é um modal próprio
  function handleComprar(p) {
    if (comprados.includes(p.id)) return
    if (moedas < p.preco) {
      setDialogo({ tipo: 'aviso', titulo: 'Moedas insuficientes', texto: `Você precisa de ${p.preco} moedas.\nSeu saldo: ${moedas} moedas.` })
      return
    }
    setDialogo({
      tipo: 'confirmar', item: p,
      titulo: `Comprar ${p.nome}?`,
      texto: `Custo: ${p.preco} moedas\nSaldo depois: ${moedas - p.preco} moedas`,
    })
  }

  async function confirmarCompra(p) {
    setDialogo(null)
    try {
      await comprarItem(p.id)
      setMoedas(m => m - p.preco)
      setComprados(prev => [...prev, p.id])
      setDialogo({ tipo: 'aviso', item: p, titulo: 'Comprado!', texto: `${p.nome} foi para o inventário do seu pet!` })
    } catch (e) {
      console.error(e)
      setDialogo({ tipo: 'aviso', titulo: 'Ops!', texto: 'Não foi possível comprar agora. Tente de novo.' })
    }
  }

  function renderCard(p) {
    const comprado  = comprados.includes(p.id)
    const semMoedas = !comprado && moedas < p.preco
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

    travaCompra.current = true
    setProcessando(true)
    setErroCompra(null)
    try {
      const r = await comprarItem(aluno.id, item.id)
      // Daqui em diante o servidor JÁ confirmou a compra: nada abaixo pode mostrar "falha na compra".
      if (r?.saldo != null) {
        setSaldoServidor(r.saldo)
        setComprados(prev => (prev.some(id => String(id) === String(item.id)) ? prev : [...prev, item.id]))
      }
      setPendente(null)
      // Recarrega o estado real (servidor ou local no modo legado); se só essa releitura falhar, a tela
      // mantém o que o servidor acabou de confirmar.
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

      {/* App Bar — react-native-paper Appbar */}
      <Appbar.Header style={[s.appBar, { backgroundColor: 'transparent' }]} statusBarHeight={Platform.OS === 'android' ? 0 : undefined}>
        <Appbar.BackAction onPress={onLogout} color="#fff" />
        <Appbar.Content title="Loja" titleStyle={s.appBarTitle} />
        {/* Chip de moedas */}
        <Chip
          style={s.moedasChip}
          textStyle={s.moedasVal}
          icon={() => <Text style={{ fontSize: 14 }}>⭐</Text>}
          compact
        >
          {saldo.toLocaleString('pt-BR')}
        </Chip>
      </Appbar.Header>

      {aviso ? (
        <Text variant="labelSmall" style={{ color: '#ffb74d', textAlign: 'center', paddingHorizontal: 16, paddingBottom: 6 }}>{aviso}</Text>
      ) : null}

      {/* Hero Card — react-native-paper Surface */}
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
        {CATEGORIAS.map(c => (
          <Chip
            key={c.id}
            selected={cat === c.id}
            onPress={() => setCat(c.id)}
            style={[s.filterChip, cat === c.id && s.filterChipAtivo]}
            textStyle={[s.filterChipLabel, cat === c.id && { color: '#00C853' }]}
            selectedColor="#00C853"
            showSelectedCheck
            compact
          >
            {c.label}
          </Chip>
        </Appbar.Header>

        {/* Placa da loja */}
        <View style={s.heroCard}>
          <View style={s.heroPetCircle}>
            {turma?.pet
              ? <Image source={{ uri: turma.pet }} style={{ width: 48, height: 48 }} resizeMode="contain" />
              : <Image source={require('../assets/logo.png')} style={{ width: 40, height: 40 }} resizeMode="contain" />}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.heroTitle} numberOfLines={1} adjustsFontSizeToFit>Loja do Curupira</Text>
            <View style={s.heroPill}>
              <Text style={s.heroPillTxt}>{comprados.length} {comprados.length === 1 ? 'item' : 'itens'}</Text>
            </View>
            <Text style={s.heroDica}>Itens comprados aparecem no seu pet</Text>
          </View>
        </View>

        {/* Abas de categoria */}
        <View style={s.tabs}>
          {CATEGORIAS.map((c, i) => {
            const ativo = i === idx
            return (
              <TouchableOpacity key={c.id} activeOpacity={0.85} onPress={() => irPara(i)} style={{ flex: 1 }}>
                <View style={[s.tabLip, { backgroundColor: ativo ? '#C47F00' : '#0A2A1D' }]}>
                  <View style={[s.tabFace, { backgroundColor: ativo ? '#FFC928' : '#1F6B49' }]}>
                    <IconeAcessorio slot={c.id} size={26} />
                    <Text style={[s.tabTxt, { color: ativo ? '#3E2723' : '#FFFFFF' }]} numberOfLines={1}>{c.label}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Páginas: deslize para o lado para trocar de categoria */}
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
      </View>

      {/* Janela de confirmação / aviso */}
      <Modal transparent visible={!!dialogo} animationType="fade" onRequestClose={() => setDialogo(null)}>
        <View style={s.overlay}>
          <View style={s.dlg}>
            {dialogo?.item?.imagem && (
              <Image source={{ uri: dialogo.item.imagem }} style={s.dlgImg} resizeMode="contain" />
            )}
            <Text style={s.dlgTitulo}>{dialogo?.titulo}</Text>
            <Text style={s.dlgTexto}>{dialogo?.texto}</Text>
            <View style={s.dlgBtns}>
              {dialogo?.tipo === 'confirmar' && (
                <BotaoGordo face="#9AA5B1" lip="#5F6B7A" onPress={() => setDialogo(null)} style={{ flex: 1 }}>
                  <TextoContorno size={15}>Cancelar</TextoContorno>
                </BotaoGordo>
              )}
              <BotaoGordo
                face="#4CD137" lip="#2E8B1E" style={{ flex: 1 }}
                onPress={() => dialogo?.tipo === 'confirmar' ? confirmarCompra(dialogo.item) : setDialogo(null)}
              >
                <TextoContorno size={15}>{dialogo?.tipo === 'confirmar' ? 'Comprar' : 'Ok'}</TextoContorno>
              </BotaoGordo>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  // No navegador a tela precisa de altura fixa; senão a lista não rola
  root:               { flex: 1, ...(Platform.OS === 'web' ? { height: '100vh', overflow: 'hidden' } : {}) },
  bgBase:             { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0E3B2A' },
  bgCard:             { position: 'absolute', top: '15%', left: 0, right: 0, bottom: 0, backgroundColor: '#165238', borderTopLeftRadius: 32, borderTopRightRadius: 32 },
  coluna:             { flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center' },
  appBar:             { elevation: 0 },
  appBarTitle:        { fontSize: 20, fontFamily: fonts.extrabold, color: '#fff', letterSpacing: 0.5 },
  moedasChip:         { backgroundColor: colors.yellowLight + '22', borderColor: colors.yellow + '66', borderWidth: 1.5, marginRight: 8 },
  moedasVal:          { fontSize: 13, fontFamily: fonts.bold, color: colors.yellow },

  heroCard:           { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 12, backgroundColor: '#FFF8E1', borderRadius: 22, borderWidth: 3.5, borderColor: '#1B5E20', borderBottomWidth: 8, padding: 12 },
  heroPetCircle:      { width: 62, height: 62, borderRadius: 31, backgroundColor: '#E6F7EA', borderWidth: 3.5, borderColor: '#1B5E20', alignItems: 'center', justifyContent: 'center' },
  heroTitle:          { fontFamily: fonts.extrabold, fontSize: 21, color: '#1B5E20' },
  heroPill:           { alignSelf: 'flex-start', backgroundColor: '#FFC928', borderRadius: 14, borderWidth: 2.5, borderColor: '#3E2723', paddingHorizontal: 10, paddingVertical: 2 },
  heroPillTxt:        { fontFamily: fonts.extrabold, fontSize: 13, color: '#3E2723' },
  heroDica:           { fontFamily: fonts.semibold, fontSize: 12, color: '#5D4037' },

  tabs:               { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  tabLip:             { borderRadius: 16, borderWidth: 3, borderColor: '#0A2A1D', paddingBottom: 4 },
  tabFace:            { height: 42, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 4 },
  tabTxt:             { fontSize: 13, fontFamily: fonts.extrabold },

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

  overlay:            { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dlg:                { width: '100%', maxWidth: 360, backgroundColor: '#FFF8E1', borderRadius: 24, borderWidth: 4, borderColor: '#1B5E20', borderBottomWidth: 9, padding: 20, alignItems: 'center', gap: 10 },
  dlgImg:             { width: 110, height: 110 },
  dlgTitulo:          { fontFamily: fonts.extrabold, fontSize: 20, color: '#1B5E20', textAlign: 'center' },
  dlgTexto:           { fontFamily: fonts.semibold, fontSize: 14, color: '#5D4037', textAlign: 'center' },
  dlgBtns:            { flexDirection: 'row', gap: 10, marginTop: 6, width: '100%' },
})
