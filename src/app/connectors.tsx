/** 连接器：外部服务的地址 + 凭据引用；凭据只在发请求那一刻由 App 注入 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../app-state';
import {
  CONNECTOR_PRESETS,
  newConnectorId,
  normalizeConnectorName,
  type Connector,
  type ConnectorAuth,
} from '../connectors';
import { callConnector } from '../connectorCall';
import { Btn, Header, SectionTitle } from '../ui';

type Draft = {
  id: string | null;
  name: string;
  label: string;
  baseUrl: string;
  auth: ConnectorAuth;
  credential: string;
  fieldName: string;
  note: string;
};

const EMPTY: Draft = {
  id: null,
  name: '',
  label: '',
  baseUrl: '',
  auth: 'bearer',
  credential: '',
  fieldName: '',
  note: '',
};

export default function ConnectorsScreen() {
  const { t, cfg, saveCfg, credentials, reloadCredentials } = useApp();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tested, setTested] = useState<Record<string, string>>({});

  useEffect(() => {
    void reloadCredentials();
  }, [reloadCredentials]);

  const list = cfg.connectors ?? [];

  const save = async () => {
    if (!draft) return;
    const name = normalizeConnectorName(draft.name);
    if (!name || !draft.baseUrl.trim()) return;
    const item: Connector = {
      id: draft.id ?? newConnectorId(),
      name,
      label: draft.label.trim() || undefined,
      baseUrl: draft.baseUrl.trim(),
      auth: draft.auth,
      credential: draft.credential.trim() || undefined,
      fieldName: draft.fieldName.trim() || undefined,
      note: draft.note.trim() || undefined,
      createdAt: Date.now(),
    };
    const next = draft.id ? list.map((c) => (c.id === draft.id ? item : c)) : [...list, item];
    await saveCfg({ ...cfg, connectors: next });
    setDraft(null);
  };

  const test = async (c: Connector) => {
    setTested((p) => ({ ...p, [c.id]: t('mcp.probing') }));
    const r = await callConnector(cfg, c, { path: '' });
    setTested((p) => ({
      ...p,
      [c.id]: r.ok
        ? t('conn.test.ok', { s: r.status ?? 0 })
        : t('conn.test.fail', { e: r.error ?? `HTTP ${r.status ?? '?'}` }),
    }));
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <Header
        title={t('conn.title')}
        subtitle={`${list.length}`}
        right={<Btn label={t('conn.add')} onPress={() => setDraft({ ...EMPTY })} />}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={s.hint}>{t('conn.hint')}</Text>
        {credentials.length === 0 ? <Text style={s.warn}>{t('conn.needCred')}</Text> : null}

        {list.map((c) => (
          <View key={c.id} style={s.card}>
            <View style={s.head}>
              <Ionicons name="git-network-outline" size={17} color="#0a84ff" />
              <Text style={s.name}>{c.name}</Text>
              <Text style={s.tag}>
                {c.auth === 'none' ? t('conn.auth.none') : `${c.auth}${c.credential ? ` · ${c.credential}` : ''}`}
              </Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                onPress={() =>
                  setDraft({
                    id: c.id,
                    name: c.name,
                    label: c.label ?? '',
                    baseUrl: c.baseUrl,
                    auth: c.auth,
                    credential: c.credential ?? '',
                    fieldName: c.fieldName ?? '',
                    note: c.note ?? '',
                  })
                }
              >
                <Text style={s.action}>{t('prov.edit')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  Alert.alert(t('conn.delete'), t('conn.deleteConfirm'), [
                    { text: t('agents.cancel'), style: 'cancel' },
                    {
                      text: t('mem.delete'),
                      style: 'destructive',
                      onPress: () =>
                        void saveCfg({ ...cfg, connectors: list.filter((x) => x.id !== c.id) }),
                    },
                  ])
                }
              >
                <Ionicons name="trash-outline" size={16} color="#ff3b30" />
              </TouchableOpacity>
            </View>
            <Text style={s.line}>{c.baseUrl}</Text>
            {c.label ? <Text style={s.line}>{c.label}</Text> : null}
            {tested[c.id] ? <Text style={s.result}>{tested[c.id]}</Text> : null}
            <Btn
              label={t('prov.test')}
              kind="ghost"
              onPress={() => void test(c)}
              style={{ marginTop: 8 }}
            />
          </View>
        ))}
      </ScrollView>

      <Modal visible={!!draft} animationType="slide" onRequestClose={() => setDraft(null)}>
        <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
          <Header
            title={draft?.id ? t('prov.edit') : t('conn.add')}
            right={<Btn label={t('agents.cancel')} kind="ghost" onPress={() => setDraft(null)} />}
          />
          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            {!draft?.id ? (
              <>
                <SectionTitle>{t('conn.preset')}</SectionTitle>
                {CONNECTOR_PRESETS.map((p) => (
                  <TouchableOpacity
                    key={p.name}
                    style={s.preset}
                    onPress={() =>
                      setDraft({
                        ...EMPTY,
                        name: p.name,
                        label: p.label,
                        baseUrl: p.baseUrl,
                        auth: p.auth,
                        credential: p.credential,
                        fieldName: p.fieldName ?? '',
                        note: p.note,
                      })
                    }
                  >
                    <Text style={s.presetName}>{p.label}</Text>
                    <Text style={s.presetNote}>{p.baseUrl || '—'}</Text>
                  </TouchableOpacity>
                ))}
              </>
            ) : null}

            <SectionTitle>{t('conn.name')}</SectionTitle>
            <TextInput
              style={s.input}
              value={draft?.name ?? ''}
              onChangeText={(v) => setDraft((d) => (d ? { ...d, name: v } : d))}
              placeholder="github"
              placeholderTextColor="#9a9a9e"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <SectionTitle>{t('prov.baseUrl')}</SectionTitle>
            <TextInput
              style={s.input}
              value={draft?.baseUrl ?? ''}
              onChangeText={(v) => setDraft((d) => (d ? { ...d, baseUrl: v } : d))}
              placeholder="https://api.github.com"
              placeholderTextColor="#9a9a9e"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <SectionTitle>{t('conn.auth')}</SectionTitle>
            <View style={s.chips}>
              {(['none', 'bearer', 'header', 'query'] as ConnectorAuth[]).map((a) => (
                <TouchableOpacity
                  key={a}
                  style={[s.chip, draft?.auth === a && s.chipOn]}
                  onPress={() => setDraft((d) => (d ? { ...d, auth: a } : d))}
                >
                  <Text style={[s.chipTxt, draft?.auth === a && s.chipTxtOn]}>
                    {t(`conn.auth.${a}` as 'conn.auth.none')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {draft?.auth !== 'none' ? (
              <>
                <SectionTitle>{t('conn.credential')}</SectionTitle>
                <TextInput
                  style={s.input}
                  value={draft?.credential ?? ''}
                  onChangeText={(v) => setDraft((d) => (d ? { ...d, credential: v } : d))}
                  placeholder={credentials[0]?.name ?? 'github_token'}
                  placeholderTextColor="#9a9a9e"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={s.hint2}>
                  {t('conn.credHint')}
                  {credentials.length ? `（${credentials.map((c) => c.name).join('、')}）` : ''}
                </Text>
                {draft?.auth === 'header' || draft?.auth === 'query' ? (
                  <>
                    <SectionTitle>{t('conn.field')}</SectionTitle>
                    <TextInput
                      style={s.input}
                      value={draft?.fieldName ?? ''}
                      onChangeText={(v) => setDraft((d) => (d ? { ...d, fieldName: v } : d))}
                      placeholder={draft?.auth === 'query' ? 'api_key' : 'X-API-Key'}
                      placeholderTextColor="#9a9a9e"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </>
                ) : null}
              </>
            ) : null}
            <SectionTitle>{t('conn.note')}</SectionTitle>
            <TextInput
              style={[s.input, { height: 90, textAlignVertical: 'top' }]}
              value={draft?.note ?? ''}
              onChangeText={(v) => setDraft((d) => (d ? { ...d, note: v } : d))}
              multiline
              placeholder={t('conn.notePlaceholder')}
              placeholderTextColor="#9a9a9e"
            />
            <Btn label={t('agents.save')} onPress={() => void save()} style={{ marginTop: 16 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f7' },
  hint: { fontSize: 12, color: '#888', lineHeight: 18, marginBottom: 8 },
  warn: { fontSize: 12, color: '#8a6d1f', lineHeight: 18, marginBottom: 10 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  name: { fontSize: 16, fontWeight: '700', color: '#111' },
  tag: { fontSize: 10, color: '#0a84ff', backgroundColor: '#e6f0ff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  line: { fontSize: 12, color: '#666', lineHeight: 18 },
  result: { fontSize: 12, color: '#0a84ff', marginTop: 6 },
  action: { fontSize: 13, color: '#0a84ff', fontWeight: '600', marginRight: 10 },
  preset: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 },
  presetName: { fontSize: 14, fontWeight: '600', color: '#111' },
  presetNote: { fontSize: 11, color: '#999', marginTop: 2 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#f0f0f3' },
  chipOn: { backgroundColor: '#0a84ff' },
  chipTxt: { fontSize: 12, color: '#333' },
  chipTxtOn: { color: '#fff', fontWeight: '600' },
  hint2: { fontSize: 11, color: '#aaa', marginTop: 6, lineHeight: 16 },
});
