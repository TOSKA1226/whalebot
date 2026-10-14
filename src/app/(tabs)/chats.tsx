import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../app-state';
import { CollapsibleGroups, useGroups } from '../../groupList';
import { Btn, Header, Row, SectionTitle } from '../../ui';

export default function ChatsTab() {
  const {
    t,
    sessions,
    openSession,
    deleteSession,
    agents,
    roomList,
    openRoom,
    deleteRoom,
    createRoom,
    switchAgent,
  } = useApp();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);

  const kw = q.trim().toLowerCase();
  const plain = sessions.filter((s) => !s.roomId);
  const shown = kw
    ? plain.filter((sess) => {
        const hay = `${sess.title} ${(sess.messages ?? [])
          .slice(-6)
          .map((m) => m.content ?? '')
          .join(' ')}`.toLowerCase();
        return hay.includes(kw);
      })
    : plain;
  const rooms = kw ? roomList.filter((r) => r.name.toLowerCase().includes(kw)) : roomList;

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <Header
        title={t('chats.title')}
        subtitle={t('chats.count', { n: plain.length + roomList.length })}
        right={
          <TouchableOpacity style={s.addBtn} onPress={() => setCreating(true)}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        }
      />
      <View style={s.searchWrap}>
        <Ionicons name="search" size={15} color="#9a9a9e" />
        <TextInput
          style={s.search}
          value={q}
          onChangeText={setQ}
          placeholder={t('chats.search')}
          placeholderTextColor="#9a9a9e"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {q ? (
          <TouchableOpacity onPress={() => setQ('')}>
            <Ionicons name="close-circle" size={16} color="#c7c7cc" />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <SectionTitle>{t('room.grouplist')}</SectionTitle>
        {rooms.length === 0 ? (
          <Text style={s.empty}>{t('room.none')}</Text>
        ) : (
          rooms.map((r) => {
            const leader = agents.find((a) => a.id === r.leaderId)?.name ?? r.leaderId;
            const sess = sessions.find((x) => x.roomId === r.id);
            const when = sess ? new Date(sess.updatedAt).toLocaleString() : '';
            return (
              <Row
                key={r.id}
                left={<Ionicons name="people" size={18} color="#0a84ff" />}
                title={r.name}
                desc={`${t('room.leaderTag')} ${leader} · ${t('room.memberCount', {
                  n: r.memberIds.length + 1,
                })}${when ? ` · ${when}` : ''}`}
                right={
                  <TouchableOpacity
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={() =>
                      Alert.alert(t('room.delete'), t('room.deleteConfirm'), [
                        { text: t('agents.cancel'), style: 'cancel' },
                        {
                          text: t('room.delete'),
                          style: 'destructive',
                          onPress: () => deleteRoom(r.id),
                        },
                      ])
                    }
                  >
                    <Ionicons name="trash-outline" size={16} color="#ff3b30" />
                  </TouchableOpacity>
                }
                onPress={async () => {
                  await openRoom(r.id);
                  router.push('/chat');
                }}
              />
            );
          })
        )}

        <SectionTitle>{t('chats.title')}</SectionTitle>
        {shown.length === 0 ? (
          <Text style={s.empty}>{kw ? t('chats.noMatch') : t('chats.empty')}</Text>
        ) : null}
        {shown.map((sess) => {
          const who = agents.find((a) => a.id === sess.agentId)?.name ?? sess.agentId;
          const when = new Date(sess.updatedAt).toLocaleString();
          return (
            <Row
              key={sess.id}
              title={sess.title || t('chats.untitled')}
              desc={`${who} · ${when} · ${sess.bubbles?.length ?? 0} 条`}
              right={
                <TouchableOpacity
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() => deleteSession(sess.id)}
                >
                  <Ionicons name="trash-outline" size={16} color="#ff3b30" />
                </TouchableOpacity>
              }
              onPress={async () => {
                await openSession(sess.id);
                router.push('/chat');
              }}
            />
          );
        })}
        <View style={{ height: 8 }} />
      </ScrollView>

      <NewChatSheet
        visible={creating}
        onClose={() => setCreating(false)}
        onCreateRoom={async (name, leaderId, memberIds) => {
          await createRoom(name, leaderId, memberIds);
          setCreating(false);
          router.push('/chat');
        }}
        onPickAgent={async (id) => {
          setCreating(false);
          await switchAgent(id);
          router.push('/chat');
        }}
      />
    </SafeAreaView>
  );
}

