/**
 * whalebot 全局状态（路由各页面共用）
 * 原来的单体 App.tsx 逻辑搬到这里：配置 / 会话 / 审批 / 预算 / 调度 / 通知
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { DEFAULT_CONFIG, loadConfig, saveConfig, type Config } from './config';
import { execHealth, type Msg } from './api';
import { initialHistory, runAgent, type AgentEvent } from './agent';
import { makeT, type TFn } from './i18n';
import * as store from './store';
import {
  setActiveAgent as setToolAgent,
  setAskUser,
  type AskAnswer,
  type AskRequest,
} from './context';
import { nextDue, startScheduler } from './scheduler';
import { mcpToolSpecs, TOOLS } from './tools';
import { diag } from './diag';
import * as sessions from './sessions';
import type { Session, SessionBubble } from './sessions';
import { callTool, listTools, type McpTool } from './mcp';
import { reviewToolCall } from './review';
import { getSecret, setSecret } from './secrets';
import * as rooms from './rooms';
import type { Room } from './rooms';
import * as providerStore from './providers';
import { providerSecret, type Provider } from './providers';
import { pickProvider, resolveAgentCfg } from './agentCfg';
import * as runsStore from './runs';
import { addRun, newRunId, type RunLog, type RunTool } from './runs';
import * as vault from './vault';
import { speak, stopSpeaking } from './voice';
import {
  backgroundStatus,
  disableBackgroundRoutines,
  enableBackgroundRoutines,
} from './background';
import {
  dispatchPrompt,
  mentionPrompt,
  parseAssignments,
  parseMentions,
  planWaves,
  stripPlanBlock,
  summaryPrompt,
  workerPrompt,
  type Member,
} from './orchestra';
import { dataUrlFor, type PickedAttachment } from './attachments';
import {
  cancelAllScheduled,
  cancelScheduled,
  notifyNow,
  onNotificationResponse,
  scheduleAt,
  setupNotifications,
} from './notify';

export type Bubble = SessionBubble;

/**
 * 一次「某个助手说一轮话」的上下文。
 * 并行跑多个助手时，每个 run 各有一份，流式增量不会串到别人的气泡里。
 */
type RunCtx = {
  agentId: string;
  /** 群聊/多助手时标注是谁在说话；单聊不标 */
  speaker?: string;
  phase?: Bubble['phase'];
  streamId: string | null;
  toolId: string | null;
  text: string;
  bubbleId: string | null;
  /** 这一轮用到的工具（写运行日志用） */
  tools: RunTool[];
  tokens?: number;
  error?: string;
};

let seq = 0;
export const nextId = () => `b${++seq}`;

type AppState = {
  ready: boolean;
  cfg: Config;
  t: TFn;
  health: string;
  bubbles: Bubble[];
  busy: boolean;
  usage: { used: number; budget: number } | null;
  sched: { running: boolean; nextAt?: number };
  notifyAvailable: boolean | null;
  notifyGranted: boolean | null;
  data: { memories: store.Memory[]; skills: store.Skill[]; routines: store.Routine[] };
  agents: store.Agent[];
  activeAgentId: string;
  activeAgent?: store.Agent;
  switchAgent: (id: string) => Promise<void>;
  /** 把例程的下次触发预约到系统通知 */
  syncScheduled: () => Promise<void>;
  /** 房间：参与者（含主答） */
  roomAgents: store.Agent[];
  setRoomMembers: (ids: string[]) => Promise<void>;
  saveAgent: (input: Parameters<typeof store.upsertAgent>[0]) => Promise<store.Agent>;
  deleteAgent: (id: string) => Promise<void>;
  reloadData: () => Promise<void>;
  checkHealth: (c?: Config) => Promise<void>;
  saveCfg: (c: Config) => Promise<void>;
  send: (text: string, attachments?: PickedAttachment[]) => Promise<void>;
  runTurn: (text: string, opts?: { silentBubble?: boolean }) => Promise<string>;
  clearChat: () => void;
  push: (role: Bubble['role'], text: string) => string;
  /** 助手状态：在线 / 忙碌 / 下线 */
  presenceOf: (agentId: string) => 'online' | 'busy' | 'offline';
  /** 这一轮的状态：idle / running / stopping */
  runState: 'idle' | 'running' | 'stopping';
  /** 停止这一轮（掐断流式请求；群协作里已产出的成果仍会汇总） */
  stop: () => void;
  /** 正在生成回复的助手 id 列表（群协作并行时会有多个） */
  speakingIds: string[];
  /** 某助手实际生效的配置（含它自己的模型/Key） */
  effectiveCfg: (agentId: string) => Promise<Config>;
  /** 重新扫描各助手的独立 Key 状态 */
  refreshAgentKeys: () => Promise<void>;
  /** 哪些助手配了自己的 Key */
  agentHasKey: Record<string, boolean>;
  /** 会话列表（持久化） */
  sessions: Session[];
  currentSessionId: string;
  /** 新开一段会话 */
  newChat: () => Promise<void>;
  /** 打开指定会话 */
  openSession: (id: string) => Promise<void>;
  /** 删除会话 */
  deleteSession: (id: string) => Promise<void>;
  /** MCP：已发现的工具 */
  mcpTools: McpTool[];
  /** MCP：每个服务器的连接状态（ok:N / err:...） */
  mcpStatus: Record<string, string>;
  /** 重新连接所有 MCP 服务器 */
  refreshMcp: () => Promise<void>;
  /** 助手群列表 */
  roomList: Room[];
  /** 当前会话所属的群（单聊时为 undefined） */
  currentRoom?: Room;
  /** 当前群里的助手（组长排第一） */
  currentRoomAgents: store.Agent[];
  /** 新建一个群，并开一段属于它的会话 */
  createRoom: (name: string, leaderId: string, memberIds: string[]) => Promise<Room>;
  /** 改群名 / 换组长 / 加减成员 */
  updateRoom: (id: string, patch: { name?: string; leaderId?: string; memberIds?: string[] }) => Promise<void>;
  /** 解散群 */
  deleteRoom: (id: string) => Promise<void>;
  /** 打开某个群的会话 */
  openRoom: (roomId: string) => Promise<void>;
  /** 打开某个助手的私聊（成员汇报就落在那里） */
  openAgentChat: (agentId: string) => Promise<void>;
  /** 某助手这一轮实际生效的 token 上限（null = 不限制） */
  limitFor: (agentId: string) => number | null;
  /** 模型供应商（接口 + Key + 默认模型） */
  providers: Provider[];
  /** 哪些供应商配了自己的 Key */
  providerKeys: Record<string, boolean>;
  /** 某助手的接口来源：助手指定 / 分组绑定 / 全局设置 */
  providerInfo: (agent?: store.Agent) => { provider?: Provider; from: 'agent' | 'group' | 'global' };
  saveProvider: (input: {
    id?: string;
    name: string;
    baseUrl: string;
    model: string;
    note?: string;
    apiKey?: string;
    vision?: boolean;
  }) => Promise<Provider>;
  deleteProvider: (id: string) => Promise<void>;
  /** 给某个分组绑定供应商（组内助手共用这把 Key） */
  setGroupProvider: (group: string, providerId: string) => Promise<void>;
  /** 给某个分组指定色系（助手头像） */
  setGroupColor: (group: string, familyKey: string) => Promise<void>;
  /* ---- P1：权限规则 / 运行日志 / 凭据库 / 后台常驻 ---- */
  /** 永久权限规则：agentId（或 '*'）→ 工具 → allow/deny */
  permRules: Record<string, Record<string, 'allow' | 'deny'>>;
  /** 写/删一条永久规则（decision 传 null = 删除这条） */
  savePermRule: (agentId: string, tool: string, decision: 'allow' | 'deny' | null) => Promise<void>;
  /** 本会话临时允许的条目（`agentId:tool`），重启即失效 */
  sessionAllows: string[];
  clearSessionAllows: () => void;
  /** 运行日志（最近 200 条） */
  runs: RunLog[];
  reloadRuns: () => Promise<void>;
  clearRuns: () => Promise<void>;
  /** 凭据库（只有元数据，值在 SecureStore 里） */
  credentials: vault.Credential[];
  reloadCredentials: () => Promise<void>;
  saveCredential: (input: {
    id?: string;
    name: string;
    label?: string;
    value?: string;
  }) => Promise<vault.Credential>;
  deleteCredential: (id: string) => Promise<void>;
  /** 后台常驻（WorkManager）状态与开关 */
  bg: { available: boolean; registered: boolean };
  toggleBackground: (on: boolean) => Promise<void>;
  refreshBackground: () => Promise<void>;
};

