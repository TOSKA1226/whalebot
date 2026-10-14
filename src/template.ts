/**
 * 模板：把「助手 + 技能 + 例程 + 记忆 + 供应商」打包成一份 JSON，能复制/分享出去，也能导进来。
 * **不含任何密钥** —— 供应商只带地址和模型名，Key 要靠导入方自己配。
 */
import * as store from './store';
import { listProviders, upsertProvider, type Provider } from './providers';

export type TemplateBundle = {
  kind: 'whalebot.template';
  v: 1;
  name: string;
  exportedAt: number;
  agents: store.Agent[];
  skills: store.Skill[];
  routines: store.Routine[];
  memories: store.Memory[];
  providers: { name: string; baseUrl: string; model: string }[];
  groupProviders?: Record<string, string>;
  groupColors?: Record<string, string>;
};

export async function exportTemplate(
  name: string,
  extra: { groupProviders?: Record<string, string>; groupColors?: Record<string, string> } = {},
): Promise<TemplateBundle> {
  const [agents, skills, routines, memories, providers] = await Promise.all([
    store.listAgents(),
    store.listSkills(),
    store.listRoutines(),
    store.listMemories(),
    listProviders(),
  ]);
  return {
    kind: 'whalebot.template',
    v: 1,
    name: name.trim() || 'whalebot 模板',
    exportedAt: Date.now(),
    agents,
    skills,
    routines,
    memories,
    providers: providers.map((p: Provider) => ({
      name: p.name,
      baseUrl: p.baseUrl,
      model: p.model,
    })),
    groupProviders: extra.groupProviders,
    groupColors: extra.groupColors,
  };
}

/** 文本形式：优先 JSON（好读），也可以要 base64（一行，方便发消息） */
export function bundleToText(b: TemplateBundle, base64 = false): string {
  const json = JSON.stringify(b);
  if (!base64) return JSON.stringify(b, null, 2);
  // 纯 JS 的 base64（不引额外依赖）：TextEncoder → 手工编码
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b2 of bytes) bin += String.fromCharCode(b2);
  const g = globalThis as any;
  if (typeof g.btoa === 'function') return g.btoa(bin);
  return json;
}

function parseBundle(raw: string): TemplateBundle {
  const text = raw.trim();
  let json = text;
  if (!text.startsWith('{')) {
    // 可能是 base64
    try {
      const g = globalThis as any;
      const bin = typeof g.atob === 'function' ? g.atob(text) : '';
      if (bin) json = new TextDecoder().decode(Uint8Array.from(bin, (ch: string) => ch.charCodeAt(0)));
    } catch {
      // 保持原样，交给 JSON.parse 报错
    }
  }
  const obj = JSON.parse(json);
  if (obj?.kind !== 'whalebot.template') throw new Error('这不是 whalebot 模板');
  return obj as TemplateBundle;
}

export type ImportResult = {
  agents: number;
  skills: number;
  routines: number;
  memories: number;
  providers: number;
  /** 已存在的助手（按同名合并） */
  merged: string[];
};

/** 导入：同名助手复用，其余新建；技能/例程/记忆跟着重映射到新 id */
export async function importTemplate(
  raw: string,
  opts: { includeMemories?: boolean } = {},
): Promise<ImportResult> {
  const b = parseBundle(raw);
  const existing = await store.listAgents();
  const idMap = new Map<string, string>();
  const merged: string[] = [];

  for (const a of b.agents ?? []) {
    const same = existing.find((x) => x.name === a.name);
    if (same) {
      idMap.set(a.id, same.id);
      merged.push(a.name);
      continue;
    }
    const created = await store.upsertAgent({
      name: a.name,
      description: a.description,
      persona: a.persona,
      group: a.group,
      model: a.model,
      baseUrl: a.baseUrl,
      providerId: a.providerId,
      tokenLimitMode: a.tokenLimitMode,
      tokenLimit: a.tokenLimit,
    });
    idMap.set(a.id, created.id);
  }
  const mapId = (id?: string) => (id ? (idMap.get(id) ?? id) : undefined);

  for (const s of b.skills ?? []) {
    await store.upsertSkill({
      agentId: mapId(s.agentId),
      name: s.name,
      description: s.description,
      content: s.content,
      provenance: 'user',
      enabled: s.enabled,
    });
  }
  for (const r of b.routines ?? []) {
    await store.upsertRoutine({
      agentId: mapId(r.agentId),
      name: r.name,
      description: r.description,
      schedule: r.schedule,
      provenance: 'user',
      enabled: r.enabled,
      once: r.once,
    });
  }
  if (opts.includeMemories !== false) {
    for (const m of b.memories ?? []) {
      await store.addMemory(m.content, m.provenance ?? 'user', mapId(m.agentId) ?? store.DEFAULT_AGENT_ID);
    }
  }

  const have = await listProviders();
  let providers = 0;
  for (const p of b.providers ?? []) {
    if (have.some((x) => x.name === p.name && x.baseUrl === p.baseUrl)) continue;
    await upsertProvider({ name: p.name, baseUrl: p.baseUrl, model: p.model });
    providers += 1;
  }

  return {
    agents: (b.agents ?? []).length,
    skills: (b.skills ?? []).length,
    routines: (b.routines ?? []).length,
    memories: opts.includeMemories === false ? 0 : (b.memories ?? []).length,
    providers,
    merged,
  };
}
