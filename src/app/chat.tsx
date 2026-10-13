import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../app-state';
import { Btn } from '../ui';

export default function ChatScreen() {
  const {
    t,
    bubbles,
    busy,
    send,
    clearChat,
    agents,
    activeAgentId,
    roomAgents,
    setRoomMembers,
  } = useApp();
  const [input, setInput] = useState('');
  const [picking, setPicking] = useState(false);

  const main = agents.find((a) => a.id === activeAgentId);
  const members = roomAgents.filter((a) => a.id !== activeAgentId);

  const onSend = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    await send(text);
  };

  const toggleMember = async (id: string) => {
    const ids = roomAgents.map((a) => a.id);
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    await setRoomMembers(next);
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <Text style={s.iconTxt}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{main?.name ?? t('chat.title')}</Text>
          <Text style={s.sub}>
            {members.length ? `${t('room.participants')}：${members.length + 1}` : t('room.title')}
          </Text>
        </View>
        <TouchableOpacity onPress={clearChat} style={s.iconBtn}>
          <Text style={s.iconTxt}>清空</Text>
        </TouchableOpacity>
      </View>

      {/* 参与者条 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 46, flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8, alignItems: 'center' }}
      >
        <View style={[s.chip, s.chipMain]}>
          <Text style={s.chipMainTxt}>
            {main?.name ?? '—'} · {t('room.main')}
          </Text>
        </View>
        {members.map((m) => (
          <TouchableOpacity key={m.id} style={s.chip} onPress={() => toggleMember(m.id)}>
            <Text style={s.chipTxt}>{m.name} ✕</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[s.chip, s.chipAdd]} onPress={() => setPicking(true)}>
          <Text style={s.chipAddTxt}>{t('room.add')}</Text>
        </TouchableOpacity>
      </ScrollView>
      {members.length ? <Text style={s.hint}>{t('room.hint')}</Text> : null}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 20 }}>
        {bubbles.map((b) => (
          <View key={b.id} style={[s.bubbleWrap, alignFor(b.role)]}>
            {b.speaker ? <Text style={s.speaker}>{b.speaker}</Text> : null}
            <View style={[s.bubble, roleStyle(b.role)]}>
              <Text style={[s.bubbleTxt, b.role === 'user' && { color: '#fff' }]}>{b.text}</Text>
            </View>
          </View>
        ))}
        {busy && <ActivityIndicator style={{ marginTop: 8 }} />}
      </ScrollView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder={t('input.placeholder')}
            multiline
            editable={!busy}
          />
          <TouchableOpacity
            style={[s.sendBtn, busy && { opacity: 0.5 }]}
            onPress={onSend}
            disabled={busy}
          >
            <Text style={s.sendTxt}>{t('btn.send')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* 成员选择 */}
      <Modal visible={picking} animationType="slide" onRequestClose={() => setPicking(false)}>
        <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
          <View style={s.header}>
            <Text style={s.title}>{t('room.pick')}</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {agents
              .filter((a) => a.id !== activeAgentId)
              .map((a) => {
                const joined = roomAgents.some((x) => x.id === a.id);
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={s.pickRow}
                    onPress={() => toggleMember(a.id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.pickName}>{a.name}</Text>
                      <Text style={s.pickDesc}>{a.description || a.group}</Text>
                    </View>
                    <Text style={[s.pickState, joined && { color: '#0a84ff' }]}>
                      {joined ? '已加入' : '未加入'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            <Btn label={t('room.done')} onPress={() => setPicking(false)} style={{ marginTop: 14 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const alignFor = (r: string) =>
  r === 'user'
    ? ({ alignItems: 'flex-end' } as const)
    : r === 'tool' || r === 'error'
      ? ({ alignItems: 'stretch' } as const)
      : ({ alignItems: 'flex-start' } as const);

const roleStyle = (r: string) => {
  switch (r) {
    case 'user':
      return { backgroundColor: '#0a84ff' };
    case 'assistant':
      return { backgroundColor: '#fff' };
    case 'tool':
      return { backgroundColor: '#fff8e6' };
    case 'error':
      return { backgroundColor: '#ffe9e9' };
    default:
      return { backgroundColor: 'transparent' };
  }
};

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
  sub: { fontSize: 11, color: '#888' },
  iconBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#e8e8ec',
    borderRadius: 8,
  },
  iconTxt: { fontSize: 14 },
  chip: {
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#e2e2e7',
  },
  chipMain: { backgroundColor: '#0a84ff', borderColor: '#0a84ff' },
  chipMainTxt: { fontSize: 12, color: '#fff', fontWeight: '600' },
  chipTxt: { fontSize: 12, color: '#333' },
  chipAdd: { borderStyle: 'dashed' },
  chipAddTxt: { fontSize: 12, color: '#0a84ff' },
  hint: { fontSize: 11, color: '#999', paddingHorizontal: 14, paddingBottom: 6 },
  bubbleWrap: { maxWidth: '92%', marginBottom: 8 },
  speaker: { fontSize: 11, color: '#0a84ff', marginBottom: 3, fontWeight: '600' },
  bubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  bubbleTxt: { fontSize: 15, lineHeight: 21, color: '#111' },
  inputRow: { flexDirection: 'row', padding: 10, gap: 8, alignItems: 'flex-end' },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxHeight: 120,
    fontSize: 15,
  },
  sendBtn: {
    backgroundColor: '#0a84ff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sendTxt: { color: '#fff', fontWeight: '600' },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  pickName: { fontSize: 15, fontWeight: '600' },
  pickDesc: { fontSize: 12, color: '#999', marginTop: 2 },
  pickState: { fontSize: 12, color: '#c7c7cc' },
});
