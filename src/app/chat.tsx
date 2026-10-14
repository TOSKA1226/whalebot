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
import { KeyboardAvoidingView } from '../kav';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, type Bubble } from '../app-state';
import { CollapsibleGroups, useGroups } from '../groupList';
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
    presenceOf,
    sessions,
    currentSessionId,
    currentRoom,
    currentRoomAgents,
    updateRoom,
  } = useApp();
  const [input, setInput] = useState('');
  const [picking, setPicking] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  /** 输入 @ 时的候选助手；null = 不显示候选条 */
  const [mentionQ, setMentionQ] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const kbHeight = useKeyboardVisible();
  const kb = kbHeight > 0;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [bubbles.length, kb]);

  const inRoom = !!currentRoom;
  const roster = inRoom ? currentRoomAgents : agents.filter((a) => a.id === activeAgentId);
  const main = inRoom
    ? currentRoomAgents.find((a) => a.id === currentRoom?.leaderId)
    : agents.find((a) => a.id === activeAgentId);
  const sessionTitle = sessions.find((x) => x.id === currentSessionId)?.title;
  const modelName = main?.model?.trim() || cfg.model;
  const mainPresence = presenceOf(main?.id ?? activeAgentId);
  const groups = useGroups(agents, t('agents.ungrouped'));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (currentRoom) setRoomName(currentRoom.name);
  }, [currentRoom]);

  const candidates = useMemo(() => {
    if (mentionQ === null) return [];
    const q = mentionQ.trim().toLowerCase();
    return roster.filter((a) => !q || a.name.toLowerCase().includes(q));
  }, [mentionQ, roster]);

  const onChangeText = (v: string) => {
    setInput(v);
    if (!inRoom) return;
    const m = /@([^\s@]*)$/.exec(v);
    setMentionQ(m ? m[1] : null);
  };

  const insertMention = (name: string) => {
    setInput((prev) => prev.replace(/@([^\s@]*)$/, `@${name} `));
    setMentionQ(null);
  };

  const onSend = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setMentionQ(null);
    await send(text);
  };

  const toggleMember = async (id: string) => {
    if (!currentRoom) return;
    if (id === currentRoom.leaderId) return; // 组长不能移除，换组长用左边的星标
    const joined = currentRoom.memberIds.includes(id);
    const next = joined
      ? currentRoom.memberIds.filter((x) => x !== id)
      : [...currentRoom.memberIds, id];
    await updateRoom(currentRoom.id, { memberIds: next });
  };

  const setLeader = async (id: string) => {
    if (!currentRoom || id === currentRoom.leaderId) return;
    await updateRoom(currentRoom.id, {
      leaderId: id,
      memberIds: currentRoom.memberIds.filter((x) => x !== id),
    });
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
          // 同一个助手的连续工具调用才并成一组（群聊里换人说话就断开）
          if (last && last.kind === 'tools' && last.list[last.list.length - 1].speaker === b.speaker) {
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
      {/* edge-to-edge 下用自研 KAV（按键盘上沿的屏幕坐标算抬升量） */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
            <Ionicons name="chevron-back" size={18} color="#111" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={s.titleRow}>
              {inRoom ? (
                <Ionicons name="people" size={16} color="#0a84ff" />
              ) : (
                <Dot state={mainPresence} />
              )}
              <Text style={s.title}>{inRoom ? currentRoom?.name : (main?.name ?? t('chat.title'))}</Text>
            </View>
            <Text style={s.sub} numberOfLines={1}>
              {sessionTitle ? `${sessionTitle} · ` : ''}
              {inRoom
                ? `${t('room.leaderTag')} ${main?.name ?? '—'} · ${t('room.memberCount', {
                    n: roster.length,
                  })}`
                : `${t(`presence.${mainPresence}` as 'presence.online')} · ${modelName}`}
            </Text>
          </View>
          {inRoom ? (
            <TouchableOpacity onPress={() => setPicking(true)} style={s.iconBtn}>
              <Ionicons name="settings-outline" size={16} color="#111" />
            </TouchableOpacity>
          ) : null}
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

        {inRoom ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ maxHeight: 40, flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 12, gap: 8, alignItems: 'center' }}
          >
            {roster.map((a) => {
              const isLeader = a.id === currentRoom?.leaderId;
              return (
                <View key={a.id} style={[s.chip, isLeader && s.chipLeader]}>
                  {isLeader ? (
                    <Ionicons name="star" size={11} color="#f5a623" />
                  ) : (
                    <Dot state={presenceOf(a.id)} size={8} />
                  )}
                  <Text style={[s.chipTxt, isLeader && { color: '#8a6d1f', fontWeight: '600' }]}>
                    {a.name}
                  </Text>
                </View>
              );
            })}
            <TouchableOpacity style={[s.chip, s.chipAdd]} onPress={() => setPicking(true)}>
              <Ionicons name="add" size={13} color="#0a84ff" />
              <Text style={s.chipAddTxt}>{t('room.addMember')}</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : null}

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          {onlyGreeting ? (
            <Text style={s.empty}>{inRoom ? t('room.hintGroup') : t('chat.empty')}</Text>
          ) : null}
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
              <RowBubble key={it.key} b={it.b} t={t} />
            ),
          )}
          {busy ? (
            <View style={s.working}>
              <ActivityIndicator size="small" />
              <Text style={s.workingTxt}>
                {inRoom && main ? t('orchestra.working', { name: main.name }) : ''}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={[s.inputWrap, { paddingBottom: kb ? 8 : Math.max(insets.bottom, 10) }]}>
          {/* @ 候选：输入 @ 或点左下角 @ 按钮都会弹出来 */}
          {mentionQ !== null ? (
            <View style={s.mentionBox}>
              {candidates.length === 0 ? (
                <Text style={s.mentionEmpty}>{t('mention.empty')}</Text>
              ) : (
                candidates.map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    style={s.mentionRow}
                    onPress={() => insertMention(a.name)}
                  >
                    <Dot state={presenceOf(a.id)} size={8} />
                    <Text style={s.mentionName}>{a.name}</Text>
                    {a.id === currentRoom?.leaderId ? (
                      <Ionicons name="star" size={11} color="#f5a623" />
                    ) : null}
                    {a.description ? (
                      <Text style={s.mentionDesc} numberOfLines={1}>
                        {a.description}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                ))
              )}
            </View>
          ) : null}
          <View style={s.inputRow}>
            {inRoom ? (
              <TouchableOpacity
                style={s.atBtn}
                onPress={() => {
                  setInput((prev) => `${prev}@`);
                  setMentionQ('');
                }}
              >
                <Ionicons name="at" size={18} color="#0a84ff" />
              </TouchableOpacity>
            ) : null}
            <TextInput
              style={s.input}
              value={input}
              onChangeText={onChangeText}
              placeholder={inRoom ? t('chat.roomHint') : t('input.placeholder')}
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
        </View>
      </KeyboardAvoidingView>

      {/* 群设置：改名 / 换组长 / 加减成员 */}
      <Modal visible={picking} animationType="slide" onRequestClose={() => setPicking(false)}>
        <SafeAreaView style={s.root} edges={['top', 'left', 'right', 'bottom']}>
          <View style={s.header}>
            <Text style={s.title}>{currentRoom?.name ?? t('room.group')}</Text>
            <View style={{ flex: 1 }} />
            <Btn label={t('room.done')} onPress={() => setPicking(false)} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <Text style={s.label}>{t('room.nameLabel')}</Text>
            <TextInput
              style={s.input2}
              value={roomName}
              onChangeText={setRoomName}
              onBlur={() => {
                if (currentRoom && roomName.trim() && roomName !== currentRoom.name) {
                  void updateRoom(currentRoom.id, { name: roomName.trim() });
                }
              }}
              placeholder={t('room.namePlaceholder')}
              placeholderTextColor="#9a9a9e"
            />
            <Text style={s.label}>{t('room.leaderLabel')}</Text>
            <View style={s.leaderBox}>
              <Ionicons name="star" size={16} color="#f5a623" />
              <Text style={s.leaderTxt}>{main?.name ?? '—'}</Text>
            </View>
            <Text style={s.hint}>{t('room.leaderHint')}</Text>
            <Text style={s.hint}>{t('room.pickMembers')}</Text>
            <CollapsibleGroups
              groups={groups}
              toggleLabels={{ expand: t('agents.expandAll'), collapse: t('agents.collapseAll') }}
              defaultOpen={() => true}
              renderItem={(a) => {
                const isLeader = a.id === currentRoom?.leaderId;
                const joined = isLeader || !!currentRoom?.memberIds.includes(a.id);
                return (
                  <View style={s.pickRow}>
                    <TouchableOpacity
                      style={s.pickMain}
                      activeOpacity={0.7}
                      onPress={() => void toggleMember(a.id)}
                    >
                      <Ionicons
                        name={joined ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={joined ? '#0a84ff' : '#c7c7cc'}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={s.pickName}>
                          {a.name}
                          {isLeader ? ` · ${t('room.leaderTag')}` : ''}
                        </Text>
                        {a.description ? (
                          <Text style={s.pickDesc} numberOfLines={1}>
                            {a.description}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={() => void setLeader(a.id)}
                    >
                      <Ionicons
                        name={isLeader ? 'star' : 'star-outline'}
                        size={20}
                        color={isLeader ? '#f5a623' : '#c7c7cc'}
                      />
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

/** 群协作阶段的小标签 */
function PhaseTag({ phase, t }: { phase: Bubble['phase']; t: (k: any) => string }) {
  if (phase === 'plan') {
    return (
      <View style={[s.phase, { backgroundColor: '#e6f0ff' }]}>
        <Text style={[s.phaseTxt, { color: '#0a84ff' }]}>{t('orchestra.plan')}</Text>
      </View>
    );
  }
  if (phase === 'summary') {
    return (
      <View style={[s.phase, { backgroundColor: '#fff3d6' }]}>
        <Text style={[s.phaseTxt, { color: '#8a6d1f' }]}>{t('orchestra.summary')}</Text>
      </View>
    );
  }
  if (phase === 'work') {
    return (
      <View style={[s.phase, { backgroundColor: '#eef7ee' }]}>
        <Text style={[s.phaseTxt, { color: '#2f7d32' }]}>{t('orchestra.work')}</Text>
      </View>
    );
  }
  return null;
}

/** 普通气泡（用户/助手/工具/错误/系统） */
function RowBubble({ b, t }: { b: Bubble; t: (k: any) => string }) {
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
  const mine = b.role === 'user';
  const tint =
    b.phase === 'plan' ? s.bubblePlan : b.phase === 'summary' ? s.bubbleSummary : null;
  return (
    <View style={[s.bubbleWrap, mine ? { alignItems: 'flex-end' } : null]}>
      {!mine && (b.speaker || b.phase) ? (
        <View style={s.metaRow}>
          {b.speaker ? <Text style={s.speaker}>{b.speaker}</Text> : null}
          <PhaseTag phase={b.phase} t={t} />
        </View>
      ) : null}
      <View style={[s.bubble, mine ? s.bubbleUser : s.bubbleAssistant, tint]}>
        <Text style={[s.bubbleTxt, mine && { color: '#fff' }]}>{b.text}</Text>
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
        <Text style={s.toolName}>
          {b.speaker ? `${b.speaker} · ` : ''}
          {b.tool?.name ?? 'tool'}
        </Text>
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
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#e2e2e7',
  },
  chipLeader: { backgroundColor: '#fff8e6', borderColor: '#f0dca8' },
  chipTxt: { fontSize: 12, color: '#333' },
  chipAdd: { borderStyle: 'dashed' },
  chipAddTxt: { fontSize: 12, color: '#0a84ff' },
  label: { fontSize: 12, color: '#555', marginBottom: 6, marginTop: 12 },
  input2: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
  },
  leaderBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff8e6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  leaderTxt: { fontSize: 15, color: '#8a6d1f', fontWeight: '600' },
  hint: { fontSize: 11, color: '#999', marginTop: 8, lineHeight: 16 },
  empty: { fontSize: 13, color: '#999', paddingHorizontal: 4, paddingVertical: 8, lineHeight: 19 },
  bubbleWrap: { maxWidth: '92%', marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  speaker: { fontSize: 11, color: '#0a84ff', fontWeight: '600' },
  phase: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  phaseTxt: { fontSize: 10, fontWeight: '600' },
  bubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  bubbleUser: { backgroundColor: '#0a84ff' },
  bubbleAssistant: { backgroundColor: '#fff' },
  bubblePlan: { backgroundColor: '#f2f8ff', borderWidth: 1, borderColor: '#cfe4ff' },
  bubbleSummary: { backgroundColor: '#fffaf0', borderWidth: 1, borderColor: '#f0dca8' },
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
    alignItems: 'flex-start',
    gap: 5,
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    maxWidth: '92%',
  },
  sysTxt: { flex: 1, fontSize: 12, color: '#8e8e93', lineHeight: 17 },
  working: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  workingTxt: { fontSize: 12, color: '#8e8e93' },
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
  inputWrap: { paddingHorizontal: 10, paddingTop: 6 },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  atBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#e6f0ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  mentionBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 4,
    marginBottom: 6,
    maxHeight: 190,
    borderWidth: 1,
    borderColor: '#e2e2e7',
  },
  mentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  mentionName: { fontSize: 14, fontWeight: '600', color: '#111' },
  mentionDesc: { flex: 1, fontSize: 11, color: '#9a9a9e' },
  mentionEmpty: { fontSize: 12, color: '#999', paddingHorizontal: 12, paddingVertical: 10 },
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
  pickMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pickName: { fontSize: 15, fontWeight: '600' },
  pickDesc: { fontSize: 12, color: '#999', marginTop: 2 },
});
