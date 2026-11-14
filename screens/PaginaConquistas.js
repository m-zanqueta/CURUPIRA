import { useCallback, useEffect, useRef, useState } from 'react'
import { View, StyleSheet, TouchableOpacity, ScrollView, Image, Platform } from 'react-native'
import { Text, ActivityIndicator } from 'react-native-paper'
import { colors, fonts } from '../theme'
import { listarConquistasDoAluno } from '../services/storage'
import { mensagemDeErroAluno, analisarData } from './useDadosAluno'

// Página "Conquistas" do aluno (página 3 do paginador do PetScreen).
//
// DEPENDE DO ZANQ. Hoje a RPC aluno_minhas_conquistas devolve as linhas da tabela `conquistas`
// do próprio aluno, mas o esquema dessa tabela (nomes das colunas) e o catálogo de conquistas
// ainda não estão definidos em nenhuma migration do repositório. Por isso esta página:
//   • mostra APENAS as conquistas que o backend devolveu (nada de lista fixa, nada de "bloqueadas",
//     porque sem catálogo real não há como saber quais existem);
//   • lê título/descrição/ícone/data de forma tolerante (vários nomes de coluna possíveis, ver
//     `normalizarConquista`); o que não existir simplesmente não aparece;
//   • quando não há nenhuma, mostra um estado vazio honesto.
// Quando o Zanq fechar o esquema, só `normalizarConquista` precisa ser ajustada.
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
    cor: CORES[indice % CORES.length],
  }
}

function dataCurta(d) {
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '')
}

export default function PaginaConquistas({ width, petImage, alunoId, ativa }) {
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

  return (
    <View style={[p.page, { width }]}>
      <View style={p.simpleHeader}>
        <Text style={p.headerEyebrow}>MEDALHAS DA AVENTURA</Text>
        <Text style={p.simpleTitle}>Conquistas</Text>
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
          <Text style={p.centroTitulo}>Nenhuma conquista ainda</Text>
          <Text style={p.centroTexto}>Complete tarefas com o seu PET. As conquistas que você ganhar aparecem aqui.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={p.courseContent} showsVerticalScrollIndicator={false}>
          <View style={p.achievementBanner}>
            <MiniPet uri={petImage} emoji="🏅" style={p.bannerPet} />
            <Text style={p.bannerText}>Sua coleção</Text>
            <Text style={p.bannerCount}>{lista.length}</Text>
          </View>
          {lista.map(item => (
            <View key={item.id} style={p.badgeCard}>
              <View style={[p.badgeArt, { backgroundColor: item.cor }]}>
                {item.iconeUrl
                  ? <Image source={{ uri: item.iconeUrl }} style={p.badgeImg} resizeMode="contain" />
                  : <Text style={p.badgeEmoji}>{item.icone || '🏅'}</Text>}
              </View>
              <View style={p.badgeInfo}>
                <Text style={p.badgeTitle}>{item.titulo}</Text>
                {item.descricao ? <Text style={p.badgeDescription}>{item.descricao}</Text> : null}
                <Text style={p.badgeStatus}>CONQUISTADA!{item.data ? ` · ${dataCurta(item.data)}` : ''}</Text>
              </View>
              <Text style={p.badgeCheck}>✓</Text>
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
  courseContent: { padding: 18, paddingBottom: 78, gap: 14 },
  achievementBanner: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.purple, borderRadius: 18, paddingHorizontal: 14, borderBottomWidth: 5, borderBottomColor: '#4D0D75' },
  bannerPet: { width: 58, height: 58, fontSize: 38, textAlign: 'center' },
  bannerText: { flex: 1, color: colors.white, fontSize: 18, fontFamily: fonts.extrabold },
  bannerCount: { color: colors.yellow, fontSize: 20, fontFamily: fonts.extrabold },
  badgeCard: { minHeight: 102, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.white, padding: 12, borderRadius: 18, borderWidth: 1.5, borderColor: colors.border, borderBottomWidth: 5, borderBottomColor: '#D7D2BE' },
  badgeArt: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(0,0,0,0.06)' },
  badgeImg: { width: 52, height: 52 },
  badgeEmoji: { fontSize: 44 },
  badgeInfo: { flex: 1, gap: 4 },
  badgeTitle: { color: '#20221D', fontSize: 16, fontFamily: fonts.extrabold },
  badgeDescription: { color: '#74766D', fontSize: 12, fontFamily: fonts.semibold },
  badgeStatus: { color: colors.green, fontSize: 10, fontFamily: fonts.bold, letterSpacing: 0.3 },
  badgeCheck: { color: colors.green, fontSize: 22, fontFamily: fonts.extrabold },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 80, gap: 10 },
  centroEmoji: { fontSize: 44 },
  vazioPet: { width: 90, height: 90, fontSize: 56, textAlign: 'center' },
  centroTitulo: { color: '#20221D', fontSize: 16, fontFamily: fonts.extrabold, textAlign: 'center' },
  centroTexto: { color: '#65665F', fontSize: 12, fontFamily: fonts.medium, lineHeight: 18, textAlign: 'center' },
  botao: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green, borderRadius: 16, borderBottomWidth: 5, borderBottomColor: '#08761F', marginTop: 8, paddingHorizontal: 18 },
  botaoTxt: { color: colors.white, fontSize: 15, fontFamily: fonts.extrabold },
})