/** 右上角 ➕：单聊 或 新建助手群 */
function NewChatSheet({
  visible,
  onClose,
  onCreateRoom,
  onPickAgent,
}: {
  visible: boolean;
  onClose: () => void;
  onCreateRoom: (name: string, leaderId: string, memberIds: string[]) => Promise<void>;
  onPickAgent: (id: string) => Promise<void>;
}) {
  const { t, agents, activeAgentId } = useApp();
  const [tab, setTab] = useState<'group' | 'single'>('group');
  const [name, setName] = useState('');
  const [leaderId, setLeaderId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [err, setErr] = useState('');

  const groups = useGroups(agents, t('agents.ungrouped'));
  const leader = agents.find((a) => a.id === leaderId);

  const reset = () => {
    setName('');
    setLeaderId('');
    setMemberIds([]);
    setErr('');
  };

  const submit = async () => {
    if (!leaderId) {
      setErr(t('room.needLeader'));
      return;
    }
    if (!memberIds.filter((m) => m !== leaderId).length) {
      setErr(t('room.needMember'));
      return;
    }
    setErr('');
    await onCreateRoom(name.trim() || t('room.group'), leaderId, memberIds);
    reset();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
        <Header
          title={t('room.new')}
          right={<Btn label={t('agents.cancel')} kind="ghost" onPress={onClose} />}
        />
        <View style={s.tabs}>
          {(['group', 'single'] as const).map((k) => (
            <TouchableOpacity
              key={k}
              style={[s.tab, tab === k && s.tabOn]}
              onPress={() => setTab(k)}
            >
              <Text style={[s.tabTxt, tab === k && s.tabTxtOn]}>
                {k === 'group' ? t('room.group') : t('room.single')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {tab === 'group' ? (
            <>
              <Text style={s.label}>{t('room.nameLabel')}</Text>
              <TextInput
                style={s.input}
                value={name}
                onChangeText={setName}
                placeholder={t('room.namePlaceholder')}
                placeholderTextColor="#9a9a9e"
              />
              <Text style={s.label}>{t('room.leaderLabel')}</Text>
              <View style={s.leaderBox}>
                <Ionicons
                  name={leader ? 'star' : 'star-outline'}
                  size={16}
                  color={leader ? '#f5a623' : '#c7c7cc'}
                />
                <Text style={s.leaderTxt}>{leader?.name ?? t('room.pickLeader')}</Text>
              </View>
              <Text style={s.hint}>{t('room.leaderHint')}</Text>
              <Text style={s.hint}>{t('room.pickMembers')}</Text>

              <CollapsibleGroups
                groups={groups}
                toggleLabels={{ expand: t('agents.expandAll'), collapse: t('agents.collapseAll') }}
                defaultOpen={(_g, items) =>
                  items.some((a) => a.id === activeAgentId) || groups.length <= 2
                }
                renderItem={(a) => {
                  const picked = memberIds.includes(a.id);
                  const isLeader = leaderId === a.id;
                  return (
                    <View style={s.pickRow}>
                      <TouchableOpacity
                        style={s.pickMain}
                        activeOpacity={0.7}
                        onPress={() =>
                          setMemberIds((prev) =>
                            prev.includes(a.id)
                              ? prev.filter((x) => x !== a.id)
                              : [...prev, a.id],
                          )
                        }
                      >
                        <Ionicons
                          name={picked ? 'checkmark-circle' : 'ellipse-outline'}
                          size={20}
                          color={picked ? '#0a84ff' : '#c7c7cc'}
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
                        onPress={() => {
                          setLeaderId(a.id);
                          setMemberIds((prev) =>
                            prev.includes(a.id) ? prev : [...prev, a.id],
                          );
                        }}
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

              {err ? <Text style={s.err}>{err}</Text> : null}
              <Btn label={t('room.create')} onPress={submit} style={{ marginTop: 16 }} />
            </>
          ) : (
            <>
              <Text style={s.hint}>{t('chats.new')}</Text>
              <CollapsibleGroups
                groups={groups}
                toggleLabels={{ expand: t('agents.expandAll'), collapse: t('agents.collapseAll') }}
                defaultOpen={(_g, items) =>
                  items.some((a) => a.id === activeAgentId) || groups.length <= 2
                }
                renderItem={(a) => (
                  <Row
                    title={a.name}
                    desc={a.description || a.group}
                    onPress={async () => {
                      onClose();
                      await onPickAgent(a.id);
                    }}
                  />
                )}
              />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f7' },
  empty: { fontSize: 13, color: '#999', paddingVertical: 8 },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0a84ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
  },
  search: { flex: 1, fontSize: 14, color: '#111', paddingVertical: 2 },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#e8e8ec',
    alignItems: 'center',
  },
  tabOn: { backgroundColor: '#0a84ff' },
  tabTxt: { fontSize: 14, fontWeight: '600', color: '#111' },
  tabTxtOn: { color: '#fff' },
  label: { fontSize: 12, color: '#555', marginBottom: 6, marginTop: 10 },
  input: {
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
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  leaderTxt: { fontSize: 15, color: '#111' },
  hint: { fontSize: 11, color: '#999', marginTop: 8, lineHeight: 16 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
    gap: 8,
  },
  pickMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickName: { fontSize: 15, fontWeight: '600', color: '#111' },
  pickDesc: { fontSize: 12, color: '#999', marginTop: 2 },
  err: { fontSize: 12, color: '#ff3b30', marginTop: 10 },
});
