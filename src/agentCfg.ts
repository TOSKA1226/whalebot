/**
 * 助手实际生效的接口配置（UI 和后台任务共用这一份逻辑，避免两处漂移）。
 *   供应商：助手自己指定 > 所属分组绑定 > 无（用全局设置）
 *   Key：助手专属 Key → 供应商 Key → 全局 Key
 *   模型 / 地址：助手单独填的 → 供应商的 → 全局的
 */
import type { Config } from './config';
import type { Agent } from './store';
import type { Provider } from './providers';
import { providerSecret } from './providers';
import { getSecret } from './secrets';

export const groupKeyOf = (agent?: Agent) => (agent?.group ?? '').trim() || '未分组';

export function pickProvider(
  agent: Agent | undefined,
  providers: Provider[],
  cfg: Config,
): { provider?: Provider; from: 'agent' | 'group' | 'global' } {
  const own = (agent?.providerId ?? '').trim();
  if (own) {
    const p = providers.find((x) => x.id === own);
    if (p) return { provider: p, from: 'agent' };
  }
  const gid = cfg.groupProviders?.[groupKeyOf(agent)];
  if (gid) {
    const p = providers.find((x) => x.id === gid);
    if (p) return { provider: p, from: 'group' };
  }
  return { from: 'global' };
}

export async function resolveAgentCfg(
  cfg: Config,
  agent: Agent | undefined,
  providers: Provider[],
): Promise<Config> {
  const { provider } = pickProvider(agent, providers, cfg);
  let key = '';
  if (agent?.id) {
    try {
      const own = await getSecret(`apikey.${agent.id}`);
      if (own) key = own;
    } catch {
      // 读不到就往下走
    }
  }
  if (!key && provider) {
    try {
      const pk = await getSecret(providerSecret(provider.id));
      if (pk) key = pk;
    } catch {
      // 读不到就往下走
    }
  }
  if (!key) key = cfg.apiKey;
  return {
    ...cfg,
    apiKey: key,
    model: agent?.model?.trim() || provider?.model?.trim() || cfg.model,
    baseUrl: agent?.baseUrl?.trim() || provider?.baseUrl?.trim() || cfg.baseUrl,
  };
}
