import { useCallback, useEffect, useRef, useState } from 'react'
import { View, StyleSheet, TouchableOpacity, ScrollView, Image, Platform } from 'react-native'
import { Text, ActivityIndicator } from 'react-native-paper'
import { colors, fonts } from '../theme'
import { listarConquistasDoAluno } from '../services/storage'
import { mensagemDeErroAluno, analisarData } from './useDadosAluno'

// Página de conquistas: lista o catálogo global do banco e sinaliza quais medalhas este aluno desbloqueou.
//
// Props:
//   width    largura da página
//   petImage URL do PET (enfeite do banner)
//   alunoId  id do aluno logado (o serviço ignora e usa o token)
//   ativa    true quando esta é a página visível: a consulta só roda ao chegar aqui (e atualiza nas vezes seguintes)

function MiniPet({ uri, emoji = '🏅', style }) {
  return uri
    ? <Image source={{ uri }} style={style} resizeMode="contain" />
    : <Text style={style}>{emoji}</Text>
}

const CORES = ['#FFE27A', '#C6F1C9', '#D8C3F0', '#FFD2A8']

function primeiroTexto(obj, chaves) {
  for (const k of chaves) {
    const v = obj?.[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

// Transforma uma linha crua do backend em algo exibível. NÃO inventa título: se a linha não tem
// nenhum campo de nome conhecido, usa o texto genérico "Conquista".
export function normalizarConquista(linha, indice) {
  const l = linha && typeof linha === 'object' ? linha : {}
  const titulo = primeiroTexto(l, ['titulo', 'nome', 'name', 'title']) || 'Conquista'
  const descricao = primeiroTexto(l, ['descricao', 'description'])
  const icone = primeiroTexto(l, ['icone', 'emoji', 'icon'])
  const dataBruta = primeiroTexto(l, ['conquistadaEm', 'conquistada_em', 'criadoEm', 'criado_em', 'created_at', 'data'])
  const data = analisarData(dataBruta) // null se ausente ou inválida; data "pura" não volta um dia (fuso)
  return {
    id: String(l.id ?? `${titulo}-${indice}`),
    titulo,
    descricao,
    icone: /^https?:\/\//i.test(icone) ? '' : icone,
    iconeUrl: /^https?:\/\//i.test(icone) ? icone : '',
    data,
    desbloqueada: l.desbloqueada === true || l.desbloqueada === 'true',
    cor: CORES[indice % CORES.length],
  }
}

function dataCurta(d) {
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '')
}

export default function PaginaConquistas({ width, petImage, alunoId, ativa, filtro = 'pendentes', onFiltroChange }) {
  const [lista, setLista] = useState([])
  const [estado, setEstado] = useState('ocioso') // 'ocioso' | 'carregando' | 'pronto' | 'erro'
  const [erro, setErro] = useState(null)
  const vivo = useRef(true)
  const geracao = useRef(0)       // sobe a cada troca de aluno: invalida consultas em andamento
  const sequencia = useRef(0)
  const jaCarregou = useRef(false) // já temos uma lista válida DESTE aluno?
  const ultimaCarga = useRef(0)    // evita repetir a consulta se o aluno vai e volta da página em poucos segundos

  useEffect(() => { vivo.current = true; return () => { vivo.current = false } }, [])

  // Troca de aluno: descarta a consulta em andamento e limpa as conquistas do aluno anterior.
  // Declarado antes do efeito de carga para rodar primeiro.
  useEffect(() => {
    geracao.current += 1
    sequencia.current += 1
    jaCarregou.current = false
    ultimaCarga.current = 0
    setLista([])
    setErro(null)
    setEstado('ocioso')
  }, [alunoId])

  const carregar = useCallback(async () => {
    if (!alunoId) return
    const ger = geracao.current
    const minha = ++sequencia.current
    if (!jaCarregou.current) { setEstado('carregando'); setErro(null) }
    try {
      const linhas = await listarConquistasDoAluno(alunoId, { lancarErro: true })
      if (!vivo.current || ger !== geracao.current || minha !== sequencia.current) return
      setLista((Array.isArray(linhas) ? linhas : []).map(normalizarConquista))
      setErro(null)
      setEstado('pronto')
      jaCarregou.current = true
      ultimaCarga.current = Date.now()
    } catch (e) {
      if (!vivo.current || ger !== geracao.current || minha !== sequencia.current) return
      if (jaCarregou.current) return // falha em segundo plano: mantém o que já está na tela
      setErro(e)
      setEstado('erro')
    }
  }, [alunoId])

  // Só consulta ao CHEGAR na página (ativa passa a true) ou ao trocar de aluno. Renders e mudanças
  // irrelevantes de estado não reexecutam este efeito; voltar à página em menos de 5 s reaproveita a lista.
  useEffect(() => {
    if (!ativa || !alunoId) return
    if (jaCarregou.current && Date.now() - ultimaCarga.current < 5000) return
    carregar()
  }, [ativa, alunoId, carregar])

  const carregando = estado === 'ocioso' || estado === 'carregando'
  const feitas = lista.filter(item => item.desbloqueada)
  const porFazer = lista.filter(item => !item.desbloqueada)
  const visiveis = filtro === 'feitas' ? feitas : porFazer

  return (
    <View style={[p.page, { width }]}>
      <View style={p.simpleHeader}>
        <Text style={p.headerEyebrow}>MEDALHAS DA AVENTURA</Text>
        <Text style={p.simpleTitle}>Conquistas</Text>
      </View>

      <View style={p.filters}>
        <TouchableOpacity onPress={() => onFiltroChange?.('pendentes')} style={[p.filterButton, filtro === 'pendentes' && p.filterButtonActive]} accessibilityRole="button" accessibilityState={{ selected: filtro === 'pendentes' }}>
          <Text style={[p.filterEmoji, filtro === 'pendentes' && p.filterTextActive]}>🧭</Text>
          <Text style={[p.filterText, filtro === 'pendentes' && p.filterTextActive]}>Por conquistar</Text>
          <Text style={[p.filterCount, filtro === 'pendentes' && p.filterTextActive]}>{porFazer.length}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onFiltroChange?.('feitas')} style={[p.filterButton, filtro === 'feitas' && p.filterButtonWon]} accessibilityRole="button" accessibilityState={{ selected: filtro === 'feitas' }}>
          <Text style={p.filterEmoji}>🏆</Text>
          <Text style={[p.filterText, filtro === 'feitas' && p.filterTextActive]}>Conquistadas</Text>
          <Text style={[p.filterCount, filtro === 'feitas' && p.filterTextActive]}>{feitas.length}</Text>
        </TouchableOpacity>
      </View>

      {carregando && lista.length === 0 ? (
        <View style={p.centro}>
          <ActivityIndicator color={colors.green} />
          <Text style={p.centroTexto}>Carregando suas conquistas…</Text>
        </View>
      ) : estado === 'erro' ? (
        <View style={p.centro}>
          <Text style={p.centroEmoji}>😕</Text>
          <Text style={p.centroTitulo}>Não foi possível carregar</Text>
          <Text style={p.centroTexto}>{mensagemDeErroAluno(erro)}</Text>
          <TouchableOpacity onPress={carregar} activeOpacity={0.85} style={p.botao} accessibilityRole="button">
            <Text style={p.botaoTxt}>Tentar de novo</Text>
          </TouchableOpacity>
        </View>
      ) : lista.length === 0 ? (
        <View style={p.centro}>
          <MiniPet uri={petImage} emoji="🏅" style={p.vazioPet} />
          <Text style={p.centroTitulo}>Sua aventura começa agora!</Text>
          <Text style={p.centroTexto}>Complete desafios para ganhar suas primeiras conquistas.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={p.courseContent} showsVerticalScrollIndicator={false}>
          <View style={p.achievementBanner}>
            <MiniPet uri={petImage} emoji="🏅" style={p.bannerPet} />
            <Text style={p.bannerText}>{filtro === 'feitas' ? 'Você conquistou!' : 'Novos desafios!'}</Text>
            <Text style={p.bannerCount}>{feitas.length}/{lista.length}</Text>
          </View>
          {!visiveis.length ? <View style={p.emptyFilter}><Text style={p.emptyEmoji}>{filtro === 'feitas' ? '🌱' : '🎉'}</Text><Text style={p.centroTitulo}>{filtro === 'feitas' ? 'Ainda sem conquistas' : 'Tudo conquistado!'}</Text><Text style={p.centroTexto}>{filtro === 'feitas' ? 'Complete um desafio e sua medalha aparece aqui.' : 'Parabéns! Você já ganhou todas as medalhas.'}</Text></View> : null}
          {visiveis.map(item => (
            <View key={item.id} style={[p.badgeCard, !item.desbloqueada && p.badgeLocked]}>
              <View style={[p.badgeArt, { backgroundColor: item.desbloqueada ? item.cor : '#E6E6E1' }]}>
                {item.iconeUrl
                  ? <Image source={{ uri: item.iconeUrl }} style={p.badgeImg} resizeMode="contain" />
                  : <Text style={[p.badgeEmoji, !item.desbloqueada && p.emojiLocked]}>{item.icone || '🏅'}</Text>}
              </View>
              <View style={p.badgeInfo}>
                <Text style={p.badgeTitle}>{item.titulo}</Text>
                {item.descricao ? <Text style={p.badgeDescription}>{item.descricao}</Text> : null}
                <Text style={[p.badgeStatus, !item.desbloqueada && p.badgeStatusLocked]}>{item.desbloqueada ? `CONQUISTADA!${item.data ? ` · ${dataCurta(item.data)}` : ''}` : 'AINDA NÃO CONQUISTADA'}</Text>
              </View>
              {item.desbloqueada ? <Text style={p.badgeCheck}>✓</Text> : <Text style={p.badgeLock}>🔒</Text>}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const p = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.cream, overflow: 'hidden' },
  simpleHeader: { backgroundColor: colors.white, paddingTop: Platform.OS === 'android' ? 34 : 48, paddingBottom: 14, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  headerEyebrow: { color: colors.green, fontSize: 9, fontFamily: fonts.bold, letterSpacing: 1.4 },
  simpleTitle: { color: '#171914', fontSize: 23, fontFamily: fonts.extrabold, marginTop: 3 },
  filters: { flexDirection: 'row', gap: 9, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 5, backgroundColor: colors.cream },
  filterButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 7, backgroundColor: colors.white, borderRadius: 16, borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4 },
  filterButtonActive: { backgroundColor: '#FFF0B3', borderColor: '#E2B800', borderBottomColor: '#B98D00' },
  filterButtonWon: { backgroundColor: '#E7D8F4', borderColor: colors.purple, borderBottomColor: '#4D0D75' },
  filterEmoji: { fontSize: 17 },
  filterText: { color: '#4E5049', fontSize: 11, fontFamily: fonts.extrabold, flexShrink: 1 },
  filterTextActive: { color: '#3C2D00' },
  filterCount: { color: '#77786F', fontSize: 11, fontFamily: fonts.extrabold },
  courseContent: { padding: 18, paddingBottom: 78, gap: 14 },
  achievementBanner: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.purple, borderRadius: 18, paddingHorizontal: 14, borderBottomWidth: 5, borderBottomColor: '#4D0D75' },
  bannerPet: { width: 58, height: 58, fontSize: 38, textAlign: 'center' },
  bannerText: { flex: 1, color: colors.white, fontSize: 18, fontFamily: fonts.extrabold },
  bannerCount: { color: colors.yellow, fontSize: 20, fontFamily: fonts.extrabold },
  badgeCard: { minHeight: 102, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.white, padding: 12, borderRadius: 18, borderWidth: 1.5, borderColor: colors.border, borderBottomWidth: 5, borderBottomColor: '#D7D2BE' },
  badgeLocked: { backgroundColor: '#F7F7F3', opacity: 0.8 },
  badgeArt: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(0,0,0,0.06)' },
  badgeImg: { width: 52, height: 52 },
  badgeEmoji: { fontSize: 44 },
  emojiLocked: { opacity: 0.48 },
  badgeInfo: { flex: 1, gap: 4 },
  badgeTitle: { color: '#20221D', fontSize: 16, fontFamily: fonts.extrabold },
  badgeDescription: { color: '#74766D', fontSize: 12, fontFamily: fonts.semibold },
  badgeStatus: { color: colors.green, fontSize: 10, fontFamily: fonts.bold, letterSpacing: 0.3 },
  badgeStatusLocked: { color: '#7A7B75' },
  badgeCheck: { color: colors.green, fontSize: 22, fontFamily: fonts.extrabold },
  badgeLock: { fontSize: 18 },
  emptyFilter: { minHeight: 210, alignItems: 'center', justifyContent: 'center', padding: 22, gap: 8, backgroundColor: colors.white, borderRadius: 18, borderWidth: 1, borderColor: colors.border },
  emptyEmoji: { fontSize: 44 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 80, gap: 10 },
  centroEmoji: { fontSize: 44 },
  vazioPet: { width: 90, height: 90, fontSize: 56, textAlign: 'center' },
  centroTitulo: { color: '#20221D', fontSize: 16, fontFamily: fonts.extrabold, textAlign: 'center' },
  centroTexto: { color: '#65665F', fontSize: 12, fontFamily: fonts.medium, lineHeight: 18, textAlign: 'center' },
  botao: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green, borderRadius: 16, borderBottomWidth: 5, borderBottomColor: '#08761F', marginTop: 8, paddingHorizontal: 18 },
  botaoTxt: { color: colors.white, fontSize: 15, fontFamily: fonts.extrabold },
})
