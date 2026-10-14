import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../app-state';
import { useGroups } from '../../groupList';
import type { Config, ToolDisplay } from '../../config';
import type { Lang } from '../../i18n';
import { Btn, Card, Header, Row, SectionTitle } from '../../ui';

const LANGS: Lang[] = ['zh-Hans', 'en', 'system'];

const TOOL_MODES: { v: ToolDisplay; k: 'tools.mode.show' | 'tools.mode.collapse' | 'tools.mode.hide' }[] = [
  { v: 'show', k: 'tools.mode.show' },
  { v: 'collapse', k: 'tools.mode.collapse' },
  { v: 'hide', k: 'tools.mode.hide' },
];

export default function SettingsTab() {
  const {
    t,
    cfg,
    saveCfg,
    checkHealth,
    health,
    sched,
    notifyAvailable,
    notifyGranted,
    usage,
    data,
    mcpTools,
    providers,
    agents,
    permRules,
    runs,
    credentials,
    bg,
    toggleBackground,
  } = useApp();
  const ruleCount = Object.values(permRules ?? {}).reduce(
    (n, tools) => n + Object.keys(tools ?? {}).length,
    0,
  );
  const groupCount = useGroups(agents, t('agents.ungrouped')).length;
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

        <Text style={s.label}>{t('settings.tools')}</Text>
        <View style={s.langRow}>
          {TOOL_MODES.map((m) => (
            <Btn
              key={m.v}
              label={t(m.k)}
              kind={draft.toolDisplay === m.v ? 'primary' : 'ghost'}
              style={{ flex: 1 }}
              onPress={() => set({ toolDisplay: m.v })}
            />
          ))}
        </View>
        <Text style={s.hint2}>{t('settings.tools.desc')}</Text>

        <SectionTitle>{t('budget.section')}</SectionTitle>
        <Text style={s.label}>{t('budget.limit')}</Text>
        <View style={s.langRow}>
          {[true, false].map((v) => (
            <Btn
              key={String(v)}
              label={v ? t('budget.on') : t('budget.off')}
              kind={draft.tokenLimitEnabled === v ? 'primary' : 'ghost'}
              style={{ flex: 1 }}
              onPress={() => set({ tokenLimitEnabled: v })}
            />
          ))}
        </View>
        {draft.tokenLimitEnabled ? (
          <>
            <TextInput
              style={s.input}
              value={String(draft.tokenLimit ?? '')}
              onChangeText={(v) => set({ tokenLimit: Number(v.replace(/[^0-9]/g, '')) || 0 })}
              keyboardType="number-pad"
              placeholder="200000"
              placeholderTextColor="#9a9a9e"
            />
            <View style={[s.langRow, { marginTop: 8 }]}>
              {[50000, 200000, 1000000, 2000000].map((n) => (
                <Btn
                  key={n}
                  label={n >= 1000000 ? `${n / 1000000}M` : `${n / 1000}k`}
                  kind={draft.tokenLimit === n ? 'primary' : 'ghost'}
                  style={{ flex: 1 }}
                  onPress={() => set({ tokenLimit: n })}
                />
              ))}
            </View>
          </>
        ) : null}
        <Text style={s.hint2}>{t('budget.limitHint')}</Text>

        <Row
          title={t('perm.title')}
          desc={t('settings.perm.desc', { n: ruleCount })}
          onPress={() => router.push('/permissions')}
        />
        <Row
          title={t('runs.title')}
          desc={t('settings.runs.desc', { n: runs.length })}
          onPress={() => router.push('/runs')}
        />
        <Row
          title={t('vault.title')}
          desc={t('settings.vault.desc', { n: credentials.length })}
          onPress={() => router.push('/vault')}
        />

        <Text style={s.label}>{t('bg.title')}</Text>
        <View style={s.langRow}>
          {[true, false].map((v) => (
            <Btn
              key={String(v)}
              label={v ? t('bg.on') : t('bg.off')}
              kind={bg.registered === v ? 'primary' : 'ghost'}
              style={{ flex: 1 }}
              onPress={() => void toggleBackground(v)}
            />
          ))}
        </View>
        <Text style={s.hint2}>
          {bg.available ? t('bg.note') : t('bg.unavailable')}
        </Text>

        <Row
          title={t('settings.providers')}
          desc={t('settings.providers.desc', { n: providers.length })}
          onPress={() => router.push('/providers')}
        />
        <Row
          title={t('settings.groups')}
          desc={t('settings.groups.desc', { n: groupCount })}
          onPress={() => router.push('/groups')}
        />

        <Row
          title={t('mcp.entry')}
          desc={t('mcp.tools', { n: mcpTools.length })}
          onPress={() => router.push('/mcp')}
        />

        <Row
          title={t('quick.title')}
          desc={t('quick.count', { n: draft.quickActions.length })}
          onPress={() => router.push('/quick')}
        />

        <Text style={s.label}>{t('settings.autorule')}</Text>
        <View style={s.langRow}>
          {[false, true].map((v) => (
            <Btn
              key={String(v)}
              label={v ? t('review.on') : t('review.off')}
              kind={draft.reviewEnabled === v ? 'primary' : 'ghost'}
              style={{ flex: 1 }}
              onPress={() => set({ reviewEnabled: v })}
            />
          ))}
        </View>
        <Text style={s.hint2}>{t('settings.autorule.desc')}</Text>
        {draft.reviewEnabled ? (
          <View style={{ marginTop: 10 }}>
            <Field
              label={t('review.model')}
              value={draft.reviewModel}
              onChange={(v) => set({ reviewModel: v })}
              hint="deepseek-chat"
            />
            <Text style={s.hint2}>{t('review.note')}</Text>
          </View>
        ) : null}
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
            <Text style={s.line}>
              {usage.budget > 0
                ? t('budget.line', { used: usage.used, budget: usage.budget })
                : t('budget.usedNow', { used: usage.used })}
            </Text>
          ) : null}
          <Text style={s.line}>
            记忆 {data.memories.length} · 技能 {data.skills.length} · 例程 {data.routines.length}
          </Text>
        </Card>

        <Row
          title={t('settings.version')}
          desc={`${Constants.expoConfig?.version ?? '—'} (${Constants.expoConfig?.android?.versionCode ?? '—'}) · SDK ${
            Constants.expoConfig?.sdkVersion ?? '—'
          }`}
        />

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
        placeholderTextColor="#9a9a9e"
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
    color: '#111',
  },
  langRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  hint2: { fontSize: 11, color: '#aaa', marginBottom: 8 },
  pill: { fontSize: 11, color: '#8e8e93', backgroundColor: '#f0f0f3', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  line: { fontSize: 12, color: '#333', lineHeight: 19 },
  note: { marginTop: 16, color: '#999', fontSize: 12, lineHeight: 18 },
});
