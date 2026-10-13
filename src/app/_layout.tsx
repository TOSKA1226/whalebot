import * as NavBar from 'expo-navigation-bar';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../app-state';

export default function RootLayout() {
  /**
   * 隐藏系统导航栏（沉浸式）：原本它压在聊天输入框上，用户明确要求启动后就藏起来。
   * 隐藏后底部 inset 变 0，聊天页那套「键盘顶起」的计算才准。
   */
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    NavBar.setVisibilityAsync('hidden').catch(() => {});
  }, []);

  return (
    <KeyboardProvider>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {Platform.OS === 'android' ? <NavBar.NavigationBar hidden style="dark" /> : null}
        <AppProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#f5f5f7' },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="chat" options={{ presentation: 'card' }} />
            <Stack.Screen name="quick" />
            <Stack.Screen name="capabilities" />
          </Stack>
        </AppProvider>
      </SafeAreaProvider>
    </KeyboardProvider>
  );
}
