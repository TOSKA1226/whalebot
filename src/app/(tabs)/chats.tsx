import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../app-state';
import { Btn, Header, Row } from '../../ui';

export default function ChatsTab() {
  const { t, sessions, openSession, deleteSession, newChat, agents } = useApp();
  const [q, setQ] = useState('');

  const kw = q.trim().toLowerCase();
  const shown = kw
    ? sessions.filter((sess) => {
        const hay = `${sess.title} ${(sess.messages ?? [])
          .slice(-6)
          .map((m) => m.content ?? '')
          .join(' ')}`.toLowerCase();
        return hay.includes(kw);
      })
    : sessions;

  const startNew = async () => {
    await newChat();
    router.push('/chat');
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <Header
        title={t('chats.title')}
        subtitle={t('chats.count', { n: sessions.length })}
        right={<Btn label={t('chats.new')} onPress={startNew} />}
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

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f7' },
  empty: { fontSize: 13, color: '#999', paddingVertical: 8 },
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
});
