import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../app-state';
import { Btn, Header, Row } from '../../ui';

export default function ChatsTab() {
  const { t, sessions, openSession, deleteSession, newChat, agents } = useApp();

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
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {sessions.length === 0 ? <Text style={s.empty}>{t('chats.empty')}</Text> : null}
        {sessions.map((sess) => {
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
});
