/**
 * whalebot 数据层：记忆 / 技能 / 例程
 * M2 先用 AsyncStorage（JSON）存，量大了再迁 expo-sqlite。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Provenance = 'user' | 'agent' | 'untrusted';

export type Agent = {
  id: string;
  name: string;
  description: string;
  /** 人设 / 指令 */
  persona: string;
  /** 分组（工作 / 生活 / 学习…） */
  group: string;
  /** 该助手单独使用的模型；留空则用全局设置 */
  model?: string;
  /** 该助手单独使用的接口地址；留空则用全局设置 */
  baseUrl?: string;
  /** 该助手指定的模型供应商；留空 = 用所属分组绑定的供应商 */
  providerId?: string;
  /** 该助手单独的 token 上限模式；缺省 = 跟随全局 */
  tokenLimitMode?: 'global' | 'custom' | 'unlimited';
  /** 该助手单独的 token 上限数值（mode 为 custom 时生效） */
  tokenLimit?: number;
  createdAt: number;
};

export const DEFAULT_AGENT_ID = 'default';

export type Memory = {
  id: string;
  /** 归属助手；老数据没有此字段视为 default */
  agentId?: string;
  content: string;
  provenance: Provenance;
  createdAt: number;
  lastUsedAt?: number;
  hits?: number;
};

export type Skill = {
  id: string;
  /** 归属助手；老数据没有此字段视为 default */
  agentId?: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
  provenance: Provenance;
  createdAt: number;
};

export type Routine = {
  id: string;
  /** 归属助手；老数据没有此字段视为 default */
  agentId?: string;
  name: string;
  description: string;
  schedule: string;
  /** true = 只触发一次，触发后自动暂停 */
  once?: boolean;
  enabled: boolean;
  provenance: Provenance;
  createdAt: number;
  lastRunAt?: number;
};

const K = {
  agents: 'whalebot.agents.v1',
  mem: 'whalebot.memories.v1',
  skill: 'whalebot.skills.v1',
  routine: 'whalebot.routines.v1',
};

export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function read<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

