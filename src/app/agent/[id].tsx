import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../app-state';
import { nextDue, parseSchedule } from '../../scheduler';
import { getSecret, setSecret } from '../../secrets';
import * as store from '../../store';
import { Btn, Row, SectionTitle } from '../../ui';

export default function AgentProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, activeAgentId, saveAgent, deleteAgent, switchAgent, reloadData, refreshAgentKeys } =
    useApp();

  const [agent, setAgent] = useState<store.Agent | undefined>();
  const [draft, setDraft] = useState({
    name: '',
    group: '',
    description: '',
    persona: '',
    model: '',
    baseUrl: '',
  });
  const [limitMode, setLimitMode] = useState<'global' | 'custom' | 'unlimited'>('global');
  const [limitValue, setLimitValue] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [hasOwnKey, setHasOwnKey] = useState(false);
  const [data, setData] = useState<{
    memories: store.Memory[];
    skills: store.Skill[];
    routines: store.Routine[];
  }>({ memories: [], skills: [], routines: [] });

  const load = useCallback(async () => {
    const a = await store.getAgent(id);
    setAgent(a);
    if (a) {
      setDraft({
        name: a.name,
        group: a.group,
        description: a.description,
        persona: a.persona,
        model: a.model ?? '',
        baseUrl: a.baseUrl ?? '',
      });
      setLimitMode(a.tokenLimitMode ?? 'global');
      setLimitValue(a.tokenLimit ? String(a.tokenLimit) : '');
    }
    try {
      setHasOwnKey(!!(await getSecret(`apikey.${id}`)));
    } catch {
      setHasOwnKey(false);
    }
    const [memories, skills, routines] = await Promise.all([
      store.listMemories(id),
      store.listSkills(id),
      store.listRoutines(id),
    ]);
    setData({ memories, skills, routines });
  }, [id]);

  useEffect(() => {
    // 异步加载数据（setState 发生在 await 之后，不会造成级联渲染）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const isActive = !!agent && agent.id === activeAgentId;

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <Text style={s.iconTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={s.title}>{agent?.name ?? t('profile.title')}</Text>
        <View style={{ flex: 1 }} />
        {isActive ? <Text style={s.badge}>{t('agents.active')}</Text> : null}
      </View>

      <ScrollView contentContainerStyle={s.body}>
        <SectionTitle>{t('agents.name')}</SectionTitle>
        <TextInput
          style={s.input}
          value={draft.name}
          onChangeText={(v) => setDraft({ ...draft, name: v })}
        />
        <SectionTitle>{t('agents.group')}</SectionTitle>
        <TextInput
          style={s.input}
          value={draft.group}
          onChangeText={(v) => setDraft({ ...draft, group: v })}
        />
        <SectionTitle>{t('agents.desc')}</SectionTitle>
        <TextInput
          style={s.input}
          value={draft.description}
          onChangeText={(v) => setDraft({ ...draft, description: v })}
        />
        <SectionTitle>{t('agents.persona')}</SectionTitle>
        <TextInput
          style={[s.input, s.multi]}
          value={draft.persona}
          onChangeText={(v) => setDraft({ ...draft, persona: v })}
          multiline
          placeholder={t('agents.personaHint')}
        />

        <SectionTitle>{t('agent.model')}</SectionTitle>
        <TextInput
          style={s.input}
          value={draft.model}
          onChangeText={(v) => setDraft({ ...draft, model: v })}
          placeholder="deepseek-chat / deepseek-reasoner"
          placeholderTextColor="#9a9a9e"
          autoCapitalize="none"
        />
        <SectionTitle>{t('agent.baseUrl')}</SectionTitle>
        <TextInput
          style={s.input}
          value={draft.baseUrl}
          onChangeText={(v) => setDraft({ ...draft, baseUrl: v })}
          placeholder="https://api.deepseek.com"
          placeholderTextColor="#9a9a9e"
          autoCapitalize="none"
        />

        <SectionTitle>{t('budget.ownLimit')}</SectionTitle>
        <View style={s.chipRow}>
          {(['global', 'custom', 'unlimited'] as const).map((m) => (
            <TouchableOpacity
              key={m}
              style={[s.chip, limitMode === m && s.chipOn]}
              onPress={() => setLimitMode(m)}
            >
              <Text style={[s.chipTxt, limitMode === m && s.chipTxtOn]}>
                {m === 'global'
                  ? t('budget.followGlobal')
                  : m === 'custom'
                    ? t('budget.on')
                    : t('budget.off')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {limitMode === 'custom' ? (
          <TextInput
            style={[s.input, { marginTop: 8 }]}
            value={limitValue}
            onChangeText={(v) => setLimitValue(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            placeholder="200000"
            placeholderTextColor="#9a9a9e"
          />
        ) : null}
        <Text style={s.hint2}>{t('budget.limitHint')}</Text>

        <SectionTitle>
          {t('agent.apiKey')}
          {hasOwnKey ? `　${t('agent.keySet')}` : ''}
        </SectionTitle>
        <TextInput
          style={s.input}
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="sk-…"
          placeholderTextColor="#9a9a9e"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <Text style={s.hint2}>{t('agent.keyHint')}</Text>
        {hasOwnKey ? (
          <Btn
            label={t('agent.keyClear')}
            kind="ghost"
            onPress={async () => {
              await setSecret(`apikey.${id}`, '');
              setHasOwnKey(false);
              setApiKey('');
              await refreshAgentKeys();
            }}
            style={{ marginTop: 8 }}
          />
        ) : null}

        <Btn
          label={t('agents.save')}
          onPress={async () => {
            if (!agent) return;
            await saveAgent({
              id: agent.id,
              ...draft,
              tokenLimitMode: limitMode,
              tokenLimit: limitMode === 'custom' ? Number(limitValue) || 0 : undefined,
            });
            if (apiKey.trim()) {
              await setSecret(`apikey.${agent.id}`, apiKey.trim());
              setApiKey('');
            }
            await refreshAgentKeys();
            await load();
            await reloadData();
          }}
          style={{ marginTop: 12 }}
        />
        {!isActive ? (
          <Btn
            label={t('agents.setActive')}
            kind="ghost"
            onPress={async () => {
              if (agent) await switchAgent(agent.id);
            }}
            style={{ marginTop: 10 }}
          />
        ) : null}
        {agent && agent.id !== store.DEFAULT_AGENT_ID ? (
          <Btn
            label={t('agents.delete')}
            kind="danger"
            onPress={() =>
              Alert.alert(t('agents.delete'), t('agents.delete.confirm'), [
                { text: t('agents.cancel'), style: 'cancel' },
                {
                  text: t('mem.delete'),
                  style: 'destructive',
                  onPress: async () => {
                    await deleteAgent(agent.id);
                    router.back();
                  },
                },
              ])
            }
            style={{ marginTop: 10 }}
          />
        ) : null}

        <Row
          title={t('data.title')}
          desc={`${t('mem.memories')} ${data.memories.length} · ${t('mem.skills')} ${data.skills.length} · ${t('mem.routines')} ${data.routines.length}`}
          onPress={() => router.push('/data')}
        />

        <SectionTitle>
          {t('profile.memory')}（{data.memories.length}）
        </SectionTitle>
        {data.memories.length === 0 ? (
          <Text style={s.empty}>{t('mem.empty')}</Text>
        ) : (
          data.memories.map((m) => (
            <Row
              key={m.id}
              title={m.content}
              desc={m.provenance}
              right={
                <TouchableOpacity
                  onPress={async () => {
                    await store.removeMemory(m.id);
                    await load();
                    await reloadData();
                  }}
                >
                  <Text style={s.danger}>{t('mem.delete')}</Text>
                </TouchableOpacity>
              }
            />
          ))
        )}

        <SectionTitle>
          {t('profile.skills')}（{data.skills.length}）
        </SectionTitle>
        {data.skills.length === 0 ? (
          <Text style={s.empty}>{t('mem.empty')}</Text>
        ) : (
          data.skills.map((sk) => (
            <Row
              key={sk.id}
              title={`${sk.name} · ${sk.enabled ? t('mem.enabledTag') : t('mem.paused')}`}
              desc={sk.description || sk.content.slice(0, 80)}
              right={
                <TouchableOpacity
                  onPress={async () => {
                    await store.setSkillEnabled(sk.id, !sk.enabled);
                    await load();
                    await reloadData();
                  }}
                >
                  <Text style={s.action}>{sk.enabled ? t('mem.disable') : t('mem.enable')}</Text>
                </TouchableOpacity>
              }
            />
          ))
        )}

        <SectionTitle>
          {t('profile.routines')}（{data.routines.length}）
        </SectionTitle>
        {data.routines.length === 0 ? (
          <Text style={s.empty}>{t('mem.empty')}</Text>
        ) : (
          data.routines.map((r) => {
            const parsed = parseSchedule(r.schedule);
            const base =
              r.once && parsed && parsed.kind === 'once'
                ? `${t('mem.once')} · ${new Date(r.createdAt + parsed.ms).toLocaleString()}`
                : r.schedule || '—';
            const warn = parsed ? '' : ` · ${t('mem.unparsable')}`;
            const due = r.enabled ? nextDue(r) : null;
            return (
              <Row
                key={r.id}
                title={`${r.name} · ${r.enabled ? t('mem.enabledTag') : t('mem.paused')}`}
                desc={`${base}${warn}${
                  due ? ` · ${t('sched.next', { t: new Date(due).toLocaleString() })}` : ''
                }`}
                right={
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity
                      onPress={async () => {
                        await store.setRoutineEnabled(r.id, !r.enabled);
                        await load();
                        await reloadData();
                      }}
                    >
                      <Text style={s.action}>{r.enabled ? t('mem.disable') : t('mem.enable')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={async () => {
                        await store.removeRoutine(r.id);
                        await load();
                        await reloadData();
                      }}
                    >
                      <Text style={s.danger}>{t('mem.delete')}</Text>
                    </TouchableOpacity>
                  </View>
                }
              />
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f7' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 8,
  },
  title: { fontSize: 18, fontWeight: '700' },
  badge: {
    fontSize: 11,
    color: '#0a84ff',
    backgroundColor: '#e6f0ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  iconBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#e8e8ec',
    borderRadius: 8,
  },
  iconTxt: { fontSize: 14 },
  body: { padding: 16, paddingBottom: 40 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  hint2: { fontSize: 11, color: '#aaa', marginTop: 6, lineHeight: 16 },
  multi: { height: 150, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  chipOn: { backgroundColor: '#0a84ff' },
  chipTxt: { fontSize: 13, color: '#111', fontWeight: '600' },
  chipTxtOn: { color: '#fff' },
  empty: { fontSize: 13, color: '#999', marginBottom: 8 },
  action: { fontSize: 13, color: '#0a84ff', fontWeight: '600' },
  danger: { fontSize: 13, color: '#ff3b30', fontWeight: '600' },
});
