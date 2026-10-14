/**
 * 本地工具：由 App 自己执行（不走容器），模型通过 function calling 调用。
 * 目前包含：记忆读写、技能、例程。
 */
import * as store from './store';
import { askUser, type AskAnswer, type AskField } from './context';
import * as vault from './vault';

export type LocalResult = { ok: boolean; stdout?: string; stderr?: string; data?: any };

/** 每个本地工具都知道"现在在为哪个助手干活"（并行跑群协作时必须显式传） */
export type LocalCtx = { agentId: string };

type Handler = (args: any, ctx: LocalCtx) => Promise<LocalResult>;

const str = (v: any, fallback = '') => (v === undefined || v === null ? fallback : String(v));

export const LOCAL_HANDLERS: Record<string, Handler> = {
  memory_write: async (args, ctx) => {
    const content = str(args.content).trim();
    if (!content) return { ok: false, stderr: '缺少 content' };
    const prov = (['user', 'agent', 'untrusted'] as const).includes(args.provenance)
      ? args.provenance
      : 'agent';
    const m = await store.addMemory(content, prov, ctx.agentId);
    return { ok: true, stdout: `已记住（来源 ${m.provenance}）：${m.content}`, data: m };
  },

  memory_recall: async (args, ctx) => {
    const query = args.query ? str(args.query) : undefined;
    const items = await store.recallMemories(query, 12, ctx.agentId);
    if (!items.length) return { ok: true, stdout: '（没有相关记忆）', data: [] };
    return {
      ok: true,
      stdout: items.map((m) => `- [${m.provenance}] ${m.content}`).join('\n'),
      data: items,
    };
  },

  memory_forget: async (args, ctx) => {
    const key = str(args.content).trim();
    const items = await store.listMemories(ctx.agentId);
    const hit = items.find((m) => m.content.includes(key));
    if (!hit) return { ok: false, stderr: '没找到匹配的记忆' };
    await store.removeMemory(hit.id);
    return { ok: true, stdout: `已删除：${hit.content}` };
  },

  skill_upsert: async (args, ctx) => {
    const name = str(args.name).trim();
    if (!name) return { ok: false, stderr: '缺少 name' };
    const s = await store.upsertSkill({
      agentId: ctx.agentId,
      name,
      description: str(args.description),
      content: str(args.content),
      provenance: 'agent',
    });
    return {
      ok: true,
      stdout: `技能已保存（默认暂停，等用户启用）：${s.name}。请在「资料」面板里确认。`,
      data: s,
    };
  },

  skill_list: async (_args, ctx) => {
    const items = await store.listSkills(ctx.agentId);
    if (!items.length) return { ok: true, stdout: '（暂无技能）', data: [] };
    return {
      ok: true,
      stdout: items
        .map((s) => `- ${s.name}${s.enabled ? '' : '（已暂停）'}：${s.description || '无描述'}`)
        .join('\n'),
      data: items,
    };
  },

  remind_in: async (args, ctx) => {
    const minutes = Number(args.minutes);
    const text = str(args.text).trim();
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return { ok: false, stderr: 'minutes 必须是正数' };
    }
    const ms = Math.round(minutes * 60_000);
    const r = await store.upsertRoutine({
      agentId: ctx.agentId,
      name: text || `${minutes} 分钟后提醒`,
      description: text,
      schedule: `once:${ms}`,
      enabled: true, // 用户明确要求的一次性提醒，直接生效
      once: true,
      provenance: 'user',
    });
    const at = new Date(r.createdAt + ms).toLocaleTimeString();
    return {
      ok: true,
      stdout: `已设定一次性提醒：${at}（约 ${minutes} 分钟后）—— ${text}`,
      data: r,
    };
  },

  routine_upsert: async (args, ctx) => {
    const name = str(args.name).trim();
    if (!name) return { ok: false, stderr: '缺少 name' };
    const r = await store.upsertRoutine({
      agentId: ctx.agentId,
      name,
      description: str(args.description),
      schedule: str(args.schedule),
      provenance: 'agent',
    });
    return {
      ok: true,
      stdout: `周期例程已保存（默认暂停，等用户启用）：${r.name}，时间设定「${r.schedule || '未指定'}」。定时触发已可用（前台心跳每 30 秒检查一次）。`,
      data: r,
    };
  },

  routine_list: async (_args, ctx) => {
    const items = await store.listRoutines(ctx.agentId);
    if (!items.length) return { ok: true, stdout: '（暂无例程）', data: [] };
    return {
      ok: true,
      stdout: items
        .map((r) => `- ${r.name}${r.enabled ? '' : '（已暂停）'} @ ${r.schedule || '未指定'}`)
        .join('\n'),
      data: items,
    };
  },

  /** 凭据清单（只有元数据，永远不给明文） */
  credential_list: async () => {
    const items = await vault.listCredentials();
    if (!items.length) {
      return { ok: true, stdout: '（凭据库是空的，让用户去「设置 → 凭据库」加一条）', data: [] };
    }
    return {
      ok: true,
      stdout: items
        .map((c) => `- ${c.name}${c.label ? `：${c.label}` : ''}`)
        .join('\n'),
      data: items.map((c) => ({ name: c.name, label: c.label })),
    };
  },

  /** 取凭据明文（调用前已经过用户批准） */
  credential_get: async (args) => {
    const name = str(args.name).trim();
    if (!name) return { ok: false, stderr: '缺少 name' };
    const c = await vault.findCredential(name);
    if (!c) return { ok: false, stderr: `凭据库里没有「${name}」` };
    const value = await vault.credentialValue(c.id);
    if (!value) return { ok: false, stderr: `凭据「${c.name}」还没有填值` };
    await vault.touchCredential(c.id);
    return {
      ok: true,
      stdout: `凭据 ${c.name} 的值：${value}\n（只在这次任务里用，不要复述给用户，也不要写进任何会长期保存的地方）`,
      data: { name: c.name, value },
    };
  },

  /** 结构化提问：弹一张卡片，把用户的选择/输入作为工具结果回给模型 */
  ask_user: async (args) => {
    const title = str(args.title).trim();
    const fields: AskField[] = (Array.isArray(args.fields) ? args.fields : [])
      .map((f: any) => ({
        key: str(f?.key).trim() || undefined,
        label: str(f?.label).trim(),
        type: (['select', 'multi', 'text', 'confirm'] as const).includes(f?.type)
          ? f.type
          : 'text',
        options: Array.isArray(f?.options) ? f.options.map((o: any) => str(o)) : undefined,
        placeholder: f?.placeholder ? str(f.placeholder) : undefined,
      }))
      .filter((f: AskField) => f.label);
    if (!title || !fields.length) {
      return { ok: false, stderr: '缺少 title 或 fields（fields 至少一项，每项要有 label）' };
    }
    const answer: AskAnswer | null = await askUser({
      title,
      description: args.description ? str(args.description) : undefined,
      fields,
    });
    if (!answer) return { ok: false, stderr: '用户关掉了提问卡片，没有回答。不要假设答案，可以先做别的或稍后再问。' };
    return {
      ok: true,
      stdout: `用户已经回答：\n${JSON.stringify(answer, null, 2)}`,
      data: answer,
    };
  },
};
