// ============================================================
// CURUPIRA — screens/DetalheConquistaScreen.js
// Usa theme.js (colors + fonts) da feature/dashboard.
// ============================================================

import React, { useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, Animated, SafeAreaView,
} from 'react-native';
import { colors, fonts } from '../theme';
import {
  getCorRaridade, getFundoRaridade, getEstrelasRaridade,
  calcularPorcentagem, getTextoProgresso, formatarData,
} from '../utils/conquistasUtils';

export default function DetalheConquistaScreen({ navigation, route }) {
  const { conquista } = route.params;

  const heroAnim      = useRef(new Animated.Value(0)).current;
  const conteudoAnim  = useRef(new Animated.Value(28)).current;
  const progressoAnim = useRef(new Animated.Value(0)).current;
  const ringAnim      = useRef(new Animated.Value(0)).current;

  const cor      = getCorRaridade(conquista.raridade);
  const fundo    = getFundoRaridade(conquista.raridade);
  const estrelas = getEstrelasRaridade(conquista.raridade);
  const pct      = calcularPorcentagem(conquista.progresso, conquista.meta);
  const progTxt  = getTextoProgresso(conquista);
  const dataFmt  = formatarData(conquista.dataDesbloqueio);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroAnim,     { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.spring(conteudoAnim, { toValue: 0, tension: 55, friction: 9, delay: 180, useNativeDriver: true }),
      Animated.timing(progressoAnim,{ toValue: pct / 100, duration: 1100, delay: 380, useNativeDriver: false }),
    ]).start();

    if (conquista.desbloqueada) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(ringAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
          Animated.timing(ringAnim, { toValue: 0, duration: 0,    useNativeDriver: true }),
        ])
      ).start();
    }
  }, []);

  const ringScale   = ringAnim.interpolate({ inputRange: [0, 1], outputRange: [1,   2.1] });
  const ringOpacity = ringAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0  ] });
  const barLargura  = progressoAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <SafeAreaView style={S.root}>
      <StatusBar barStyle="light-content" backgroundColor={cor} />

      {/* Hero */}
      <Animated.View style={[S.hero, { backgroundColor: cor, opacity: heroAnim }]}>
        <View style={S.heroDecor1} />
        <View style={S.heroDecor2} />

        <TouchableOpacity style={S.voltarBtn} onPress={() => navigation.goBack()}>
          <Text style={[S.voltarIcone, { fontFamily: fonts.bold }]}>←</Text>
        </TouchableOpacity>

        <View style={S.emojiWrap}>
          {conquista.desbloqueada && (
            <Animated.View style={[
              S.ring,
              { borderColor: 'rgba(255,255,255,0.45)', transform: [{ scale: ringScale }], opacity: ringOpacity },
            ]} />
          )}
          <View style={[S.emojiCirculo, { backgroundColor: fundo }]}>
            <Text style={[S.emoji, !conquista.desbloqueada && { opacity: 0.3 }]}>
              {conquista.emoji}
            </Text>
            {!conquista.desbloqueada && (
              <View style={S.cadeadoBadge}>
                <Text style={{ fontSize: 13 }}>🔒</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={[S.heroCategoria, { fontFamily: fonts.semibold }]}>
          {conquista.categoria}
        </Text>
        <Text style={[S.heroNome, { fontFamily: fonts.extrabold }]}>
          {conquista.nome}
        </Text>

        <View style={S.heroPilulas}>
          <View style={S.heroPilula}>
            <Text style={[S.heroPilulaTxt, { fontFamily: fonts.semibold }]}>
              {conquista.raridade} · {estrelas}
            </Text>
          </View>
          {conquista.xp > 0 && (
            <View style={[S.heroPilula, { backgroundColor: 'rgba(219,180,7,0.22)' }]}>
              <Text style={[S.heroPilulaTxt, { fontFamily: fonts.semibold }]}>
                ⚡ +{conquista.xp} XP
              </Text>
            </View>
          )}
        </View>
      </Animated.View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <Animated.View style={{ transform: [{ translateY: conteudoAnim }] }}>

          {/* Barra de progresso */}
          <View style={S.progressoSecao}>
            <View style={S.progressoTop}>
              <Text style={[S.progressoRotulo, { fontFamily: fonts.semibold }]}>
                {conquista.desbloqueada ? 'Conquistado! 🎉' : 'Progresso'}
              </Text>
              <Text style={[S.progressoPct, { fontFamily: fonts.extrabold }]}>{pct}%</Text>
            </View>
            <View style={S.progressoTrilha}>
              <Animated.View style={[S.progressoFill, { width: barLargura, backgroundColor: cor }]} />
            </View>
            <Text style={[S.progressoTxt, { fontFamily: fonts.medium },
              conquista.desbloqueada && { color: cor }]}>
              {progTxt}
            </Text>
          </View>

          {/* Sobre */}
          <View style={S.secao}>
            <Text style={[S.secaoRotulo, { fontFamily: fonts.semibold }]}>Sobre esta Conquista</Text>
            <View style={S.card}>
              <Text style={[S.descricao, { fontFamily: fonts.regular }]}>{conquista.descricao}</Text>
            </View>
          </View>

          {/* Como desbloquear */}
          {!conquista.desbloqueada && (
            <View style={S.secao}>
              <Text style={[S.secaoRotulo, { fontFamily: fonts.semibold }]}>Como Desbloquear</Text>
              <View style={[S.card, { borderLeftWidth: 3, borderLeftColor: cor }]}>
                <View style={S.comoRow}>
                  <Text style={{ fontSize: 22 }}>{conquista.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[S.comoTitulo, { fontFamily: fonts.bold }]}>{conquista.nome}</Text>
                    <Text style={[S.comoDesc, { fontFamily: fonts.regular }]}>{progTxt}</Text>
                  </View>
                </View>
                <View style={S.miniTrilha}>
                  <View style={[S.miniFill, { width: `${pct}%`, backgroundColor: cor }]} />
                </View>
                <Text style={[S.miniTxt, { fontFamily: fonts.medium }]}>{pct}% concluído</Text>
              </View>
            </View>
          )}

          {/* Data de desbloqueio */}
          {conquista.desbloqueada && dataFmt && (
            <View style={S.secao}>
              <Text style={[S.secaoRotulo, { fontFamily: fonts.semibold }]}>Data de Desbloqueio</Text>
              <View style={[S.card, { backgroundColor: fundo, borderWidth: 1, borderColor: cor }]}>
                <View style={S.dataRow}>
                  <Text style={{ fontSize: 28 }}>🎉</Text>
                  <View>
                    <Text style={[S.dataTitulo, { fontFamily: fonts.extrabold, color: cor }]}>
                      Parabéns!
                    </Text>
                    <Text style={[S.dataDesc, { fontFamily: fonts.regular }]}>
                      Desbloqueada em {dataFmt}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Recompensa XP */}
          {conquista.xp > 0 && (
            <View style={S.secao}>
              <Text style={[S.secaoRotulo, { fontFamily: fonts.semibold }]}>Recompensa</Text>
              <View style={[S.card, S.recompensaCard]}>
                <Text style={{ fontSize: 32 }}>⚡</Text>
                <View>
                  <Text style={[S.recompensaXp, { fontFamily: fonts.extrabold, color: colors.yellow }]}>
                    +{conquista.xp} XP
                  </Text>
                  <Text style={[S.recompensaDesc, { fontFamily: fonts.regular }]}>
                    {conquista.desbloqueada
                      ? 'Já adicionado ao seu perfil!'
                      : 'Desbloqueie para ganhar este XP'}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* CTA */}
          {!conquista.desbloqueada && (
            <View style={S.ctaSecao}>
              <TouchableOpacity
                style={[S.ctaBtn, { backgroundColor: cor }]}
                onPress={() => navigation.navigate('Dashboard')}
                activeOpacity={0.85}
              >
                <Text style={[S.ctaBtnTxt, { fontFamily: fonts.extrabold }]}>
                  Ir para Tarefas →
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 48 }} />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },

  hero: {
    alignItems: 'center', paddingTop: 24,
    paddingBottom: 32, paddingHorizontal: 16,
    position: 'relative', overflow: 'hidden',
  },
  heroDecor1: {
    position: 'absolute', top: -50, right: -50,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  heroDecor2: {
    position: 'absolute', bottom: -30, left: -30,
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  voltarBtn: {
    alignSelf: 'flex-start', width: 40, height: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  voltarIcone: { fontSize: 20, color: colors.white },
  emojiWrap: {
    width: 120, height: 120, alignItems: 'center',
    justifyContent: 'center', marginBottom: 16, position: 'relative',
  },
  ring: {
    position: 'absolute', width: 120, height: 120,
    borderRadius: 60, borderWidth: 3,
  },
  emojiCirculo: {
    width: 90, height: 90, borderRadius: 45,
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  emoji: { fontSize: 46 },
  cadeadoBadge: {
    position: 'absolute', bottom: -4, right: -4,
    backgroundColor: colors.white, borderRadius: 20,
    width: 26, height: 26, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12, shadowRadius: 3, elevation: 3,
  },
  heroCategoria: {
    fontSize: 11, color: 'rgba(255,255,255,0.65)',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4,
  },
  heroNome: {
    fontSize: 24, color: colors.white,
    textAlign: 'center', marginBottom: 12,
  },
  heroPilulas: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  heroPilula: {
    paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  heroPilulaTxt: { fontSize: 13, color: colors.white },

  progressoSecao: {
    backgroundColor: colors.white, margin: 16, borderRadius: 16,
    padding: 16, elevation: 2,
    shadowColor: colors.dark, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6,
    borderWidth: 1, borderColor: colors.border,
  },
  progressoTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  progressoRotulo: { fontSize: 13, color: colors.muted },
  progressoPct: { fontSize: 13, color: colors.dark },
  progressoTrilha: {
    height: 8, backgroundColor: colors.border,
    borderRadius: 20, overflow: 'hidden', marginBottom: 6,
  },
  progressoFill: { height: '100%', borderRadius: 20 },
  progressoTxt: { fontSize: 11, color: colors.muted },

  secao: { paddingHorizontal: 16, marginBottom: 14 },
  secaoRotulo: {
    fontSize: 11, color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
  },
  card: {
    backgroundColor: colors.white, borderRadius: 16, padding: 16,
    elevation: 2, shadowColor: colors.dark, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6,
    borderWidth: 1, borderColor: colors.border,
  },
  descricao: { fontSize: 15, color: colors.muted, lineHeight: 22 },

  comoRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 12 },
  comoTitulo: { fontSize: 15, color: colors.dark, marginBottom: 2 },
  comoDesc: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  miniTrilha: {
    height: 6, backgroundColor: colors.border,
    borderRadius: 20, overflow: 'hidden', marginBottom: 4,
  },
  miniFill: { height: '100%', borderRadius: 20 },
  miniTxt: { fontSize: 11, color: '#BDBDBD' },

  dataRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  dataTitulo: { fontSize: 17, marginBottom: 2 },
  dataDesc: { fontSize: 13, color: colors.muted },

  recompensaCard: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  recompensaXp: { fontSize: 20, marginBottom: 2 },
  recompensaDesc: { fontSize: 13, color: colors.muted },

  ctaSecao: { paddingHorizontal: 16 },
  ctaBtn: {
    borderRadius: 30, height: 54,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.green, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28, shadowRadius: 10, elevation: 6,
  },
  ctaBtnTxt: { color: colors.white, fontSize: 16 },
});
