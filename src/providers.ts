/**
 * 模型供应商：一个供应商 = 一个接口地址 + 一把 Key + 一份默认模型清单。
 * 助手的接口来源按这个顺序解析：
 *   助手自己指定的供应商 → 所属分组绑定的供应商 → 全局设置（设置页那一套）
 * 这样同一组的助手可以共用一把 Key，不用一个个绑。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Provider = {
  id: string;
  name: string;
  /** 接口地址，例如 https://api.deepseek.com（代码会自己拼 /chat/completions） */
  baseUrl: string;
  /** 默认模型 */
  model: string;
  /** 这一家的模型支持图片输入吗（多模态） */
  vision?: boolean;
  note?: string;
  createdAt: number;
};

const KEY = 'whalebot.providers.v1';

/** Key 存放位置（SecureStore）：provider.<id> */
export const providerSecret = (id: string) => `provider.${id}`;

/** 内置的 DeepSeek 官方；没单独填 Key 时会自动用「设置」里的全局 Key */
export const BUILTIN_ID = 'deepseek';

export const newProviderId = () =>
  `p${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

const SEED: Provider[] = [
  {
    id: BUILTIN_ID,
    name: 'DeepSeek 官方',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    note: '内置；没单独填 Key 就用「设置」里的全局 Key',
    createdAt: 0,
  },
];

/** 常见第三方（新建时点一下就把地址和模型填好，只需要再粘一把 Key） */
export const PRESETS: { name: string; baseUrl: string; model: string; note: string }[] = [
  {
    name: 'DeepSeek 官方',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    note: 'deepseek-chat / deepseek-reasoner',
  },
  {
    name: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3',
    note: '国内聚合，模型多、有免费额度',
  },
  {
    name: '月之暗面 Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    note: '长文本见长',
  },
  {
    name: '阿里通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    note: 'OpenAI 兼容模式',
  },
  {
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-plus',
    note: '国内可用',
  },
  {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    note: '一个 Key 调很多家模型',
  },
  {
    name: '自定义（OpenAI 兼容）',
    baseUrl: '',
    model: '',
    note: '任何 OpenAI 兼容接口：填地址 + 模型名即可',
  },
];

export async function listProviders(): Promise<Provider[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const arr: Provider[] = raw ? JSON.parse(raw) : [];
    return arr.length ? arr : [...SEED];
  } catch {
    return [...SEED];
  }
}

/** 首次运行确保至少有内置的 DeepSeek 官方 */
export async function ensureProviders(): Promise<Provider[]> {
  const items = await listProviders();
  if (!items.some((p) => p.id === BUILTIN_ID)) {
    const merged = [...SEED, ...items];
    await AsyncStorage.setItem(KEY, JSON.stringify(merged));
    return merged;
  }
  if (!(await AsyncStorage.getItem(KEY))) {
    await AsyncStorage.setItem(KEY, JSON.stringify(items));
  }
  return items;
}

export async function getProvider(id: string): Promise<Provider | undefined> {
  return (await listProviders()).find((p) => p.id === id);
}

export async function upsertProvider(input: {
  id?: string;
  name: string;
  baseUrl: string;
  model: string;
  note?: string;
  vision?: boolean;
}): Promise<Provider> {
  const items = await listProviders();
  const idx = input.id ? items.findIndex((p) => p.id === input.id) : -1;
  if (idx >= 0) {
    const merged: Provider = {
      ...items[idx],
      name: input.name.trim() || items[idx].name,
      baseUrl: input.baseUrl.trim(),
      model: input.model.trim(),
      note: input.note ?? items[idx].note,
      vision: input.vision ?? items[idx].vision,
    };
    items[idx] = merged;
    await AsyncStorage.setItem(KEY, JSON.stringify(items));
    return merged;
  }
  const p: Provider = {
    id: newProviderId(),
    name: input.name.trim() || '新供应商',
    baseUrl: input.baseUrl.trim(),
    model: input.model.trim(),
    note: input.note,
    vision: input.vision,
    createdAt: Date.now(),
  };
  items.push(p);
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
  return p;
}

export async function removeProvider(id: string): Promise<void> {
  if (id === BUILTIN_ID) return;
  const items = await listProviders();
  await AsyncStorage.setItem(KEY, JSON.stringify(items.filter((p) => p.id !== id)));
}
