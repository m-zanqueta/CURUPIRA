// ============================================================
// CURUPIRA — screens/CriarConquistaScreen.js
// Tela do PROFESSOR para criar conquistas personalizadas.
// Usa theme.js (colors + fonts Montserrat) da feature/dashboard.
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, StatusBar, SafeAreaView, Alert,
  Animated, KeyboardAvoidingView, Platform,
} from 'react-native';
import { colors, fonts } from '../theme';
import { salvarConquistaProfessor } from '../services/conquistasService';
import { CATEGORIAS, RARIDADE, CRITERIOS } from '../data/mockConquistas';
import { getCorRaridade, getFundoRaridade } from '../utils/conquistasUtils';

const EMOJIS = [
  '🌱','🌿','🌳','🌲','🍃','🌍','🌏','🌎',
  '♻️','💧','⚡','🔥','🏆','⭐','💫','🎯',
  '🪣','🌾','🐸','🦋','🌻','🌺','🌊','🌬️',
];

const OPCOES_CRITERIO = [
  { valor: CRITERIOS.TAREFAS_CONCLUIDAS, label: 'Tarefas concluídas',   emoji: '📋', placeholder: 'Ex: 5'   },
  { valor: CRITERIOS.XP_ACUMULADO,       label: 'XP acumulado',          emoji: '⚡', placeholder: 'Ex: 100' },
  { valor: CRITERIOS.STREAK_DIAS,        label: 'Dias consecutivos',     emoji: '🔥', placeholder: 'Ex: 7'   },
  { valor: CRITERIOS.CATEGORIA_TAREFAS,  label: 'Missões por categoria', emoji: '🌿', placeholder: 'Ex: 3'   },
  { valor: CRITERIOS.PRIMEIRA_TAREFA,    label: 'Primeira tarefa',        emoji: '🌱', placeholder: '1'       },
  { valor: CRITERIOS.MISSAO_ESPECIFICA,  label: 'Missão específica',      emoji: '🎯', placeholder: '1'       },
];

