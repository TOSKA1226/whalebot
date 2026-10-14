/**
 * 工具执行上下文：让本地工具知道"现在在为哪个助手干活"。
 * 由 app-state 在切换助手时更新。
 */
import { DEFAULT_AGENT_ID } from './store';

let activeAgentId = DEFAULT_AGENT_ID;

export function setActiveAgent(id: string) {
  activeAgentId = id || DEFAULT_AGENT_ID;
}

export function getActiveAgent(): string {
  return activeAgentId;
}

/* ---------- 结构化提问卡片（ask_user 工具用） ---------- */

export type AskFieldType = 'select' | 'multi' | 'text' | 'confirm';

export type AskField = {
  key?: string;
  label: string;
  type?: AskFieldType;
  options?: string[];
  placeholder?: string;
};

export type AskRequest = { title: string; description?: string; fields: AskField[] };
/** 用户的答案：key -> 选项/文本/是否；null = 用户关掉了卡片 */
export type AskAnswer = Record<string, string | string[] | boolean>;

let asker: ((req: AskRequest) => Promise<AskAnswer | null>) | null = null;

/** app-state 在挂载时把自己注册进来（UI 层负责弹卡片） */
export function setAskUser(fn: ((req: AskRequest) => Promise<AskAnswer | null>) | null) {
  asker = fn;
}

export async function askUser(req: AskRequest): Promise<AskAnswer | null> {
  if (!asker) return null;
  return asker(req);
}
