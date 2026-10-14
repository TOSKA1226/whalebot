/** 权限规则：哪些工具对哪个助手永久放行/拒绝；以及本会话的临时允许 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../app-state';
import { Btn, Header, Row, SectionTitle } from '../ui';

export default function PermissionsScreen() {
  const { t, permRules, savePermRule, sessionAllows, clearSessionAllows, agents } = useApp();

  const agentName = (id: string) =>
    id === '*' ? t('perm.all') : (agents.find((a) => a.id === id)?.name ?? id);

  const rows: { agentId: string; tool: string; decision: 'allow' | 'deny' }[] = [];
  for (const [agentId, tools] of Object.entries(permRules ?? {})) {
    for (const [tool, decision] of Object.entries(tools ?? {})) rows.push({ agentId, tool, decision });
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <Header title={t('perm.title')} subtitle={`${rows.length}`} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={s.hint}>{t('perm.hint')}</Text>

        {rows.length === 0 ? <Text style={s.empty}>{t('perm.empty')}</Text> : null}
        {rows.map((r) => (
          <Row
            key={`${r.agentId}|${r.tool}`}
            left={
              <Ionicons
                name={r.decision === 'allow' ? 'checkmark-circle' : 'close-circle'}
                size={18}
                color={r.decision === 'allow' ? '#34c759' : '#ff3b30'}
              />
            }
            title={`${agentName(r.agentId)} · ${r.tool}`}
            desc={r.decision === 'allow' ? t('perm.allow') : t('perm.deny')}
            right={
              <TouchableOpacity
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => void savePermRule(r.agentId, r.tool, null)}
              >
                <Ionicons name="trash-outline" size={16} color="#ff3b30" />
              </TouchableOpacity>
            }
          />
        ))}

        <SectionTitle>{t('perm.session')}</SectionTitle>
        {sessionAllows.length === 0 ? (
          <Text style={s.empty}>{t('perm.sessionEmpty')}</Text>
        ) : (
          sessionAllows.map((k) => {
            const [agentId, ...rest] = k.split(':');
            return <Row key={k} title={`${agentName(agentId)} · ${rest.join(':')}`} desc={t('perm.allow')} />;
          })
        )}
        {sessionAllows.length ? (
          <Btn
            label={t('perm.clearSession')}
            kind="ghost"
            onPress={clearSessionAllows}
            style={{ marginTop: 10 }}
          />
        ) : null}

        <View style={{ height: 8 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f7' },
  hint: { fontSize: 12, color: '#888', lineHeight: 18, marginBottom: 12 },
  empty: { fontSize: 13, color: '#999', paddingVertical: 6 },
});
