/**
 * 连接器调用（App 侧实现，UI 的「测试」和模型的 connector_request 共用这一份）。
 * 凭据在这里从保险库取出，只在发请求的那一刻存在，不写日志、不进模型上下文。
 */
import { execTool } from './api';
import type { Config } from './config';
import { buildUrl, redact, type Connector } from './connectors';
import * as vault from './vault';

export type ConnectorResult = {
  ok: boolean;
  status?: number;
  text: string;
  error?: string;
  url: string;
};

export async function callConnector(
  cfg: Config,
  c: Connector,
  opts: {
    path?: string;
    method?: string;
    query?: Record<string, any>;
    body?: any;
  } = {},
): Promise<ConnectorResult> {
  const method = (opts.method ?? 'GET').toUpperCase();
  const query: Record<string, any> = { ...(opts.query ?? {}) };

  let secret = '';
  let credId = '';
  if (c.auth !== 'none') {
    if (!c.credential) {
      return { ok: false, text: '', error: `连接器「${c.name}」没有绑定凭据`, url: '' };
    }
    const cred = await vault.findCredential(c.credential);
    if (!cred) {
      return { ok: false, text: '', error: `凭据库里没有「${c.credential}」`, url: '' };
    }
    credId = cred.id;
    secret = await vault.credentialValue(cred.id);
    if (!secret) {
      return { ok: false, text: '', error: `凭据「${cred.name}」还没填值`, url: '' };
    }
  }

  const headers: Record<string, string> = { ...(c.headers ?? {}) };
  if (secret && c.auth === 'bearer') headers.Authorization = `Bearer ${secret}`;
  if (secret && c.auth === 'header') headers[c.fieldName || 'X-API-Key'] = secret;
  if (secret && c.auth === 'query') query[c.fieldName || 'api_key'] = secret;

  const url = buildUrl(c.baseUrl, opts.path ?? '', query);
  if (!/^https?:\/\//.test(url)) {
    return { ok: false, text: '', error: `地址没配好：${url}`, url };
  }

  try {
    const res: any = await execTool(cfg, 'http.fetch', {
      url,
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : opts.body,
    });
    if (credId) await vault.touchCredential(credId);
    const text = redact(String(res?.stdout ?? ''), secret);
    const error = redact(String(res?.stderr ?? ''), secret) || undefined;
    return {
      ok: !!res?.ok,
      status: res?.data?.status,
      text,
      error,
      url: redact(url, secret),
    };
  } catch (e: any) {
    return { ok: false, text: '', error: String(e?.message ?? e), url: redact(url, secret) };
  }
}
