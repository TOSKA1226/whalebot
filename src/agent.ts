import { streamChat, execTool, type ChatResult, type Msg } from './api';
import { TOOLS } from './tools';
import { resolveLang, systemPrompt, type Lang } from './i18n';
import { LOCAL_HANDLERS } from './localTools';
import type { ToolSpec } from './tools';
import * as store from './store';
import type { Config } from './config';

export type AgentEvent =
  | { type: 'assistant_delta'; text: string }
  | { type: 'tool_start'; name: string; args: any }
  | { type: 'tool_result'; name: string; result: any }
  | { type: 'approval_needed'; name: string; args: any }
  | { type: 'usage'; used: number; budget: number }
  | { type: 'budget_exceeded'; used: number; budget: number }
  | { type: 'error'; message: string }
  | { type: 'done' };

export type Approver = (name: string, args: any) => Promise<boolean>;

const shortResult = (r: any) => JSON.stringify(r).slice(0, 20000);

/** 把记忆/技能/例程拼进系统提示词，每轮刷新。 */
export async function buildSystemMessage(
  lang: Lang,
  userText: string,
  agentId?: string,
): Promise<string> {
  const zh = resolveLang(lang) === 'zh-Hans';
  const agent = agentId ? await store.getAgent(agentId).catch(() => undefined) : undefined;
  const [memories, skills, routines] = await Promise.all([
    store.recallMemories(userText, 10, agentId).catch(() => [] as store.Memory[]),
    store.listSkills(agentId).catch(() => [] as store.Skill[]),
    store.listRoutines(agentId).catch(() => [] as store.Routine[]),
  ]);

  const skillsOn = skills.filter((s) => s.enabled);
  const routinesOn = routines.filter((r) => r.enabled);
  const L: string[] = [systemPrompt(lang), ''];
  if (agent?.persona?.trim()) {
    L.push(zh ? `## 你现在的身份：${agent.name}` : `## You are now: ${agent.name}`);
    L.push(agent.persona.trim());
    L.push('');
  }

  L.push(zh ? '## 参考信息' : '## Reference');
  L.push(zh ? '### 记忆（可能与当前对话相关）' : '### Memories (possibly relevant)');
  L.push(
    memories.length
      ? memories.map((m) => `- [${m.provenance}] ${m.content}`).join('\n')
      : zh
        ? '（暂无）'
        : '(none)',
  );

  L.push(zh ? '### 已启用技能' : '### Enabled skills');
  L.push(
    skillsOn.length
      ? skillsOn.map((s) => `- ${s.name}: ${s.description || s.content.slice(0, 80)}`).join('\n')
      : zh
        ? '（暂无）'
        : '(none)',
  );

  L.push(zh ? '### 已启用例程' : '### Enabled routines');
  L.push(
    routinesOn.length
      ? routinesOn.map((r) => `- ${r.name} @ ${r.schedule || '?'}`).join('\n')
      : zh
        ? '（暂无）'
        : '(none)',
  );

  L.push('');
  L.push(
    zh
      ? '需要更多记忆时用 memory_recall；用户提到值得长期记住的事实时，用 memory_write 记下来。'
      : 'Use memory_recall when you need more context, and memory_write when the user states a durable fact.',
  );

  return L.join('\n');
}

/**
 * M2 agent 循环：
 *   模型 → 工具调用 → （本地工具 / 审批 / 容器执行）→ 结果回喂 → 直到模型不再调用工具
 */
