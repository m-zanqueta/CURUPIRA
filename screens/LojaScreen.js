import { useState, useEffect } from 'react'
import {
  View, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, Alert, StatusBar, Platform, Image,
} from 'react-native'
import {
  Appbar, Chip, Text, ActivityIndicator,
  Surface, Button,
} from 'react-native-paper'
import { colors, fonts } from '../theme'
import { listarItensComprados, comprarItem, listarAcessoriosLoja } from '../services/storage'

const WIN  = Dimensions.get('window')
const W    = Math.min(WIN.width, 480)
const CARD = (W - 48) / 2

const CATEGORIAS = [
  { id: 'todos',  label: 'Todos'   },
  { id: 'chapeu', label: 'Chapéus' },
  { id: 'colar',  label: 'Colares' },
  { id: 'fundo',  label: 'Cenários' },
]

// Cores de raridade baseadas no tema do projeto
const RAR_CFG = {
  comum:    { cor: '#78909C',      bg: 'rgba(120,144,156,0.12)', label: 'COMUM'    },
  raro:     { cor: colors.green,   bg: colors.greenLight+'33',   label: 'RARO'     },
  epico:    { cor: colors.purple,  bg: colors.purpleLight+'33',  label: 'ÉPICO'    },
  lendario: { cor: colors.yellow,  bg: colors.yellowLight+'33',  label: 'LENDÁRIO' },
}

