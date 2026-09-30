import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator,
  Dimensions, Alert,
} from 'react-native'
import { cores } from '../constants/cores'
import { listarAcessoriosLoja, listarItensComprados, comprarItem } from '../services/storage'

const { width } = Dimensions.get('window')

const CATEGORIAS = [
  { id: 'cabeca', label: 'Chapéus', icon: '🎩' },
  { id: 'roupa', label: 'Roupas', icon: '👕' },
  { id: 'outro', label: 'Acessórios', icon: '💎' },
]

const PET_EMOJI = '🐉' // padrão da loja
const MOEDAS_INICIAIS = 1000
const SLOT_LABEL = { cabeca: 'Cabeça', roupa: 'Roupa', outro: 'Acessório' }

export default function LojaScreen({ onLogout }) {
  const [categoriaAtiva, setCategoriaAtiva] = useState('cabeca')
  const [moedas, setMoedas] = useState(MOEDAS_INICIAIS)
  const [comprados, setComprados] = useState([])
  const [produtos, setProdutos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    async function carregarLoja() {
      try {
        const [itens, compras] = await Promise.all([listarAcessoriosLoja(), listarItensComprados()])
        setProdutos(itens.map(item => ({
          ...item,
          categoria: item.slot,
          emoji: '',
        })))
        setComprados((compras || []).map(String))
      } catch (error) {
        setErro(error?.message || 'Não foi possível carregar os itens da loja.')
      } finally {
        setCarregando(false)
      }
    }
    carregarLoja()
  }, [])

  const produtosFiltrados = produtos.filter(p => p.categoria === categoriaAtiva)

  async function handleComprar(produto) {
    if (comprados.includes(String(produto.id))) return
    if (moedas < produto.preco) {
      Alert.alert('Moedas insuficientes', `Você precisa de ${produto.preco} moedas para comprar este item.`)
      return
    }
    Alert.alert(
      `Comprar ${produto.nome}?`,
      `Custo: ${produto.preco} moedas\nSaldo após: ${moedas - produto.preco} moedas`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Comprar', onPress: async () => {
            setMoedas(m => m - produto.preco)
            setComprados(prev => [...prev, String(produto.id)])
            await comprarItem(String(produto.id))
            Alert.alert('✅ Comprado!', `${produto.nome} adicionado ao seu inventário!`)
          }
        }
      ]
    )
  }

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onLogout}>
          <Text style={styles.voltar}>← Sair</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>🛒 Loja</Text>
        <View style={styles.moedasWrap}>
          <Text style={styles.moedasIcon}>⭐</Text>
          <Text style={styles.moedasVal}>{moedas}</Text>
        </View>
      </View>

      {/* Pet preview */}
      <View style={styles.petPreview}>
        <View style={styles.petCirculo}>
          <Text style={styles.petEmoji}>{PET_EMOJI}</Text>
        </View>
        <View>
          <Text style={styles.petLabel}>Seu pet</Text>
          <Text style={styles.petSub}>{comprados.length} itens comprados</Text>
        </View>
      </View>

      {/* Categorias */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categorias}>
        {CATEGORIAS.map(c => (
          <TouchableOpacity
            key={c.id}
            style={[styles.categoriaBtn, categoriaAtiva === c.id && styles.categoriaBtnAtiva]}
            onPress={() => setCategoriaAtiva(c.id)}
          >
            <Text style={styles.categoriaIcon}>{c.icon}</Text>
            <Text style={[styles.categoriaLabel, categoriaAtiva === c.id && styles.categoriaLabelAtiva]}>
              {c.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Produtos */}
      <ScrollView contentContainerStyle={styles.grid}>
        {carregando && <ActivityIndicator color={cores.verde} style={styles.loading} />}
        {!!erro && <Text style={styles.error}>{erro}</Text>}
        {!carregando && !erro && produtosFiltrados.length === 0 && <Text style={styles.empty}>Nenhum item disponível nesta categoria.</Text>}
        {produtosFiltrados.map(p => {
          const comprado = comprados.includes(String(p.id))
          const semMoedas = moedas < p.preco && !comprado
          return (
            <View key={p.id} style={[styles.card, comprado && styles.cardComprado]}>
              <View style={styles.cardRaridade}>
                <Text style={styles.cardRaridadeText}>{SLOT_LABEL[p.slot] || 'Acessório'}</Text>
              </View>
              {p.imagem ? <Image source={{ uri: p.imagem }} style={styles.cardImage} resizeMode="contain" /> : <Text style={styles.cardEmoji}>{p.emoji || '🎁'}</Text>}
              <Text style={styles.cardNome}>{p.nome}</Text>
              <TouchableOpacity
                style={[
                  styles.cardBtn,
                  comprado && styles.cardBtnComprado,
                  semMoedas && styles.cardBtnSemMoedas,
                ]}
                onPress={() => handleComprar(p)}
                disabled={comprado}
              >
                <Text style={[styles.cardBtnTxt, comprado && { color: '#888' }]}>
                  {comprado ? '✅ Comprado' : `⭐ ${p.preco}`}
                </Text>
              </TouchableOpacity>
            </View>
          )
        })}
      </ScrollView>

    </View>
  )
}

const cardW = (width - 48) / 2

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.branco },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, backgroundColor: cores.verde },
  voltar: { color: cores.branco, fontSize: 14, fontWeight: '600' },
  titulo: { color: cores.branco, fontSize: 20, fontWeight: 'bold' },
  moedasWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  moedasIcon: { fontSize: 14 },
  moedasVal: { color: cores.branco, fontSize: 14, fontWeight: 'bold' },
  petPreview: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16, backgroundColor: cores.verde, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  petCirculo: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  petEmoji: { fontSize: 36 },
  petLabel: { color: cores.branco, fontSize: 16, fontWeight: 'bold' },
  petSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  categorias: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 0 },
  categoriaBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#ddd', marginRight: 8, backgroundColor: '#f9f9f9' },
  categoriaBtnAtiva: { borderColor: cores.verde, backgroundColor: '#e6f7ea' },
  categoriaIcon: { fontSize: 16 },
  categoriaLabel: { fontSize: 13, color: '#888', fontWeight: '500' },
  categoriaLabelAtiva: { color: cores.verde, fontWeight: 'bold' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16 },
  card: { width: cardW, backgroundColor: '#f9f9f9', borderRadius: 14, padding: 14, alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: '#eee' },
  cardComprado: { borderColor: cores.verde, backgroundColor: '#e6f7ea' },
  cardRaridade: { backgroundColor: '#e6f7ea', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, alignSelf: 'center' },
  cardRaridadeText: { color: cores.verde, fontSize: 10, fontWeight: 'bold' },
  cardImage: { width: 96, height: 96 },
  cardEmoji: { fontSize: 48 },
  cardNome: { fontSize: 13, fontWeight: '600', color: cores.preto, textAlign: 'center' },
  cardBtn: { backgroundColor: cores.verde, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16, width: '100%', alignItems: 'center' },
  cardBtnComprado: { backgroundColor: '#eee' },
  cardBtnSemMoedas: { backgroundColor: '#f5c5c5' },
  cardBtnTxt: { color: cores.branco, fontSize: 13, fontWeight: 'bold' },
  loading: { width: '100%', marginTop: 30 },
  error: { width: '100%', color: '#c62828', textAlign: 'center', fontSize: 12, padding: 12 },
  empty: { width: '100%', color: '#777', textAlign: 'center', fontSize: 13, padding: 24 },
})
