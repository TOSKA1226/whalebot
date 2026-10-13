import { Tabs } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { useApp } from '../../app-state';

const HomeIcon = ({ color }: { color: any }) => <Text style={[g.icon, { color }]}>🏠</Text>;
const ChatsIcon = ({ color }: { color: any }) => <Text style={[g.icon, { color }]}>💬</Text>;
const AgentsIcon = ({ color }: { color: any }) => <Text style={[g.icon, { color }]}>🤖</Text>;
const SettingsIcon = ({ color }: { color: any }) => <Text style={[g.icon, { color }]}>⚙️</Text>;

export default function TabsLayout() {
  const { t } = useApp();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0a84ff',
        tabBarInactiveTintColor: '#8e8e93',
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tab.home'), tabBarIcon: HomeIcon }}
      />
      <Tabs.Screen
        name="chats"
        options={{ title: t('tab.chats'), tabBarIcon: ChatsIcon }}
      />
      <Tabs.Screen
        name="agents"
        options={{ title: t('tab.agents'), tabBarIcon: AgentsIcon }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: t('tab.settings'), tabBarIcon: SettingsIcon }}
      />
    </Tabs>
  );
}

const g = StyleSheet.create({ icon: { fontSize: 18 } });
