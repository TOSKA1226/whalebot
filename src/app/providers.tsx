/** 模型供应商：接第三方模型（OpenAI 兼容接口）都在这里；分组绑上去就整组共用一把 Key */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
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
import { listModels } from '../api';
import { useApp } from '../app-state';
import { PRESETS, providerSecret, type Provider } from '../providers';
import { getSecret } from '../secrets';
import { Btn, Header, SectionTitle } from '../ui';

export default function ProvidersScreen() {
  const { t, providers, providerKeys, saveProvider, deleteProvider, agents } = useApp();
  const [editing, setEditing] = useState<Provider | null>(null);
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState('');
  const [result, setResult] = useState<Record<string, string>>({});

  const usedBy = (id: string) =>
    agents.filter((a) => (a.providerId ?? '') === id).length;

  const test = async (p: Provider) => {
    setTesting(p.id);
    try {
      // 用真正会用到的那把 Key 测：供应商自己的 → 全局的
      const own = await getSecret(providerSecret(p.id));
      const models = await listModels(p.baseUrl, own || (await getSecret('whalebot.apikey')));
      setResult((r) => ({ ...r, [p.id]: t('prov.ok', { n: models.length }) }));
    } catch (e: any) {
      setResult((r) => ({ ...r, [p.id]: t('prov.fail', { e: String(e?.message ?? e).slice(0, 120) }) }));
    } finally {
      setTesting('');
    }
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <Header
        title={t('prov.title')}
        subtitle={`${providers.length}`}
        right={<Btn label={t('prov.add')} onPress={() => setCreating(true)} />}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={s.hint}>{t('prov.hint')}</Text>
        {providers.map((p) => {
          const n = usedBy(p.id);
          const has = !!providerKeys[p.id];
          return (
            <View key={p.id} style={s.card}>
              <View style={s.cardHead}>
                <Ionicons name="cloud-outline" size={17} color="#0a84ff" />
                <Text style={s.name}>{p.name}</Text>
                {p.id === 'deepseek' ? <Text style={s.badge}>{t('prov.builtin')}</Text> : null}
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={() => setEditing(p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={s.action}>{t('prov.edit')}</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.line}>{p.baseUrl || '—'}</Text>
              <Text style={s.line}>
                {p.model || '—'} · {has ? t('prov.keySet') : t('prov.keyNone')}
                {n ? ` · ${t('groups.count', { n })}` : ''}
              </Text>
              {result[p.id] ? <Text style={s.result}>{result[p.id]}</Text> : null}
              <View style={s.rowBtns}>
                <Btn
                  label={testing === p.id ? t('prov.testing') : t('prov.test')}
                  kind="ghost"
                  onPress={() => void test(p)}
                  style={{ flex: 1 }}
                />
                {p.id !== 'deepseek' ? (
                  <Btn
                    label={t('prov.delete')}
                    kind="danger"
                    onPress={() =>
                      Alert.alert(t('prov.delete'), t('prov.deleteConfirm'), [
                        { text: t('agents.cancel'), style: 'cancel' },
                        {
                          text: t('mem.delete'),
                          style: 'destructive',
                          onPress: () => void deleteProvider(p.id),
                        },
                      ])
                    }
                    style={{ flex: 1 }}
                  />
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <ProviderEditor
        key={editing?.id ?? (creating ? 'new' : 'closed')}
        visible={creating || !!editing}
        editing={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSave={async (input) => {
          await saveProvider(input);
          setCreating(false);
          setEditing(null);
        }}
      />
    </SafeAreaView>
  );
}

function ProviderEditor({
  visible,
  editing,
  onClose,
  onSave,
}: {
  visible: boolean;
  editing: Provider | null;
  onClose: () => void;
  onSave: (input: {
    id?: string;
    name: string;
    baseUrl: string;
    model: string;
    note?: string;
    apiKey?: string;
    vision?: boolean;
  }) => Promise<void>;
}) {
  const { t } = useApp();
  // 调用处用 key 控制重挂载，所以这里可以直接从 props 初始化
  const [name, setName] = useState(editing?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(editing?.baseUrl ?? '');
  const [model, setModel] = useState(editing?.model ?? '');
  const [apiKey, setApiKey] = useState('');
  const [vision, setVision] = useState(editing?.vision === true);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
        <Header
          title={editing ? t('prov.edit') : t('prov.new')}
          right={<Btn label={t('agents.cancel')} kind="ghost" onPress={onClose} />}
        />
        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          {!editing ? (
            <>
              <SectionTitle>{t('prov.preset')}</SectionTitle>
              {PRESETS.map((p) => (
                <TouchableOpacity
                  key={p.name}
                  style={s.preset}
                  onPress={() => {
                    setName(p.name);
                    setBaseUrl(p.baseUrl);
                    setModel(p.model);
                  }}
                >
                  <Text style={s.presetName}>{p.name}</Text>
                  <Text style={s.presetNote}>{p.baseUrl || '—'}</Text>
                </TouchableOpacity>
              ))}
            </>
          ) : null}

          <SectionTitle>{t('prov.name')}</SectionTitle>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="DeepSeek 官方" placeholderTextColor="#9a9a9e" />
          <SectionTitle>{t('prov.baseUrl')}</SectionTitle>
          <TextInput
            style={s.input}
            value={baseUrl}
            onChangeText={setBaseUrl}
            placeholder="https://api.deepseek.com"
            placeholderTextColor="#9a9a9e"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <SectionTitle>{t('prov.model')}</SectionTitle>
          <TextInput
            style={s.input}
            value={model}
            onChangeText={setModel}
            placeholder="deepseek-chat"
            placeholderTextColor="#9a9a9e"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <SectionTitle>{t('prov.key')}</SectionTitle>
          <TextInput
            style={s.input}
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="sk-…"
            placeholderTextColor="#9a9a9e"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={s.hint2}>{t('prov.keyHint')}</Text>

          <SectionTitle>{t('field.vision')}</SectionTitle>
          <View style={s.rowBtns}>
            {[true, false].map((v) => (
              <Btn
                key={String(v)}
                label={v ? t('review.on') : t('review.off')}
                kind={vision === v ? 'primary' : 'ghost'}
                style={{ flex: 1 }}
                onPress={() => setVision(v)}
              />
            ))}
          </View>
          <Text style={s.hint2}>{t('field.visionHint')}</Text>

          <Btn
            label={t('agents.save')}
            onPress={() =>
              void onSave({
                id: editing?.id,
                name,
                baseUrl,
                model,
                apiKey,
                vision,
              })
            }
            style={{ marginTop: 14 }}
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f7' },
  hint: { fontSize: 12, color: '#888', lineHeight: 18, marginBottom: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  name: { fontSize: 16, fontWeight: '700', color: '#111' },
  badge: {
    fontSize: 10,
    color: '#0a84ff',
    backgroundColor: '#e6f0ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  line: { fontSize: 12, color: '#666', lineHeight: 18 },
  result: { fontSize: 12, color: '#0a84ff', marginTop: 6 },
  rowBtns: { flexDirection: 'row', gap: 8, marginTop: 10 },
  action: { fontSize: 13, color: '#0a84ff', fontWeight: '600' },
  preset: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
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
  hint2: { fontSize: 11, color: '#aaa', marginTop: 8, lineHeight: 16 },
});
