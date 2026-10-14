import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Lang } from './i18n';
import type { McpServer } from './mcp';
import { getSecret, setSecret } from './secrets';

/** 首页快捷指令（用户自定义；旧的三个写死的测试入口已移除） */
export type QuickAction = {
  id: string;
  /** 首页显示的文字 */
  label: string;
  /** 点一下发给助手的内容 */
  prompt: string;
};

/** 聊天里工具调用气泡的显示方式 */
export type ToolDisplay = 'show' | 'collapse' | 'hide';

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
  /** 工具调用气泡怎么显示 */
  toolDisplay: ToolDisplay;
  /** 首页快捷指令 */
  quickActions: QuickAction[];
  /** 高风险工具先由便宜模型复核意图 */
  reviewEnabled: boolean;
  /** 复核用的模型；留空则用当前助手的模型 */
  reviewModel: string;
  /** 外接 MCP 服务器 */
  mcpServers: McpServer[];
  /** 每个分组绑定的模型供应商 id：组内助手共用这一把 Key */
  groupProviders: Record<string, string>;
  /** 每个分组手动指定的色系（助手头像用） */
  groupColors: Record<string, string>;
  /** 永久工具权限规则：agentId（或 '*'）→ 工具名 → allow/deny */
  permRules: Record<string, Record<string, 'allow' | 'deny'>>;
  /** 要不要限制单轮 token 用量 */
  tokenLimitEnabled: boolean;
  /** 单轮 token 上限（tokenLimitEnabled 为 true 时生效） */
  tokenLimit: number;
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
  toolDisplay: 'show',
  quickActions: [],
  reviewEnabled: false,
  reviewModel: '',
  mcpServers: [],
  groupProviders: {},
  groupColors: {},
  permRules: {},
  tokenLimitEnabled: true,
  tokenLimit: 200000,
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
    quickActions: Array.isArray(base.quickActions) ? base.quickActions : [],
    mcpServers: Array.isArray(base.mcpServers) ? base.mcpServers : [],
    groupProviders:
      base.groupProviders && typeof base.groupProviders === 'object' ? base.groupProviders : {},
    groupColors:
      base.groupColors && typeof base.groupColors === 'object' ? base.groupColors : {},
    permRules: base.permRules && typeof base.permRules === 'object' ? base.permRules : {},
    toolDisplay: base.toolDisplay ?? 'show',
    tokenLimitEnabled: base.tokenLimitEnabled !== false,
    tokenLimit:
      Number.isFinite(Number(base.tokenLimit)) && Number(base.tokenLimit) > 0
        ? Number(base.tokenLimit)
        : DEFAULT_CONFIG.tokenLimit,
  };
}

export async function saveConfig(c: Config): Promise<void> {
  // 密钥不进明文存储
  const { apiKey, execToken, ...rest } = c;
  await AsyncStorage.setItem(KEY, JSON.stringify({ ...rest, apiKey: '', execToken: '' }));
  await Promise.all([setSecret(SECRET_API_KEY, apiKey), setSecret(SECRET_EXEC_TOKEN, execToken)]);
}
