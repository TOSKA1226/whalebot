/**
 * 极简 MCP 客户端（Streamable HTTP 传输）
 * 只做我们要用的三件事：initialize → tools/list → tools/call。
 * 兼容两种返回：application/json 单响应，或 text/event-stream（SSE）流。
 */
export type McpServer = {
  id: string;
  name: string;
  /** MCP 服务器地址，例如 http://127.0.0.1:8931/mcp */
  url: string;
  /** 可选 Bearer Token */
  token?: string;
  enabled: boolean;
};

export type McpTool = {
  serverId: string;
  serverName: string;
  name: string;
  description: string;
  inputSchema: any;
};

export const newServerId = () => `m${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

let rpcId = 1;

async function rpc(
  server: McpServer,
  method: string,
  params: Record<string, unknown>,
  timeoutMs = 20000,
): Promise<any> {
  const id = rpcId++;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(server.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 声明两种都接受：有的服务器返回 JSON，有的返回 SSE
        Accept: 'application/json, text/event-stream',
        ...(server.token ? { Authorization: `Bearer ${server.token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}：${(await res.text()).slice(0, 200)}`);
    }
    const ctype = res.headers.get('Content-Type') ?? '';
    if (ctype.includes('text/event-stream')) {
      const text = await res.text();
      const payload = text
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .filter(Boolean)
        .pop();
      if (!payload) throw new Error('SSE 响应里没有数据');
      const msg = JSON.parse(payload);
      if (msg.error) throw new Error(msg.error?.message ?? 'MCP 返回错误');
      return msg.result;
    }
    const msg = await res.json();
    if (msg?.error) throw new Error(msg.error?.message ?? 'MCP 返回错误');
    return msg?.result;
  } finally {
    clearTimeout(timer);
  }
}

/** 握手 + 列出工具 */
export async function listTools(server: McpServer): Promise<McpTool[]> {
  await rpc(server, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'whalebot', version: '1.0' },
  });
  const out = await rpc(server, 'tools/list', {});
  const list: any[] = out?.tools ?? [];
  return list.map((t) => ({
    serverId: server.id,
    serverName: server.name,
    name: String(t?.name ?? ''),
    description: String(t?.description ?? ''),
    inputSchema: t?.inputSchema ?? { type: 'object', properties: {} },
  }));
}

/**
 * 探活 + 自动命名：握手时拿服务器的 serverInfo.name，
 * 用来给「粘贴一个地址就接上」的一键接入流程自动填名字。
 */
export async function probeServer(server: McpServer): Promise<{
  ok: boolean;
  name?: string;
  version?: string;
  tools: McpTool[];
  error?: string;
}> {
  try {
    const init = await rpc(server, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'whalebot', version: '1.0' },
    });
    const out = await rpc(server, 'tools/list', {});
    const list: any[] = out?.tools ?? [];
    return {
      ok: true,
      name: String(init?.serverInfo?.name ?? '').trim() || undefined,
      version: String(init?.serverInfo?.version ?? '').trim() || undefined,
      tools: list.map((t) => ({
        serverId: server.id,
        serverName: server.name,
        name: String(t?.name ?? ''),
        description: String(t?.description ?? ''),
        inputSchema: t?.inputSchema ?? { type: 'object', properties: {} },
      })),
    };
  } catch (e: any) {
    return { ok: false, tools: [], error: String(e?.message ?? e) };
  }
}

/** 内置的常用 MCP 服务器（点一下就把地址填好） */
export const MCP_CATALOG: {
  name: string;
  url: string;
  note: string;
  /** true = 需要先改地址里的路径/参数 */
  needsEdit?: boolean;
}[] = [
  {
    name: '文件系统（@modelcontextprotocol/server-filesystem）',
    url: 'http://127.0.0.1:8932/mcp',
    note: '需要本地跑这个 MCP 服务器；用下面的命令或你自己的部署',
    needsEdit: true,
  },
  {
    name: 'Fetch（抓网页）',
    url: 'http://127.0.0.1:8933/mcp',
    note: '把网页转成 markdown 给模型看',
    needsEdit: true,
  },
  {
    name: 'whalebot 测试服务器',
    url: 'http://127.0.0.1:8931/mcp',
    note: '容器里已跑着的测试服务（now / echo / sum）',
  },
  {
    name: '自定义地址',
    url: '',
    note: '自己填 Streamable HTTP 地址',
    needsEdit: true,
  },
];

/** 调用工具，返回纯文本结果 */
export async function callTool(
  server: McpServer,
  tool: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; text: string }> {
  const out = await rpc(server, 'tools/call', { name: tool, arguments: args ?? {} });
  const parts: string[] = [];
  for (const c of out?.content ?? []) {
    if (c?.type === 'text') parts.push(String(c.text ?? ''));
    else if (c?.type === 'resource') parts.push(JSON.stringify(c.resource ?? {}));
    else parts.push(JSON.stringify(c));
  }
  const text = parts.join('\n').slice(0, 4000) || JSON.stringify(out ?? {}).slice(0, 2000);
  return { ok: !out?.isError, text };
}
