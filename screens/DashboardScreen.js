import { useState } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  StyleSheet, Modal, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';

const { width } = Dimensions.get('window');

const NAV = [
  { id: 'overview',   label: 'Visão Geral',  icon: '📊' },
  { id: 'turmas',     label: 'Turmas',        icon: '👥' },
  { id: 'missoes',    label: 'Missões',       icon: '🏆' },
  { id: 'relatorio',  label: 'Relatórios',    icon: '📈' },
  { id: 'conquistas', label: 'Conquistas',    icon: '🎖️' },
]

const TURMAS = [
  { nome: '2º A', pet: '🐉', estagio: 'Jovem',   xp: 980, progresso: 78, emocao: '😄', cor: colors.green,  cosmetico: true  },
  { nome: '2º B', pet: '🦊', estagio: 'Filhote', xp: 640, progresso: 52, emocao: '😐', cor: colors.purple, cosmetico: false },
  { nome: '2º C', pet: '🦅', estagio: 'Adulto',  xp: 830, progresso: 91, emocao: '🤩', cor: colors.yellow, cosmetico: true  },
  { nome: '2º D', pet: '🐺', estagio: 'Filhote', xp: 510, progresso: 41, emocao: '😴', cor: colors.green,  cosmetico: false },
]

const MISSIONS = [
  { name: 'Horta Escolar',         turma: 'Todas as turmas', alunos: 92,  xp: 150, color: colors.greenLight,  textColor: '#006516', icon: '🌱', active: true,  progress: 68 },
  { name: 'Clube de Leitura',      turma: '2º B',            alunos: 18,  xp: 100, color: colors.yellowLight, textColor: '#7a5f00', icon: '📖', active: false },
  { name: 'Coral da Escola',       turma: '2º C',            alunos: 24,  xp: 200, color: colors.purpleLight, textColor: colors.purple, icon: '🎵', active: false },
  { name: 'Atletismo Comunitário', turma: '2º D',            alunos: 15,  xp: 120, color: '#fde8e8',          textColor: '#c0392b', icon: '🏃', active: false },
]

const RANKING = [
  { name: 'Maria Fernanda', turma: '2º A', xp: 980, pct: 100, initials: 'MF', color: colors.green  },
  { name: 'João Pedro',     turma: '2º B', xp: 830, pct: 85,  initials: 'JP', color: colors.purple },
  { name: 'Letícia S.',     turma: '2º C', xp: 710, pct: 72,  initials: 'LS', color: colors.yellow },
  { name: 'Carlos R.',      turma: '2º D', xp: 570, pct: 58,  initials: 'CR', color: '#888'        },
]

const BADGES = [
  { label: 'Guardião da Natureza', color: colors.greenLight,  text: '#006516', icon: '🌿' },
  { label: 'Estrela em Ascensão',  color: colors.yellowLight, text: '#7a5f00', icon: '⭐' },
  { label: 'Artista do Coral',     color: colors.purpleLight, text: colors.purple, icon: '🎵' },
  { label: 'Atleta Comunitário',   color: colors.greenLight,  text: '#006516', icon: '🏃' },
  { label: 'Leitor Voraz',         color: colors.yellowLight, text: '#7a5f00', icon: '📚' },
  { label: 'Primeira Missão',      color: colors.purpleLight, text: colors.purple, icon: '🎖️' },
]

const MEDALS = ['🥇', '🥈', '🥉', '4️⃣']

const STATS = [
  { label: 'Alunos ativos',       value: '87',   icon: '👥', bg: colors.greenLight  },
  { label: 'Missões abertas',     value: '12',   icon: '🏆', bg: colors.yellowLight },
  { label: 'Conquistas entregues',value: '234',  icon: '🎖️', bg: colors.purpleLight },
  { label: 'XP distribuído',      value: '4.8k', icon: '⭐', bg: '#f0f0f0'          },
]

