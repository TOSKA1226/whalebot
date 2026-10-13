import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../app-state';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AppProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#f5f5f7' },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="chat" options={{ presentation: 'card' }} />
          <Stack.Screen name="capabilities" />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}
