/** 运行日志：每轮模型调用的复盘（群协作一轮会调 N+2 次） */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../app-state';
import { Btn, Header } from '../ui';

const PHASE_LABEL: Record<string, string> = {
  plan: '组长派发',
  work: '成员干活',
  summary: '组长总结',
  single: '单聊',
  'routine-bg': '后台例程',
};

export default function RunsScreen() {
  const { t, runs, reloadRuns, clearRuns } = useApp();
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    void reloadRuns();
  }, [reloadRuns]);

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <Header
        title={t('runs.title')}
        subtitle={`${runs.length}`}
        right={
          <Btn
            label={t('runs.clear')}
            kind="ghost"
            onPress={() =>
              Alert.alert(t('runs.clear'), t('runs.clearConfirm'), [
                { text: t('agents.cancel'), style: 'cancel' },
                { text: t('mem.delete'), style: 'destructive', onPress: () => void clearRuns() },
              ])
            }
          />
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={s.hint}>{t('runs.hint')}</Text>
        {runs.length === 0 ? <Text style={s.empty}>{t('runs.empty')}</Text> : null}

        {runs.map((r) => {
          const expanded = open === r.id;
          const time = new Date(r.at).toLocaleString();
          const ok = !r.error;
          return (
            <TouchableOpacity
              key={r.id}
              style={s.card}
              activeOpacity={0.8}
              onPress={() => setOpen(expanded ? null : r.id)}
            >
              <View style={s.head}>
                <Ionicons
                  name={ok ? 'checkmark-circle' : 'alert-circle'}
                  size={15}
                  color={ok ? '#34c759' : '#ff3b30'}
                />
                <Text style={s.title}>{r.agentName ?? r.agentId}</Text>
                <View style={s.tag}>
                  <Text style={s.tagTxt}>{PHASE_LABEL[r.phase ?? ''] ?? r.phase ?? '—'}</Text>
                </View>
                {r.background ? (
                  <View style={[s.tag, { backgroundColor: '#e6f0ff' }]}>
                    <Text style={[s.tagTxt, { color: '#0a84ff' }]}>{t('runs.background')}</Text>
                  </View>
                ) : null}
                <View style={{ flex: 1 }} />
                <Text style={s.ms}>{(r.ms / 1000).toFixed(1)}s</Text>
              </View>
              <Text style={s.line}>
                {time} · {r.provider ? `${r.provider} · ` : ''}
                {r.model}
                {r.tokens ? ` · ${t('runs.tokens', { n: r.tokens })}` : ''}
                {r.tools.length ? ` · ${t('runs.tools', { n: r.tools.length })}` : ''}
              </Text>
              {r.tools.length && expanded ? (
                <Text style={s.tools}>
                  {r.tools
                    .map((x) => `${x.ok === false ? '⛔' : x.ok ? '✓' : '·'} ${x.name}`)
                    .join('   ')}
                </Text>
              ) : null}
              {expanded && r.text ? <Text style={s.body}>{r.text}</Text> : null}
              {expanded && r.error ? <Text style={s.err}>{r.error}</Text> : null}
              {!expanded && r.text ? (
                <Text style={s.preview} numberOfLines={1}>
                  {r.text}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 8 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f7' },
  hint: { fontSize: 12, color: '#888', lineHeight: 18, marginBottom: 12 },
  empty: { fontSize: 13, color: '#999', paddingVertical: 6 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 14, fontWeight: '700', color: '#111' },
  tag: {
    backgroundColor: '#f0f0f3',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tagTxt: { fontSize: 10, color: '#666' },
  ms: { fontSize: 12, color: '#8e8e93' },
  line: { fontSize: 11, color: '#888', marginTop: 4 },
  tools: { fontSize: 11, color: '#5c5c60', marginTop: 6, lineHeight: 16 },
  body: { fontSize: 12, color: '#333', marginTop: 6, lineHeight: 18 },
  err: { fontSize: 12, color: '#ff3b30', marginTop: 6 },
  preview: { fontSize: 12, color: '#9a9a9e', marginTop: 6 },
});
