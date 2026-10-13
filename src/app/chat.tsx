import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, type Bubble } from '../app-state';
import { Btn, Dot } from '../ui';

/** 只关心键盘有没有弹起（用于自动滚到底、底部内边距）；避免遮挡交给 KeyboardAvoidingView */
function useKeyboardVisible() {
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setVisible(e?.endCoordinates?.height ?? -1),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

type Item =
  | { key: string; kind: 'bubble'; b: Bubble }
  | { key: string; kind: 'tools'; list: Bubble[] };

export default function ChatScreen() {
  const {
    t,
    cfg,
    bubbles,
    busy,
    send,
    clearChat,
    agents,
    activeAgentId,
    roomAgents,
    setRoomMembers,
    presenceOf,
  } = useApp();
  const [input, setInput] = useState('');
  const [picking, setPicking] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const insets = useSafeAreaInsets();
  const kbHeight = useKeyboardVisible();
  const kb = kbHeight > 0;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [bubbles.length, kb]);

  const main = agents.find((a) => a.id === activeAgentId);
  const members = roomAgents.filter((a) => a.id !== activeAgentId);
  const mainPresence = presenceOf(activeAgentId);

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

  /** 按「工具调用显示」设置把气泡整理成渲染列表（连续的工具气泡合成一组） */
  const mode = cfg.toolDisplay;
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const b of bubbles) {
      if (b.role === 'tool') {
        if (mode === 'hide') continue;
        if (mode === 'collapse') {
          const last = out[out.length - 1];
          if (last && last.kind === 'tools') {
            last.list.push(b);
            continue;
          }
          out.push({ key: `g-${b.id}`, kind: 'tools', list: [b] });
          continue;
        }
      }
      out.push({ key: b.id, kind: 'bubble', b });
    }
    return out;
  }, [bubbles, mode]);

  const onlyGreeting = bubbles.every((b) => b.role === 'system');

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      {/* edge-to-edge 下用 keyboard-controller 的 KAV（原生 IME insets，不依赖 RN 的键盘事件） */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name="chevron-back" size={18} color="#111" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={s.titleRow}>
            <Dot state={mainPresence} />
            <Text style={s.title}>{main?.name ?? t('chat.title')}</Text>
          </View>
          <Text style={s.sub}>
            {t(`presence.${mainPresence}` as 'presence.online')}
            {members.length ? ` · ${t('room.participants')}：${members.length + 1}` : ` · ${t('room.title')}`}
          </Text>
        </View>
        <TouchableOpacity onPress={clearChat} style={s.iconBtn}>
          <Text style={s.iconTxt}>{t('chat.clear')}</Text>
        </TouchableOpacity>
      </View>

      {!cfg.apiKey ? (
        <TouchableOpacity style={s.banner} onPress={() => router.push('/settings')}>
          <Ionicons name="key-outline" size={14} color="#8a6d1f" />
          <Text style={s.bannerTxt}>{t('chat.nokey')}</Text>
          <Ionicons name="chevron-forward" size={14} color="#8a6d1f" />
        </TouchableOpacity>
      ) : null}

      {/* 参与者条 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 46, flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8, alignItems: 'center' }}
      >
        <View style={[s.chip, s.chipMain]}>
          <Dot state={mainPresence} />
          <Text style={s.chipMainTxt}>
            {main?.name ?? '—'} · {t('room.main')}
          </Text>
        </View>
        {members.map((m) => (
          <TouchableOpacity key={m.id} style={s.chip} onPress={() => toggleMember(m.id)}>
            <Dot state={presenceOf(m.id)} />
            <Text style={s.chipTxt}>{m.name}</Text>
            <Ionicons name="close" size={12} color="#8e8e93" />
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[s.chip, s.chipAdd]} onPress={() => setPicking(true)}>
          <Ionicons name="add" size={13} color="#0a84ff" />
          <Text style={s.chipAddTxt}>{t('room.member')}</Text>
        </TouchableOpacity>
      </ScrollView>
      {members.length ? <Text style={s.hint}>{t('room.hint')}</Text> : null}

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        {onlyGreeting ? <Text style={s.empty}>{t('chat.empty')}</Text> : null}
        {items.map((it) =>
          it.kind === 'tools' ? (
            <ToolGroup
              key={it.key}
              list={it.list}
              open={!!openGroups[it.key]}
              onToggle={() => setOpenGroups((p) => ({ ...p, [it.key]: !p[it.key] }))}
              t={t}
            />
          ) : (
            <RowBubble key={it.key} b={it.b} />
          ),
        )}
        {busy && <ActivityIndicator style={{ marginTop: 8 }} />}
      </ScrollView>

      <View
        style={[
          s.inputRow,
          { paddingBottom: kb ? 10 : Math.max(insets.bottom, 10) },
        ]}
      >
        <TextInput
          style={s.input}
          value={input}
          onChangeText={setInput}
          placeholder={t('input.placeholder')}
          placeholderTextColor="#9a9a9e"
          multiline
          editable={!busy}
        />
        <TouchableOpacity
          style={[s.sendBtn, busy && { opacity: 0.5 }]}
          onPress={onSend}
          disabled={busy}
        >
          <Ionicons name="arrow-up" size={18} color="#fff" />
        </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* 成员选择 */}
      <Modal visible={picking} animationType="slide" onRequestClose={() => setPicking(false)}>
        <SafeAreaView style={s.root} edges={['top', 'left', 'right', 'bottom']}>
          <View style={s.header}>
            <Text style={s.title}>{t('room.pick')}</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {agents
              .filter((a) => a.id !== activeAgentId)
              .map((a) => {
                const joined = roomAgents.some((x) => x.id === a.id);
                return (
                  <TouchableOpacity key={a.id} style={s.pickRow} onPress={() => toggleMember(a.id)}>
                    <Dot state={presenceOf(a.id)} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.pickName}>{a.name}</Text>
                      <Text style={s.pickDesc}>{a.description || a.group}</Text>
                    </View>
                    <Text style={[s.pickState, joined && { color: '#0a84ff' }]}>
                      {joined ? t('room.joined') : t('room.notjoined')}
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

/** 普通气泡（用户/助手/工具/错误/系统） */
function RowBubble({ b }: { b: Bubble }) {
  if (b.role === 'tool') return <ToolCard b={b} />;
  if (b.role === 'system') {
    return (
      <View style={s.sysRow}>
        <Ionicons name="information-circle-outline" size={13} color="#8e8e93" />
        <Text style={s.sysTxt}>{b.text}</Text>
      </View>
    );
  }
  if (b.role === 'error') {
    return (
      <View style={[s.bubbleWrap, { alignItems: 'stretch' }]}>
        {b.speaker ? <Text style={s.speaker}>{b.speaker}</Text> : null}
        <View style={[s.bubble, s.bubbleError, s.errRow]}>
          <Ionicons name="alert-circle" size={15} color="#ff3b30" />
          <Text style={[s.bubbleTxt, { flex: 1 }]}>{b.text}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={[s.bubbleWrap, b.role === 'user' ? { alignItems: 'flex-end' } : null]}>
      {b.speaker ? <Text style={s.speaker}>{b.speaker}</Text> : null}
      <View style={[s.bubble, b.role === 'user' ? s.bubbleUser : s.bubbleAssistant]}>
        <Text style={[s.bubbleTxt, b.role === 'user' && { color: '#fff' }]}>{b.text}</Text>
      </View>
    </View>
  );
}

/** 折叠模式：连续的工具调用合成一行，点开看详情 */
function ToolGroup({
  list,
  open,
  onToggle,
  t,
}: {
  list: Bubble[];
  open: boolean;
  onToggle: () => void;
  t: (k: any, v?: any) => string;
}) {
  const failed = list.some((b) => b.tool?.done && b.tool?.ok === false);
  return (
    <View style={s.toolGroup}>
      <TouchableOpacity style={s.toolHead} onPress={onToggle} activeOpacity={0.7}>
        <Ionicons name="construct-outline" size={14} color="#8a6d1f" />
        <Text style={s.toolGroupTitle}>{t('tools.calls', { n: list.length })}</Text>
        {failed ? <Ionicons name="alert-circle" size={13} color="#ff3b30" /> : null}
        <View style={{ flex: 1 }} />
        <Text style={s.toolToggle}>{open ? t('tools.collapse') : t('tools.detail')}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={13} color="#8e8e93" />
      </TouchableOpacity>
      {open ? list.map((b) => <ToolCard key={b.id} b={b} />) : null}
    </View>
  );
}

/** 单条工具调用（显示模式 / 折叠展开后） */
function ToolCard({ b }: { b: Bubble }) {
  const done = !!b.tool?.done;
  const ok = b.tool?.ok;
  return (
    <View style={s.toolCard}>
      <View style={s.toolHead}>
        <Ionicons name="build-outline" size={13} color="#8a6d1f" />
        <Text style={s.toolName}>{b.tool?.name ?? 'tool'}</Text>
        <View style={{ flex: 1 }} />
        {done ? (
          <Ionicons
            name={ok ? 'checkmark-circle' : 'close-circle'}
            size={14}
            color={ok ? '#34c759' : '#ff3b30'}
          />
        ) : (
          <ActivityIndicator size="small" color="#8a6d1f" />
        )}
      </View>
      <Text style={s.toolBody}>{b.text}</Text>
    </View>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 18, fontWeight: '700', color: '#111' },
  sub: { fontSize: 11, color: '#888', marginTop: 2 },
  iconBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#e8e8ec',
    borderRadius: 8,
  },
  iconTxt: { fontSize: 14, color: '#111' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  empty: { fontSize: 13, color: '#999', paddingHorizontal: 4, paddingVertical: 8 },
  bubbleWrap: { maxWidth: '92%', marginBottom: 8 },
  speaker: { fontSize: 11, color: '#0a84ff', marginBottom: 3, fontWeight: '600' },
  bubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  bubbleUser: { backgroundColor: '#0a84ff' },
  bubbleAssistant: { backgroundColor: '#fff' },
  bubbleError: { backgroundColor: '#ffe9e9' },
  errRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  bubbleTxt: { fontSize: 15, lineHeight: 21, color: '#111' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff8e6',
    borderRadius: 10,
  },
  bannerTxt: { flex: 1, fontSize: 12, color: '#8a6d1f' },
  sysRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  sysTxt: { fontSize: 12, color: '#8e8e93' },
  toolGroup: { marginBottom: 8 },
  toolCard: {
    backgroundColor: '#fff8e6',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  toolHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toolName: { fontSize: 12, fontWeight: '700', color: '#8a6d1f' },
  toolGroupTitle: { fontSize: 12, fontWeight: '600', color: '#6b6b70' },
  toolToggle: { fontSize: 11, color: '#8e8e93' },
  toolBody: {
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
    fontSize: 11,
    color: '#5c5c60',
    marginTop: 5,
    lineHeight: 16,
  },
  inputRow: { flexDirection: 'row', padding: 10, paddingBottom: 10, gap: 8, alignItems: 'flex-end' },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxHeight: 120,
    fontSize: 15,
    color: '#111',
  },
  sendBtn: {
    backgroundColor: '#0a84ff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
