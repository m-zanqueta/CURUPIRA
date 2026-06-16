// ============================================================
// CURUPIRA — screens/ConquistasScreen.js
// Lista de conquistas do aluno.
// Usa theme.js (colors + fonts Montserrat) da feature/dashboard.
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  StatusBar, SafeAreaView, ActivityIndicator, Animated, RefreshControl,
} from 'react-native';
import { colors, fonts } from '../theme';
import {
  carregarTodasConquistas,
  carregarEstatisticasConquistas,
} from '../services/conquistasService';
import {
  ordenarConquistas, calcularPorcentagem, getTextoProgresso,
  getCorRaridade, getFundoRaridade, getEstrelasRaridade,
} from '../utils/conquistasUtils';
import { CATEGORIAS, RARIDADE } from '../data/mockConquistas';

// ── Filtros ──────────────────────────────────────────────────
const FILTROS = [
  { id: 'todas',             label: 'Todas',        emoji: '🏆' },
  { id: 'desbloqueadas',     label: 'Desbloqueadas',emoji: '✅' },
  { id: 'bloqueadas',        label: 'Bloqueadas',   emoji: '🔒' },
  { id: CATEGORIAS.TAREFAS,     label: 'Tarefas',   emoji: '🌿' },
  { id: CATEGORIAS.COMPOSTAGEM, label: 'Compostagem',emoji: '🪣' },
  { id: CATEGORIAS.RECICLAGEM,  label: 'Reciclagem',emoji: '♻️' },
  { id: CATEGORIAS.AGUA,        label: 'Água',      emoji: '💧' },
  { id: CATEGORIAS.ENERGIA,     label: 'Energia',   emoji: '⚡' },
  { id: CATEGORIAS.XP,          label: 'XP',        emoji: '⭐' },
  { id: CATEGORIAS.STREAK,      label: 'Sequência', emoji: '🔥' },
  { id: CATEGORIAS.ESPECIAL,    label: 'Especial',  emoji: '🌲' },
];

// ── Card de conquista ────────────────────────────────────────
function CardConquista({ item, onPress, delay }) {
  const fade  = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(14)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 280, delay, useNativeDriver: true }),
      Animated.spring(slide, { toValue: 0, tension: 60, friction: 9, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  const onIn  = () => Animated.spring(press, { toValue: 0.97, useNativeDriver: true }).start();
  const onOut = () => Animated.spring(press, { toValue: 1,    useNativeDriver: true }).start();

  const cor      = getCorRaridade(item.raridade);
  const fundo    = getFundoRaridade(item.raridade);
  const estrelas = getEstrelasRaridade(item.raridade);
  const pct      = calcularPorcentagem(item.progresso, item.meta);
  const progTxt  = getTextoProgresso(item);
  const locked   = !item.desbloqueada;

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }, { scale: press }] }}>
      <TouchableOpacity onPress={onPress} onPressIn={onIn} onPressOut={onOut} activeOpacity={1}>
        <View style={[S.card, locked && S.cardLocked]}>

          {/* Barra lateral */}
          <View style={[S.barraLateral, { backgroundColor: locked ? colors.border : cor }]} />

          <View style={S.cardBody}>
            {/* Linha topo */}
            <View style={S.topRow}>
              <View style={[S.emojiBox, { backgroundColor: locked ? '#F0F0F0' : fundo }]}>
                <Text style={[S.emoji, locked && { opacity: 0.3 }]}>{item.emoji}</Text>
                {locked && (
                  <View style={S.cadeadoWrap}>
                    <Text style={{ fontSize: 9 }}>🔒</Text>
                  </View>
                )}
              </View>

              <View style={S.infoBloco}>
                <Text style={[S.nome, { fontFamily: fonts.bold }, locked && { color: colors.muted }]}
                  numberOfLines={1}>
                  {item.nome}
                </Text>
                <View style={S.raridadeRow}>
                  <View style={[S.raridadePilula, { backgroundColor: locked ? '#F0F0F0' : fundo }]}>
                    <Text style={[S.raridadeTxt, { fontFamily: fonts.semibold, color: locked ? '#BDBDBD' : cor }]}>
                      {item.raridade}
                    </Text>
                  </View>
                  <Text style={[S.estrelas, { color: locked ? '#E0E0E0' : cor }]}>{estrelas}</Text>
                </View>
              </View>

              {item.xp > 0 && (
                <View style={[S.xpBadge, { backgroundColor: locked ? '#F0F0F0' : colors.yellowLight }]}>
                  <Text style={{ fontSize: 10 }}>⚡</Text>
                  <Text style={[S.xpTxt, { fontFamily: fonts.extrabold, color: locked ? '#BDBDBD' : colors.yellow }]}>
                    +{item.xp}
                  </Text>
                </View>
              )}
            </View>

            {/* Descrição */}
            <Text style={[S.desc, { fontFamily: fonts.regular }, locked && { color: '#BDBDBD' }]}
              numberOfLines={2}>
              {item.descricao}
            </Text>

            {/* Progresso */}
            <View style={S.progressoBloco}>
              <View style={S.progressoTrilha}>
                <View style={[S.progressoFill, {
                  width: `${pct}%`,
                  backgroundColor: item.desbloqueada ? cor : colors.green,
                }]} />
              </View>
              <Text style={[S.progressoTxt, { fontFamily: fonts.medium },
                item.desbloqueada && { color: cor }]}>
                {progTxt}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Barra de stats ────────────────────────────────────────────
