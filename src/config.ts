import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Lang } from './i18n';

export type Config = {
  apiKey: string;
  baseUrl: string;
  model: string;
  execUrl: string;
  execToken: string;
  lang: Lang;
  /** 当前使用的助手 id */
  activeAgentId: string;
  /** 房间参与者（含主答）；空数组表示只有主答一人 */
  roomAgentIds: string[];
};

export const DEFAULT_CONFIG: Config = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  execUrl: 'http://127.0.0.1:8770',
  execToken: 'whalebot-m1',
  lang: 'zh-Hans',
  activeAgentId: 'default',
  roomAgentIds: [],
};

const KEY = 'whalebot.config.v2';

export async function loadConfig(): Promise<Config> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(c: Config): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(c));
}