export async function runAgent(params: {
  cfg: Config;
  lang: Lang;
  history: Msg[];
  agentId?: string;
  userText: string;
  onEvent: (e: AgentEvent) => void;
  approve: Approver;
  maxSteps?: number;
  /** token 预算守卫（M3）：不传则不限制 */
  budgetTokens?: number;
  /** 超预算时询问用户；返回额外额度，0 表示停止 */
  onBudget?: (used: number, budget: number) => Promise<number>;
  /** 额外工具（MCP 等外部来源） */
  extraTools?: ToolSpec[];
  /** 执行外部 MCP 工具 */
  runMcpTool?: (serverId: string, tool: string, args: any) => Promise<{ ok: boolean; text: string }>;
}): Promise<Msg[]> {
  const {
    cfg,
    lang,
    history,
    userText,
    agentId,
    onEvent,
    approve,
    maxSteps = 8,
    budgetTokens,
    onBudget,
    extraTools = [],
    runMcpTool,
  } = params;

  const allTools = [...TOOLS, ...extraTools];
  const toolSchemas = allTools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  let used = 0;
  let budget = budgetTokens ?? Number.POSITIVE_INFINITY;

  const messages: Msg[] = [...history];
  const sysContent = await buildSystemMessage(lang, userText, agentId);
  if (messages.length && messages[0].role === 'system') {
    messages[0] = { role: 'system', content: sysContent };
  } else {
    messages.unshift({ role: 'system', content: sysContent });
  }
  messages.push({ role: 'user', content: userText });

  for (let step = 0; step < maxSteps; step++) {
    let res: ChatResult;
    try {
      res = await streamChat(cfg, messages, toolSchemas, (t) =>
        onEvent({ type: 'assistant_delta', text: t }),
      );
    } catch (e: any) {
      onEvent({ type: 'error', message: String(e?.message ?? e) });
      onEvent({ type: 'done' });
      return messages;
    }

    if (res.usage?.total_tokens) {
      used += Number(res.usage.total_tokens) || 0;
      onEvent({ type: 'usage', used, budget: Number.isFinite(budget) ? budget : 0 });

      if (Number.isFinite(budget) && used >= budget) {
        onEvent({ type: 'budget_exceeded', used, budget });
        const extra = onBudget ? await onBudget(used, budget) : 0;
        if (!extra) {
          onEvent({ type: 'done' });
          return messages;
        }
        budget = used + extra;
      }
    }

    if (res.toolCalls.length) {
      messages.push({
        role: 'assistant',
        content: res.text || null,
        tool_calls: res.toolCalls,
      });
    } else {
      if (res.text) messages.push({ role: 'assistant', content: res.text });
      break;
    }

    for (const call of res.toolCalls) {
      let args: any = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = {};
      }
      const spec = allTools.find((x) => x.name === call.function.name);
      if (!spec) {
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ ok: false, stderr: `未知工具：${call.function.name}` }),
        });
        continue;
      }

      onEvent({ type: 'tool_start', name: spec.name, args });

      // 本地工具（记忆/技能/例程）由 App 直接执行
      if (spec.local) {
        const handler = LOCAL_HANDLERS[spec.capability];
        let result: any;
        try {
          result = handler ? await handler(args) : { ok: false, stderr: '本地工具未实现' };
        } catch (e: any) {
          result = { ok: false, stderr: String(e?.message ?? e) };
        }
        onEvent({ type: 'tool_result', name: spec.name, result });
        messages.push({ role: 'tool', tool_call_id: call.id, content: shortResult(result) });
        continue;
      }

      // 外部 MCP 工具
      if (spec.mcp) {
        if (spec.needsApproval) {
          const okMcp = await approve(spec.name, args);
          if (!okMcp) {
            onEvent({
              type: 'tool_result',
              name: spec.name,
              result: { ok: false, stderr: '用户拒绝了这个操作' },
            });
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify({ ok: false, stderr: '用户拒绝了这个操作，不要重试同一动作' }),
            });
            continue;
          }
        }
        let mcpResult: any;
        try {
          mcpResult = runMcpTool
            ? await runMcpTool(spec.mcp.serverId, spec.mcp.tool, args ?? {})
            : { ok: false, text: 'MCP 未就绪' };
        } catch (e: any) {
          mcpResult = { ok: false, text: String(e?.message ?? e) };
        }
        onEvent({
          type: 'tool_result',
          name: spec.name,
          result: mcpResult.ok
            ? { ok: true, data: mcpResult.text }
            : { ok: false, stderr: mcpResult.text },
        });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(mcpResult).slice(0, 4000),
        });
        continue;
      }

      if (spec.needsApproval) {
        onEvent({ type: 'approval_needed', name: spec.name, args });
        const ok = await approve(spec.name, args);
        if (!ok) {
          onEvent({
            type: 'tool_result',
            name: spec.name,
            result: { ok: false, stderr: '用户拒绝了这个操作' },
          });
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({ ok: false, stderr: '用户拒绝了这个操作，不要重试同一动作' }),
          });
          continue;
        }
      }

      let result: any;
      try {
        result = await execTool(cfg, spec.capability, args ?? {});
      } catch (e: any) {
        result = { ok: false, stderr: String(e?.message ?? e) };
      }
      onEvent({ type: 'tool_result', name: spec.name, result });
      messages.push({ role: 'tool', tool_call_id: call.id, content: shortResult(result) });
    }
  }

  onEvent({ type: 'done' });
  return messages;
}

export function initialHistory(lang: Lang): Msg[] {
  return [{ role: 'system', content: systemPrompt(lang) }];
}
