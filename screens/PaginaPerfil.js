import { View, StyleSheet, TouchableOpacity, ScrollView, Image, Platform } from 'react-native'
import { Text } from 'react-native-paper'
import { colors, fonts } from '../theme'

// Página "Perfil" do aluno (página 4 do paginador do PetScreen).
//
// Só mostra o que o backend realmente informa:
//   • nome, XP total, missões aprovadas e nº de conquistas -> `progresso` (consultarProgressoGeral:
//     RPCs obter_meu_perfil + aluno_meu_progresso_geral), mantido por useDadosAluno;
//   • turma e PET -> objeto `turma` que o App já carrega (buscarTurmaDoAluno).
// Não faz nenhuma consulta própria: os números chegam por props, então não duplica chamadas.
// Quando um dado ainda não chegou, aparece "—" (nunca um número inventado).
//
// Props:
//   width     largura da página
//   aluno     aluno logado ({ id, nome, ... })
//   turma     turma/PET do aluno (nome, pet, petNome, estagio...) ou null
//   estagioPet estágio do PET calculado pelo PetScreen a partir do XP (opcional)
//   progresso { xp, nome, turmaId, missoesAprovadas, conquistas } ou null
//   erroProgresso erro da última atualização (os números mostrados continuam os últimos válidos)
//   onAtualizar   tenta atualizar os números de novo
//   onSair    callback de logout (vem do App)

function MiniPet({ uri, emoji = '🌱', style }) {
  return uri
    ? <Image source={{ uri }} style={style} resizeMode="contain" />
    : <Text style={style}>{emoji}</Text>
}

function numeroOuTraco(valor) {
  const n = Number(valor)
  return valor === null || valor === undefined || !Number.isFinite(n) ? '—' : String(n)
}

export default function PaginaPerfil({ width, aluno, turma, estagioPet, progresso, erroProgresso, onAtualizar, onSair }) {
  const nome = String(progresso?.nome || aluno?.nome || '').trim()
  const temProgresso = !!progresso
  const missoes = temProgresso ? progresso.missoesAprovadas : null
  const conquistas = temProgresso ? progresso.conquistas : null
  const xp = temProgresso ? progresso.xp : null
  const petNome = turma?.petNome || ''
  // Estágio: usa o MESMO que a tela do PET mostra (calculado a partir do XP, vem em `estagioPet`).
  // Se não vier, cai para o texto gravado no backend (ex.: "Filhote"). Só mostra se houver texto; não inventa número.
  const estagioTexto = (typeof estagioPet === 'string' && estagioPet.trim())
    ? estagioPet.trim()
    : (typeof turma?.estagio === 'string' ? turma.estagio.trim() : '')
  const estagio = estagioTexto ? estagioTexto.charAt(0).toUpperCase() + estagioTexto.slice(1) : ''

  return (
    <View style={[p.page, { width }]}>
      <ScrollView contentContainerStyle={p.profileScroll} showsVerticalScrollIndicator={false}>
        <View style={p.profileHero}>
          <View style={p.profileTopLine}>
            <Text style={p.profilePageTitle}>Meu perfil</Text>
          </View>
          <View style={p.avatarCircle}><Text style={p.avatarGlyph}>🧑‍🌾</Text></View>
        </View>

        <View style={p.profileInfo}>
          {nome ? <Text style={p.profileName}>{nome}</Text> : null}
          {turma?.nome ? <Text style={p.profileTurma}>Turma {turma.nome}</Text> : null}

          <View style={p.profileStats}>
            <View style={p.profileStat}><Text style={p.profileStatValue}>{numeroOuTraco(xp)}</Text><Text style={p.profileStatLabel}>XP total</Text></View>
            <View style={p.statDivider} />
            <View style={p.profileStat}><Text style={p.profileStatValue}>{numeroOuTraco(missoes)}</Text><Text style={p.profileStatLabel}>{missoes === 1 ? 'tarefa aprovada' : 'tarefas aprovadas'}</Text></View>
            <View style={p.statDivider} />
            <View style={p.profileStat}><Text style={p.profileStatValue}>{numeroOuTraco(conquistas)}</Text><Text style={p.profileStatLabel}>{conquistas === 1 ? 'conquista' : 'conquistas'}</Text></View>
          </View>

          {erroProgresso ? (
            <TouchableOpacity onPress={onAtualizar} activeOpacity={0.85} style={p.aviso} accessibilityRole="button">
              <Text style={p.avisoTxt}>Não foi possível atualizar seus números agora. Toque para tentar de novo.</Text>
            </TouchableOpacity>
          ) : null}

          {turma ? (
            <View style={p.petCard}>
              <MiniPet uri={turma.pet} emoji="🌱" style={p.petImg} />
              <View style={p.petInfo}>
                <Text style={p.petTitulo}>{petNome || 'Meu PET'}</Text>
                {estagio ? <Text style={p.petSub}>Estágio: {estagio}</Text> : null}
              </View>
            </View>
          ) : null}

          <TouchableOpacity onPress={onSair} activeOpacity={0.85} style={p.logoutButton} accessibilityRole="button">
            <Text style={p.logoutEmoji}>🚪</Text><Text style={p.logoutText}>Sair da conta</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  )
}

