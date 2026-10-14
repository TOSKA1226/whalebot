/** 凭据库：集中保管密码/token，助手只能按名字取用，且每次要你批准 */
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
import { Btn, Header, Row, SectionTitle } from '../ui';

export default function VaultScreen() {
  const { t, credentials, reloadCredentials, saveCredential, deleteCredential } = useApp();
  const [editing, setEditing] = useState<{ id?: string } | null>(null);
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');

  useEffect(() => {
    void reloadCredentials();
  }, [reloadCredentials]);

  const submit = async () => {
    if (!name.trim()) return;
    await saveCredential({ id: editing?.id, name, label, value: value || undefined });
    setEditing(null);
    setName('');
    setLabel('');
    setValue('');
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <Header
        title={t('vault.title')}
        subtitle={`${credentials.length}`}
        right={<Btn label={t('vault.add')} onPress={() => setEditing({})} />}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={s.hint}>{t('vault.hint')}</Text>
        {credentials.length === 0 ? <Text style={s.empty}>{t('vault.empty')}</Text> : null}

        {credentials.map((c) => (
          <Row
            key={c.id}
            left={<Ionicons name="key-outline" size={17} color="#0a84ff" />}
            title={c.name}
            desc={`${c.label ? `${c.label} · ` : ''}${
              c.lastUsedAt
                ? t('vault.used', { n: c.usedCount ?? 0, t: new Date(c.lastUsedAt).toLocaleString() })
                : t('vault.never')
            }`}
            right={
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  onPress={() => {
                    setEditing({ id: c.id });
                    setName(c.name);
                    setLabel(c.label ?? '');
                    setValue('');
                  }}
                >
                  <Text style={s.action}>{t('prov.edit')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert(t('vault.delete'), t('vault.deleteConfirm'), [
                      { text: t('agents.cancel'), style: 'cancel' },
                      {
                        text: t('mem.delete'),
                        style: 'destructive',
                        onPress: () => void deleteCredential(c.id),
                      },
                    ])
                  }
                >
                  <Ionicons name="trash-outline" size={16} color="#ff3b30" />
                </TouchableOpacity>
              </View>
            }
          />
        ))}
      </ScrollView>

      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
          <Header
            title={editing?.id ? t('prov.edit') : t('vault.add')}
            right={<Btn label={t('agents.cancel')} kind="ghost" onPress={() => setEditing(null)} />}
          />
          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <SectionTitle>{t('vault.name')}</SectionTitle>
            <TextInput
              style={s.input}
              value={name}
              onChangeText={setName}
              placeholder="github_token"
              placeholderTextColor="#9a9a9e"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <SectionTitle>{t('vault.label')}</SectionTitle>
            <TextInput
              style={s.input}
              value={label}
              onChangeText={setLabel}
              placeholder="GitHub 只读 token"
              placeholderTextColor="#9a9a9e"
            />
            <SectionTitle>{t('vault.value')}</SectionTitle>
            <TextInput
              style={s.input}
              value={value}
              onChangeText={setValue}
              placeholder="ghp_…"
              placeholderTextColor="#9a9a9e"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Btn label={t('agents.save')} onPress={() => void submit()} style={{ marginTop: 16 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f7' },
  hint: { fontSize: 12, color: '#888', lineHeight: 18, marginBottom: 12 },
  empty: { fontSize: 13, color: '#999', paddingVertical: 6 },
  action: { fontSize: 13, color: '#0a84ff', fontWeight: '600' },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
  },
});
