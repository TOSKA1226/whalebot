import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useApp } from '../../app-state';

type IconName = keyof typeof Ionicons.glyphMap;

/** 选中用实心、未选中用描边，风格统一（原来是一堆 emoji） */
const tabIcon = (on: IconName, off: IconName) => {
  const Icon = ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => (
    <Ionicons name={focused ? on : off} size={size ?? 22} color={color} />
  );
  Icon.displayName = `TabIcon(${on})`;
  return Icon;
};

export default function TabsLayout() {
  const { t } = useApp();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0a84ff',
        tabBarInactiveTintColor: '#8e8e93',
        tabBarLabelStyle: { fontSize: 11 },
        tabBarStyle: { paddingTop: 4 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tab.home'), tabBarIcon: tabIcon('home', 'home-outline') }}
      />
      <Tabs.Screen
        name="chats"
        options={{ title: t('tab.chats'), tabBarIcon: tabIcon('chatbubbles', 'chatbubbles-outline') }}
      />
      <Tabs.Screen
        name="agents"
        options={{ title: t('tab.agents'), tabBarIcon: tabIcon('people', 'people-outline') }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: t('tab.settings'), tabBarIcon: tabIcon('settings', 'settings-outline') }}
      />
    </Tabs>
  );
}