const AppCtx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp 必须在 AppProvider 内使用');
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState('');
  const [usage, setUsage] = useState<{ used: number; budget: number } | null>(null);
  const [sched, setSched] = useState<{ running: boolean; nextAt?: number }>({ running: false });
  const [notifyAvailable, setNotifyAvailable] = useState<boolean | null>(null);
  const [notifyGranted, setNotifyGranted] = useState<boolean | null>(null);
  const [data, setData] = useState<AppState['data']>({ memories: [], skills: [], routines: [] });
  const [agents, setAgents] = useState<store.Agent[]>([]);
  /** 正在生成回复的助手（房间成员轮流发言时也会变） */
  /** 正在生成回复的助手（群协作并行时可能同时好几个） */

  /** 每个助手最近一次请求的结果，用于推算在线/下线 */
  const [agentHealth, setAgentHealth] = useState<Record<string, 'ok' | 'error'>>({});
  /** 每个助手是否配置了自己的 API Key（用于状态点） */
  const [agentHasKey, setAgentHasKey] = useState<Record<string, boolean>>({});
  /** 模型供应商（一个供应商 = 一把 Key，可以按分组共用） */
  const [providerList, setProviderList] = useState<Provider[]>([]);
  const providersRef = useRef<Provider[]>([]);
  /** 每个供应商自己有没有配 Key */
  const [providerKeyMap, setProviderKeyMap] = useState<Record<string, boolean>>({});
  /** MCP：发现的工具 + 每个服务器的连接状态 */
  const [mcpTools, setMcpTools] = useState<McpTool[]>([]);
  const [mcpStatus, setMcpStatus] = useState<Record<string, string>>({});
  const mcpToolsRef = useRef<McpTool[]>([]);

  /** 连接所有启用的 MCP 服务器并拉取工具清单 */
  const refreshMcp = useCallback(async () => {
    const servers = (cfgRef.current.mcpServers ?? []).filter((x) => x.enabled);
    const found: McpTool[] = [];
    const status: Record<string, string> = {};
    for (const srv of servers) {
      try {
        const list = await listTools(srv);
        found.push(...list);
        status[srv.id] = `ok:${list.length}`;
      } catch (e: any) {
        status[srv.id] = `err:${String(e?.message ?? e).slice(0, 100)}`;
      }
    }
    mcpToolsRef.current = found;
    setMcpTools(found);
    setMcpStatus(status);
  }, []);

  /** 会话列表（持久化）与当前会话 */
  const [sessionList, setSessionList] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [roomList, setRoomList] = useState<Room[]>([]);
  const [currentRoomId, setCurrentRoomId] = useState<string>('');
  const sessionIdRef = useRef<string>('');
  const roomIdRef = useRef<string>('');
  const roomsRef = useRef<Room[]>([]);
  const titleRef = useRef<string>('');
  const lastUserTextRef = useRef<string>('');
  /** 审批 / 预算询问都排队：群里并行跑时可能同时有好几个要问 */
  const [pending, setPending] = useState<{
    name: string;
    args: any;
    agentId: string;
    noAlways?: boolean;
    resolve: (ok: boolean) => void;
  } | null>(null);
  const approvalQueue = useRef<
    {
      name: string;
      args: any;
      agentId: string;
      noAlways?: boolean;
      resolve: (ok: boolean) => void;
    }[]
  >([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [budgetAsk, setBudgetAsk] = useState<
    { used: number; budget: number; resolve: (extra: number) => void } | null
  >(null);
  const budgetQueue = useRef<
    { used: number; budget: number; resolve: (extra: number) => void }[]
  >([]);
  /** 这一轮的状态：idle / running / stopping（点了停止但还没收尾） */
  const [runState, setRunState] = useState<'idle' | 'running' | 'stopping'>('idle');
  const abortRef = useRef<AbortController | null>(null);
  /** 正在生成回复的助手（群协作并行时可能同时好几个） */
  const [speakingIds, setSpeakingIds] = useState<string[]>([]);
  /** 这一轮是不是已经提示过「已停止」了（并行时好几个成员会同时被掐断） */
  const stoppedRef = useRef(false);
  /** 最近一次助手说出来的全文（自动朗读用） */
  const lastAnswerRef = useRef('');
  /** 本会话临时允许的工具（`agentId:tool`），App 重启就没了 */
  const sessionAllowsRef = useRef<Set<string>>(new Set());
  const [sessionAllows, setSessionAllows] = useState<string[]>([]);
  const [bg, setBg] = useState<{ available: boolean; registered: boolean }>({
    available: false,
    registered: false,
  });
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [credentials, setCredentials] = useState<vault.Credential[]>([]);

  const t = useMemo(() => makeT(cfg.lang), [cfg.lang]);

  const historyRef = useRef<Msg[]>(initialHistory(DEFAULT_CONFIG.lang));
  const cfgRef = useRef(cfg);
  const tRef = useRef(t);
  const agentRef = useRef<string>(DEFAULT_CONFIG.activeAgentId);
  const agentsRef = useRef<store.Agent[]>([]);

  const bubblesRef = useRef<Bubble[]>([]);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const push = useCallback(
    (
      role: Bubble['role'],
      text: string,
      speaker?: string,
      tool?: Bubble['tool'],
      phase?: Bubble['phase'],
      action?: Bubble['action'],
    ) => {
      const id = nextId();
      setBubbles((prev) => [...prev, { id, role, text, speaker, tool, phase, action }]);
      return id;
    },
    [],
  );

  const appendTo = useCallback((id: string, chunk: string) => {
    setBubbles((prev) => prev.map((b) => (b.id === id ? { ...b, text: b.text + chunk } : b)));
  }, []);

  /** 把当前会话写回存储（防抖；气泡一变就会触发） */
  const persistSession = useCallback(
    (immediate = false) => {
      const id = sessionIdRef.current;
      if (!id) return;
      const payload: Session = {
        id,
        title: titleRef.current,
        agentId: agentRef.current,
        roomId: roomIdRef.current || undefined,
        createdAt: 0,
        updatedAt: Date.now(),
        bubbles: [] as SessionBubble[],
        messages: historyRef.current as any,
      };
      const write = async () => {
        const prev = await sessions.getSession(id);
        const full: Session = {
          ...payload,
          createdAt: prev?.createdAt ?? Date.now(),
          bubbles: bubblesRef.current,
          title: titleRef.current || prev?.title || '新对话',
        };
        await sessions.upsertSession(full);
        setSessionList(await sessions.listSessions());
      };
      if (immediate) void write();
      else {
        if (persistTimer.current) clearTimeout(persistTimer.current);
        persistTimer.current = setTimeout(() => void write(), 400);
      }
    },
    [],
  );

  useEffect(() => {
    // 这个 ref 只是给回调读取最新配置用，属于标准用法
    // eslint-disable-next-line react-hooks/immutability
    cfgRef.current = cfg;
  }, [cfg]);
  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    bubblesRef.current = bubbles;
    if (ready && sessionIdRef.current) persistSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubbles, ready]);

  /** 读出每个助手是否有独立 Key（只在启动/保存助手时刷一次） */
  const refreshAgentKeys = useCallback(async () => {
    const map: Record<string, boolean> = {};
    for (const a of agentsRef.current) {
      try {
        map[a.id] = !!(await getSecret(`apikey.${a.id}`));
      } catch {
        map[a.id] = false;
      }
    }
    setAgentHasKey(map);
  }, []);

  /** 每个供应商有没有配自己的 Key */
  const refreshProviderKeys = useCallback(async () => {
    const map: Record<string, boolean> = {};
    for (const p of providersRef.current) {
      try {
        map[p.id] = !!(await getSecret(providerSecret(p.id)));
      } catch {
        map[p.id] = false;
      }
    }
    setProviderKeyMap(map);
  }, []);

  /** 这个助手的接口从哪来：助手自己指定 > 所属分组绑定 > 全局设置 */
  const providerInfo = useCallback(
    (agent?: store.Agent) => pickProvider(agent, providersRef.current, cfgRef.current),
    [],
  );

  /**
   * 某助手实际生效的配置：
   *   Key：助手专属 Key → 供应商 Key → 全局 Key
   *   模型/地址：助手单独填的 → 供应商的 → 全局的
   */
  const effectiveCfg = useCallback(
    async (agentId: string): Promise<Config> =>
      resolveAgentCfg(
        cfgRef.current,
        agentsRef.current.find((x) => x.id === agentId),
        providersRef.current,
      ),
    [],
  );

  /** 这个助手到底有没有可用的 Key（自己的 / 供应商的 / 全局的） */
  const agentKeyOk = useCallback(
    (agentId: string): boolean => {
      if (agentHasKey[agentId]) return true;
      const { provider } = providerInfo(agentsRef.current.find((x) => x.id === agentId));
      if (provider && providerKeyMap[provider.id]) return true;
      return !!cfgRef.current.apiKey;
    },
    [agentHasKey, providerInfo, providerKeyMap],
  );

  /** 写一条永久权限规则（decision = null 表示删掉这条） */
  const savePermRule = useCallback(
    async (agentId: string, tool: string, decision: 'allow' | 'deny' | null) => {
      const rules = { ...(cfgRef.current.permRules ?? {}) };
      const forAgent = { ...(rules[agentId] ?? {}) };
      if (decision) forAgent[tool] = decision;
      else delete forAgent[tool];
      if (Object.keys(forAgent).length) rules[agentId] = forAgent;
      else delete rules[agentId];
      const next = { ...cfgRef.current, permRules: rules };
      await saveConfig(next);
      setCfg(next);
    },
    [],
  );

  /** 这个助手 + 这个工具，有没有永久规则 */
  const ruleFor = useCallback((agentId: string, tool: string): 'allow' | 'deny' | null => {
    const rules = cfgRef.current.permRules ?? {};
    return rules[agentId]?.[tool] ?? rules['*']?.[tool] ?? null;
  }, []);

  /**
   * 工具审批（每个助手一份，并行跑群协作时才知道是谁在申请）：
   *   永久规则 → 本会话允许 → 自动复核 → 弹卡片（这次 / 本会话 / 永久 / 拒绝）
   */
  const makeApprove = useCallback(
    (agentId: string) =>
      async (name: string, args: any): Promise<boolean> => {
        const rule = ruleFor(agentId, name);
        if (rule === 'allow') return true;
        if (rule === 'deny') return false;
        if (sessionAllowsRef.current.has(`${agentId}:${name}`)) return true;

        const c = cfgRef.current;
        if (c.reviewEnabled) {
          try {
            const v = await reviewToolCall(await effectiveCfg(agentId), {
              name,
              args,
              userText: lastUserTextRef.current,
            });
            push('system', tRef.current('review.verdict', { v: v.verdict, why: v.reason }));
            if (v.verdict === 'allow') return true;
            if (v.verdict === 'deny') return false;
          } catch (e: any) {
            push('system', tRef.current('review.failed', { e: String(e?.message ?? e) }));
          }
        }
        // 凭据这类工具每次都问，不给「永久允许」
        const noAlways = !!TOOLS.find((x) => x.name === name)?.alwaysAsk;
        return new Promise<boolean>((resolve) => {
          approvalQueue.current.push({ name, args, agentId, noAlways, resolve });
          setPending(approvalQueue.current[0]);
          setPendingCount(approvalQueue.current.length);
        });
      },
    [effectiveCfg, push, ruleFor],
  );

  /**
   * 用户对审批卡做了选择：出队一个，接着显示下一个（并行跑时可能排着队）
   *   once = 只这次；session = 本会话都允许；always = 写永久规则；deny = 拒绝
   */
  const resolvePending = useCallback(
    (decision: 'once' | 'session' | 'always' | 'deny') => {
      const cur = approvalQueue.current.shift();
      if (cur) {
        if (decision === 'session') {
          sessionAllowsRef.current.add(`${cur.agentId}:${cur.name}`);
          setSessionAllows([...sessionAllowsRef.current]);
        }
        if (decision === 'always') void savePermRule(cur.agentId, cur.name, 'allow');
        cur.resolve(decision !== 'deny');
      }
      setPending(approvalQueue.current[0] ?? null);
      setPendingCount(approvalQueue.current.length);
    },
    [savePermRule],
  );

  const clearSessionAllows = useCallback(() => {
    sessionAllowsRef.current.clear();
    setSessionAllows([]);
  }, []);

  /* ---------- 运行日志 / 凭据库 / 后台常驻 ---------- */

  const reloadRuns = useCallback(async () => {
    setRuns(await runsStore.listRuns());
  }, []);
  const clearRuns = useCallback(async () => {
    await runsStore.clearRuns();
    setRuns([]);
  }, []);

  const reloadCredentials = useCallback(async () => {
    setCredentials(await vault.listCredentials());
  }, []);

  const saveCredential = useCallback(
    async (input: { id?: string; name: string; label?: string; value?: string }) => {
      const c = await vault.upsertCredential(input);
      await reloadCredentials();
      return c;
    },
    [reloadCredentials],
  );

  const deleteCredential = useCallback(
    async (id: string) => {
      await vault.removeCredential(id);
      await reloadCredentials();
    },
    [reloadCredentials],
  );

  const refreshBackground = useCallback(async () => {
    try {
      setBg(await backgroundStatus());
    } catch {
      setBg({ available: false, registered: false });
    }
  }, []);

  const toggleBackground = useCallback(
    async (on: boolean) => {
      try {
        if (on) await enableBackgroundRoutines(15);
        else await disableBackgroundRoutines();
      } catch (e: any) {
        push('system', tRef.current('bg.failed', { e: String(e?.message ?? e) }));
      }
      await refreshBackground();
    },
    [push, refreshBackground],
  );

  /** 问用户要不要继续加预算（并行时排队） */
  const askBudget = useCallback(
    (used: number, budget: number) =>
      new Promise<number>((resolve) => {
        budgetQueue.current.push({ used, budget, resolve });
        setBudgetAsk(budgetQueue.current[0]);
      }),
    [],
  );

  /**
   * 停止这一轮：掐断流式请求，并把挂着的审批/预算询问一起放掉
   * （不然 runAgent 会一直等那个永远不会被点的弹窗）
   */
  const stop = useCallback(() => {
    if (!abortRef.current) return;
    setRunState('stopping');
    stopSpeaking();
    while (approvalQueue.current.length) approvalQueue.current.shift()?.resolve(false);
    setPending(null);
    setPendingCount(0);
    while (budgetQueue.current.length) budgetQueue.current.shift()?.resolve(0);
    setBudgetAsk(null);
    abortRef.current.abort();
  }, []);

  /** 用户对预算弹窗做了选择：出队（并行时可能排着队） */
  const resolveBudget = useCallback((extra: number) => {
    const cur = budgetQueue.current.shift();
    cur?.resolve(extra);
    setBudgetAsk(budgetQueue.current[0] ?? null);
  }, []);

  /* ---------- ask_user 卡片 ---------- */

  const [askReq, setAskReq] = useState<AskRequest | null>(null);
  const askQueue = useRef<{ req: AskRequest; resolve: (a: AskAnswer | null) => void }[]>([]);

  useEffect(() => {
    setAskUser(
      (req) =>
        new Promise<AskAnswer | null>((resolve) => {
          askQueue.current.push({ req, resolve });
          setAskReq((cur) => cur ?? askQueue.current[0].req);
        }),
    );
    return () => setAskUser(null);
  }, []);

  const resolveAsk = useCallback((answer: AskAnswer | null) => {
    const cur = askQueue.current.shift();
    cur?.resolve(answer);
    setAskReq(askQueue.current[0]?.req ?? null);
  }, []);

  const notifyStopped = useCallback(() => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    push('system', tRef.current('chat.stopped'));
  }, [push]);

  const addSpeaking = useCallback((id: string) => {
    setSpeakingIds((p) => (p.includes(id) ? p : [...p, id]));
  }, []);
  const removeSpeaking = useCallback((id: string) => {
    setSpeakingIds((p) => p.filter((x) => x !== id));
  }, []);

  /** 把 agent 事件写进 ctx 对应的气泡（并行时每个 run 各用一份） */
  const makeOnEvent = useCallback(
    (ctx: RunCtx, quiet = false) => (e: AgentEvent) => {
      switch (e.type) {
        case 'assistant_delta': {
          ctx.text += e.text;
          if (quiet) break;
          if (!ctx.streamId) {
            ctx.streamId = push('assistant', '', ctx.speaker, undefined, ctx.phase);
            ctx.bubbleId = ctx.streamId;
          }
          appendTo(ctx.streamId, e.text);
          break;
        }
        case 'usage':
          ctx.tokens = e.used;
          setUsage({ used: e.used, budget: e.budget });
          break;
        case 'tool_start':
          ctx.streamId = null;
          ctx.tools.push({ name: e.name });
          if (quiet) break;
          ctx.toolId = push(
            'tool',
            `${e.name}  ${JSON.stringify(e.args).slice(0, 300)}`,
            ctx.speaker,
            { name: e.name, args: e.args },
            ctx.phase,
          );
          break;
        case 'tool_result': {
          const id = ctx.toolId;
          const ok = !!e.result?.ok;
          if (quiet && !id) break;
          const brief = ok
            ? `✓ ${String(e.result.stdout ?? JSON.stringify(e.result.data ?? 'ok')).slice(0, 400)}`
            : `⛔ ${String(e.result?.stderr ?? 'failed').slice(0, 400)}`;
          if (id) {
            setBubbles((prev) =>
              prev.map((b) =>
                b.id === id
                  ? { ...b, text: `${b.text}\n${brief}`, tool: { ...b.tool!, ok, done: true } }
                  : b,
              ),
            );
          }
          {
            const last = ctx.tools[ctx.tools.length - 1];
            if (last) last.ok = ok;
          }
          ctx.toolId = null;
          break;
        }
        case 'aborted':
          ctx.streamId = null;
          notifyStopped();
          break;
        case 'error':
          ctx.streamId = null;
          ctx.error = e.message;
          if (!quiet) push('error', ctx.speaker ? `${ctx.speaker}：${e.message}` : e.message);
          break;
        case 'done':
          ctx.streamId = null;
          break;
      }
    },
    [appendTo, notifyStopped, push],
  );

  const checkHealth = useCallback(async (c?: Config) => {
    const target = c ?? cfgRef.current;
    const tt = makeT(target.lang);
    setHealth(tt('health.checking'));
    try {
      const r = await execHealth(target);
      setHealth(r?.ok ? tt('health.online') : tt('health.error'));
    } catch (e: any) {
      setHealth(`${tt('health.down')}（${String(e?.message ?? e).slice(0, 40)}）`);
    }
  }, []);

  /** 把所有启用例程的下次触发时间预约到系统通知里（App 不在前台也能弹） */
  const syncScheduled = useCallback(async () => {
    await cancelAllScheduled();
    const all = await store.listRoutines();
    for (const r of all) {
      if (!r.enabled) continue;
      const due = nextDue(r);
      if (!due) continue;
      await scheduleAt(
        due,
        `${r.name}`,
        r.description || r.schedule || '',
        `routine-${r.id}`,
      );
    }
  }, []);

  const reloadData = useCallback(async () => {
    const aid = agentRef.current;
    const [memories, skills, routines] = await Promise.all([
      store.listMemories(aid),
      store.listSkills(aid),
      store.listRoutines(aid),
    ]);
    setData({ memories, skills, routines });
  }, []);

  /** 某助手这一轮实际生效的 token 上限（null = 不限制） */
  const limitFor = useCallback((agentId: string): number | null => {
    const c = cfgRef.current;
    const a = agentsRef.current.find((x) => x.id === agentId);
    const mode = a?.tokenLimitMode ?? 'global';
    if (mode === 'unlimited') return null;
    if (mode === 'custom') return a?.tokenLimit && a.tokenLimit > 0 ? a.tokenLimit : null;
    return c.tokenLimitEnabled ? c.tokenLimit : null;
  }, []);

  /** 跑一个外接 MCP 工具 */
  const runMcp = useCallback(async (serverId: string, tool: string, args: any) => {
    const srv = cfgRef.current.mcpServers.find((x) => x.id === serverId);
    if (!srv) return { ok: false, text: '找不到这个 MCP 服务器（可能已被删除）' };
    try {
      return await callTool(srv, tool, args);
    } catch (e: any) {
      return { ok: false, text: String(e?.message ?? e) };
    }
  }, []);

  /**
   * 让「一个助手」说一轮话。群协作里会被反复调用：
   * 默认给它一段干净的上下文（各干各的，互不污染），单聊时沿用同一段历史。
   */
  const runOne = useCallback(
    async (
      agentId: string,
      prompt: string,
      opts: {
        phase?: Bubble['phase'];
        fresh?: boolean;
        signal?: AbortSignal;
        /** 群聊里标注说话人；单聊不标 */
        label?: boolean;
        attachments?: PickedAttachment[];
        /** true = 过程不刷气泡（群协作里成员干活用，结果走私聊） */
        quiet?: boolean;
      } = {},
    ): Promise<{ text: string; bubbleId: string | null; messages: Msg[] }> => {
      const a = agentsRef.current.find((x) => x.id === agentId);
      const c = await effectiveCfg(agentId);
      const ctx: RunCtx = {
        agentId,
        speaker: opts.label ? (a?.name ?? agentId) : undefined,
        phase: opts.phase,
        streamId: null,
        toolId: null,
        text: '',
        bubbleId: null,
        tools: [],
      };
      addSpeaking(agentId);
      const startedAt = Date.now();
      const limit = limitFor(agentId);
      let messages: Msg[] = historyRef.current;
      try {
        messages = await runAgent({
          cfg: c,
          lang: c.lang,
          agentId,
          history: opts.fresh === false ? historyRef.current : initialHistory(c.lang),
          userText: prompt,
          onEvent: makeOnEvent(ctx, opts.quiet),
          approve: makeApprove(agentId),
          signal: opts.signal,
          attachments: opts.attachments?.map((a) => ({
            kind: a.kind,
            name: a.name,
            mime: a.mime,
            path: a.path,
            dataUrl: a.kind === 'image' ? dataUrlFor(a) : undefined,
          })),
          extraTools: mcpToolSpecs(mcpToolsRef.current),
          runMcpTool: runMcp,
          budgetTokens: limit ?? undefined,
          onBudget: limit == null ? undefined : askBudget,
        });
        setAgentHealth((h) => ({ ...h, [agentId]: 'ok' }));
      } catch (e: any) {
        if (!opts.signal?.aborted) {
          push('error', `${a?.name ?? agentId}：${String(e?.message ?? e)}`);
          setAgentHealth((h) => ({ ...h, [agentId]: 'error' }));
        }
      } finally {
        removeSpeaking(agentId);
      }
      lastAnswerRef.current = ctx.text;
      void addRun({
        id: newRunId(),
        at: startedAt,
        agentId,
        agentName: a?.name,
        phase: opts.phase ?? (opts.label ? 'work' : 'single'),
        model: c.model,
        provider: providerInfo(a).provider?.name,
        ms: Date.now() - startedAt,
        tokens: ctx.tokens,
        tools: ctx.tools,
        text: ctx.text.slice(0, 200),
        error: ctx.error,
      });
      return { text: ctx.text, bubbleId: ctx.bubbleId, messages };
    },
    [
      addSpeaking,
      askBudget,
      effectiveCfg,
      limitFor,
      makeApprove,
      makeOnEvent,
      providerInfo,
      push,
      removeSpeaking,
      runMcp,
    ],
  );

  /**
   * 成员干完活：①写进它的私聊会话 ②给你推一条通知 ③群里只留一行可点开的进度。
   * 这是"各个助手单独给我发消息"的实现（群里只保留组长的派发与总结）。
   */
  const deliverReport = useCallback(
    async (
      agent: store.Agent,
      r: { name: string; task: string; output: string; ok: boolean; ms: number; skipped?: string },
      roomName: string,
    ) => {
      const body = r.ok
        ? r.output
        : r.skipped
          ? `这一份没做成：${r.skipped}`
          : '这一份没做成（没有产出，可能是接口报错）';
      try {
        await sessions.appendToAgentSession(agent.id, {
          bubble: { id: nextId(), role: 'assistant', text: body, speaker: agent.name },
          message: {
            role: 'assistant',
            content: `[群任务 · ${roomName}] ${r.task}\n\n${body}`,
          },
        });
      } catch (e: any) {
        diag('dm-fail', { e: String(e?.message ?? e) });
      }
      push(
        'system',
        tRef.current('orchestra.dmLine', {
          name: agent.name,
          s: (r.ms / 1000).toFixed(0),
          ok: r.ok ? '✅' : '⛔',
        }),
        undefined,
        undefined,
        undefined,
        { kind: 'agent', agentId: agent.id, label: agent.name },
      );
      try {
        await notifyNow(
          cfgRef.current,
          tRef.current('orchestra.dmTitle', { name: agent.name }),
          body.slice(0, 180),
          { withReply: true },
        );
      } catch {
        // 通知不可用就算了，私聊会话里还有
      }
    },
    [push],
  );

  /**
   * 群聊一轮：
   *   用户下令 → 组长拆活 → 各成员单独向用户汇报 → 成果汇总回组长 → 组长在群里总结。
   * 如果用户用 @ 点名，就只有被点到的助手回答（组长和其他人都不插话）。
   */
  const runRoomTurn = useCallback(
    async (userText: string, opts: { silentBubble?: boolean; signal?: AbortSignal } = {}) => {
      const room = roomsRef.current.find((r) => r.id === roomIdRef.current);
      const roster = room
        ? rooms
            .roomAgentIds(room)
            .map((id) => agentsRef.current.find((a) => a.id === id))
            .filter((a): a is store.Agent => !!a)
        : [];
      // 群被解散、成员被删光：退化成单聊
      if (!room || !roster.length) {
        roomIdRef.current = '';
        setCurrentRoomId('');
        return runOne(agentRef.current, userText, { fresh: false, signal: opts.signal });
      }
      const leader = roster.find((a) => a.id === room.leaderId) ?? roster[0];
      const members = roster.filter((a) => a.id !== leader.id);
      const asMember = (x: store.Agent): Member => ({
        id: x.id,
        name: x.name,
        description: x.description,
      });

      if (!opts.silentBubble) push('user', userText);
      if (!titleRef.current) {
        titleRef.current = sessions.titleFrom(userText, tRef.current('chats.untitled'));
      }
      lastUserTextRef.current = userText;
      historyRef.current = [...historyRef.current, { role: 'user', content: userText }];

      // 1) 点名：只叫被点到的助手
      const mentioned = parseMentions(userText, roster.map(asMember));
      if (mentioned.length) {
        for (const who of mentioned) {
          const a = roster.find((x) => x.id === who.id);
          if (!a) continue;
          const out = await runOne(
            a.id,
            mentionPrompt(
              userText,
              mentioned.map((x) => x.name),
              a.name,
            ),
            { phase: 'work', label: true, signal: opts.signal },
          );
          historyRef.current = [
            ...historyRef.current,
            { role: 'assistant', content: `[${a.name}] ${out.text}` },
          ];
        }
        return;
      }

      // 群里只有组长一个人 → 就是普通对话
      if (!members.length) {
        const out = await runOne(leader.id, userText, { signal: opts.signal });
        historyRef.current = [...historyRef.current, { role: 'assistant', content: out.text }];
        return;
      }

      // 2) 组长拆活
      const plan = await runOne(
        leader.id,
        dispatchPrompt(userText, leader.name, members.map(asMember)),
        { phase: 'plan', label: true, signal: opts.signal },
      );
      let visiblePlan = plan.text;
      if (plan.bubbleId) {
        const cleaned = stripPlanBlock(plan.text);
        visiblePlan = cleaned;
        if (cleaned !== plan.text) {
          const id = plan.bubbleId;
          setBubbles((prev) =>
            prev.map((b) =>
              b.id === id ? { ...b, text: cleaned || tRef.current('orchestra.plan') } : b,
            ),
          );
        }
      }
      historyRef.current = [
        ...historyRef.current,
        { role: 'assistant', content: `[${leader.name}] ${visiblePlan}` },
      ];

      const tasks = parseAssignments(plan.text, members.map(asMember));
      if (!tasks.length) {
        push('system', tRef.current('orchestra.noWorker'));
        return;
      }
      push(
        'system',
        tasks
          .map((x) => tRef.current('orchestra.planLine', { name: x.agent, task: x.task }))
          .join('\n'),
      );

      // 3) 成员干活：同一波并行跑，有 after 依赖的排到下一波
      type Done = {
        name: string;
        task: string;
        output: string;
        ok: boolean;
        ms: number;
        skipped?: string;
      };
      const doneMap = new Map<string, Done>();
      const results: Done[] = [];
      const waves = planWaves(tasks);
      for (const [wi, wave] of waves.entries()) {
        if (opts.signal?.aborted) break;
        if (waves.length > 1) {
          push('system', tRef.current('orchestra.wave', { i: wi + 1, n: waves.length }));
        }
        const settled = await Promise.all(
          wave.map(async (task): Promise<Done | null> => {
            const a = members.find((x) => x.name === task.agent);
            if (!a) return null;
            // 依赖没成 → 直接跳过，别让它拿着空上下文瞎猜
            const failedDeps = (task.after ?? []).filter((n) => doneMap.get(n)?.ok === false);
            if (failedDeps.length) {
              return {
                name: a.name,
                task: task.task,
                output: '',
                ok: false,
                ms: 0,
                skipped: `前置「${failedDeps.join('、')}」没有产出`,
              };
            }
            const deps = (task.after ?? []).map((n) => ({
              name: n,
              output: doneMap.get(n)?.output ?? '',
            }));
            const t0 = Date.now();
            const out = await runOne(
              a.id,
              workerPrompt(userText, task.task, leader.name, a.name, deps),
              { phase: 'work', label: true, signal: opts.signal, quiet: true },
            );
            const text = out.text.trim();
            return {
              name: a.name,
              task: task.task,
              output: out.text,
              ok: !!text,
              ms: Date.now() - t0,
            };
          }),
        );
        // 这一波跑完：各自私聊汇报 + 通知 + 群内一行进度
        for (const r of settled) {
          if (!r) continue;
          doneMap.set(r.name, r);
          results.push(r);
          const a = members.find((x) => x.name === r.name);
          if (a) await deliverReport(a, r, room.name);
        }
      }

      // 中途被叫停：已拿到的成果照常留在记录里，不再跑组长总结
      if (opts.signal?.aborted) {
        notifyStopped();
        for (const r of results) {
          historyRef.current = [
            ...historyRef.current,
            { role: 'assistant', content: `[${r.name}] ${r.output}` },
          ];
        }
        return;
      }
      for (const r of results) {
        historyRef.current = [
          ...historyRef.current,
          { role: 'assistant', content: `[${r.name}] ${r.output}` },
        ];
      }
      if (!results.length) return;

      // 4) 成果交回组长，由组长向用户总结
      push('system', tRef.current('orchestra.collect', { n: results.length }));
      const final = await runOne(
        leader.id,
        summaryPrompt(
          userText,
          leader.name,
          results.map((r) => ({
            name: r.name,
            task: r.task,
            output: r.ok ? r.output : `（这一份没做成：${r.skipped ?? '没有产出或报错'}）`,
          })),
        ),
        {
        phase: 'summary',
        label: true,
        signal: opts.signal,
      });
      historyRef.current = [
        ...historyRef.current,
        { role: 'assistant', content: `[${leader.name}] ${final.text}` },
      ];
    },
    [deliverReport, notifyStopped, push, runOne],
  );

  const runTurn = useCallback(
    async (
      userText: string,
      opts: { silentBubble?: boolean; agentId?: string; attachments?: PickedAttachment[] } = {},
    ) => {
      // 已经有一轮在跑就不叠（用户可以先点「停止」）
      if (abortRef.current) return '';
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      stoppedRef.current = false;
      setRunState('running');
      setBusy(true);
      let answer = '';
      try {
        // 群聊会话且没有指定助手 → 走群协作编排
        if (roomIdRef.current && !opts.agentId) {
          await runRoomTurn(userText, { ...opts, signal: ctrl.signal });
          return answer;
        }
        const who = opts.agentId ?? agentRef.current;
        lastUserTextRef.current = userText;
        if (!opts.silentBubble) push('user', userText);
        if (!titleRef.current) {
          titleRef.current = sessions.titleFrom(userText, tRef.current('chats.untitled'));
        }
        const out = await runOne(who, userText, {
          fresh: false,
          signal: ctrl.signal,
          attachments: opts.attachments,
        });
        if (out.messages.length) historyRef.current = out.messages;
        answer = out.text;
        return out.text;
      } finally {
        abortRef.current = null;
        setRunState('idle');
        setBusy(false);
        setSpeakingIds([]);
        // 自动朗读：只念这一轮最后说话的那位（群协作里就是组长的总结）
        if (cfgRef.current.ttsAuto && !ctrl.signal.aborted && lastAnswerRef.current.trim()) {
          speak(lastAnswerRef.current, { rate: cfgRef.current.ttsRate ?? 1 });
        }
        persistSession(true);
        await reloadData();
        await syncScheduled();
      }
    },
    [persistSession, push, reloadData, runOne, runRoomTurn, syncScheduled],
  );

  const send = useCallback(
    async (text: string, attachments?: PickedAttachment[]) => {
      const trimmed = text.trim();
      if (!trimmed && !attachments?.length) return;
      await runTurn(trimmed || '（看附件）', { attachments });
    },
    [runTurn],
  );

  const saveCfg = useCallback(
    async (next: Config) => {
      const reset = next.lang !== cfg.lang || next.apiKey !== cfg.apiKey;
      await saveConfig(next);
      setCfg(next);
      if (reset) {
        const tt = makeT(next.lang);
        setBubbles([{ id: nextId(), role: 'system', text: tt('app.greeting') }]);
        historyRef.current = initialHistory(next.lang);
      }
      await checkHealth(next);
      void refreshMcp();
    },
    [cfg.lang, cfg.apiKey, checkHealth, refreshMcp],
  );

  /** 开一段新会话（roomId 有值 = 群聊会话） */
  const startSession = useCallback(async (agentId: string, greeting: string, roomId?: string) => {
    const sid = sessions.newSessionId();
    sessionIdRef.current = sid;
    roomIdRef.current = roomId ?? '';
    setCurrentRoomId(roomId ?? '');
    titleRef.current = '';
    setCurrentSessionId(sid);
    setBubbles([{ id: nextId(), role: 'system', text: greeting }]);
    historyRef.current = initialHistory(cfgRef.current.lang);
    await sessions.upsertSession({
      id: sid,
      title: greeting,
      agentId,
      roomId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      bubbles: [],
      messages: [],
    });
    setSessionList(await sessions.listSessions());
  }, []);

  const newChat = useCallback(async () => {
    await startSession(agentRef.current, tRef.current('app.greeting'));
  }, [startSession]);

  /** 打开已有会话（会连同它的助手/群一起切过去） */
  const openSession = useCallback(async (id: string) => {
    const sess = await sessions.getSession(id);
    if (!sess) return;
    sessionIdRef.current = sess.id;
    titleRef.current = sess.title;
    roomIdRef.current = sess.roomId ?? '';
    setCurrentRoomId(sess.roomId ?? '');
    setCurrentSessionId(sess.id);
    setBubbles(
      sess.bubbles?.length
        ? sess.bubbles
        : [{ id: nextId(), role: 'system', text: tRef.current('app.greeting') }],
    );
    historyRef.current = (sess.messages?.length
      ? sess.messages
      : initialHistory(cfgRef.current.lang)) as typeof historyRef.current;
    if (sess.agentId && sess.agentId !== agentRef.current) {
      agentRef.current = sess.agentId;
      setToolAgent(sess.agentId);
      const next = { ...cfgRef.current, activeAgentId: sess.agentId };
      await saveConfig(next);
      setCfg(next);
      await reloadData();
    }
  }, [reloadData]);

  /* ---------------- 助手群 ---------------- */

  const createRoom = useCallback(
    async (name: string, leaderId: string, memberIds: string[]) => {
      const r = await rooms.upsertRoom({ name, leaderId, memberIds });
      const list = await rooms.listRooms();
      roomsRef.current = list;
      setRoomList(list);
      if (leaderId !== agentRef.current) {
        agentRef.current = leaderId;
        setToolAgent(leaderId);
        const nextCfg = { ...cfgRef.current, activeAgentId: leaderId };
        await saveConfig(nextCfg);
        setCfg(nextCfg);
      }
      await startSession(leaderId, `群「${r.name}」已创建`, r.id);
      return r;
    },
    [startSession],
  );

  const updateRoom = useCallback(
    async (
      id: string,
      patch: { name?: string; leaderId?: string; memberIds?: string[] },
    ) => {
      const cur = roomsRef.current.find((r) => r.id === id);
      if (!cur) return;
      await rooms.upsertRoom({
        id,
        name: patch.name ?? cur.name,
        leaderId: patch.leaderId ?? cur.leaderId,
        memberIds: patch.memberIds ?? cur.memberIds,
      });
      const list = await rooms.listRooms();
      roomsRef.current = list;
      setRoomList(list);
    },
    [],
  );

  const openRoom = useCallback(
    async (roomId: string) => {
      const sess = await sessions.latestSessionOfRoom(roomId);
      if (sess) {
        await openSession(sess.id);
        return;
      }
      const r = roomsRef.current.find((x) => x.id === roomId);
      await startSession(r?.leaderId ?? agentRef.current, `群「${r?.name ?? ''}」`, roomId);
    },
    [openSession, startSession],
  );

  const deleteRoom = useCallback(
    async (id: string) => {
      await rooms.removeRoom(id);
      const list = await rooms.listRooms();
      roomsRef.current = list;
      setRoomList(list);
      if (roomIdRef.current === id) await newChat();
    },
    [newChat],
  );

  const deleteSession = useCallback(
    async (id: string) => {
      await sessions.removeSession(id);
      const list = await sessions.listSessions();
      setSessionList(list);
      if (id === sessionIdRef.current) {
        if (list[0]) await openSession(list[0].id);
        else await startSession(agentRef.current, tRef.current('app.greeting'));
      }
    },
    [openSession, startSession],
  );

  const switchAgent = useCallback(
    async (id: string) => {
      agentRef.current = id;
      setToolAgent(id);
      const next = { ...cfgRef.current, activeAgentId: id };
      await saveConfig(next);
      setCfg(next);
      // 换助手 = 换人格：开一段属于它的新会话（避免上个助手的历史污染新人设）
      const a = await store.getAgent(id);
      await reloadData();
      await startSession(id, `已切换到「${a?.name ?? id}」`);
    },
    [reloadData, startSession],
  );

  /** 打开某个助手的私聊（没有就新开一段） */
  const openAgentChat = useCallback(
    async (agentId: string) => {
      const list = await sessions.listSessions();
      const s = list.find((x) => !x.roomId && x.agentId === agentId);
      if (s) {
        await openSession(s.id);
        return;
      }
      await switchAgent(agentId);
    },
    [openSession, switchAgent],
  );

  /* ---------------- 模型供应商 / 分组 ---------------- */

  const saveProvider = useCallback(
    async (input: {
      id?: string;
      name: string;
      baseUrl: string;
      model: string;
      note?: string;
      apiKey?: string;
      vision?: boolean;
    }) => {
      const p = await providerStore.upsertProvider({
        id: input.id,
        name: input.name,
        baseUrl: input.baseUrl,
        model: input.model,
        note: input.note,
        vision: input.vision,
      });
      if (input.apiKey !== undefined) {
        await setSecret(providerSecret(p.id), input.apiKey.trim());
      }
      providersRef.current = await providerStore.listProviders();
      setProviderList(providersRef.current);
      await refreshProviderKeys();
      return p;
    },
    [refreshProviderKeys],
  );

  const deleteProvider = useCallback(
    async (id: string) => {
      await providerStore.removeProvider(id);
      await setSecret(providerSecret(id), '');
      providersRef.current = await providerStore.listProviders();
      setProviderList(providersRef.current);
      await refreshProviderKeys();
    },
    [refreshProviderKeys],
  );

  const setGroupProvider = useCallback(async (group: string, providerId: string) => {
    const g = group.trim() || '未分组';
    const nextMap = { ...cfgRef.current.groupProviders };
    if (providerId) nextMap[g] = providerId;
    else delete nextMap[g];
    const next = { ...cfgRef.current, groupProviders: nextMap };
    await saveConfig(next);
    setCfg(next);
  }, []);

  const setGroupColor = useCallback(async (group: string, familyKey: string) => {
    const g = group.trim() || '未分组';
    const nextMap = { ...cfgRef.current.groupColors };
    if (familyKey) nextMap[g] = familyKey;
    else delete nextMap[g];
    const next = { ...cfgRef.current, groupColors: nextMap };
    await saveConfig(next);
    setCfg(next);
  }, []);

  const setRoomMembers = useCallback(async (ids: string[]) => {
    const next = { ...cfgRef.current, roomAgentIds: ids };
    await saveConfig(next);
    setCfg(next);
  }, []);

  const saveAgent = useCallback(
    async (input: Parameters<typeof store.upsertAgent>[0]) => {
      const a = await store.upsertAgent(input);
      setAgents(await store.listAgents());
      void refreshAgentKeys();
      return a;
    },
    [refreshAgentKeys],
  );

  const deleteAgent = useCallback(
    async (id: string) => {
      await store.removeAgent(id);
      setAgents(await store.listAgents());
      if (agentRef.current === id) await switchAgent(store.DEFAULT_AGENT_ID);
      else await reloadData();
    },
    [reloadData, switchAgent],
  );

  const clearChat = useCallback(() => {
    setBubbles([{ id: nextId(), role: 'system', text: tRef.current('app.greeting') }]);
    historyRef.current = initialHistory(cfgRef.current.lang);
  }, []);

  /**
   * 助手状态（本地推算，没有后端）：
   * 忙碌 = 正在生成；下线 = 没配 Key 或上一次请求失败；其余为在线。
   */
  const presenceOf = useCallback(
    (agentId: string): 'online' | 'busy' | 'offline' => {
      if (speakingIds.includes(agentId)) return 'busy';
      if (!agentKeyOk(agentId)) return 'offline';
      if (agentHealth[agentId] === 'error') return 'offline';
      return 'online';
    },
    [speakingIds, agentHealth, agentKeyOk],
  );

  // 启动：载配置 + 通知 + 调度 + 通知回复监听
  useEffect(() => {
    let stopScheduler: (() => void) | null = null;
    (async () => {
      diag('boot', 'startup begin');
      let c = DEFAULT_CONFIG;
      try {
        c = await loadConfig();
        diag('boot', 'config loaded');
      } catch (e) {
        diag('boot-fail', { where: 'loadConfig', e });
        throw e;
      }
      const list = await store.ensureAgents();
      diag('boot', `agents loaded (${list.length})`);
      await reloadRuns();
      await reloadCredentials();
      void refreshBackground();
      const provs = await providerStore.ensureProviders();
      providersRef.current = provs;
      setProviderList(provs);
      diag('boot', `providers loaded (${provs.length})`);
      void refreshProviderKeys();
      const roomItems = await rooms.listRooms();
      roomsRef.current = roomItems;
      setRoomList(roomItems);
      diag('boot', `rooms loaded (${roomItems.length})`);
      const exists = list.some((a) => a.id === c.activeAgentId);
      const activeId = exists ? c.activeAgentId : (list[0]?.id ?? store.DEFAULT_AGENT_ID);
      const c2 = { ...c, activeAgentId: activeId };
      if (activeId !== c.activeAgentId) await saveConfig(c2);
      agentRef.current = activeId;
      setToolAgent(activeId);
      setAgents(list);
      agentsRef.current = list;
      void refreshAgentKeys();
      setCfg(c2);
      // 恢复上次的会话（含群聊会话）；没有就新建一段
      const all = await sessions.listSessions();
      const last = all[0];
      if (last) {
        sessionIdRef.current = last.id;
        titleRef.current = last.title;
        roomIdRef.current = last.roomId ?? '';
        setCurrentRoomId(last.roomId ?? '');
        setCurrentSessionId(last.id);
        if (last.agentId && last.agentId !== agentRef.current) {
          agentRef.current = last.agentId;
          setToolAgent(last.agentId);
        }
        setBubbles(
          last.bubbles?.length
            ? last.bubbles
            : [{ id: nextId(), role: 'system', text: makeT(c2.lang)('app.greeting') }],
        );
        historyRef.current = (last.messages?.length
          ? last.messages
          : initialHistory(c2.lang)) as typeof historyRef.current;
        diag('boot', `session restored: ${last.bubbles?.length ?? 0} bubbles`);
      } else {
        const sid = sessions.newSessionId();
        sessionIdRef.current = sid;
        titleRef.current = makeT(c2.lang)('chats.untitled');
        setCurrentSessionId(sid);
        setBubbles([{ id: nextId(), role: 'system', text: makeT(c2.lang)('app.greeting') }]);
        historyRef.current = initialHistory(c2.lang);
        await sessions.upsertSession({
          id: sid,
          title: titleRef.current,
          agentId: activeId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          bubbles: [],
          messages: [],
        });
      }
      setSessionList(await sessions.listSessions());
      void refreshMcp();
      setReady(true);
      diag('boot', 'ready');
      await checkHealth(c2);
      await reloadData();
      await syncScheduled();
      diag('boot', 'first screen data loaded');

      const n = await setupNotifications();
      setNotifyAvailable(n.available);
      setNotifyGranted(n.granted);

      stopScheduler = startScheduler(
        async (routine) => {
          const tt = tRef.current;
          push('system', tt('routine.fired', { name: routine.name }));
          const prompt = `[例程触发] ${routine.name}${routine.description ? '：' + routine.description : ''}（时间设定 ${routine.schedule || '未指定'}）`;
          await cancelScheduled(`routine-${routine.id}`);
          const answer = await runTurn(prompt, {
            silentBubble: true,
            agentId: routine.agentId ?? store.DEFAULT_AGENT_ID,
          });
          await notifyNow(cfgRef.current, tt('routine.done', { name: routine.name }), answer || '（没有输出）', {
            withReply: true,
          });
        },
        (st) => setSched({ running: st.running, nextAt: st.nextAt }),
      );
      diag('boot', 'startup done');
    })().catch((e) => {
      // 以前这里的 rejection 会变成未处理拒绝，release 下直接白屏退出
      diag('boot-fail', { where: 'startup', e });
      push('system', `启动时出错：${String((e as any)?.message ?? e)}`);
    });

    const sub = onNotificationResponse(async (payload) => {
      if (!payload.userText) return;
      const answer = await runTurn(payload.userText);
      await notifyNow(cfgRef.current, tRef.current('reply.title'), answer || '（没有输出）', {
        withReply: true,
      });
    });

    return () => {
      stopScheduler?.();
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: AppState = {
    ready,
    cfg,
    t,
    health,
    bubbles,
    busy,
    usage,
    sched,
    notifyAvailable,
    notifyGranted,
    data,
    agents,
    activeAgentId: cfg.activeAgentId,
    activeAgent: agents.find((a) => a.id === cfg.activeAgentId),
    switchAgent,
    syncScheduled,
    roomAgents: agents.filter(
      (a) => a.id === cfg.activeAgentId || cfg.roomAgentIds.includes(a.id),
    ),
    setRoomMembers,
    saveAgent,
    deleteAgent,
    reloadData,
    checkHealth,
    saveCfg,
    send,
    runTurn,
    clearChat,
    push,
    presenceOf,
    runState,
    stop,
    speakingIds,
    effectiveCfg,
    refreshAgentKeys,
    agentHasKey,
    sessions: sessionList,
    currentSessionId,
    newChat,
    openSession,
    deleteSession,
    mcpTools,
    mcpStatus,
    refreshMcp,
    roomList,
    currentRoom: roomList.find((r) => r.id === currentRoomId),
    currentRoomAgents: (() => {
      const r = roomList.find((x) => x.id === currentRoomId);
      if (!r) return [];
      return rooms
        .roomAgentIds(r)
        .map((id) => agents.find((a) => a.id === id))
        .filter((a): a is store.Agent => !!a);
    })(),
    createRoom,
    updateRoom,
    deleteRoom,
    openRoom,
    openAgentChat,
    limitFor,
    providers: providerList,
    providerKeys: providerKeyMap,
    providerInfo,
    saveProvider,
    deleteProvider,
    setGroupProvider,
    setGroupColor,
    permRules: cfg.permRules ?? {},
    savePermRule,
    sessionAllows,
    clearSessionAllows,
    runs,
    reloadRuns,
    clearRuns,
    credentials,
    reloadCredentials,
    saveCredential,
    deleteCredential,
    bg,
    toggleBackground,
    refreshBackground,
  };

  return (
    <AppCtx.Provider value={value}>
      {children}
      <ApprovalModal pending={pending} count={pendingCount} onResolve={resolvePending} t={t} />
      <BudgetModal ask={budgetAsk} onResolve={resolveBudget} t={t} />
      <AskModal
        key={askReq ? `${askReq.title}|${askReq.fields.map((f) => f.label).join(',')}` : 'none'}
        req={askReq}
        onSubmit={resolveAsk}
        t={t}
      />
    </AppCtx.Provider>
  );
}

/* ---------- 全局弹卡（覆盖在任何页面之上） ---------- */

function ApprovalModal({
  pending,
  count,
  onResolve,
  t,
}: {
  pending: { name: string; args: any; agentId: string; noAlways?: boolean } | null;
  count: number;
  onResolve: (decision: 'once' | 'session' | 'always' | 'deny') => void;
  t: TFn;
}) {
  return (
    <Modal visible={!!pending} transparent animationType="fade">
      <View style={m.mask}>
        <View style={m.card}>
          <Text style={m.title}>
            {t('approval.title')}
            {count > 1 ? `（还有 ${count - 1} 个排队）` : ''}
          </Text>
          <Text style={m.tool}>{pending?.name}</Text>
          <ScrollView style={{ maxHeight: 220 }}>
            <Text style={m.args}>{JSON.stringify(pending?.args, null, 2)}</Text>
          </ScrollView>
          <View style={m.row}>
            <TouchableOpacity
              style={[m.btn, { backgroundColor: '#f0f0f3' }]}
              onPress={() => onResolve('deny')}
            >
              <Text style={m.btnTxt}>{t('approval.deny')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[m.btn, { backgroundColor: '#0a84ff' }]}
              onPress={() => onResolve('once')}
            >
              <Text style={[m.btnTxt, { color: '#fff' }]}>{t('approval.allow')}</Text>
            </TouchableOpacity>
          </View>
          <View style={m.row}>
            <TouchableOpacity
              style={[m.btn, { backgroundColor: '#eef4ff' }]}
              onPress={() => onResolve('session')}
            >
              <Text style={[m.btnTxt, { color: '#0a84ff' }]}>{t('approval.session')}</Text>
            </TouchableOpacity>
            {pending?.noAlways ? null : (
              <TouchableOpacity
                style={[m.btn, { backgroundColor: '#eef4ff' }]}
                onPress={() => onResolve('always')}
              >
                <Text style={[m.btnTxt, { color: '#0a84ff' }]}>{t('approval.always')}</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={m.note}>{t('approval.note')}</Text>
        </View>
      </View>
    </Modal>
  );
}

function BudgetModal({
  ask,
  onResolve,
  t,
}: {
  ask: { used: number; budget: number } | null;
  onResolve: (extra: number) => void;
  t: TFn;
}) {
  return (
    <Modal visible={!!ask} transparent animationType="fade">
      <View style={m.mask}>
        <View style={m.card}>
          <Text style={m.title}>{t('budget.title')}</Text>
          <Text style={m.args}>
            {t('budget.line', { used: ask?.used ?? 0, budget: ask?.budget ?? 0 })}
          </Text>
          <View style={m.row}>
            <TouchableOpacity
              style={[m.btn, { backgroundColor: '#f0f0f3' }]}
              onPress={() => onResolve(0)}
            >
              <Text style={m.btnTxt}>{t('budget.stop')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[m.btn, { backgroundColor: '#0a84ff' }]}
              onPress={() => onResolve(100000)}
            >
              <Text style={[m.btnTxt, { color: '#fff' }]}>{t('budget.more')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ---------- ask_user：结构化提问卡片 ---------- */

function AskModal({
  req,
  onSubmit,
  t,
}: {
  req: AskRequest | null;
  onSubmit: (answer: AskAnswer | null) => void;
  t: TFn;
}) {
  const [vals, setVals] = useState<Record<string, string | string[] | boolean>>({});

  if (!req) return null;
  const keyOf = (f: { key?: string; label: string }, i: number) => f.key || f.label || `f${i}`;
  const ready = req.fields.every((f, i) => {
    const v = vals[keyOf(f, i)];
    return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== '';
  });

  return (
    <Modal visible transparent animationType="fade">
      <View style={m.mask}>
        <View style={m.card}>
          <Text style={m.title}>{req.title}</Text>
          {req.description ? <Text style={m.desc}>{req.description}</Text> : null}
          <ScrollView style={{ maxHeight: 380 }}>
            {req.fields.map((f, i) => {
              const k = keyOf(f, i);
              const type = f.type ?? 'text';
              const v = vals[k];
              return (
                <View key={k} style={{ marginBottom: 14 }}>
                  <Text style={m.fieldLabel}>
                    {f.label}
                    {type === 'multi' ? `　（${t('ask.multiHint')}）` : ''}
                  </Text>
                  {type === 'select' || type === 'multi' ? (
                    <View style={m.opts}>
                      {(f.options ?? []).map((o) => {
                        const on =
                          type === 'multi'
                            ? Array.isArray(v) && v.includes(o)
                            : v === o;
                        return (
                          <TouchableOpacity
                            key={o}
                            style={[m.opt, on && m.optOn]}
                            onPress={() =>
                              setVals((prev) =>
                                type === 'multi'
                                  ? {
                                      ...prev,
                                      [k]: Array.isArray(prev[k]) && (prev[k] as string[]).includes(o)
                                        ? (prev[k] as string[]).filter((x) => x !== o)
                                        : [...((prev[k] as string[]) ?? []), o],
                                    }
                                  : { ...prev, [k]: o },
                              )
                            }
                          >
                            <Text style={[m.optTxt, on && m.optTxtOn]}>{o}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : type === 'confirm' ? (
                    <View style={m.row}>
                      <TouchableOpacity
                        style={[m.btn, { backgroundColor: v === true ? '#0a84ff' : '#f0f0f3' }]}
                        onPress={() => setVals((prev) => ({ ...prev, [k]: true }))}
                      >
                        <Text style={[m.btnTxt, v === true && { color: '#fff' }]}>{t('ask.yes')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[m.btn, { backgroundColor: v === false ? '#0a84ff' : '#f0f0f3' }]}
                        onPress={() => setVals((prev) => ({ ...prev, [k]: false }))}
                      >
                        <Text style={[m.btnTxt, v === false && { color: '#fff' }]}>{t('ask.no')}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TextInput
                      style={m.input}
                      value={typeof v === 'string' ? v : ''}
                      onChangeText={(txt) => setVals((prev) => ({ ...prev, [k]: txt }))}
                      placeholder={f.placeholder || t('ask.placeholder')}
                      placeholderTextColor="#9a9a9e"
                      multiline
                    />
                  )}
                </View>
              );
            })}
          </ScrollView>
          <View style={m.row}>
            <TouchableOpacity
              style={[m.btn, { backgroundColor: '#f0f0f3' }]}
              onPress={() => onSubmit(null)}
            >
              <Text style={m.btnTxt}>{t('ask.close')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[m.btn, { backgroundColor: ready ? '#0a84ff' : '#b9d8ff' }]}
              disabled={!ready}
              onPress={() => onSubmit(vals)}
            >
              <Text style={[m.btnTxt, { color: '#fff' }]}>{t('ask.submit')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const m = StyleSheet.create({
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  tool: { fontSize: 15, color: '#0a84ff', marginBottom: 8, fontWeight: '600' },
  args: { fontFamily: 'monospace', fontSize: 12, color: '#333' },
  note: { fontSize: 11, color: '#999', marginTop: 8, lineHeight: 15 },
  row: { flexDirection: 'row', gap: 10, marginTop: 14 },
  desc: { fontSize: 13, color: '#666', marginBottom: 10, lineHeight: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 6 },
  opts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opt: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f0f0f3',
  },
  optOn: { backgroundColor: '#0a84ff' },
  optTxt: { fontSize: 13, color: '#333' },
  optTxtOn: { color: '#fff', fontWeight: '600' },
  input: {
    backgroundColor: '#f5f5f7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
    minHeight: 42,
  },
  btn: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  btnTxt: { fontWeight: '600' },
});
