import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../app-state';
import { CollapsibleGroups, useGroups } from '../../groupList';
import { Btn, Dot, Header, Row, SectionTitle } from '../../ui';

export default function AgentsTab() {
  const { t, agents, activeAgentId, saveAgent, presenceOf, agentHasKey, cfg, roomList, openRoom } =
    useApp();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', group: '', description: '', persona: '' });

  const ungrouped = t('agents.ungrouped');
  const groups = useGroups(agents, ungrouped);
  const active = agents.find((a) => a.id === activeAgentId);

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <Header
        title={t('agents.title')}
        subtitle={`${agents.length} 位 · 当前：${active?.name ?? '—'}`}
        right={<Btn label={t('agents.new')} onPress={() => setCreating(true)} />}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* 折叠分组：助手多了也不会滑很久；默认只展开当前助手所在的那组 */}
        <CollapsibleGroups
          groups={groups}
          toggleLabels={{ expand: t('agents.expandAll'), collapse: t('agents.collapseAll') }}
          defaultOpen={(_g, items) =>
            items.some((a) => a.id === activeAgentId) || groups.length <= 2
          }
          renderItem={(a) => (
            <Row
              left={<Dot state={presenceOf(a.id)} />}
              title={`${a.name}${a.id === activeAgentId ? ` · ${t('agents.active')}` : ''}`}
              desc={`${a.model?.trim() || cfg.model} · ${
                agentHasKey[a.id] ? t('agents.ownKey') : t('agents.globalKey')
              }${a.description ? ` · ${a.description}` : ''}`}
              right={
                <Text style={{ fontSize: 11, color: '#8e8e93' }}>
                  {t(`presence.${presenceOf(a.id)}` as 'presence.online')}
                </Text>
              }
              onPress={() => router.push(`/agent/${a.id}`)}
            />
          )}
        />

        <SectionTitle>{t('room.grouplist')}</SectionTitle>
        {roomList.length === 0 ? (
          <Text style={s.hint}>{t('room.none')}</Text>
        ) : (
          roomList.map((r) => (
            <Row
              key={r.id}
              title={r.name}
              desc={`${t('room.leaderTag')} ${
                agents.find((a) => a.id === r.leaderId)?.name ?? r.leaderId
              } · ${t('room.memberCount', { n: r.memberIds.length + 1 })}`}
              onPress={async () => {
                await openRoom(r.id);
                router.push('/chat');
              }}
            />
          ))
        )}

        <Text style={s.hint}>{t('presence.note')}</Text>
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
        placeholderTextColor="#9a9a9e"
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
    color: '#111',
  },
  hint: { fontSize: 12, color: '#999', marginTop: 12, lineHeight: 18 },
  hint2: { fontSize: 11, color: '#aaa', marginTop: 4 },
});