export default function LojaScreen({ onLogout, aluno, turma }) {
  const [cat,       setCat]       = useState('todos')
  const [moedas,    setMoedas]    = useState(aluno?.xp || 1000)
  const [comprados, setComprados] = useState([])
  const [produtos,  setProdutos]  = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => { listarItensComprados().then(setComprados) }, [])

  useEffect(() => {
    listarAcessoriosLoja()
      .then(itens => setProdutos(itens || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const lista = cat === 'todos'
    ? produtos
    : produtos.filter(p => p.slot === cat)

  async function handleComprar(p) {
    if (comprados.includes(p.id)) return
    if (moedas < p.preco) {
      Alert.alert('Moedas insuficientes', `Você precisa de ${p.preco} moedas.\nSaldo: ${moedas} moedas.`)
      return
    }
    Alert.alert(
      `Comprar ${p.nome}?`,
      `Custo: ${p.preco} moedas\nSaldo após: ${moedas - p.preco} moedas`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Comprar', onPress: async () => {
          setMoedas(m => m - p.preco)
          setComprados(prev => [...prev, p.id])
          await comprarItem(p.id)
          Alert.alert('Comprado!', `${p.nome} foi adicionado ao inventário do seu pet!`)
        }},
      ]
    )
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#050f05" />
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
          {moedas.toLocaleString('pt-BR')}
        </Chip>
      </Appbar.Header>

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
        ))}
      </ScrollView>

      {/* Produtos */}
      {loading ? (
        <View style={s.centralWrap}>
          <ActivityIndicator animating color={colors.green} size="large" />
          <Text variant="bodyMedium" style={s.centralTxt}>Carregando itens... ⏳</Text>
        </View>
      ) : lista.length === 0 ? (
        <View style={s.centralWrap}>
          <Text style={{ fontSize: 48 }}>🛒</Text>
          <Text variant="titleMedium" style={s.centralTitulo}>Nenhum item disponível</Text>
          <Text variant="bodyMedium" style={s.centralTxt}>Novos itens em breve!</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.grade} showsVerticalScrollIndicator={false}>
          {lista.map(p => {
            const comprado  = comprados.includes(p.id)
            const semMoedas = !comprado && moedas < p.preco
            const rar       = RAR_CFG[p.raridade?.toLowerCase()] || RAR_CFG.comum
            return (
              /* Card — react-native-paper Surface */
              <Surface key={p.id} style={[s.prodCard, comprado && { borderColor: '#00C853', borderWidth: 2 }]} elevation={1}>
                {/* Badge raridade */}
                <View style={[s.rarBadge, { backgroundColor: rar.bg }]}>
                  <Text variant="labelSmall" style={[s.rarLabel, { color: rar.cor }]}>{rar.label}</Text>
                </View>

                {/* Imagem do Supabase Storage — upada pelo ADM */}
                <View style={[s.prodImgWrap, p.slot === 'fundo' && s.prodImgWrapFundo]}>
                  {p.imagem
                    ? <Image
                        source={{ uri: p.imagem }}
                        style={{ width: '100%', height: '100%', borderRadius: p.slot === 'fundo' ? 12 : 0 }}
                        resizeMode={p.slot === 'fundo' ? 'cover' : 'contain'}
                      />
                    : <View style={s.prodImgPlaceholder} />
                  }
                </View>

                <Text variant="labelMedium" style={s.prodNome} numberOfLines={2}>{p.nome}</Text>

                {/* Botão — react-native-paper Button */}
                <Button
                  mode={comprado ? 'outlined' : semMoedas ? 'outlined' : 'contained'}
                  onPress={() => handleComprar(p)}
                  disabled={comprado}
                  buttonColor={!comprado && !semMoedas ? rar.cor : undefined}
                  textColor={comprado ? '#00C853' : semMoedas ? '#ff6b6b' : '#fff'}
                  style={s.prodBtn}
                  labelStyle={s.prodBtnLabel}
                  compact
                >
                  {comprado ? 'No inventário' : `${p.preco} moedas`}
                </Button>
              </Surface>
            )
          })}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root:               { flex: 1 },
  bgBase:             { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#050f05' },
  bgCard:             { position: 'absolute', top: '15%', left: 0, right: 0, bottom: 0, backgroundColor: '#0a1a0a', borderTopLeftRadius: 32, borderTopRightRadius: 32 },
  appBar:             { elevation: 0 },
  appBarTitle:        { fontSize: 20, fontFamily: fonts.extrabold, color: '#fff', letterSpacing: 0.5 },
  moedasChip:         { backgroundColor: colors.yellowLight+'22', borderColor: colors.yellow+'66', borderWidth: 1.5, marginRight: 8 },
  moedasVal:          { fontSize: 13, fontFamily: fonts.bold, color: colors.yellow },
  heroCard:           { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 16, backgroundColor: colors.greenLight+'18', borderRadius: 20, borderWidth: 1.5, borderColor: colors.green+'33', padding: 16 },
  heroTitle:          { fontFamily: fonts.extrabold, color: colors.cream },
  heroSub:            { fontFamily: fonts.semibold, color: colors.green },
  heroDica:           { fontFamily: fonts.regular, color: 'rgba(245,244,217,0.4)' },
  heroPetCircle:      { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.green+'22', borderWidth: 2, borderColor: colors.green+'55', alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  filtrosRow:         { paddingHorizontal: 16, paddingBottom: 14, gap: 8, flexDirection: 'row' },
  filterChip:         { borderWidth: 1.5, borderColor: 'rgba(245,244,217,0.12)', backgroundColor: 'rgba(245,244,217,0.06)' },
  filterChipAtivo:    { borderColor: colors.green, backgroundColor: colors.green+'22' },
  filterChipLabel:    { fontSize: 13, fontFamily: fonts.semibold, color: 'rgba(245,244,217,0.5)' },
  grade:              { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 14 },
  prodCard:           { width: CARD, borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(245,244,217,0.1)', backgroundColor: 'rgba(245,244,217,0.04)', padding: 14, alignItems: 'center', gap: 8 },
  rarBadge:           { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, alignSelf: 'center' },
  rarLabel:           { fontSize: 9, fontFamily: fonts.bold, letterSpacing: 1 },
  prodImgWrap:        { width: CARD - 28, height: CARD - 28, alignItems: 'center', justifyContent: 'center' },
  prodImgWrapFundo:   { width: CARD - 28, height: (CARD - 28) * 1.4, borderRadius: 12, overflow: 'hidden' },
  prodImgPlaceholder: { width: '100%', height: '100%', backgroundColor: 'rgba(245,244,217,0.06)', borderRadius: 12 },
  prodNome:           { fontFamily: fonts.semibold, color: colors.cream, textAlign: 'center' },
  prodBtn:            { width: '100%', borderRadius: 20 },
  prodBtnLabel:       { fontSize: 12, fontFamily: fonts.bold },
  centralWrap:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  centralTitulo:      { fontFamily: fonts.bold, color: colors.cream },
  centralTxt:         { fontFamily: fonts.regular, color: 'rgba(245,244,217,0.4)' },
})
