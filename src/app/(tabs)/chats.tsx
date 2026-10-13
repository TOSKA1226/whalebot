import { router } from 'expo-router';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../app-state';
import { Header, Row } from '../../ui';

export default function ChatsTab() {
  const { t, bubbles, data } = useApp();

  const last = [...bubbles].reverse().find((b) => b.role !== 'system' && b.role !== 'tool');
  const preview = last ? last.text.slice(0, 60) : t('chat.empty');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f5f5f7' }} edges={['top', 'left', 'right']}>
      <Header title={t('chats.title')} subtitle={`例程 ${data.routines.length}`} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Row
          title={t('chats.untitled')}
          desc={preview}
          right={<HeaderRightHint />}
          onPress={() => router.push('/chat')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function HeaderRightHint() {
  return null;
}
