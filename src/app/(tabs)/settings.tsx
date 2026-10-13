import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../app-state';
import type { Config } from '../../config';
import type { Lang } from '../../i18n';
import { Btn, Card, Header, Row, SectionTitle } from '../../ui';

const LANGS: Lang[] = ['zh-Hans', 'en', 'system'];

export default function SettingsTab() {
  const { t, cfg, saveCfg, checkHealth, health, sched, notifyAvailable, notifyGranted, usage, data } =
    useApp();
  const [draft, setDraft] = useState<Config>(cfg);

  const set = (patch: Partial<Config>) => setDraft({ ...draft, ...patch });

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <Header title={t('settings.title')} />
      <ScrollView contentContainerStyle={s.body}>
        <SectionTitle>{t('settings.section.model')}</SectionTitle>
        <Field label={t('field.apiKey')} value={draft.apiKey} onChange={(v) => set({ apiKey: v })} secure />
        <Field label={t('field.baseUrl')} value={draft.baseUrl} onChange={(v) => set({ baseUrl: v })} />
        <Field label={t('field.model')} value={draft.model} onChange={(v) => set({ model: v })} hint={t('field.modelHint')} />

        <SectionTitle>{t('settings.section.executor')}</SectionTitle>
        <Field label={t('field.execUrl')} value={draft.execUrl} onChange={(v) => set({ execUrl: v })} />
        <Field label={t('field.execToken')} value={draft.execToken} onChange={(v) => set({ execToken: v })} />

        <SectionTitle>{t('settings.section.general')}</SectionTitle>
        <Text style={s.label}>{t('field.lang')}</Text>
        <View style={s.langRow}>
          {LANGS.map((l) => {
            const active = draft.lang === l;
            const label = l === 'zh-Hans' ? t('lang.zh') : l === 'en' ? t('lang.en') : t('lang.system');
            return (
              <Btn
                key={l}
                label={label}
                kind={active ? 'primary' : 'ghost'}
                style={{ flex: 1 }}
                onPress={() => set({ lang: l })}
              />
            );
          })}
        </View>

        <Row
          title={t('settings.autorule')}
          desc={t('settings.autorule.desc')}
          right={<Text style={s.pill}>下一步</Text>}
        />
        <Row title={t('btn.caps')} desc="23 项容器/手机能力 + 本地工具" onPress={() => router.push('/capabilities')} />

        <Btn label={t('settings.save')} onPress={() => saveCfg(draft)} style={{ marginTop: 18 }} />
        <Btn label={t('settings.test')} kind="ghost" onPress={() => checkHealth(draft)} style={{ marginTop: 10 }} />

        <SectionTitle>{t('settings.section.status')}</SectionTitle>
        <Card>
          <Text style={s.line}>{health}</Text>
          <Text style={s.line}>
            {t('sched.running')}
            {sched.nextAt ? ` · ${new Date(sched.nextAt).toLocaleString()}` : ` · ${t('sched.none')}`}
          </Text>
          <Text style={s.line}>
            {notifyAvailable === false
              ? t('notify.status', { s: t('notify.unavailable') })
              : t('notify.perm', { s: notifyGranted ? t('notify.granted') : t('notify.denied') })}
          </Text>
          {usage ? (
            <Text style={s.line}>{t('budget.line', { used: usage.used, budget: usage.budget })}</Text>
          ) : null}
          <Text style={s.line}>
            记忆 {data.memories.length} · 技能 {data.skills.length} · 例程 {data.routines.length}
          </Text>
        </Card>

        <Text style={s.note}>{t('settings.note')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
  secure,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  secure?: boolean;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={secure}
        placeholder={hint}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f7' },
  body: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 12, color: '#555', marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  langRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  pill: { fontSize: 11, color: '#8e8e93', backgroundColor: '#f0f0f3', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  line: { fontSize: 12, color: '#333', lineHeight: 19 },
  note: { marginTop: 16, color: '#999', fontSize: 12, lineHeight: 18 },
});
