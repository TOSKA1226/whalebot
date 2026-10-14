/**
 * 运行日志：每「一个助手说一轮话」记一条，用来复盘（尤其群协作一轮会调 N+2 次模型）。
 * 只留最近 200 条，存在 AsyncStorage。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type RunTool = { name: string; ok?: boolean; ms?: number };

export type RunLog = {
  id: string;
  at: number;
  agentId: string;
  agentName?: string;
  /** 这一轮在干什么：单聊 / 点名 / 组长派发 / 成员干活 / 组长总结 */
  phase?: string;
  model: string;
  provider?: string;
  ms: number;
  tokens?: number;
  tools: RunTool[];
  /** 结果摘要（前 200 字） */
  text: string;
  error?: string;
  /** 后台任务里跑的（App 没开） */
  background?: boolean;
};

const KEY = 'whalebot.runs.v1';
const MAX = 200;

export async function listRuns(): Promise<RunLog[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const arr: RunLog[] = raw ? JSON.parse(raw) : [];
    return arr.sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

export async function addRun(log: RunLog): Promise<void> {
  try {
    const arr = await listRuns();
    arr.unshift(log);
    await AsyncStorage.setItem(KEY, JSON.stringify(arr.slice(0, MAX)));
  } catch {
    // 日志写不进去不影响主流程
  }
}

export async function clearRuns(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

export const newRunId = () => `run${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
