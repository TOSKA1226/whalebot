import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../app-state';
import type { McpServer } from '../mcp';
import { newServerId } from '../mcp';
import { Btn, SectionTitle } from '../ui';

export default function McpScreen() {
  const { t, cfg, saveCfg, mcpTools, mcpStatus, refreshMcp } = useApp();
  const [editing, setEditing] = useState<{
    id: string | null;
    name: string;
    url: string;
    token: string;
    enabled: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const commit = async (next: McpServer[]) => {
    await saveCfg({ ...cfg, mcpServers: next });
    setBusy(true);
    await refreshMcp();
    setBusy(false);
  };

  const save = async () => {
    if (!editing) return;
    const name = editing.name.trim() || 'MCP';
    const url = editing.url.trim();
    if (!url) return;
    const item: McpServer = {
      id: editing.id ?? newServerId(),
      name,
      url,
      token: editing.token.trim() || undefined,
      enabled: editing.enabled,
    };
    const next = editing.id
      ? (cfg.mcpServers ?? []).map((s) => (s.id === editing.id ? item : s))
      : [...(cfg.mcpServers ?? []), item];
    await commit(next);
    setEditing(null);
  };

  const remove = async (id: string) => {
    await commit((cfg.mcpServers ?? []).filter((s) => s.id !== id));
  };

  const toggle = async (srv: McpServer) => {
    await commit((cfg.mcpServers ?? []).map((s) => (s.id === srv.id ? { ...s, enabled: !s.enabled } : s)));
  };

  const statusText = (id: string) => {
    const st = mcpStatus[id];
    if (!st) return '';
    if (st.startsWith('ok:')) return t('mcp.test.ok', { n: Number(st.slice(3)) });
    return t('mcp.test.err', { e: st.slice(4) });
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name="chevron-back" size={18} color="#111" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{t('mcp.title')}</Text>
          <Text style={s.sub}>{t('mcp.hint')}</Text>
        </View>
        <TouchableOpacity
          style={s.iconBtn}
          onPress={async () => {
            setBusy(true);
            await refreshMcp();
            setBusy(false);
          }}
        >
          <Ionicons name="refresh" size={16} color={busy ? '#c7c7cc' : '#0a84ff'} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {(cfg.mcpServers ?? []).length === 0 ? <Text style={s.empty}>{t('mcp.none')}</Text> : null}

        {(cfg.mcpServers ?? []).map((srv) => (
          <View key={srv.id} style={s.card}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>
                {srv.name} {srv.enabled ? '' : `· ${t('mcp.disabled')}`}
              </Text>
              <Text style={s.url} numberOfLines={1}>
                {srv.url}
              </Text>
              {statusText(srv.id) ? <Text style={s.status}>{statusText(srv.id)}</Text> : null}
            </View>
            <View style={s.ops}>
              <TouchableOpacity style={s.op} onPress={() => toggle(srv)}>
                <Ionicons
                  name={srv.enabled ? 'toggle' : 'toggle-outline'}
                  size={20}
                  color={srv.enabled ? '#34c759' : '#c7c7cc'}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={s.op}
                onPress={() =>
                  setEditing({
                    id: srv.id,
                    name: srv.name,
                    url: srv.url,
                    token: srv.token ?? '',
                    enabled: srv.enabled,
                  })
                }
              >
                <Ionicons name="create-outline" size={17} color="#0a84ff" />
              </TouchableOpacity>
              <TouchableOpacity style={s.op} onPress={() => remove(srv.id)}>
                <Ionicons name="trash-outline" size={17} color="#ff3b30" />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <Btn
          label={t('mcp.add')}
          onPress={() => setEditing({ id: null, name: '', url: '', token: '', enabled: true })}
          style={{ marginTop: 8 }}
        />

        <SectionTitle>{t('mcp.tools', { n: mcpTools.length })}</SectionTitle>
        {mcpTools.length === 0 ? (
          <Text style={s.empty}>{t('mcp.noTools')}</Text>
        ) : (
          mcpTools.map((tool) => (
            <View key={`${tool.serverId}-${tool.name}`} style={s.toolRow}>
              <Text style={s.toolName}>{tool.name}</Text>
              <Text style={s.toolDesc} numberOfLines={3}>
                {`[${tool.serverName}] ${tool.description || '—'}`}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={!!editing} animationType="slide" transparent onRequestClose={() => setEditing(null)}>
        <View style={s.mask}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>{editing?.id ? t('mcp.edit') : t('mcp.add')}</Text>
            <Text style={s.label}>{t('mcp.name')}</Text>
            <TextInput
              style={s.input}
              value={editing?.name ?? ''}
              onChangeText={(v) => setEditing((e) => (e ? { ...e, name: v } : e))}
              placeholder="my-mcp"
              placeholderTextColor="#9a9a9e"
              autoCapitalize="none"
            />
            <Text style={s.label}>{t('mcp.url')}</Text>
            <TextInput
              style={s.input}
              value={editing?.url ?? ''}
              onChangeText={(v) => setEditing((e) => (e ? { ...e, url: v } : e))}
              placeholder="http://127.0.0.1:8931/mcp"
              placeholderTextColor="#9a9a9e"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={s.label}>{t('mcp.token')}</Text>
            <TextInput
              style={s.input}
              value={editing?.token ?? ''}
              onChangeText={(v) => setEditing((e) => (e ? { ...e, token: v } : e))}
              placeholder="（可留空）"
              placeholderTextColor="#9a9a9e"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Btn label={t('quick.save')} onPress={save} style={{ marginTop: 14 }} />
            <Btn
              label={t('agents.cancel')}
              kind="ghost"
              onPress={() => setEditing(null)}
              style={{ marginTop: 8 }}
            />
          </View>
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
  empty: { fontSize: 13, color: '#999', marginBottom: 8, lineHeight: 19 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  name: { fontSize: 15, fontWeight: '600', color: '#111' },
  url: { fontSize: 11, color: '#888', marginTop: 2 },
  status: { fontSize: 11, color: '#0a84ff', marginTop: 4 },
  ops: { flexDirection: 'row', gap: 6 },
  op: { padding: 4 },
  toolRow: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  toolName: { fontSize: 13, fontWeight: '600', color: '#111' },
  toolDesc: { fontSize: 11, color: '#777', marginTop: 3, lineHeight: 16 },
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18 },
  sheetTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  label: { fontSize: 12, color: '#555', marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: '#f2f2f5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
  },
});