const p = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.cream, overflow: 'hidden' },
  profileScroll: { paddingBottom: 78, backgroundColor: colors.cream },
  profileHero: { height: 174, backgroundColor: colors.green, paddingTop: Platform.OS === 'android' ? 34 : 48, alignItems: 'center' },
  profileTopLine: { width: '100%', paddingHorizontal: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  profilePageTitle: { color: colors.white, fontSize: 23, fontFamily: fonts.extrabold },
  avatarCircle: { position: 'absolute', bottom: -46, width: 104, height: 104, borderRadius: 52, backgroundColor: '#E8EFE9', borderWidth: 5, borderColor: colors.white, alignItems: 'center', justifyContent: 'center', elevation: 5 },
  avatarGlyph: { color: '#79877B', fontSize: 58, fontFamily: fonts.regular, lineHeight: 66 },
  profileInfo: { paddingTop: 52, paddingHorizontal: 18 },
  profileName: { textAlign: 'center', color: '#171914', fontSize: 26, fontFamily: fonts.extrabold, marginBottom: 4 },
  profileTurma: { textAlign: 'center', color: '#77786F', fontSize: 12, fontFamily: fonts.semibold, marginBottom: 14 },
  profileStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: colors.white, borderRadius: 16, paddingVertical: 14, marginTop: 8, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  profileStat: { flex: 1, alignItems: 'center', gap: 3 },
  profileStatValue: { color: colors.green, fontSize: 18, fontFamily: fonts.extrabold },
  profileStatLabel: { color: '#77786F', fontSize: 10, fontFamily: fonts.medium, textAlign: 'center' },
  statDivider: { width: 1, height: 30, backgroundColor: colors.border },
  aviso: { backgroundColor: colors.yellowLight, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#EBDDA0', marginBottom: 12 },
  avisoTxt: { color: '#785A00', fontSize: 12, fontFamily: fonts.bold, textAlign: 'center' },
  petCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.greenLight, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#C5E7CD' },
  petImg: { width: 56, height: 56, fontSize: 38, textAlign: 'center' },
  petInfo: { flex: 1, gap: 3 },
  petTitulo: { color: colors.green, fontSize: 15, fontFamily: fonts.extrabold },
  petSub: { color: '#59645A', fontSize: 12, fontFamily: fonts.semibold },
  logoutButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: colors.green, borderRadius: 16, borderBottomWidth: 5, borderBottomColor: '#08761F', marginTop: 16 },
  logoutEmoji: { fontSize: 22 },
  logoutText: { color: colors.white, fontSize: 18, fontFamily: fonts.extrabold },
})