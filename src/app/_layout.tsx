import * as NavBar from 'expo-navigation-bar';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../app-state';
import { diag, installErrorReport } from '../diag';

installErrorReport();
diag('boot', 'bundle start');

/** 界面渲染错误兜底：显示出来并上报，避免直接白屏退出 */
class Boundary extends React.Component<{ children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };

  static getDerivedStateFromError(err: Error) {
    return { err };
  }

  componentDidCatch(err: Error, info: { componentStack?: string | null }) {
    diag('render-error', {
      message: err?.message,
      stack: `${err?.stack ?? ''}\n--- componentStack ---${info?.componentStack ?? ''}`,
    });
  }

  render() {
    if (this.state.err) {
      return (
        <ScrollView style={b.root} contentContainerStyle={{ padding: 20 }}>
          <Text style={b.title}>界面出错了（已上报）</Text>
          <Text style={b.msg}>{String(this.state.err?.message ?? this.state.err)}</Text>
          <Text style={b.stack}>{String(this.state.err?.stack ?? '').slice(0, 1500)}</Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

const b = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 17, fontWeight: '700', color: '#ff3b30', marginBottom: 10 },
  msg: { fontSize: 14, color: '#111', marginBottom: 12 },
  stack: { fontSize: 11, color: '#666', fontFamily: 'monospace' },
});

export default function RootLayout() {
  /**
   * 隐藏系统导航栏（沉浸式）：原本它压在聊天输入框上，用户明确要求启动后就藏起来。
   * 隐藏后底部 inset 变 0，聊天页那套「键盘顶起」的计算才准。
   */
  useEffect(() => {
    diag('boot', 'root layout mounted');
    if (Platform.OS !== 'android') return;
    NavBar.setVisibilityAsync('hidden').catch(() => {});
  }, []);

  return (
    <Boundary>
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
    </Boundary>
  );
}
