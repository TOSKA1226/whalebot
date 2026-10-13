import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../app-state';
import { Btn, Header, Row, SectionTitle } from '../../ui';

export default function AgentsTab() {
  const { t, agents, activeAgentId, saveAgent } = useApp();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', group: '', description: '', persona: '' });

  const groups = Array.from(new Set(agents.map((a) => a.group || '未分组')));

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <Header
        title={t('agents.title')}
        subtitle={`${agents.length} 位 · 当前：${agents.find((a) => a.id === activeAgentId)?.name ?? '—'}`}
        right={<Btn label={t('agents.new')} onPress={() => setCreating(true)} />}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {groups.map((g) => (
          <View key={g}>
            <SectionTitle>{g}</SectionTitle>
            {agents
              .filter((a) => (a.group || '未分组') === g)
              .map((a) => (
                <Row
                  key={a.id}
                  title={`${a.name}${a.id === activeAgentId ? ` · ${t('agents.active')}` : ''}`}
                  desc={a.description || a.persona.slice(0, 60) || '—'}
                  onPress={() => router.push(`/agent/${a.id}`)}
                />
              ))}
          </View>
        ))}
        <Text style={s.hint}>{t('agents.hint')}</Text>
      </ScrollView>

      <Modal visible={creating} animationType="slide" onRequestClose={() => setCreating(false)}>
        <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
          <Header title={t('agents.new')} />
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Field
              label={t('agents.name')}
              value={draft.name}
              onChange={(v) => setDraft({ ...draft, name: v })}
            />
            <Field
              label={t('agents.group')}
              value={draft.group}
              onChange={(v) => setDraft({ ...draft, group: v })}
            />
            <Field
              label={t('agents.desc')}
              value={draft.description}
              onChange={(v) => setDraft({ ...draft, description: v })}
            />
            <Field
              label={t('agents.persona')}
              value={draft.persona}
              onChange={(v) => setDraft({ ...draft, persona: v })}
              multiline
              hint={t('agents.personaHint')}
            />
            <Btn
              label={t('agents.create')}
              onPress={async () => {
                if (!draft.name.trim()) return;
                await saveAgent(draft);
                setDraft({ name: '', group: '', description: '', persona: '' });
                setCreating(false);
              }}
              style={{ marginTop: 12 }}
            />
            <Btn
              label={t('agents.cancel')}
              kind="ghost"
              onPress={() => setCreating(false)}
              style={{ marginTop: 10 }}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

export function Field({
  label,
  value,
  onChange,
  hint,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  multiline?: boolean;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={[s.input, multiline && { height: 120, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        placeholder={hint}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {hint && !multiline ? <Text style={s.hint2}>{hint}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f7' },
  label: { fontSize: 12, color: '#555', marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  hint: { fontSize: 12, color: '#999', marginTop: 12, lineHeight: 18 },
  hint2: { fontSize: 11, color: '#aaa', marginTop: 4 },
});
