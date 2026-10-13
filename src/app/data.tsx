import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../app-state';
import { nextDue, parseSchedule } from '../scheduler';
import * as store from '../store';
import { Btn, SectionTitle } from '../ui';

type Kind = 'memory' | 'skill' | 'routine';

type Draft = {
  kind: Kind;
  id: string | null;
  name: string;
  description: string;
  content: string;
  schedule: string;
  once: boolean;
  enabled: boolean;
  /** 时间设定的解析预览（在事件回调里算好，渲染时不再读时钟） */
  preview?: string;
};

const emptyDraft = (kind: Kind): Draft => ({
  kind,
  id: null,
  name: '',
  description: '',
  content: '',
  schedule: '',
  once: false,
  enabled: true,
});

export default function DataScreen() {
  const { t, cfg, data, reloadData, activeAgentId } = useApp();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const agentId = cfg.activeAgentId || activeAgentId;
  const tRefParseFail = () => t('mem.unparsable');

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      if (draft.kind === 'memory') {
        if (!draft.content.trim()) return;
        if (draft.id) {
          // 记忆没有 upsert：先删后加，保持简单
          await store.removeMemory(draft.id);
        }
        await store.addMemory(draft.content.trim(), 'user', agentId);
      } else if (draft.kind === 'skill') {
        if (!draft.name.trim()) return;
        await store.upsertSkill({
          id: draft.id ?? undefined,
          agentId,
          name: draft.name.trim(),
          description: draft.description.trim(),
          content: draft.content,
          enabled: draft.enabled,
          provenance: 'user',
        });
      } else {
        if (!draft.name.trim()) return;
        await store.upsertRoutine({
          id: draft.id ?? undefined,
          agentId,
          name: draft.name.trim(),
          description: draft.description.trim(),
          schedule: draft.schedule.trim(),
          once: draft.once,
          enabled: draft.enabled,
          provenance: 'user',
        });
      }
      await reloadData();
      setDraft(null);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (kind: Kind, id: string) => {
    if (kind === 'memory') await store.removeMemory(id);
    if (kind === 'skill') await store.removeSkill(id);
    if (kind === 'routine') await store.removeRoutine(id);
    await reloadData();
  };

  const toggle = async (kind: Kind, id: string, enabled: boolean) => {
    if (kind === 'skill') {
      const s = data.skills.find((x) => x.id === id);
      if (s) await store.upsertSkill({ id, agentId, name: s.name, enabled });
    } else if (kind === 'routine') {
      const r = data.routines.find((x) => x.id === id);
      if (r) await store.upsertRoutine({ id, agentId, name: r.name, enabled });
    }
    await reloadData();
  };

  /** 解析预览：只在用户改时间设定时算一次 */
  const previewOf = (schedule: string): string => {
    const parsed = parseSchedule(schedule);
    if (!parsed) return tRefParseFail();
    const due = nextDue({ schedule } as any);
    const what =
      parsed.kind === 'once'
        ? new Date(Date.now() + (parsed.ms ?? 0)).toLocaleString()
        : parsed.kind;
    const dueText = due ? ` · ${t('sched.next', { t: new Date(due).toLocaleString() })}` : '';
    return `${t('data.parsed')} ${what}${dueText}`;
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name="chevron-back" size={18} color="#111" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{t('data.title')}</Text>
          <Text style={s.sub}>{t('data.sub')}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* -------- 记忆 -------- */}
        <View style={s.sectionHead}>
          <SectionTitle>{t('mem.memories')}</SectionTitle>
          <TouchableOpacity onPress={() => setDraft(emptyDraft('memory'))}>
            <Text style={s.add}>{t('data.add')}</Text>
          </TouchableOpacity>
        </View>
        {data.memories.length === 0 ? <Text style={s.empty}>{t('mem.empty')}</Text> : null}
        {data.memories.map((m) => (
          <View key={m.id} style={s.card}>
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() =>
                setDraft({
                  ...emptyDraft('memory'),
                  id: m.id,
                  content: m.content,
                })
              }
            >
              <Text style={s.body}>{m.content}</Text>
              <Text style={s.meta}>
                {m.provenance === 'user' ? t('data.fromUser') : t('data.fromAgent')} ·{' '}
                {new Date(m.createdAt).toLocaleDateString()}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.op} onPress={() => remove('memory', m.id)}>
              <Ionicons name="trash-outline" size={16} color="#ff3b30" />
            </TouchableOpacity>
          </View>
        ))}

        {/* -------- 技能 -------- */}
        <View style={s.sectionHead}>
          <SectionTitle>{t('mem.skills')}</SectionTitle>
          <TouchableOpacity onPress={() => setDraft(emptyDraft('skill'))}>
            <Text style={s.add}>{t('data.add')}</Text>
          </TouchableOpacity>
        </View>
        {data.skills.length === 0 ? <Text style={s.empty}>{t('mem.empty')}</Text> : null}
        {data.skills.map((k) => (
          <View key={k.id} style={s.card}>
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() =>
                setDraft({
                  ...emptyDraft('skill'),
                  id: k.id,
                  name: k.name,
                  description: k.description,
                  content: k.content,
                  enabled: k.enabled,
                })
              }
            >
              <Text style={s.name}>{k.name}</Text>
              {k.description ? (
                <Text style={s.meta} numberOfLines={2}>
                  {k.description}
                </Text>
              ) : null}
            </TouchableOpacity>
            <Switch value={k.enabled} onValueChange={(v) => toggle('skill', k.id, v)} />
            <TouchableOpacity style={s.op} onPress={() => remove('skill', k.id)}>
              <Ionicons name="trash-outline" size={16} color="#ff3b30" />
            </TouchableOpacity>
          </View>
        ))}

        {/* -------- 例程 -------- */}
        <View style={s.sectionHead}>
          <SectionTitle>{t('mem.routines')}</SectionTitle>
          <TouchableOpacity onPress={() => setDraft(emptyDraft('routine'))}>
            <Text style={s.add}>{t('data.add')}</Text>
          </TouchableOpacity>
        </View>
        {data.routines.length === 0 ? <Text style={s.empty}>{t('mem.empty')}</Text> : null}
        {data.routines.map((r) => {
          const d = r.enabled ? nextDue(r) : null;
          return (
            <View key={r.id} style={s.card}>
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={() =>
                  setDraft({
                    ...emptyDraft('routine'),
                    id: r.id,
                    name: r.name,
                    description: r.description,
                    schedule: r.schedule,
                    once: !!r.once,
                    enabled: r.enabled,
                  })
                }
              >
                <Text style={s.name}>{r.name}</Text>
                <Text style={s.meta}>
                  {r.schedule || '—'}
                  {r.once ? ` · ${t('mem.once')}` : ''}
                  {d ? ` · ${t('sched.next', { t: new Date(d).toLocaleString() })}` : ''}
                </Text>
              </TouchableOpacity>
              <Switch value={r.enabled} onValueChange={(v) => toggle('routine', r.id, v)} />
              <TouchableOpacity style={s.op} onPress={() => remove('routine', r.id)}>
                <Ionicons name="trash-outline" size={16} color="#ff3b30" />
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={!!draft} animationType="slide" transparent onRequestClose={() => setDraft(null)}>
        <View style={s.mask}>
          <ScrollView style={s.sheet} contentContainerStyle={{ paddingBottom: 8 }}>
            <Text style={s.sheetTitle}>
              {draft?.id ? t('data.edit') : t('data.add')} ·{' '}
              {draft?.kind === 'memory'
                ? t('mem.memories')
                : draft?.kind === 'skill'
                  ? t('mem.skills')
                  : t('mem.routines')}
            </Text>

            {draft?.kind === 'memory' ? (
              <>
                <Text style={s.label}>{t('data.content')}</Text>
                <TextInput
                  style={[s.input, s.multi]}
                  value={draft.content}
                  onChangeText={(v) => setDraft({ ...draft, content: v })}
                  placeholder={t('data.memoryHint')}
                  placeholderTextColor="#9a9a9e"
                  multiline
                />
              </>
            ) : (
              <>
                <Text style={s.label}>{t('data.name')}</Text>
                <TextInput
                  style={s.input}
                  value={draft?.name ?? ''}
                  onChangeText={(v) => setDraft((d) => (d ? { ...d, name: v } : d))}
                  placeholderTextColor="#9a9a9e"
                />
                <Text style={s.label}>{t('data.desc')}</Text>
                <TextInput
                  style={s.input}
                  value={draft?.description ?? ''}
                  onChangeText={(v) => setDraft((d) => (d ? { ...d, description: v } : d))}
                  placeholderTextColor="#9a9a9e"
                />
                {draft?.kind === 'routine' ? (
                  <>
                    <Text style={s.label}>{t('data.schedule')}</Text>
                    <TextInput
                      style={s.input}
                      value={draft.schedule}
                      onChangeText={(v) =>
                        setDraft((d) => (d ? { ...d, schedule: v, preview: previewOf(v) } : d))
                      }
                      placeholder="每天 08:00 / 每 30 分钟 / 1小时后"
                      placeholderTextColor="#9a9a9e"
                      autoCapitalize="none"
                    />
                    <Text style={s.hint}>{draft.preview ?? ''}</Text>
                    <View style={s.rowSwitch}>
                      <Text style={s.label}>{t('mem.once')}</Text>
                      <Switch
                        value={draft.once}
                        onValueChange={(v) => setDraft({ ...draft, once: v })}
                      />
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={s.label}>{t('data.content')}</Text>
                    <TextInput
                      style={[s.input, s.multi]}
                      value={draft?.content ?? ''}
                      onChangeText={(v) => setDraft((d) => (d ? { ...d, content: v } : d))}
                      placeholder={t('data.skillHint')}
                      placeholderTextColor="#9a9a9e"
                      multiline
                    />
                  </>
                )}
                <View style={s.rowSwitch}>
                  <Text style={s.label}>{t('mem.enable')}</Text>
                  <Switch
                    value={!!draft?.enabled}
                    onValueChange={(v) => setDraft((d) => (d ? { ...d, enabled: v } : d))}
                  />
                </View>
              </>
            )}

            <Btn
              label={t('quick.save')}
              onPress={save}
              style={{ marginTop: 14 }}
            />
            <Btn
              label={t('agents.cancel')}
              kind="ghost"
              onPress={() => setDraft(null)}
              style={{ marginTop: 8 }}
            />
            {busy ? <Text style={s.hint}>…</Text> : null}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f7' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  iconBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#e8e8ec', borderRadius: 8 },
  title: { fontSize: 18, fontWeight: '700', color: '#111' },
  sub: { fontSize: 11, color: '#888', marginTop: 2 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  add: { fontSize: 13, color: '#0a84ff', fontWeight: '600', paddingHorizontal: 6 },
  empty: { fontSize: 13, color: '#999', marginBottom: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  name: { fontSize: 15, fontWeight: '600', color: '#111' },
  body: { fontSize: 14, color: '#111', lineHeight: 20 },
  meta: { fontSize: 11, color: '#888', marginTop: 4 },
  op: { padding: 4 },
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 18,
    maxHeight: '85%',
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  label: { fontSize: 12, color: '#555', marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: '#f2f2f5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
  },
  multi: { minHeight: 90, textAlignVertical: 'top' },
  hint: { fontSize: 11, color: '#999', marginTop: 6, lineHeight: 16 },
  rowSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
});
