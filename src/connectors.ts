/**
 * 连接器：给「外部服务」配一份长期凭据 + 地址。
 * 模型只能通过 connector_request 发起调用，**凭据由 App 从凭据库取出、经容器注入**，
 * 永远不会出现在模型的上下文里（比 credential_get 更安全，也是 Grok Bot 那种做法）。
 */
export type ConnectorAuth = 'none' | 'bearer' | 'header' | 'query';

export type Connector = {
  id: string;
  /** 引用名：模型用它来指定调哪个连接器，例如 github */
  name: string;
  /** 给人看的说明 */
  label?: string;
  /** 基础地址，例如 https://api.github.com */
  baseUrl: string;
  auth: ConnectorAuth;
  /** 绑定的凭据引用名（vault 里的名字） */
  credential?: string;
  /** auth=header / query 时的字段名，例如 X-API-Key / api_key */
  fieldName?: string;
  /** 每次请求都带的固定头 */
  headers?: Record<string, string>;
  note?: string;
  createdAt: number;
};

export const newConnectorId = () =>
  `n${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

export const normalizeConnectorName = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, '_');

/** 常见连接器模板（点一下就填好地址和认证方式） */
export const CONNECTOR_PRESETS: {
  name: string;
  label: string;
  baseUrl: string;
  auth: ConnectorAuth;
  fieldName?: string;
  credential: string;
  note: string;
}[] = [
  {
    name: 'github',
    label: 'GitHub API',
    baseUrl: 'https://api.github.com',
    auth: 'bearer',
    credential: 'github_token',
    note: '需要一个 repo 权限的 token；示例：GET /user 或 /repos/{owner}/{repo}/issues',
  },
  {
    name: 'openai',
    label: 'OpenAI 兼容 API',
    baseUrl: 'https://api.openai.com/v1',
    auth: 'bearer',
    credential: 'openai_key',
    note: '示例：POST /chat/completions',
  },
  {
    name: 'notion',
    label: 'Notion API',
    baseUrl: 'https://api.notion.com/v1',
    auth: 'bearer',
    credential: 'notion_token',
    note: 'Notion 需要额外的 Notion-Version 头，在「固定请求头」里加',
  },
  {
    name: 'custom',
    label: '自定义（自建服务）',
    baseUrl: '',
    auth: 'header',
    fieldName: 'X-API-Key',
    credential: '',
    note: '填你自己的地址；认证方式可选 Bearer / 自定义头 / URL 参数',
  },
];

/** 拼请求地址：baseUrl + path + query */
export function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): string {
  const base = (baseUrl || '').replace(/\/+$/, '');
  const p = (path || '').startsWith('/') ? path : `/${path || ''}`;
  const qs = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${base}${path ? p : ''}${qs ? `?${qs}` : ''}`;
}

/** 把响应里的密钥抹掉（万一服务器把 key 回显了） */
export function redact(text: string, secret: string): string {
  if (!text || !secret) return text;
  return text.split(secret).join('***');
}
