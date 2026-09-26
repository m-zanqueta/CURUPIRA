import React from 'react';
import { Image, Modal, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme';
import { NAV } from './dashboardConfig';

export default function DashboardSidebar({ visible, activeNav, professor, onNavigate, onClose, onLogout }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={styles.sidebar}>
        <View style={styles.logoRow}>
          <Image source={require('../assets/logo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.logoText}>CURUPIRA</Text>
        </View>
        {NAV.map(item => (
          <TouchableOpacity key={item.id} style={[styles.navItem, activeNav === item.id && styles.navActive]} onPress={() => onNavigate(item.id)}>
            <Text style={styles.navIcon}>{item.icon}</Text>
            <Text style={[styles.navLabel, activeNav === item.id && styles.navLabelActive]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
        <View style={styles.bottom}>
          <View style={styles.teacherRow}>
            <View style={styles.teacherAvatar}><Text style={styles.teacherInitials}>{(professor?.nome || 'P')[0]}</Text></View>
            <View>
              <Text style={styles.teacherName}>{professor?.nome || 'Professor'}</Text>
              <Text style={styles.teacherRole}>Área do Professor</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onLogout}><Text style={styles.logout}>← Sair</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10 },
  sidebar: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 240, backgroundColor: colors.dark, paddingTop: 50, paddingBottom: 24, zIndex: 20 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', marginBottom: 12 },
  logo: { width: 36, height: 36 },
  logoText: { fontSize: 14, fontFamily: fonts.extrabold, color: '#fff', letterSpacing: 2 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 20, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  navActive: { borderLeftColor: colors.green, backgroundColor: 'rgba(255,255,255,0.07)' },
  navIcon: { fontSize: 16, width: 22, textAlign: 'center' },
  navLabel: { fontSize: 13, fontFamily: fonts.medium, color: 'rgba(255,255,255,0.5)' },
  navLabelActive: { color: '#fff' },
  bottom: { marginTop: 'auto', paddingHorizontal: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', gap: 12 },
  teacherRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  teacherAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  teacherInitials: { fontSize: 12, fontFamily: fonts.bold, color: '#fff' },
  teacherName: { fontSize: 13, fontFamily: fonts.semibold, color: '#fff' },
  teacherRole: { fontSize: 11, fontFamily: fonts.regular, color: 'rgba(255,255,255,0.4)' },
  logout: { fontSize: 12, fontFamily: fonts.semibold, color: 'rgba(255,100,100,0.8)' },
});
