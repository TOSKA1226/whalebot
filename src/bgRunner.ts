/**
 * 后台例程执行器：跑在没有 UI 的 JS 上下文里，所以这里只用「不依赖 React」的模块。
 * 需要审批的工具在后台一律拒绝（没人在旁边点允许）。
 */
import { loadConfig } from './config';
import { initialHistory, runAgent } from './agent';
import { listProviders } from './providers';
import { resolveAgentCfg } from './agentCfg';
import { takeDueRoutines } from './scheduler';
import * as store from './store';
import { setActiveAgent } from './context';
import { notifyNow } from './notify';
import { addRun, newRunId, type RunTool } from './runs';
import { diag } from './diag';

export type BgResult = { due: number; ran: number; notes: string[] };

export async function runDueRoutines(): Promise<BgResult> {
  const notes: string[] = [];
  const cfg = await loadConfig();
  const due = await takeDueRoutines();
  if (!due.length) return { due: 0, ran: 0, notes: ['没有到点的例程'] };

  const agents = await store.ensureAgents();
  const providers = await listProviders();
  let ran = 0;

  for (const r of due) {
    const agentId = r.agentId ?? store.DEFAULT_AGENT_ID;
    const agent = agents.find((a) => a.id === agentId) ?? agents[0];
    setActiveAgent(agentId);
    const eff = await resolveAgentCfg(cfg, agent, providers);
    if (!eff.apiKey) {
      notes.push(`${r.name}：没有可用的 API Key，跳过`);
      continue;
    }
    const started = Date.now();
    const tools: RunTool[] = [];
    let text = '';
    let error: string | undefined;
    try {
      await runAgent({
        cfg: eff,
        lang: eff.lang,
        agentId,
        history: initialHistory(eff.lang),
        userText: `[例程触发 · 后台] ${r.name}${r.description ? `：${r.description}` : ''}（时间设定 ${
          r.schedule || '未指定'
        }）`,
        onEvent: (e) => {
          if (e.type === 'assistant_delta') text += e.text;
          if (e.type === 'tool_start') tools.push({ name: e.name });
          if (e.type === 'tool_result') {
            const last = tools[tools.length - 1];
            if (last) last.ok = !!e.result?.ok;
          }
          if (e.type === 'error') error = e.message;
        },
        // 后台没人审批：需要审批的工具直接拒绝，免审批的照常跑
        approve: async () => false,
        maxSteps: 4,
      });
      ran += 1;
    } catch (e: any) {
      error = String(e?.message ?? e);
      notes.push(`${r.name}：${error}`);
    }

    await addRun({
      id: newRunId(),
      at: started,
      agentId,
      agentName: agent?.name,
      phase: 'routine-bg',
      model: eff.model,
      ms: Date.now() - started,
      tools,
      text: text.slice(0, 200),
      error,
      background: true,
    });

    try {
      await notifyNow(eff, `例程完成：${r.name}`, text || error || '（没有输出）', {
        withReply: false,
      });
    } catch (e: any) {
      notes.push(`通知没发出去：${String(e?.message ?? e)}`);
    }
    diag('bg-run', { routine: r.name, ms: Date.now() - started, chars: text.length });
  }

  return { due: due.length, ran, notes };
}
