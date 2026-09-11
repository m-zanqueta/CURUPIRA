import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, Alert,
} from 'react-native'
import { cores } from '../constants/cores'
import { listarItensComprados, comprarItem } from '../services/storage'

const { width } = Dimensions.get('window')

const CATEGORIAS = [
  { id: 'chapeus',    label: 'Chapéus',     icon: '🎩' },
  { id: 'acessorios', label: 'Acessórios',  icon: '💎' },
  { id: 'roupas',     label: 'Roupas',      icon: '👕' },
  { id: 'especiais',  label: 'Especiais',   icon: '✨' },
]

const PRODUTOS = [
  // Chapéus
  { id: 1, nome: 'Chapéu de Mago',    emoji: '🧙',  preco: 150, categoria: 'chapeus',    raridade: 'Raro'     },
  { id: 2, nome: 'Coroa Dourada',     emoji: '👑',  preco: 500, categoria: 'chapeus',    raridade: 'Lendário' },
  { id: 3, nome: 'Boné Estiloso',     emoji: '🧢',  preco: 80,  categoria: 'chapeus',    raridade: 'Comum'    },
  { id: 4, nome: 'Chapéu de Cowboy',  emoji: '🤠',  preco: 120, categoria: 'chapeus',    raridade: 'Comum'    },
  // Acessórios
  { id: 5, nome: 'Óculos de Sol',     emoji: '🕶️', preco: 100, categoria: 'acessorios', raridade: 'Comum'    },
  { id: 6, nome: 'Colar Mágico',      emoji: '📿',  preco: 200, categoria: 'acessorios', raridade: 'Raro'     },
  { id: 7, nome: 'Espada Lendária',   emoji: '⚔️', preco: 400, categoria: 'acessorios', raridade: 'Épico'    },
  { id: 8, nome: 'Escudo Dourado',    emoji: '🛡️', preco: 350, categoria: 'acessorios', raridade: 'Épico'    },
  // Roupas
  { id: 9,  nome: 'Capa do Herói',    emoji: '🦸',  preco: 250, categoria: 'roupas',     raridade: 'Raro'     },
  { id: 10, nome: 'Armadura',         emoji: '🥷',  preco: 300, categoria: 'roupas',     raridade: 'Épico'    },
  { id: 11, nome: 'Mochila Aventura', emoji: '🎒',  preco: 90,  categoria: 'roupas',     raridade: 'Comum'    },
  { id: 12, nome: 'Roupa de Festa',   emoji: '🥳',  preco: 180, categoria: 'roupas',     raridade: 'Raro'     },
  // Especiais
  { id: 13, nome: 'Varinha Mágica',   emoji: '🪄',  preco: 600, categoria: 'especiais',  raridade: 'Lendário' },
  { id: 14, nome: 'Cristal Arcano',   emoji: '🔮',  preco: 450, categoria: 'especiais',  raridade: 'Épico'    },
  { id: 15, nome: 'Pó de Fada',       emoji: '✨',  preco: 700, categoria: 'especiais',  raridade: 'Lendário' },
  { id: 16, nome: 'Poção da Sorte',   emoji: '🧪',  preco: 200, categoria: 'especiais',  raridade: 'Raro'     },
]

const RARIDADE_COR = {
  'Comum':    { bg: '#f0f0f0', cor: '#888'    },
  'Raro':     { bg: '#e6f7ea', cor: '#009D25' },
  'Épico':    { bg: '#f0e6f9', cor: '#6A109E' },
  'Lendário': { bg: '#fdf7dc', cor: '#DBB407' },
}

const PET_EMOJI = '🐉' // padrão da loja
const MOEDAS_INICIAIS = 1000

export default function LojaScreen({ onLogout }) {
  const [categoriaAtiva, setCategoriaAtiva] = useState('chapeus')
  const [moedas, setMoedas] = useState(MOEDAS_INICIAIS)
  const [comprados, setComprados] = useState([])

  useEffect(() => {
    listarItensComprados().then(setComprados)
  }, [])

  const produtosFiltrados = PRODUTOS.filter(p => p.categoria === categoriaAtiva)

  async function handleComprar(produto) {
    if (comprados.includes(produto.id)) return
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
            setComprados(prev => [...prev, produto.id])
            await comprarItem(produto.id)
            Alert.alert('✅ Comprado!', `${produto.emoji} ${produto.nome} adicionado ao seu inventário!`)
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
        {produtosFiltrados.map(p => {
          const comprado = comprados.includes(p.id)
          const semMoedas = moedas < p.preco && !comprado
          const cfg = RARIDADE_COR[p.raridade]
          return (
            <View key={p.id} style={[styles.card, comprado && styles.cardComprado]}>
              <View style={[styles.cardRaridade, { backgroundColor: cfg.bg }]}>
                <Text style={[styles.cardRaridadeText, { color: cfg.cor }]}>{p.raridade}</Text>
              </View>
              <Text style={styles.cardEmoji}>{p.emoji}</Text>
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
  cardRaridade: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, alignSelf: 'center' },
  cardRaridadeText: { fontSize: 10, fontWeight: 'bold' },
  cardEmoji: { fontSize: 48 },
  cardNome: { fontSize: 13, fontWeight: '600', color: cores.preto, textAlign: 'center' },
  cardBtn: { backgroundColor: cores.verde, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16, width: '100%', alignItems: 'center' },
  cardBtnComprado: { backgroundColor: '#eee' },
  cardBtnSemMoedas: { backgroundColor: '#f5c5c5' },
  cardBtnTxt: { color: cores.branco, fontSize: 13, fontWeight: 'bold' },
})