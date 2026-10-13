import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../app-state';
import { Btn, Card, Header, SectionTitle } from '../../ui';

export default function HomeTab() {
  const { t, cfg, health, sched, usage, notifyAvailable, notifyGranted, data, send, newChat } =
    useApp();

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
          onPress={async () => {
            await newChat();
            router.push('/chat');
          }}
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
          <TouchableOpacity onPress={() => router.push('/data')}>
            <Text style={[s.line, { color: '#0a84ff' }]}>
              {`记忆 ${data.memories.length} · 技能 ${data.skills.length} · 例程 ${data.routines.length}  ›`}
            </Text>
          </TouchableOpacity>
        </Card>

        <View style={s.sectionRow}>
          <Text style={s.sectionTxt}>{t('home.quick')}</Text>
          <TouchableOpacity style={s.editBtn} onPress={() => router.push('/quick')}>
            <Ionicons name="create-outline" size={14} color="#0a84ff" />
            <Text style={s.editTxt}>{t('home.quick.edit')}</Text>
          </TouchableOpacity>
        </View>

        {cfg.quickActions.length === 0 ? (
          <TouchableOpacity style={s.quickEmpty} onPress={() => router.push('/quick')}>
            <Text style={s.quickEmptyTxt}>{t('home.quick.empty')}</Text>
          </TouchableOpacity>
        ) : (
          cfg.quickActions.map((q) => (
            <TouchableOpacity key={q.id} style={s.quickRow} onPress={() => quick(q.prompt)}>
              <Text style={s.quickTxt} numberOfLines={2}>
                {q.label}
              </Text>
              <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f7' },
  body: { padding: 16, paddingBottom: 32 },
  line: { fontSize: 13, color: '#333', lineHeight: 20 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 8,
  },
  sectionTxt: { fontSize: 13, fontWeight: '700', color: '#666', textTransform: 'uppercase' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingHorizontal: 6 },
  editTxt: { fontSize: 12, color: '#0a84ff', fontWeight: '600' },
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
  quickEmpty: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#e2e2e7',
    borderStyle: 'dashed',
  },
  quickEmptyTxt: { fontSize: 13, color: '#8e8e93', lineHeight: 19 },
});
