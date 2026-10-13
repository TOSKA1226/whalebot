import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../app-state';
import type { QuickAction } from '../config';
import { Btn } from '../ui';

const newId = () => `q${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

export default function QuickScreen() {
  const { t, cfg, saveCfg } = useApp();
  const [list, setList] = useState<QuickAction[]>(cfg.quickActions);
  const [editing, setEditing] = useState<{ id: string | null; label: string; prompt: string } | null>(
    null,
  );

  /** 每次改动立刻落盘（不依赖「保存」按钮） */
  const commit = async (next: QuickAction[]) => {
    setList(next);
    await saveCfg({ ...cfg, quickActions: next });
  };

  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    await commit(next);
  };

  const remove = async (id: string) => {
    await commit(list.filter((q) => q.id !== id));
  };

  const save = async () => {
    if (!editing) return;
    const label = editing.label.trim();
    const prompt = editing.prompt.trim();
    if (!label || !prompt) return;
    const next = editing.id
      ? list.map((q) => (q.id === editing.id ? { ...q, label, prompt } : q))
      : [...list, { id: newId(), label, prompt }];
    await commit(next);
    setEditing(null);
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name="chevron-back" size={18} color="#111" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{t('quick.title')}</Text>
          <Text style={s.sub}>{t('quick.hint')}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {list.length === 0 ? <Text style={s.empty}>{t('quick.empty')}</Text> : null}
        {list.map((q, i) => (
          <View key={q.id} style={s.card}>
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => setEditing({ id: q.id, label: q.label, prompt: q.prompt })}
            >
              <Text style={s.label}>{q.label}</Text>
              <Text style={s.prompt} numberOfLines={2}>
                {q.prompt}
              </Text>
            </TouchableOpacity>
            <View style={s.ops}>
              <TouchableOpacity
                style={[s.op, i === 0 && s.opOff]}
                disabled={i === 0}
                onPress={() => move(i, -1)}
              >
                <Ionicons name="chevron-up" size={16} color={i === 0 ? '#c7c7cc' : '#0a84ff'} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.op, i === list.length - 1 && s.opOff]}
                disabled={i === list.length - 1}
                onPress={() => move(i, 1)}
              >
                <Ionicons
                  name="chevron-down"
                  size={16}
                  color={i === list.length - 1 ? '#c7c7cc' : '#0a84ff'}
                />
              </TouchableOpacity>
              <TouchableOpacity style={s.op} onPress={() => remove(q.id)}>
                <Ionicons name="trash-outline" size={16} color="#ff3b30" />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <Btn
          label={t('quick.new')}
          onPress={() => setEditing({ id: null, label: '', prompt: '' })}
          style={{ marginTop: 8 }}
        />
      </ScrollView>

      <Modal
        visible={!!editing}
        animationType="slide"
        transparent
        onRequestClose={() => setEditing(null)}
      >
        <View style={s.mask}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>{editing?.id ? t('quick.label') : t('quick.new')}</Text>
            <Text style={s.fieldLabel}>{t('quick.label')}</Text>
            <TextInput
              style={s.input}
              value={editing?.label ?? ''}
              onChangeText={(v) => setEditing((e) => (e ? { ...e, label: v } : e))}
              placeholder={t('home.newchat')}
              placeholderTextColor="#9a9a9e"
            />
            <Text style={s.fieldLabel}>{t('quick.prompt')}</Text>
            <TextInput
              style={[s.input, { height: 90, textAlignVertical: 'top' }]}
              value={editing?.prompt ?? ''}
              onChangeText={(v) => setEditing((e) => (e ? { ...e, prompt: v } : e))}
              multiline
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
  empty: { fontSize: 13, color: '#999', marginBottom: 12 },
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
  label: { fontSize: 15, fontWeight: '600', color: '#111' },
  prompt: { fontSize: 12, color: '#888', marginTop: 3, lineHeight: 17 },
  ops: { flexDirection: 'row', gap: 2 },
  op: { padding: 4 },
  opOff: { opacity: 0.4 },
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18 },
  sheetTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  fieldLabel: { fontSize: 12, color: '#555', marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: '#f2f2f5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
  },
});
