import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../app-state';
import { Btn, Card, Header, SectionTitle } from '../../ui';

export default function HomeTab() {
  const { t, cfg, health, sched, usage, notifyAvailable, notifyGranted, data, send } = useApp();

  const quick = async (text: string) => {
    router.push('/chat');
    await send(text);
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <Header title="whalebot" subtitle={`${health} · ${cfg.model}`} />
      <ScrollView contentContainerStyle={s.body}>
        <Btn
          label={t('home.newchat')}
          onPress={() => router.push('/chat')}
          style={{ marginBottom: 4 }}
        />

        <SectionTitle>{t('home.status')}</SectionTitle>
        <Card>
          <Text style={s.line}>
            {t('sched.running')}
            {sched.nextAt
              ? `\n${t('sched.next', { t: new Date(sched.nextAt).toLocaleString() })}`
              : `\n${t('sched.none')}`}
          </Text>
          <Text style={s.line}>
            {notifyAvailable === false
              ? t('notify.status', { s: t('notify.unavailable') })
              : t('notify.perm', {
                  s: notifyGranted
                    ? t('notify.granted')
                    : notifyGranted === false
                      ? t('notify.denied')
                      : '…',
                })}
          </Text>
          {usage ? (
            <Text style={s.line}>
              {t('budget.line', { used: usage.used, budget: usage.budget })}
            </Text>
          ) : null}
          <Text style={s.line}>
            {`记忆 ${data.memories.length} · 技能 ${data.skills.length} · 例程 ${data.routines.length}`}
          </Text>
        </Card>

        <SectionTitle>{t('home.quick')}</SectionTitle>
        {[t('quick.screen'), t('quick.device'), t('quick.remind')].map((q) => (
          <TouchableOpacity key={q} style={s.quickRow} onPress={() => quick(q)}>
            <Text style={s.quickTxt}>{q}</Text>
            <Text style={s.quickArrow}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f7' },
  body: { padding: 16, paddingBottom: 32 },
  line: { fontSize: 13, color: '#333', lineHeight: 20 },
  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
  },
  quickTxt: { flex: 1, fontSize: 14, color: '#111' },
  quickArrow: { fontSize: 20, color: '#c7c7cc' },
});