export default function DashboardScreen({ navigation }) {
  const [activeNav, setActiveNav] = useState('overview')
  const [menuOpen, setMenuOpen] = useState(false)

  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })

  return (
    <SafeAreaView style={s.safe}>

      {/* Sidebar Modal */}
      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setMenuOpen(false)} />
        <View style={s.sidebar}>
          <View style={s.sidebarLogoRow}>
            <Image source={require('../assets/logo.png')} style={s.sidebarLogo} resizeMode="contain" />
            <Text style={s.sidebarLogoText}>CURUPIRA</Text>
          </View>

          {NAV.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[s.navItem, activeNav === item.id && s.navActive]}
              onPress={() => { setActiveNav(item.id); setMenuOpen(false); }}
            >
              <Text style={s.navIcon}>{item.icon}</Text>
              <Text style={[s.navLabel, activeNav === item.id && s.navLabelActive]}>{item.label}</Text>
            </TouchableOpacity>
          ))}

          <View style={s.sidebarBottom}>
            <View style={s.teacherRow}>
              <View style={s.teacherAvatar}><Text style={s.teacherInitials}>P</Text></View>
              <View>
                <Text style={s.teacherName}>Professor</Text>
                <Text style={s.teacherRole}>Área do Professor</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => { setMenuOpen(false); navigation.replace('Login'); }}>
              <Text style={s.logoutBtn}>← Sair</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Main content */}
      <ScrollView style={s.main} contentContainerStyle={s.mainContent} showsVerticalScrollIndicator={false}>

        {/* Top bar */}
        <View style={s.topBar}>
          <View style={s.topBarLeft}>
            <TouchableOpacity onPress={() => setMenuOpen(true)} style={s.hamburger}>
              <View style={s.hLine} /><View style={s.hLine} /><View style={s.hLine} />
            </TouchableOpacity>
            <Image source={require('../assets/logo.png')} style={s.topLogo} resizeMode="contain" />
            <View>
              <Text style={s.pageTitle}>Seja bem-vindo(a), Professor(a)! 👋</Text>
              <Text style={s.pageSub}>4 turmas ativas · Semana de {today}</Text>
            </View>
          </View>
          <TouchableOpacity style={s.btnNew} onPress={() => { setActiveNav('missoes'); }}>
            <Text style={s.btnNewText}>+ Nova Missão</Text>
          </TouchableOpacity>
        </View>

        {/* Horta Banner */}
        <View style={s.hortaBanner}>
          <View style={{ flex: 1 }}>
            <Text style={s.hortaTag}>🌱 MISSÃO DA SEMANA</Text>
            <Text style={s.hortaTitle}>Horta Escolar</Text>
            <Text style={s.hortaDesc}>72 alunos participando · Todas as turmas · Encerra em 3 dias</Text>
            <View style={s.progressRow}>
              <View style={s.progressBg}>
                <View style={[s.progressFill, { width: '68%' }]} />
              </View>
              <Text style={s.progressLabel}>68%</Text>
            </View>
          </View>
          <View style={s.recompensaCard}>
            <Text style={s.recompensaLabel}>🎁 Recompensa</Text>
            <Image source={require('../assets/chapeu-horta.png')} style={s.recompensaImg} resizeMode="contain" />
            <Text style={s.recompensaNome}>Chapéu Jardineiro #67</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsGrid}>
          {STATS.map(stat => (
            <View key={stat.label} style={s.statCard}>
              <View style={[s.statIconWrap, { backgroundColor: stat.bg }]}>
                <Text style={s.statIconEmoji}>{stat.icon}</Text>
              </View>
              <Text style={s.statNum}>{stat.value}</Text>
              <Text style={s.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Pets */}
        <View style={s.panel}>
          <Text style={s.panelTitle}>Pets das Turmas</Text>
          <View style={s.petsGrid}>
            {TURMAS.map(t => (
              <View key={t.nome} style={s.petCard}>
                <View style={s.petCardTop}>
                  <Text style={s.petTurma}>{t.nome}</Text>
                  <Text style={s.petEmocao}>{t.emocao}</Text>
                </View>
                <View style={[s.petAvatar, { borderColor: t.cor }]}>
                  <Text style={s.petEmoji}>{t.pet}</Text>
                  {t.cosmetico && (
                    <Image source={require('../assets/chapeu-horta.png')} style={s.petChapeu} resizeMode="contain" />
                  )}
                </View>
                <Text style={[s.petEstagio, { color: t.cor }]}>{t.estagio}</Text>
                <View style={s.petXpRow}>
                  <View style={s.petXpBg}>
                    <View style={[s.petXpFill, { width: t.progresso + '%', backgroundColor: t.cor }]} />
                  </View>
                  <Text style={s.petXpNum}>{t.xp} XP</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Missions */}
        <View style={s.panel}>
          <Text style={s.panelTitle}>Missões recentes</Text>
          {MISSIONS.map(m => (
            <View key={m.name} style={[s.missionRow, m.active && { backgroundColor: colors.greenLight, borderRadius: 8, paddingHorizontal: 8 }]}>
              <View style={[s.missionIcon, { backgroundColor: m.color }]}>
                <Text style={{ fontSize: 16 }}>{m.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={s.missionName}>{m.name}</Text>
                  {m.active && <View style={s.activePill}><Text style={s.activePillText}>ativa</Text></View>}
                </View>
                <Text style={s.missionMeta}>{m.turma} · {m.alunos} alunos</Text>
                {m.active && (
                  <View style={s.missionProgressRow}>
                    <View style={s.missionProgressBg}>
                      <View style={[s.missionProgressFill, { width: m.progress + '%' }]} />
                    </View>
                    <Text style={s.missionProgressTxt}>{m.progress}%</Text>
                  </View>
                )}
              </View>
              <View style={s.xpBadge}>
                <Text style={s.xpBadgeText}>+{m.xp} XP</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Ranking */}
        <View style={s.panel}>
          <Text style={s.panelTitle}>Ranking da semana</Text>
          {RANKING.map((r, i) => (
            <View key={r.name} style={s.rankRow}>
              <Text style={s.rankMedal}>{MEDALS[i]}</Text>
              <View style={[s.rankAvatar, { backgroundColor: r.color }]}>
                <Text style={s.rankInitials}>{r.initials}</Text>
              </View>
              <View style={{ width: 90 }}>
                <Text style={s.rankName} numberOfLines={1}>{r.name}</Text>
                <Text style={s.rankClass}>{r.turma}</Text>
              </View>
              <View style={s.rankBarBg}>
                <View style={[s.rankBarFill, { width: r.pct + '%', backgroundColor: r.color }]} />
              </View>
              <Text style={s.rankXp}>{r.xp}</Text>
            </View>
          ))}
        </View>

        {/* Badges */}
        <View style={s.panel}>
          <Text style={s.panelTitle}>Conquistas desbloqueadas esta semana</Text>
          <View style={s.badgesWrap}>
            {BADGES.map(b => (
              <View key={b.label} style={[s.badge, { backgroundColor: b.color }]}>
                <Text style={{ fontSize: 12 }}>{b.icon}</Text>
                <Text style={[s.badgeText, { color: b.text }]}>{b.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: colors.cream },
  main:       { flex: 1 },
  mainContent:{ padding: 14, gap: 14 },

  /* Overlay */
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10,
  },

  /* Sidebar */
  sidebar: {
    position: 'absolute', top: 0, left: 0, bottom: 0,
    width: 240, backgroundColor: colors.dark,
    paddingTop: 50, paddingBottom: 24, zIndex: 20,
  },
  sidebarLogoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', marginBottom: 12 },
  sidebarLogo:    { width: 36, height: 36 },
  sidebarLogoText:{ fontSize: 14, fontFamily: fonts.extrabold, color: '#fff', letterSpacing: 2 },
  navItem:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 20, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  navActive:      { borderLeftColor: colors.green, backgroundColor: 'rgba(255,255,255,0.07)' },
  navIcon:        { fontSize: 16, width: 22, textAlign: 'center' },
  navLabel:       { fontSize: 13, fontFamily: fonts.medium, color: 'rgba(255,255,255,0.5)' },
  navLabelActive: { color: '#fff' },
  sidebarBottom:  { marginTop: 'auto', paddingHorizontal: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', gap: 12 },
  teacherRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  teacherAvatar:  { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  teacherInitials:{ fontSize: 12, fontFamily: fonts.bold, color: '#fff' },
  teacherName:    { fontSize: 13, fontFamily: fonts.semibold, color: '#fff' },
  teacherRole:    { fontSize: 11, fontFamily: fonts.regular, color: 'rgba(255,255,255,0.4)' },
  logoutBtn:      { fontSize: 12, fontFamily: fonts.semibold, color: 'rgba(255,100,100,0.8)' },

  /* Top bar */
  topBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  hamburger:  { padding: 6, gap: 5 },
  hLine:      { width: 22, height: 2, backgroundColor: colors.dark, borderRadius: 2 },
  topLogo:    { width: 40, height: 40 },
  pageTitle:  { fontSize: 14, fontFamily: fonts.bold, color: colors.dark },
  pageSub:    { fontSize: 11, fontFamily: fonts.regular, color: colors.muted },
  btnNew:     { backgroundColor: colors.green, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 14 },
  btnNewText: { color: '#fff', fontSize: 12, fontFamily: fonts.bold },

  /* Horta banner */
  hortaBanner: {
    backgroundColor: colors.dark, borderRadius: 12, padding: 16,
    borderWidth: 2, borderColor: colors.green, flexDirection: 'row', gap: 12, alignItems: 'center',
  },
  hortaTag:   { fontSize: 10, fontFamily: fonts.bold, color: colors.green, letterSpacing: 1, marginBottom: 4 },
  hortaTitle: { fontSize: 18, fontFamily: fonts.extrabold, color: '#fff', marginBottom: 4 },
  hortaDesc:  { fontSize: 11, fontFamily: fonts.regular, color: 'rgba(255,255,255,0.5)', marginBottom: 12 },
  progressRow:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressBg: { flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' },
  progressFill:{ height: '100%', backgroundColor: colors.green, borderRadius: 4 },
  progressLabel:{ fontSize: 12, fontFamily: fonts.bold, color: colors.green },
  recompensaCard:{ alignItems: 'center', gap: 4, minWidth: 90 },
  recompensaLabel:{ fontSize: 11, fontFamily: fonts.semibold, color: colors.yellow },
  recompensaImg:{ width: 64, height: 64 },
  recompensaNome:{ fontSize: 10, fontFamily: fonts.semibold, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },

  /* Stats */
  statsGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard:   { backgroundColor: colors.white, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: colors.border, width: (width - 42) / 2 },
  statIconWrap:{ width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statIconEmoji:{ fontSize: 17 },
  statNum:    { fontSize: 22, fontFamily: fonts.bold, color: colors.dark },
  statLabel:  { fontSize: 11, fontFamily: fonts.medium, color: '#999', marginTop: 2 },

  /* Panel */
  panel:      { backgroundColor: colors.white, borderRadius: 10, padding: 16, borderWidth: 1, borderColor: colors.border },
  panelTitle: { fontSize: 14, fontFamily: fonts.bold, color: colors.dark, marginBottom: 12 },

  /* Pets */
  petsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  petCard:    { width: (width - 68) / 2, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, alignItems: 'center', gap: 6, backgroundColor: colors.cream },
  petCardTop: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  petTurma:   { fontSize: 12, fontFamily: fonts.bold, color: colors.dark },
  petEmocao:  { fontSize: 16 },
  petAvatar:  { width: 72, height: 72, borderRadius: 36, borderWidth: 3, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  petEmoji:   { fontSize: 34 },
  petChapeu:  { position: 'absolute', top: -20, width: 56, height: 40 },
  petEstagio: { fontSize: 12, fontFamily: fonts.bold },
  petXpRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, width: '100%' },
  petXpBg:    { flex: 1, height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  petXpFill:  { height: '100%', borderRadius: 3 },
  petXpNum:   { fontSize: 10, fontFamily: fonts.bold, color: colors.muted },

  /* Missions */
  missionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0edd8' },
  missionIcon:{ width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  missionName:{ fontSize: 13, fontFamily: fonts.semibold, color: colors.dark },
  missionMeta:{ fontSize: 11, fontFamily: fonts.regular, color: '#999', marginTop: 2 },
  activePill: { backgroundColor: colors.green, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  activePillText:{ fontSize: 10, fontFamily: fonts.bold, color: '#fff', textTransform: 'uppercase' },
  missionProgressRow:{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  missionProgressBg:{ flex: 1, height: 5, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 3, overflow: 'hidden' },
  missionProgressFill:{ height: '100%', backgroundColor: colors.green, borderRadius: 3 },
  missionProgressTxt:{ fontSize: 11, fontFamily: fonts.bold, color: colors.green },
  xpBadge:    { backgroundColor: colors.yellowLight, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  xpBadgeText:{ fontSize: 12, fontFamily: fonts.bold, color: '#7a5f00' },

  /* Ranking */
  rankRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f0edd8' },
  rankMedal:  { fontSize: 16, width: 24, textAlign: 'center' },
  rankAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rankInitials:{ fontSize: 10, fontFamily: fonts.bold, color: '#fff' },
  rankName:   { fontSize: 12, fontFamily: fonts.semibold, color: colors.dark },
  rankClass:  { fontSize: 10, fontFamily: fonts.regular, color: '#999' },
  rankBarBg:  { flex: 1, height: 6, backgroundColor: '#f0edd8', borderRadius: 3, overflow: 'hidden' },
  rankBarFill:{ height: '100%', borderRadius: 3 },
  rankXp:     { fontSize: 12, fontFamily: fonts.bold, color: colors.dark, minWidth: 34, textAlign: 'right' },

  /* Badges */
  badgesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  badgeText:  { fontSize: 12, fontFamily: fonts.semibold },
})
