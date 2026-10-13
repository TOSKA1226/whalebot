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