// ── Chip selector ─────────────────────────────────────────────
function Chips({ opcoes, valorAtivo, onSelect, corAtivo }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
        {opcoes.map((op) => {
          const ativo = valorAtivo === op.valor;
          return (
            <TouchableOpacity
              key={op.valor}
              style={[
                S.chip,
                ativo && { backgroundColor: corAtivo || colors.green, borderColor: corAtivo || colors.green },
              ]}
              onPress={() => onSelect(op.valor)}
              activeOpacity={0.75}
            >
              {op.emoji && <Text style={{ fontSize: 12 }}>{op.emoji}</Text>}
              <Text style={[
                S.chipTxt, { fontFamily: fonts.semibold },
                ativo && { color: colors.white },
              ]}>
                {op.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

export default function CriarConquistaScreen({ navigation }) {
  const [nome,      setNome]      = useState('');
  const [descricao, setDescricao] = useState('');
  const [xp,        setXp]        = useState('');
  const [categoria, setCategoria] = useState(CATEGORIAS.TAREFAS);
  const [raridade,  setRaridade]  = useState(RARIDADE.COMUM);
  const [criterio,  setCriterio]  = useState(CRITERIOS.TAREFAS_CONCLUIDAS);
  const [meta,      setMeta]      = useState('');
  const [emoji,     setEmoji]     = useState('🏆');
  const [salvando,  setSalvando]  = useState(false);
  const [erros,     setErros]     = useState({});

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const btnAnim  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 380, useNativeDriver: true }).start();
  }, []);

  const corPreview = getCorRaridade(raridade);
  const fundoPreview = getFundoRaridade(raridade);

  const validar = () => {
    const e = {};
    if (!nome.trim())    e.nome      = 'Nome é obrigatório';
    if (!descricao.trim()) e.descricao = 'Descrição é obrigatória';
    if (!meta.trim() || isNaN(Number(meta)) || Number(meta) <= 0)
      e.meta = 'Meta deve ser um número maior que zero';
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const handleSalvar = async () => {
    if (!validar()) return;

    Animated.sequence([
      Animated.spring(btnAnim, { toValue: 0.96, useNativeDriver: true }),
      Animated.spring(btnAnim, { toValue: 1,    useNativeDriver: true }),
    ]).start();

    setSalvando(true);

    const nova = {
      id:              `custom_${Date.now()}`,
      nome:            nome.trim(),
      descricao:       descricao.trim(),
      emoji,
      xp:              Number(xp) || 0,
      categoria,
      raridade,
      criterio,
      meta:            Number(meta),
      progresso:       0,
      desbloqueada:    false,
      dataDesbloqueio: null,
      criadoPor:       'professor',
      criadoEm:        new Date().toISOString(),
    };

    const resultado = await salvarConquistaProfessor(nova);
    setSalvando(false);

    if (resultado.sucesso) {
      Alert.alert(
        '✅ Conquista Criada!',
        `"${nome}" foi criada com sucesso.`,
        [{ text: 'Ver Conquistas', onPress: () => navigation.goBack() }]
      );
    } else {
      Alert.alert('Erro', 'Não foi possível salvar. Tente novamente.');
    }
  };

  const placeholderCriterio =
    OPCOES_CRITERIO.find((o) => o.valor === criterio)?.placeholder || 'Ex: 5';

  return (
    <SafeAreaView style={S.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.green} />

      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity style={S.voltarBtn} onPress={() => navigation.goBack()}>
          <Text style={[S.voltarIcone, { fontFamily: fonts.bold }]}>←</Text>
        </TouchableOpacity>
        <Text style={[S.headerTitulo, { fontFamily: fonts.extrabold }]}>Nova Conquista</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={S.scrollConteudo}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={{ opacity: fadeAnim }}>

            {/* Preview ao vivo */}
            <View style={[S.preview, { borderColor: corPreview }]}>
              <View style={[S.previewEmoji, { backgroundColor: fundoPreview }]}>
                <Text style={{ fontSize: 30 }}>{emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[S.previewNome, { fontFamily: fonts.bold }]} numberOfLines={1}>
                  {nome || 'Nome da Conquista'}
                </Text>
                <Text style={[S.previewDesc, { fontFamily: fonts.regular }]} numberOfLines={2}>
                  {descricao || 'Descrição aparecerá aqui...'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                  <View style={[S.previewPilula, { backgroundColor: fundoPreview }]}>
                    <Text style={[S.previewPilulaTxt, { fontFamily: fonts.semibold, color: corPreview }]}>
                      {raridade}
                    </Text>
                  </View>
                  {Number(xp) > 0 && (
                    <View style={[S.previewPilula, { backgroundColor: colors.yellowLight }]}>
                      <Text style={[S.previewPilulaTxt, { fontFamily: fonts.semibold, color: colors.yellow }]}>
                        ⚡ +{xp} XP
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Ícone */}
            <View style={S.bloco}>
              <Text style={[S.blocoTitulo, { fontFamily: fonts.bold }]}>Ícone</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                  {EMOJIS.map((e) => (
                    <TouchableOpacity
                      key={e}
                      style={[S.emojiBtn, emoji === e && S.emojiBtnAtivo]}
                      onPress={() => setEmoji(e)}
                    >
                      <Text style={{ fontSize: 22 }}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Nome */}
            <View style={S.bloco}>
              <Text style={[S.label, { fontFamily: fonts.semibold }]}>
                Nome <Text style={{ color: colors.red }}>*</Text>
              </Text>
              <View style={[S.inputWrap, erros.nome && S.inputErro]}>
                <TextInput
                  style={[S.input, { fontFamily: fonts.medium }]}
                  placeholder="Ex: Guardião da Natureza"
                  placeholderTextColor={colors.muted}
                  value={nome}
                  onChangeText={(v) => { setNome(v); setErros((e) => ({ ...e, nome: null })); }}
                  maxLength={50}
                />
              </View>
              {erros.nome && (
                <Text style={[S.erroTxt, { fontFamily: fonts.medium }]}>{erros.nome}</Text>
              )}
            </View>

            {/* Descrição */}
            <View style={S.bloco}>
              <Text style={[S.label, { fontFamily: fonts.semibold }]}>
                Descrição <Text style={{ color: colors.red }}>*</Text>
              </Text>
              <View style={[S.inputWrap, { height: 90, alignItems: 'flex-start', paddingTop: 10 }, erros.descricao && S.inputErro]}>
                <TextInput
                  style={[S.input, { fontFamily: fonts.regular, height: 70, textAlignVertical: 'top' }]}
                  placeholder="Descreva o que o aluno precisa fazer para desbloquear esta conquista."
                  placeholderTextColor={colors.muted}
                  value={descricao}
                  onChangeText={(v) => { setDescricao(v); setErros((e) => ({ ...e, descricao: null })); }}
                  multiline
                  maxLength={200}
                />
              </View>
              {erros.descricao && (
                <Text style={[S.erroTxt, { fontFamily: fonts.medium }]}>{erros.descricao}</Text>
              )}
            </View>

            {/* XP */}
            <View style={S.bloco}>
              <Text style={[S.label, { fontFamily: fonts.semibold }]}>
                XP Concedido <Text style={[S.labelDica, { fontFamily: fonts.regular }]}>(0 para nenhum)</Text>
              </Text>
              <View style={S.inputWrap}>
                <Text style={{ fontSize: 14, marginRight: 6 }}>⚡</Text>
                <TextInput
                  style={[S.input, { fontFamily: fonts.medium }]}
                  placeholder="Ex: 50"
                  placeholderTextColor={colors.muted}
                  value={xp}
                  onChangeText={setXp}
                  keyboardType="numeric"
                  maxLength={5}
                />
              </View>
            </View>

            {/* Categoria */}
            <View style={S.bloco}>
              <Text style={[S.blocoTitulo, { fontFamily: fonts.bold }]}>Categoria</Text>
              <Chips
                opcoes={Object.values(CATEGORIAS).map((c) => ({ valor: c, label: c }))}
                valorAtivo={categoria}
                onSelect={setCategoria}
                corAtivo={colors.green}
              />
            </View>

            {/* Raridade */}
            <View style={S.bloco}>
              <Text style={[S.blocoTitulo, { fontFamily: fonts.bold }]}>Raridade</Text>
              <Chips
                opcoes={Object.values(RARIDADE).map((r) => ({ valor: r, label: r }))}
                valorAtivo={raridade}
                onSelect={setRaridade}
                corAtivo={colors.purple}
              />
            </View>

            {/* Critério + meta */}
            <View style={S.bloco}>
              <Text style={[S.blocoTitulo, { fontFamily: fonts.bold }]}>Critério de Desbloqueio</Text>
              <Chips
                opcoes={OPCOES_CRITERIO}
                valorAtivo={criterio}
                onSelect={setCriterio}
                corAtivo="#0288D1"
              />

              <View style={{ marginTop: 14 }}>
                <Text style={[S.label, { fontFamily: fonts.semibold }]}>
                  Meta <Text style={{ color: colors.red }}>*</Text>
                </Text>
                <View style={[S.inputWrap, erros.meta && S.inputErro]}>
                  <TextInput
                    style={[S.input, { fontFamily: fonts.medium }]}
                    placeholder={placeholderCriterio}
                    placeholderTextColor={colors.muted}
                    value={meta}
                    onChangeText={(v) => { setMeta(v); setErros((e) => ({ ...e, meta: null })); }}
                    keyboardType="numeric"
                    maxLength={6}
                  />
                </View>
                {erros.meta && (
                  <Text style={[S.erroTxt, { fontFamily: fonts.medium }]}>{erros.meta}</Text>
                )}
              </View>
            </View>

            {/* Botões */}
            <View style={S.acoes}>
              <Animated.View style={{ transform: [{ scale: btnAnim }] }}>
                <TouchableOpacity
                  style={[S.btnSalvar, salvando && { opacity: 0.7 }]}
                  onPress={handleSalvar}
                  disabled={salvando}
                  activeOpacity={0.85}
                >
                  <Text style={[S.btnSalvarTxt, { fontFamily: fonts.extrabold }]}>
                    {salvando ? 'Salvando...' : '✅ Criar Conquista'}
                  </Text>
                </TouchableOpacity>
              </Animated.View>

              <TouchableOpacity style={S.btnCancelar} onPress={() => navigation.goBack()}>
                <Text style={[S.btnCancelarTxt, { fontFamily: fonts.semibold }]}>Cancelar</Text>
              </TouchableOpacity>
            </View>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },

  header: {
    backgroundColor: colors.green,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16,
  },
  voltarBtn: {
    width: 40, height: 40, backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  voltarIcone: { fontSize: 20, color: colors.white },
  headerTitulo: { fontSize: 20, color: colors.white },

  scrollConteudo: { padding: 16, paddingBottom: 60 },

  // Preview
  preview: {
    backgroundColor: colors.white, borderRadius: 14,
    padding: 14, flexDirection: 'row', gap: 12,
    alignItems: 'flex-start', marginBottom: 16,
    borderWidth: 2,
    shadowColor: colors.dark, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 10, elevation: 3,
  },
  previewEmoji: {
    width: 56, height: 56, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  previewNome: { fontSize: 15, color: colors.dark, marginBottom: 2 },
  previewDesc: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  previewPilula: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  previewPilulaTxt: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 },

  // Blocos de formulário
  bloco: {
    backgroundColor: colors.white, borderRadius: 14,
    padding: 14, marginBottom: 10,
    shadowColor: colors.dark, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    borderWidth: 1, borderColor: colors.border,
  },
  blocoTitulo: {
    fontSize: 13, color: colors.dark,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
  },
  label: { fontSize: 13, color: '#424242', marginBottom: 6 },
  labelDica: { fontSize: 12, color: colors.muted },

  // Emojis
  emojiBtn: {
    width: 44, height: 44, backgroundColor: '#F5F5F5',
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.border,
  },
  emojiBtnAtivo: { backgroundColor: colors.greenLight, borderColor: colors.green },

  // Inputs
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: 12, backgroundColor: '#FAFAFA',
    paddingHorizontal: 12, height: 50,
  },
  inputErro: { borderColor: '#D32F2F', backgroundColor: colors.red },
  input: { flex: 1, height: 48, fontSize: 15, color: colors.dark },
  erroTxt: { fontSize: 11, color: '#D32F2F', marginTop: 4 },

  // Chips
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: '#F5F5F5', borderRadius: 20,
    borderWidth: 1.5, borderColor: colors.border,
  },
  chipTxt: { fontSize: 13, color: colors.muted },

  // Botões
  acoes: { gap: 10, marginTop: 8 },
  btnSalvar: {
    backgroundColor: colors.green, borderRadius: 30, height: 56,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.green, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28, shadowRadius: 10, elevation: 6,
  },
  btnSalvarTxt: { color: colors.white, fontSize: 16 },
  btnCancelar: {
    borderRadius: 30, height: 50,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1.5, borderColor: colors.border,
  },
  btnCancelarTxt: { color: colors.muted, fontSize: 15 },
});
