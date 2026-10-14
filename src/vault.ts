/**
 * 凭据库：集中保管 API Key / 网站密码 / token。
 * 值放 SecureStore（Android Keystore），元数据放 AsyncStorage；
 * 模型只能通过 credential_get 取用，而且要过审批 —— 不再把密码写进对话或提示词。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSecret, setSecret } from './secrets';

export type Credential = {
  id: string;
  /** 引用名：模型用它来取，例如 github_token */
  name: string;
  /** 给人看的说明，例如「GitHub 只读 token」 */
  label?: string;
  createdAt: number;
  lastUsedAt?: number;
  usedCount?: number;
};

const KEY = 'whalebot.vault.v1';

export const secretName = (id: string) => `vault.${id}`;
export const newCredentialId = () =>
  `c${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

/** 名字统一成小写短名，避免模型写法不一致取不到 */
export const normalizeName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, '_');

export async function listCredentials(): Promise<Credential[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const arr: Credential[] = raw ? JSON.parse(raw) : [];
    return arr.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function upsertCredential(input: {
  id?: string;
  name: string;
  label?: string;
  /** 留空 = 只改名字/说明，不动已存的值 */
  value?: string;
}): Promise<Credential> {
  const items = await listCredentials();
  const name = normalizeName(input.name);
  const idx = input.id ? items.findIndex((c) => c.id === input.id) : -1;
  if (idx >= 0) {
    const merged: Credential = {
      ...items[idx],
      name: name || items[idx].name,
      label: input.label ?? items[idx].label,
    };
    items[idx] = merged;
    await AsyncStorage.setItem(KEY, JSON.stringify(items));
    if (input.value) await setSecret(secretName(merged.id), input.value);
    return merged;
  }
  const c: Credential = {
    id: newCredentialId(),
    name: name || 'credential',
    label: input.label?.trim(),
    createdAt: Date.now(),
  };
  items.push(c);
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
  if (input.value) await setSecret(secretName(c.id), input.value);
  return c;
}

export async function removeCredential(id: string): Promise<void> {
  const items = await listCredentials();
  await AsyncStorage.setItem(KEY, JSON.stringify(items.filter((c) => c.id !== id)));
  await setSecret(secretName(id), '');
}

export async function findCredential(name: string): Promise<Credential | undefined> {
  const n = normalizeName(name);
  const items = await listCredentials();
  return items.find((c) => c.name === n) ?? items.find((c) => c.name.includes(n));
}

/** 取明文值（只在工具执行时调用） */
export async function credentialValue(id: string): Promise<string> {
  return getSecret(secretName(id));
}

export async function touchCredential(id: string): Promise<void> {
  const items = await listCredentials();
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify(
      items.map((c) =>
        c.id === id ? { ...c, lastUsedAt: Date.now(), usedCount: (c.usedCount ?? 0) + 1 } : c,
      ),
    ),
  );
}
