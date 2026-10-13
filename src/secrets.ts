/**
 * 敏感信息存取：优先用 SecureStore（Android Keystore 支持），
 * 不可用时回落到 AsyncStorage（Expo Go 也支持 SecureStore，这里是双保险）。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

type SecureModule = typeof import('expo-secure-store');

let mod: SecureModule | null = null;
let failed = false;

async function load(): Promise<SecureModule | null> {
  if (mod) return mod;
  if (failed) return null;
  try {
    const m = (await import('expo-secure-store')) as SecureModule;
    if (typeof m?.setItemAsync !== 'function') {
      failed = true;
      return null;
    }
    mod = m;
    return m;
  } catch {
    failed = true;
    return null;
  }
}

const fallbackKey = (k: string) => `whalebot.secret.${k}`;

export async function getSecret(key: string): Promise<string> {
  const m = await load();
  try {
    if (m) {
      const v = await m.getItemAsync(key);
      if (v != null) return v;
    }
  } catch {
    // 继续走回落
  }
  return (await AsyncStorage.getItem(fallbackKey(key))) ?? '';
}

export async function setSecret(key: string, value: string): Promise<void> {
  const m = await load();
  try {
    if (m) {
      if (value) await m.setItemAsync(key, value);
      else await m.deleteItemAsync(key);
      return;
    }
  } catch {
    // 继续走回落
  }
  await AsyncStorage.setItem(fallbackKey(key), value);
}

/** 当前是否真的用上了加密存储 */
export async function secureStoreAvailable(): Promise<boolean> {
  return !!(await load());
}