async function write<T>(key: string, value: T[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

/** 老数据没有 agentId → 归默认助手 */
const belongs = (item: { agentId?: string }, agentId?: string) =>
  !agentId || (item.agentId ?? DEFAULT_AGENT_ID) === agentId;

/* ---------------- 助手 ---------------- */

export const listAgents = () => read<Agent>(K.agents);

/** 首次运行（或老数据）时确保存在一个默认助手 */
export async function ensureAgents(): Promise<Agent[]> {
  const items = await listAgents();
  if (items.length) return items;
  const seed: Agent[] = [
    {
      id: DEFAULT_AGENT_ID,
      name: '默认助手',
      description: 'whalebot 的第一位助手',
      persona: '',
      group: '常用',
      createdAt: Date.now(),
    },
  ];
  await write(K.agents, seed);
  return seed;
}

export async function getAgent(id: string): Promise<Agent | undefined> {
  const items = await listAgents();
  return items.find((a) => a.id === id) ?? items[0];
}

export async function upsertAgent(input: {
  id?: string;
  name: string;
  description?: string;
  persona?: string;
  group?: string;
  model?: string;
  baseUrl?: string;
  providerId?: string;
  tokenLimitMode?: 'global' | 'custom' | 'unlimited';
  tokenLimit?: number;
}): Promise<Agent> {
  const items = await listAgents();
  const idx = input.id ? items.findIndex((a) => a.id === input.id) : -1;
  if (idx >= 0) {
    const merged: Agent = {
      ...items[idx],
      name: input.name?.trim() || items[idx].name,
      description: input.description ?? items[idx].description,
      persona: input.persona ?? items[idx].persona,
      group: input.group ?? items[idx].group,
      model: input.model ?? items[idx].model,
      baseUrl: input.baseUrl ?? items[idx].baseUrl,
      providerId: input.providerId ?? items[idx].providerId,
      tokenLimitMode: input.tokenLimitMode ?? items[idx].tokenLimitMode,
      tokenLimit: input.tokenLimit ?? items[idx].tokenLimit,
    };
    items[idx] = merged;
    await write(K.agents, items);
    return merged;
  }
  const a: Agent = {
    id: uid(),
    name: input.name.trim(),
    description: (input.description ?? '').trim(),
    persona: (input.persona ?? '').trim(),
    group: (input.group ?? '未分组').trim(),
    providerId: input.providerId,
    tokenLimitMode: input.tokenLimitMode,
    tokenLimit: input.tokenLimit,
    createdAt: Date.now(),
  };
  items.push(a);
  await write(K.agents, items);
  return a;
}

/** 删除助手，并把它的记忆/技能/例程转交给默认助手（不丢数据） */
export async function removeAgent(id: string): Promise<void> {
  if (id === DEFAULT_AGENT_ID) return;
  const agents = await listAgents();
  await write(
    K.agents,
    agents.filter((a) => a.id !== id),
  );
  const reassign = <T extends { agentId?: string }>(items: T[]): T[] =>
    items.map((it) => (it.agentId === id ? { ...it, agentId: DEFAULT_AGENT_ID } : it));
  await write(K.mem, reassign(await read<Memory>(K.mem)));
  await write(K.skill, reassign(await read<Skill>(K.skill)));
  await write(K.routine, reassign(await read<Routine>(K.routine)));
}

/* ---------------- 记忆 ---------------- */

export const listMemories = async (agentId?: string) =>
  (await read<Memory>(K.mem)).filter((m) => belongs(m, agentId));

export async function addMemory(
  content: string,
  provenance: Provenance = 'agent',
  agentId: string = DEFAULT_AGENT_ID,
): Promise<Memory> {
  const text = content.trim();
  const items = await listMemories();
  const dup = items.find((m) => m.content.trim() === text);
  if (dup) return dup;
  const m: Memory = { id: uid(), content: text, provenance, createdAt: Date.now(), agentId };
  items.unshift(m);
  await write(K.mem, items.slice(0, 500));
  return m;
}

export async function removeMemory(id: string): Promise<void> {
  const items = await listMemories();
  await write(
    K.mem,
    items.filter((m) => m.id !== id),
  );
}

/** 关键词打分式的朴素召回；命中会累计 hits，供后续排序参考。 */
export async function recallMemories(
  query?: string,
  limit = 12,
  agentId?: string,
): Promise<Memory[]> {
  const items = await listMemories(agentId);
  if (!query) return items.slice(0, limit);
  const q = query.toLowerCase();
  const tokens = q.split(/[\s,，。;；、!！?？:：]+/).filter((t) => t.length >= 2);
  const scored = items
    .map((m) => {
      const c = m.content.toLowerCase();
      let score = 0;
      if (c.includes(q)) score += 5;
      for (const t of tokens) if (c.includes(t)) score += 2;
      score += Math.min(m.hits ?? 0, 5) * 0.2;
      return { m, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.m);

  if (scored.length) {
    const ids = new Set(scored.map((s) => s.id));
    await write(
      K.mem,
      items.map((m) =>
        ids.has(m.id) ? { ...m, hits: (m.hits ?? 0) + 1, lastUsedAt: Date.now() } : m,
      ),
    );
  }
  return scored;
}

/* ---------------- 技能 ---------------- */

export const listSkills = async (agentId?: string) =>
  (await read<Skill>(K.skill)).filter((x) => belongs(x, agentId));

export async function upsertSkill(input: {
  id?: string;
  agentId?: string;
  name: string;
  description?: string;
  content?: string;
  provenance?: Provenance;
  enabled?: boolean;
}): Promise<Skill> {
  const items = await listSkills();
  const idx = input.id ? items.findIndex((s) => s.id === input.id) : -1;
  if (idx >= 0) {
    const merged: Skill = {
      ...items[idx],
      name: input.name ?? items[idx].name,
      description: input.description ?? items[idx].description,
      content: input.content ?? items[idx].content,
    };
    items[idx] = merged;
    await write(K.skill, items);
    return merged;
  }
  const s: Skill = {
    id: uid(),
    name: input.name.trim(),
    description: (input.description ?? '').trim(),
    content: (input.content ?? '').trim(),
    // 安全默认：模型新建的技能一律暂停，等用户在面板里手动启用
    enabled: input.enabled ?? false,
    provenance: input.provenance ?? 'agent',
    createdAt: Date.now(),
    agentId: input.agentId ?? DEFAULT_AGENT_ID,
  };
  items.unshift(s);
  await write(K.skill, items);
  return s;
}

export async function setSkillEnabled(id: string, enabled: boolean): Promise<void> {
  const items = await listSkills();
  await write(
    K.skill,
    items.map((s) => (s.id === id ? { ...s, enabled } : s)),
  );
}

export async function removeSkill(id: string): Promise<void> {
  const items = await listSkills();
  await write(
    K.skill,
    items.filter((s) => s.id !== id),
  );
}

/* ---------------- 例程 ---------------- */

export const listRoutines = async (agentId?: string) =>
  (await read<Routine>(K.routine)).filter((x) => belongs(x, agentId));

export async function upsertRoutine(input: {
  id?: string;
  agentId?: string;
  name: string;
  description?: string;
  schedule?: string;
  provenance?: Provenance;
  enabled?: boolean;
  once?: boolean;
}): Promise<Routine> {
  const items = await listRoutines();
  const idx = input.id ? items.findIndex((r) => r.id === input.id) : -1;
  if (idx >= 0) {
    const merged: Routine = {
      ...items[idx],
      name: input.name ?? items[idx].name,
      description: input.description ?? items[idx].description,
      schedule: input.schedule ?? items[idx].schedule,
    };
    items[idx] = merged;
    await write(K.routine, items);
    return merged;
  }
  const r: Routine = {
    id: uid(),
    name: input.name.trim(),
    description: (input.description ?? '').trim(),
    schedule: (input.schedule ?? '').trim(),
    enabled: input.enabled ?? false,
    provenance: input.provenance ?? 'agent',
    createdAt: Date.now(),
    once: input.once ?? false,
    agentId: input.agentId ?? DEFAULT_AGENT_ID,
  };
  items.unshift(r);
  await write(K.routine, items);
  return r;
}

export async function setRoutineEnabled(id: string, enabled: boolean): Promise<void> {
  const items = await listRoutines();
  await write(
    K.routine,
    items.map((r) => (r.id === id ? { ...r, enabled } : r)),
  );
}

export async function setRoutineLastRun(id: string, ts: number): Promise<void> {
  const items = await listRoutines();
  await write(
    K.routine,
    items.map((r) => (r.id === id ? { ...r, lastRunAt: ts } : r)),
  );
}

export async function removeRoutine(id: string): Promise<void> {
  const items = await listRoutines();
  await write(
    K.routine,
    items.filter((r) => r.id !== id),
  );
}