function BarraStats({ stats }) {
  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!stats) return;
    Animated.timing(barAnim, {
      toValue: stats.percentual / 100,
      duration: 1100, delay: 400, useNativeDriver: false,
    }).start();
  }, [stats]);

  if (!stats) return null;

  const largura = barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={S.statsBox}>
      {/* Geral */}
      <View style={S.statsTop}>
        <View>
          <Text style={[S.statsRotulo, { fontFamily: fonts.semibold }]}>Progresso Geral</Text>
          <Text style={[S.statsValor, { fontFamily: fonts.extrabold }]}>
            {stats.desbloqueadas}/{stats.total} Conquistas
          </Text>
        </View>
        <View style={S.statsPercBox}>
          <Text style={[S.statsPercTxt, { fontFamily: fonts.extrabold }]}>
            {stats.percentual}%
          </Text>
        </View>
      </View>

      <View style={S.statsTrilha}>
        <Animated.View style={[S.statsFill, { width: largura }]} />
      </View>

      {/* Por raridade */}
      <View style={S.raridadeStats}>
        {Object.values(RARIDADE).map((r) => {
          const d  = stats.porRaridade?.[r];
          if (!d) return null;
          const cr = getCorRaridade(r);
          return (
            <View key={r} style={S.raridadeStatItem}>
              <View style={[S.raridadeStatPonto, { backgroundColor: cr }]} />
              <Text style={[S.raridadeStatNum, { fontFamily: fonts.bold }]}>
                {d.desbloqueadas}/{d.total}
              </Text>
              <Text style={[S.raridadeStatLabel, { fontFamily: fonts.semibold, color: cr }]}>
                {r.substring(0, 3).toUpperCase()}
              </Text>
            </View>
          );
        })}
        <View style={S.raridadeStatItem}>
          <Text style={{ fontSize: 11 }}>⚡</Text>
          <Text style={[S.raridadeStatNum, { fontFamily: fonts.bold }]}>{stats.xpTotal}</Text>
          <Text style={[S.raridadeStatLabel, { fontFamily: fonts.semibold, color: colors.yellow }]}>XP</Text>
        </View>
      </View>
    </View>
  );
}

