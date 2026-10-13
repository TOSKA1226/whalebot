/**
 * 会话持久化：每个会话 = 一段独立对话（气泡 + 模型消息历史）。
 * 存在 AsyncStorage，重启不丢。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SessionBubble = {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'error' | 'system';
  text: string;
  /** 房间里是谁在说话 */
  speaker?: string;
  /** role === 'tool' 时的结构化信息 */
  tool?: { name: string; args?: any; ok?: boolean; done?: boolean };
};

export type SessionMsg = { role: 'user' | 'assistant' | 'system'; content: string };

export type Session = {
  id: string;
  title: string;
  agentId: string;
  createdAt: number;
  updatedAt: number;
  bubbles: SessionBubble[];
  messages: SessionMsg[];
};

const KEY = 'whalebot.sessions.v1';

export const newSessionId = () =>
  `s${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

export async function listSessions(): Promise<Session[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const arr: Session[] = raw ? JSON.parse(raw) : [];
    return arr.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function getSession(id: string): Promise<Session | undefined> {
  return (await listSessions()).find((s) => s.id === id);
}

/** 写入或更新一个会话（整体覆盖） */
export async function upsertSession(s: Session): Promise<void> {
  const arr = await listSessions();
  const idx = arr.findIndex((x) => x.id === s.id);
  if (idx >= 0) arr[idx] = s;
  else arr.unshift(s);
  // 只保留最近 50 个，避免无限增长
  const trimmed = arr.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50);
  await AsyncStorage.setItem(KEY, JSON.stringify(trimmed));
}

export async function removeSession(id: string): Promise<void> {
  const arr = await listSessions();
  await AsyncStorage.setItem(KEY, JSON.stringify(arr.filter((s) => s.id !== id)));
}

export async function clearAllSessions(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

/** 会话标题：取第一条用户消息的前 24 个字 */
export function titleFrom(text: string, fallback: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return fallback;
  return t.length > 24 ? `${t.slice(0, 24)}…` : t;
}
