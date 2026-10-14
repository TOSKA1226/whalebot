/** 分组与接口：一个分组 = 一个头像色系 + 一把共用的 Key（模型供应商） */
import Ionicons from '@expo/vector-icons/Ionicons';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../app-state';
import { Avatar, FAMILIES, FamilySwatch, familyByKey, familyKeyForGroup } from '../avatar';
import { useGroups } from '../groupList';
import { Header } from '../ui';

export default function GroupsScreen() {
  const { t, agents, cfg, providers, providerKeys, setGroupProvider, setGroupColor } = useApp();
  const groups = useGroups(agents, t('agents.ungrouped'));

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <Header title={t('groups.title')} subtitle={t('groups.count', { n: agents.length })} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={s.hint}>{t('groups.hint')}</Text>
        {groups.length === 0 ? <Text style={s.hint}>{t('groups.none')}</Text> : null}

        {groups.map(([name, list]) => {
          const famKey = familyKeyForGroup(name, cfg.groupColors);
          const manual = !!cfg.groupColors?.[name];
          const boundId = cfg.groupProviders?.[name] ?? '';
          const bound = providers.find((p) => p.id === boundId);
          const summary = bound
            ? `${bound.name}${providerKeys[bound.id] ? ` · ${t('prov.keySet')}` : ` · ${t('prov.keyNone')}`}`
            : t('src.global');
          return (
            <View key={name} style={s.card}>
              <View style={s.head}>
                <FamilySwatch familyKey={famKey} />
                <Text style={s.title}>{name}</Text>
                <View style={s.badge}>
                  <Text style={s.badgeTxt}>{list.length}</Text>
                </View>
                <View style={{ flex: 1 }} />
                <View style={s.avatars}>
                  {list.slice(0, 4).map((a) => (
                    <Avatar key={a.id} agent={a} agents={agents} overrides={cfg.groupColors} size={22} />
                  ))}
                </View>
              </View>

              <Text style={s.label}>
                {t('groups.color')}
                {manual ? '' : `（${t('groups.colorAuto')}：${familyByKey(famKey)?.label ?? famKey}）`}
              </Text>
              <View style={s.chips}>
                <Chip
                  label={t('groups.colorAuto')}
                  on={!manual}
                  onPress={() => void setGroupColor(name, '')}
                />
                {FAMILIES.map((f) => (
                  <Chip
                    key={f.key}
                    label={f.label.replace('色系', '')}
                    swatch={f.colors[2]}
                    on={cfg.groupColors?.[name] === f.key}
                    onPress={() => void setGroupColor(name, f.key)}
                  />
                ))}
              </View>

              <Text style={s.label}>{t('groups.provider')}</Text>
              <View style={s.chips}>
                <Chip
                  label={t('groups.providerGlobal')}
                  on={!boundId}
                  onPress={() => void setGroupProvider(name, '')}
                />
                {providers.map((p) => (
                  <Chip
                    key={p.id}
                    label={`${p.name}${providerKeys[p.id] ? ' 🔑' : ''}`}
                    on={boundId === p.id}
                    onPress={() => void setGroupProvider(name, p.id)}
                  />
                ))}
              </View>
              <Text style={s.current}>{t('groups.current', { s: summary })}</Text>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({
  label,
  on,
  onPress,
  swatch,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  swatch?: string;
}) {
  return (
    <TouchableOpacity style={[s.chip, on && s.chipOn]} onPress={onPress}>
      {swatch ? <View style={[s.dot, { backgroundColor: swatch }]} /> : null}
      <Text style={[s.chipTxt, on && s.chipTxtOn]}>{label}</Text>
      {on ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f7' },
  hint: { fontSize: 12, color: '#888', lineHeight: 18, marginBottom: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: '#111' },
  badge: {
    backgroundColor: '#e8e8ec',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  badgeTxt: { fontSize: 11, color: '#666' },
  avatars: { flexDirection: 'row', gap: 4 },
  label: { fontSize: 12, color: '#555', marginTop: 12, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f0f0f3',
  },
  chipOn: { backgroundColor: '#0a84ff' },
  chipTxt: { fontSize: 12, color: '#333' },
  chipTxtOn: { color: '#fff', fontWeight: '600' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  current: { fontSize: 11, color: '#999', marginTop: 8 },
});
