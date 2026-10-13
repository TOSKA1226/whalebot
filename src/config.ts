import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Lang } from './i18n';
import { getSecret, setSecret } from './secrets';

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
const SECRET_API_KEY = 'whalebot.apikey';
const SECRET_EXEC_TOKEN = 'whalebot.exectoken';

export async function loadConfig(): Promise<Config> {
  let base: Config = { ...DEFAULT_CONFIG };
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) base = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    // 用默认值
  }
  // 密钥优先取自加密存储（并兼容老版本留在明文里的值）
  const [apiKey, execToken] = await Promise.all([
    getSecret(SECRET_API_KEY),
    getSecret(SECRET_EXEC_TOKEN),
  ]);
  return {
    ...base,
    apiKey: apiKey || base.apiKey || '',
    execToken: execToken || base.execToken,
  };
}

export async function saveConfig(c: Config): Promise<void> {
  // 密钥不进明文存储
  const { apiKey, execToken, ...rest } = c;
  await AsyncStorage.setItem(KEY, JSON.stringify({ ...rest, apiKey: '', execToken: '' }));
  await Promise.all([setSecret(SECRET_API_KEY, apiKey), setSecret(SECRET_EXEC_TOKEN, execToken)]);
}
