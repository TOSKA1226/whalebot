import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../app-state';
import { fetchCapabilities, type Capability } from '../api';
import { TOOLS } from '../tools';
import { SectionTitle } from '../ui';

export default function CapabilitiesScreen() {
  const { t, cfg } = useApp();
  const [caps, setCaps] = useState<Capability[]>([]);
  const [state, setState] = useState<'loading' | 'ok' | 'fail'>('loading');

  useEffect(() => {
    (async () => {
      try {
        const d = await fetchCapabilities(cfg);
        setCaps(d.capabilities ?? []);
        setState('ok');
      } catch {
        setState('fail');
      }
    })();
  }, [cfg]);

  const local = TOOLS.filter((tl) => tl.local);
  const groups = [
    { key: 'phone', label: t('caps.phone'), items: caps.filter((c) => c.computer === 'phone') },
    {
      key: 'container',
      label: t('caps.container'),
      items: caps.filter((c) => c.computer === 'container'),
    },
    {
      key: 'builtin',
      label: t('caps.builtin'),
      items: [
        ...caps.filter((c) => c.computer === 'builtin'),
        ...local.map((tl) => ({
          name: tl.name,
          risk: 'low' as const,
          needsApproval: tl.needsApproval,
          desc: tl.description,
          computer: 'builtin' as const,
        })),
      ],
    },
  ];

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <Text style={s.iconTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={s.title}>{t('caps.title')}</Text>
      </View>
      <ScrollView contentContainerStyle={s.body}>
        {state === 'loading' && <Text style={s.note}>{t('caps.loading')}</Text>}
        {state === 'fail' && <Text style={s.note}>{t('caps.failed')}</Text>}
        {state === 'ok' &&
          groups.map((g) =>
            g.items.length ? (
              <View key={g.key}>
                <SectionTitle>{g.label}</SectionTitle>
                {g.items.map((c) => (
                  <View key={c.name} style={s.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.name}>{c.name}</Text>
                      <Text style={s.desc}>{c.desc}</Text>
                    </View>
                    <View
                      style={[
                        s.badge,
                        c.risk === 'high' ? s.high : c.risk === 'medium' ? s.mid : s.low,
                      ]}
                    >
                      <Text style={s.badgeTxt}>
                        {c.risk}·{c.needsApproval ? t('caps.approval') : t('caps.free')}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null,
          )}
        {state === 'ok' && (
          <Text style={s.note}>{t('caps.count', { n: caps.length + local.length })}</Text>
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
  iconBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#e8e8ec',
    borderRadius: 8,
  },
  iconTxt: { fontSize: 14 },
  body: { padding: 16, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 8,
  },
  name: { fontSize: 14, fontWeight: '600', color: '#111' },
  desc: { fontSize: 11, color: '#888', marginTop: 2 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  low: { backgroundColor: '#e6f4ea' },
  mid: { backgroundColor: '#fff4e5' },
  high: { backgroundColor: '#ffe9e9' },
  badgeTxt: { fontSize: 10, color: '#333' },
  note: { marginTop: 10, color: '#999', fontSize: 12, lineHeight: 18 },
});
