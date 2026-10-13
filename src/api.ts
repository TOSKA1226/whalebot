import { fetch as expoFetch } from 'expo/fetch';
import type { Config } from './config';

export type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type Msg = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

export type ChatResult = { text: string; toolCalls: ToolCall[]; usage?: any };

/** 非流式的轻量对话（给"自动复核"这类小判断用，必须便宜、必须快） */
export async function quickChat(cfg: Config, messages: Msg[], maxTokens = 200): Promise<string> {
  const res = await expoFetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      max_tokens: maxTokens,
      temperature: 0,
      stream: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`复核模型 HTTP ${res.status}：${(await res.text()).slice(0, 200)}`);
  }
  const data: any = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

/** 流式对话（DeepSeek OpenAI 兼容接口），逐块回调文本增量。 */
export async function streamChat(
  cfg: Config,
  messages: Msg[],
  tools: any[],
  onDelta: (chunk: string) => void,
): Promise<ChatResult> {
  const res = await expoFetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      tools: tools.length ? tools : undefined,
      tool_choice: tools.length ? 'auto' : undefined,
      stream: true,
      stream_options: { include_usage: true },
      temperature: 1,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`模型接口 HTTP ${res.status}：${body.slice(0, 300)}`);
  }
  if (!res.body) throw new Error('响应没有可读流');

  const reader = (res.body as any).getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  let usage: any;
  const acc: ToolCall[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let json: any;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      if (json?.usage) usage = json.usage;
      const delta = json?.choices?.[0]?.delta;
      if (!delta) continue;
      if (typeof delta.content === 'string' && delta.content) {
        text += delta.content;
        onDelta(delta.content);
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx: number = tc.index ?? 0;
          if (!acc[idx]) {
            acc[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } };
          }
          if (tc.id) acc[idx].id = tc.id;
          if (tc.function?.name) acc[idx].function.name += tc.function.name;
          if (tc.function?.arguments) acc[idx].function.arguments += tc.function.arguments;
        }
      }
    }
  }

  return { text, toolCalls: acc.filter(Boolean), usage };
}

/** 调用容器侧执行服务。 */
export async function execTool(
  cfg: Config,
  capability: string,
  args: Record<string, unknown>,
): Promise<any> {
  const res = await expoFetch(`${cfg.execUrl}/exec`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.execToken}`,
    },
    body: JSON.stringify({ capability, args }),
  });
  if (!res.ok) {
    return { ok: false, stderr: `执行服务 HTTP ${res.status}` };
  }
  return await res.json();
}

export async function execHealth(cfg: Config): Promise<any> {
  const res = await expoFetch(`${cfg.execUrl}/health`, {
    headers: { Authorization: `Bearer ${cfg.execToken}` },
  });
  return await res.json();
}

export type Capability = {
  name: string;
  risk: 'low' | 'medium' | 'high';
  needsApproval: boolean;
  desc: string;
  computer: 'phone' | 'container' | 'builtin';
};

export async function fetchCapabilities(
  cfg: Config,
): Promise<{ workDir?: string; capabilities: Capability[] }> {
  const res = await expoFetch(`${cfg.execUrl}/capabilities`, {
    headers: { Authorization: `Bearer ${cfg.execToken}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data;
}
