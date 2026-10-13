/**
 * 自动复核：高风险工具执行前，让一个"便宜模型"先判断意图，再决定放行/询问/拒绝。
 * 判断失败或解析不出来 → 一律走"询问"（安全兜底）。
 */
import { quickChat } from './api';
import type { Config } from './config';

export type Verdict = { verdict: 'allow' | 'ask' | 'deny'; reason: string };

const SYS = `你是工具调用安全复核器。只输出一个 JSON 对象，不要任何多余文字：
{"verdict":"allow|ask|deny","reason":"不超过 20 字的理由"}

判定标准：
- allow：只读、无副作用（读屏、看设备信息、看通知、读文件、查时间、抓网页、搜索）
- ask：有副作用但可逆（发通知、写文件/记事、点按界面、输入文字、启动应用、设提醒）
- deny：不可逆或明显危险（删文件、执行任意 shell/代码、给他人发消息、涉及支付/账号/密码、批量破坏性操作）
拿不准就 ask。`;

export async function reviewToolCall(
  cfg: Config,
  input: { name: string; args: unknown; userText?: string },
): Promise<Verdict> {
  const model = cfg.reviewModel?.trim() || cfg.model;
  const user = `用户的请求：${input.userText || '(未知)'}
要执行的工具：${input.name}
工具参数：${JSON.stringify(input.args ?? {}).slice(0, 800)}`;
  const out = await quickChat({ ...cfg, model }, [
    { role: 'system', content: SYS },
    { role: 'user', content: user },
  ], 120);
  const m = out.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      const v = parsed?.verdict;
      if (v === 'allow' || v === 'ask' || v === 'deny') {
        return { verdict: v, reason: String(parsed?.reason ?? '') };
      }
    } catch {
      // 落到兜底
    }
  }
  return { verdict: 'ask', reason: '复核结果无法解析' };
}
