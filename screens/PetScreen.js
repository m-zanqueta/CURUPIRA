import { useState, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Dimensions, Animated, PanResponder, Modal, FlatList,
} from 'react-native'
import { cores } from '../constants/cores'

const { width } = Dimensions.get('window')

const PET_INFO = {
  '🐉': { nome: 'Dragão', cor: '#009D25' },
  '🦊': { nome: 'Raposa', cor: '#6A109E' },
  '🦅': { nome: 'Águia',  cor: '#DBB407' },
  '🐺': { nome: 'Lobo',   cor: '#555555' }, 
}

const ITENS_LOJA = [
  { id: 1, nome: 'Chapéu de Mago',    preco: 150, icon: '🎩' },
  { id: 2, nome: 'Óculos Estilosos',  preco: 100, icon: '🕶️' },
  { id: 3, nome: 'Capa do Herói',     preco: 200, icon: '🦸' },
  { id: 4, nome: 'Coroa Dourada',     preco: 300, icon: '👑' },
  { id: 5, nome: 'Espada Mágica',     preco: 250, icon: '⚔️' },
  { id: 6, nome: 'Mochila Aventura',  preco: 120, icon: '🎒' },
]

const PAGINAS = ['📅', '📋', 'pet', '🏆', '👤']
const PAGINA_INICIAL = 2

export default function PetScreen({ aluno, turma, onLogout }) {
  const [paginaAtual, setPaginaAtual] = useState(PAGINA_INICIAL)
  const [loja, setLoja] = useState(false)
  const scrollRef = useRef(null)
  const slideAnim = useRef(new Animated.Value(0)).current

  const pet = turma ? (PET_INFO[turma.pet] || { nome: 'Pet', cor: cores.verde }) : null
  const corPet = pet ? pet.cor : '#333'
  const emojiPet = turma ? turma.pet : '👻'

  function irParaPagina(idx) {
    scrollRef.current?.scrollTo({ x: idx * width, animated: true })
    setPaginaAtual(idx)
  }

  function renderPaginaCentral() {
    return (
      <View style={[styles.pagina, { width }]}>
        <View style={[styles.topo, { backgroundColor: corPet }]}>
          <Text style={styles.petEmoji}>{emojiPet}</Text>
        </View>
        <View style={styles.conteudo}>
          <Text style={styles.titulo}>Conheça seu pet!</Text>
          <Text style={styles.descricao}>
            Faça missões, ganhe dinheiro e compre acessórios para seu pet. Faça ele crescer ganhando experiência!
          </Text>
          <TouchableOpacity style={[styles.btnLoja, { backgroundColor: corPet }]} onPress={() => setLoja(true)}>
            <Text style={styles.btnLojaTxt}>Acesse a Loja</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  function renderPaginaVazia(icon, idx) {
    return (
      <View key={idx} style={[styles.pagina, styles.paginaVazia, { width }]}>
        <Text style={styles.paginaVaziaIcon}>{icon}</Text>
        <Text style={styles.paginaVaziaTxt}>Em breve</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width)
          setPaginaAtual(idx)
        }}
        contentOffset={{ x: PAGINA_INICIAL * width, y: 0 }}
      >
        {PAGINAS.map((p, idx) =>
          idx === PAGINA_INICIAL
            ? <View key={idx} style={{ width }}>{renderPaginaCentral()}</View>
            : renderPaginaVazia(p, idx)
        )}
      </ScrollView>

      {/* Bolinhas */}
      <View style={styles.bolinhas}>
        {PAGINAS.map((_, idx) => (
          <TouchableOpacity key={idx} onPress={() => irParaPagina(idx)}>
            <View style={[styles.bolinha, idx === paginaAtual && { backgroundColor: corPet, transform: [{ scale: 1.3 }] }]} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Botão sair */}
      <TouchableOpacity style={styles.btnSair} onPress={onLogout}>
        <Text style={styles.btnSairTxt}>← Sair</Text>
      </TouchableOpacity>

      {/* Modal Loja */}
      <Modal visible={loja} animationType="slide" onRequestClose={() => setLoja(false)}>
        <View style={styles.lojaContainer}>
          <View style={[styles.lojaHeader, { backgroundColor: corPet }]}>
            <Text style={styles.lojaTitulo}>🛒 Loja</Text>
            <TouchableOpacity onPress={() => setLoja(false)}>
              <Text style={styles.lojaFechar}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.lojaSub}>Acessórios para {emojiPet} {pet?.nome || 'seu pet'}</Text>
          <FlatList
            data={ITENS_LOJA}
            numColumns={2}
            keyExtractor={i => String(i.id)}
            contentContainerStyle={styles.lojaGrid}
            renderItem={({ item }) => (
              <View style={styles.lojaItem}>
                <Text style={styles.lojaItemEmoji}>{item.icon}</Text>
                <Text style={styles.lojaItemEmoji}>{emojiPet}</Text>
                <Text style={styles.lojaItemNome}>{item.nome}</Text>
                <TouchableOpacity style={[styles.lojaItemBtn, { backgroundColor: corPet }]}>
                  <Text style={styles.lojaItemBtnTxt}>⭐ {item.preco}</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.branco },
  pagina: { flex: 1 },
  topo: { height: 300, borderBottomLeftRadius: width / 2, borderBottomRightRadius: width / 2, alignItems: 'center', justifyContent: 'center' },
  petEmoji: { fontSize: 120, marginTop: 40 },
  conteudo: { flex: 1, alignItems: 'center', paddingHorizontal: 32, paddingTop: 28 },
  titulo: { fontSize: 24, fontWeight: 'bold', color: cores.preto, marginBottom: 12, textAlign: 'center' },
  descricao: { fontSize: 14, color: '#777', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  btnLoja: { borderRadius: 30, paddingVertical: 16, paddingHorizontal: 40, alignItems: 'center', width: '100%' },
  btnLojaTxt: { color: cores.branco, fontSize: 16, fontWeight: 'bold' },
  paginaVazia: { alignItems: 'center', justifyContent: 'center', backgroundColor: cores.branco },
  paginaVaziaIcon: { fontSize: 60, marginBottom: 16 },
  paginaVaziaTxt: { fontSize: 18, color: '#aaa' },
  bolinhas: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  bolinha: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ddd' },
  btnSair: { alignItems: 'center', paddingBottom: 20 },
  btnSairTxt: { color: '#aaa', fontSize: 14 },
  lojaContainer: { flex: 1, backgroundColor: cores.branco },
  lojaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 50 },
  lojaTitulo: { fontSize: 22, fontWeight: 'bold', color: cores.branco },
  lojaFechar: { fontSize: 20, color: cores.branco },
  lojaSub: { fontSize: 14, color: '#888', textAlign: 'center', marginVertical: 16 },
  lojaGrid: { paddingHorizontal: 16, gap: 12 },
  lojaItem: { flex: 1, margin: 6, backgroundColor: '#f9f9f9', borderRadius: 12, padding: 16, alignItems: 'center', gap: 6 },
  lojaItemEmoji: { fontSize: 32 },
  lojaItemNome: { fontSize: 13, fontWeight: '600', color: cores.preto, textAlign: 'center' },
  lojaItemBtn: { borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, marginTop: 4 },
  lojaItemBtnTxt: { color: cores.branco, fontSize: 12, fontWeight: 'bold' },
})