// ── Tela principal ────────────────────────────────────────────
export default function ConquistasScreen({ navigation, route }) {
  const usuario = route?.params?.usuario ?? null;

  const [conquistas,   setConquistas]   = useState([]);
  const [stats,        setStats]        = useState(null);
  const [filtro,       setFiltro]       = useState('todas');
  const [carregando,   setCarregando]   = useState(true);
  const [recarregando, setRecarregando] = useState(false);
  const [erro,         setErro]         = useState(null);

  const carregar = useCallback(async () => {
    try {
      setErro(null);
      const [todas, estatisticas] = await Promise.all([
        carregarTodasConquistas(),
        carregarEstatisticasConquistas(),
      ]);
      setConquistas(ordenarConquistas(todas));
      setStats(estatisticas);
    } catch {
      setErro('Não foi possível carregar as conquistas.');
    } finally {
      setCarregando(false);
      setRecarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const onRefresh = () => { setRecarregando(true); carregar(); };

  const listaFiltrada = useCallback(() => {
    if (filtro === 'desbloqueadas') return conquistas.filter((c) => c.desbloqueada);
    if (filtro === 'bloqueadas')    return conquistas.filter((c) => !c.desbloqueada);
    if (filtro !== 'todas')         return conquistas.filter((c) => c.categoria === filtro);
    return conquistas;
  }, [conquistas, filtro]);

  if (carregando) {
    return (
      <SafeAreaView style={S.root}>
        <StatusBar barStyle="light-content" backgroundColor={colors.green} />
        <View style={S.header}>
          <Text style={[S.headerTitulo, { fontFamily: fonts.extrabold }]}>Conquistas</Text>
        </View>
        <View style={S.centro}>
          <ActivityIndicator size="large" color={colors.green} />
          <Text style={[S.carregandoTxt, { fontFamily: fonts.medium }]}>Carregando...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const lista = listaFiltrada();

  return (
    <SafeAreaView style={S.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.green} />

      {/* Header */}
      <View style={S.header}>
        {navigation?.canGoBack?.() && (
          <TouchableOpacity style={S.voltarBtn} onPress={() => navigation.goBack()}>
            <Text style={[S.voltarIcone, { fontFamily: fonts.bold }]}>←</Text>
          </TouchableOpacity>
        )}
        <Text style={[S.headerTitulo, { fontFamily: fonts.extrabold }]}>Conquistas</Text>
        {usuario?.tipo === 'professor' ? (
          <TouchableOpacity
            style={S.criarBtn}
            onPress={() => navigation.navigate('CriarConquista')}
          >
            <Text style={[S.criarBtnTxt, { fontFamily: fonts.bold }]}>+ Criar</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      <FlatList
        data={lista}
        keyExtractor={(item) => item.id}
        contentContainerStyle={S.listaConteudo}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={recarregando}
            onRefresh={onRefresh}
            colors={[colors.green]}
            tintColor={colors.green}
          />
        }
        ListHeaderComponent={
          <>
            <BarraStats stats={stats} />

            {/* Filtros */}
            <View style={S.filtrosWrap}>
              <FlatList
                data={FILTROS}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(f) => f.id}
                contentContainerStyle={S.filtrosConteudo}
                renderItem={({ item: f }) => {
                  const ativo = filtro === f.id;
                  return (
                    <TouchableOpacity
                      style={[S.filtroChip, ativo && S.filtroChipAtivo]}
                      onPress={() => setFiltro(f.id)}
                      activeOpacity={0.75}
                    >
                      <Text style={{ fontSize: 11 }}>{f.emoji}</Text>
                      <Text style={[S.filtroLabel, { fontFamily: fonts.semibold },
                        ativo && S.filtroLabelAtivo]}>
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>

            {/* Cabeçalho da seção */}
            <View style={S.secaoHeader}>
              <Text style={[S.secaoTitulo, { fontFamily: fonts.bold }]}>
                {FILTROS.find((f) => f.id === filtro)?.label ?? 'Conquistas'}
              </Text>
              <View style={S.contagem}>
                <Text style={[S.contagemTxt, { fontFamily: fonts.bold }]}>{lista.length}</Text>
              </View>
            </View>
          </>
        }
        renderItem={({ item, index }) => (
          <CardConquista
            item={item}
            delay={index * 50}
            onPress={() => navigation.navigate('DetalheConquista', { conquista: item })}
          />
        )}
        ListEmptyComponent={
          <View style={S.vazio}>
            <Text style={{ fontSize: 44 }}>🔍</Text>
            <Text style={[S.vazioTitulo, { fontFamily: fonts.bold }]}>Nenhuma conquista aqui</Text>
            <Text style={[S.vazioTxt, { fontFamily: fonts.regular }]}>
              Continue completando tarefas!
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

// ── Estilos ───────────────────────────────────────────────────
const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },

  header: {
    backgroundColor: colors.green,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
  },
  voltarBtn: {
    width: 36, height: 36,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  voltarIcone: { fontSize: 18, color: colors.white },
  headerTitulo: { fontSize: 22, color: colors.white, flex: 1, textAlign: 'center' },
  criarBtn: {
    backgroundColor: colors.yellow,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
    shadowColor: colors.yellow, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  criarBtnTxt: { color: colors.dark, fontSize: 13 },

  // Stats
  statsBox: {
    backgroundColor: '#006D1A',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 20,
  },
  statsTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-end', marginBottom: 10,
  },
  statsRotulo: {
    fontSize: 11, color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  statsValor: { fontSize: 20, color: colors.white, marginTop: 2 },
  statsPercBox: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4,
  },
  statsPercTxt: { fontSize: 16, color: '#00C42E' },
  statsTrilha: {
    height: 8, backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20, overflow: 'hidden', marginBottom: 14,
  },
  statsFill: { height: '100%', backgroundColor: '#00C42E', borderRadius: 20 },
  raridadeStats: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10,
  },
  raridadeStatItem: { alignItems: 'center', flex: 1 },
  raridadeStatPonto: { width: 7, height: 7, borderRadius: 4, marginBottom: 2 },
  raridadeStatNum: { fontSize: 12, color: colors.white, lineHeight: 15 },
  raridadeStatLabel: { fontSize: 9, letterSpacing: 0.4, marginTop: 1 },

  // Filtros
  filtrosWrap: {
    backgroundColor: colors.white,
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    shadowColor: colors.dark, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  filtrosConteudo: { paddingHorizontal: 16, gap: 8 },
  filtroChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: '#F5F5F5', borderRadius: 20,
    borderWidth: 1.5, borderColor: colors.border,
  },
  filtroChipAtivo: { backgroundColor: colors.greenLight, borderColor: colors.green },
  filtroLabel: { fontSize: 13, color: colors.muted },
  filtroLabelAtivo: { color: '#006D1A' },

  secaoHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
  },
  secaoTitulo: { fontSize: 17, color: colors.dark, flex: 1 },
  contagem: {
    backgroundColor: colors.greenLight, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  contagemTxt: { fontSize: 13, color: '#006D1A' },

  listaConteudo: { paddingHorizontal: 16, paddingBottom: 48 },

  // Card
  card: {
    flexDirection: 'row', borderRadius: 14, marginBottom: 12,
    backgroundColor: colors.white, overflow: 'hidden',
    shadowColor: colors.dark, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 10, elevation: 3,
    borderWidth: 1, borderColor: colors.border,
  },
  cardLocked: { backgroundColor: '#FAFAFA' },
  barraLateral: { width: 4 },
  cardBody: { flex: 1, padding: 14 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  emojiBox: {
    width: 48, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, position: 'relative',
  },
  emoji: { fontSize: 24 },
  cadeadoWrap: {
    position: 'absolute', bottom: -4, right: -4,
    backgroundColor: colors.white, borderRadius: 20,
    width: 18, height: 18, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.10, shadowRadius: 2, elevation: 2,
  },
  infoBloco: { flex: 1 },
  nome: { fontSize: 15, color: colors.dark, marginBottom: 4 },
  raridadeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  raridadePilula: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  raridadeTxt: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  estrelas: { fontSize: 11 },
  xpBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, flexShrink: 0,
  },
  xpTxt: { fontSize: 13 },
  desc: { fontSize: 13, color: colors.muted, lineHeight: 18, marginBottom: 10 },
  progressoBloco: { gap: 4 },
  progressoTrilha: {
    height: 6, backgroundColor: colors.border,
    borderRadius: 20, overflow: 'hidden',
  },
  progressoFill: { height: '100%', borderRadius: 20 },
  progressoTxt: { fontSize: 11, color: colors.muted },

  // Estados
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  carregandoTxt: { fontSize: 15, color: colors.muted, marginTop: 12 },
  vazio: { alignItems: 'center', paddingVertical: 48 },
  vazioTitulo: { fontSize: 17, color: '#616161', marginTop: 12, marginBottom: 4 },
  vazioTxt: { fontSize: 13, color: '#BDBDBD', textAlign: 'center' },
});
