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
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { DEFAULT_CONFIG, loadConfig, saveConfig, type Config } from './config';
import { execHealth, type Msg } from './api';
import { initialHistory, runAgent, type AgentEvent } from './agent';
import { makeT, type TFn } from './i18n';
import * as store from './store';
import { setActiveAgent as setToolAgent } from './context';
import { startScheduler } from './scheduler';
import { notifyNow, onNotificationResponse, setupNotifications } from './notify';

export type Bubble = {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'error' | 'system';
  text: string;
  /** 房间里是谁在说话 */
  speaker?: string;
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
  /** 房间：参与者（含主答） */
  roomAgents: store.Agent[];
  setRoomMembers: (ids: string[]) => Promise<void>;
  saveAgent: (input: Parameters<typeof store.upsertAgent>[0]) => Promise<store.Agent>;
  deleteAgent: (id: string) => Promise<void>;
  reloadData: () => Promise<void>;
  checkHealth: (c?: Config) => Promise<void>;
  saveCfg: (c: Config) => Promise<void>;
  send: (text: string) => Promise<void>;
  runTurn: (text: string, opts?: { silentBubble?: boolean }) => Promise<string>;
  clearChat: () => void;
  push: (role: Bubble['role'], text: string) => string;
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
  const [pending, setPending] = useState<
    { name: string; args: any; resolve: (ok: boolean) => void } | null
  >(null);
  const [budgetAsk, setBudgetAsk] = useState<
    { used: number; budget: number; resolve: (extra: number) => void } | null
  >(null);

  const t = useMemo(() => makeT(cfg.lang), [cfg.lang]);

  const historyRef = useRef<Msg[]>(initialHistory(DEFAULT_CONFIG.lang));
  const streamIdRef = useRef<string | null>(null);
  const toolIdRef = useRef<string | null>(null);
  const lastTextRef = useRef('');
  const cfgRef = useRef(cfg);
  const tRef = useRef(t);
  const agentRef = useRef<string>(DEFAULT_CONFIG.activeAgentId);
  const speakerRef = useRef<string | undefined>(undefined);
  const agentsRef = useRef<store.Agent[]>([]);

  useEffect(() => {
    cfgRef.current = cfg;
  }, [cfg]);
  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const push = useCallback((role: Bubble['role'], text: string, speaker?: string) => {
    const id = nextId();
    setBubbles((prev) => [...prev, { id, role, text, speaker }]);
    return id;
  }, []);

  const appendTo = useCallback((id: string, chunk: string) => {
    setBubbles((prev) => prev.map((b) => (b.id === id ? { ...b, text: b.text + chunk } : b)));
  }, []);

  const approve = useCallback(
    (name: string, args: any) =>
      new Promise<boolean>((resolve) => {
        setPending({ name, args, resolve });
      }),
    [],
  );

  const onEvent = useCallback(
    (e: AgentEvent) => {
      switch (e.type) {
        case 'assistant_delta': {
          lastTextRef.current += e.text;
          if (!streamIdRef.current) {
            streamIdRef.current = push('assistant', '', speakerRef.current);
          }
          appendTo(streamIdRef.current, e.text);
          break;
        }
        case 'usage':
          setUsage({ used: e.used, budget: e.budget });
          break;
        case 'tool_start':
          streamIdRef.current = null;
          toolIdRef.current = push('tool', `🔧 ${e.name}  ${JSON.stringify(e.args).slice(0, 160)}`);
          break;
        case 'tool_result': {
          const id = toolIdRef.current;
          const brief = e.result?.ok
            ? `✓ ${String(e.result.stdout ?? JSON.stringify(e.result.data ?? 'ok')).slice(0, 400)}`
            : `⛔ ${String(e.result?.stderr ?? 'failed').slice(0, 400)}`;
          if (id) appendTo(id, `\n${brief}`);
          toolIdRef.current = null;
          break;
        }
        case 'error':
          streamIdRef.current = null;
          push('error', `⚠️ ${e.message}`);
          break;
        case 'done':
          streamIdRef.current = null;
          break;
      }
    },
    [appendTo, push],
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

  const reloadData = useCallback(async () => {
    const aid = agentRef.current;
    const [memories, skills, routines] = await Promise.all([
      store.listMemories(aid),
      store.listSkills(aid),
      store.listRoutines(aid),
    ]);
    setData({ memories, skills, routines });
  }, []);

  const runTurn = useCallback(
    async (userText: string, opts: { silentBubble?: boolean; agentId?: string } = {}) => {
      const c = cfgRef.current;
      lastTextRef.current = '';
      streamIdRef.current = null;
      toolIdRef.current = null;
      if (!opts.silentBubble) push('user', userText);
      setBusy(true);
      try {
        const msgs = await runAgent({
          cfg: c,
          lang: c.lang,
          agentId: opts.agentId ?? agentRef.current,
          history: historyRef.current,
          userText,
          onEvent,
          approve,
          budgetTokens: 200000,
          onBudget: (used, budget) =>
            new Promise<number>((resolve) => setBudgetAsk({ used, budget, resolve })),
        });
        historyRef.current = msgs;
      } catch (e: any) {
        push('error', `⚠️ ${String(e?.message ?? e)}`);
      } finally {
        setBusy(false);
        await reloadData();
      }

      // 房间：@点名让其他成员在同一会话里发言
      const mentioned = Array.from(userText.matchAll(/@([^\s@，,。.！!？?、]+)/g)).map(
        (m) => m[1],
      );
      if (mentioned.length && !opts.agentId) {
        const mainId = agentRef.current;
        for (const name of mentioned) {
          const member = agentsRef.current.find(
            (a) => a.id !== mainId && (a.name === name || a.name.startsWith(name)),
          );
          if (!member) continue;
          speakerRef.current = member.name;
          lastTextRef.current = '';
          try {
            await runAgent({
              cfg: c,
              lang: c.lang,
              agentId: member.id,
              history: historyRef.current,
              userText: `[房间协作] 用户点名了 @${member.name}，请以你的身份回应。用户原话：${userText}`,
              onEvent,
              approve,
              budgetTokens: 200000,
            });
            historyRef.current = [
              ...historyRef.current,
              { role: 'assistant', content: `[${member.name}] ${lastTextRef.current}` },
            ];
          } catch (e: any) {
            push('error', `⚠️ ${member.name}：${String(e?.message ?? e)}`);
          } finally {
            speakerRef.current = undefined;
          }
        }
        await reloadData();
      }

      return lastTextRef.current;
    },
    [approve, onEvent, push, reloadData],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      await runTurn(trimmed);
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
    },
    [cfg.lang, cfg.apiKey, checkHealth],
  );

  const switchAgent = useCallback(
    async (id: string) => {
      agentRef.current = id;
      setToolAgent(id);
      const next = { ...cfgRef.current, activeAgentId: id };
      await saveConfig(next);
      setCfg(next);
      // 换助手 = 换人格，会话重新开始（避免上个助手的历史污染新人设）
      const a = await store.getAgent(id);
      setBubbles([
        {
          id: nextId(),
          role: 'system',
          text: `已切换到「${a?.name ?? id}」`,
        },
      ]);
      historyRef.current = initialHistory(next.lang);
      await reloadData();
    },
    [reloadData],
  );

  const setRoomMembers = useCallback(async (ids: string[]) => {
    const next = { ...cfgRef.current, roomAgentIds: ids };
    await saveConfig(next);
    setCfg(next);
  }, []);

  const saveAgent = useCallback(
    async (input: Parameters<typeof store.upsertAgent>[0]) => {
      const a = await store.upsertAgent(input);
      setAgents(await store.listAgents());
      return a;
    },
    [],
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

  // 启动：载配置 + 通知 + 调度 + 通知回复监听
  useEffect(() => {
    let stopScheduler: (() => void) | null = null;
    (async () => {
      const c = await loadConfig();
      const list = await store.ensureAgents();
      const exists = list.some((a) => a.id === c.activeAgentId);
      const activeId = exists ? c.activeAgentId : (list[0]?.id ?? store.DEFAULT_AGENT_ID);
      const c2 = { ...c, activeAgentId: activeId };
      if (activeId !== c.activeAgentId) await saveConfig(c2);
      agentRef.current = activeId;
      setToolAgent(activeId);
      setAgents(list);
      setCfg(c2);
      setBubbles([{ id: nextId(), role: 'system', text: makeT(c2.lang)('app.greeting') }]);
      historyRef.current = initialHistory(c2.lang);
      setReady(true);
      await checkHealth(c2);
      await reloadData();

      const n = await setupNotifications();
      setNotifyAvailable(n.available);
      setNotifyGranted(n.granted);

      stopScheduler = startScheduler(
        async (routine) => {
          const tt = tRef.current;
          push('system', tt('routine.fired', { name: routine.name }));
          const prompt = `[例程触发] ${routine.name}${routine.description ? '：' + routine.description : ''}（时间设定 ${routine.schedule || '未指定'}）`;
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
    })();

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
  };

  return (
    <AppCtx.Provider value={value}>
      {children}
      <ApprovalModal pending={pending} setPending={setPending} t={t} />
      <BudgetModal ask={budgetAsk} setAsk={setBudgetAsk} t={t} />
    </AppCtx.Provider>
  );
}

/* ---------- 全局弹卡（覆盖在任何页面之上） ---------- */

function ApprovalModal({
  pending,
  setPending,
  t,
}: {
  pending: { name: string; args: any; resolve: (ok: boolean) => void } | null;
  setPending: (v: null) => void;
  t: TFn;
}) {
  return (
    <Modal visible={!!pending} transparent animationType="fade">
      <View style={m.mask}>
        <View style={m.card}>
          <Text style={m.title}>{t('approval.title')}</Text>
          <Text style={m.tool}>{pending?.name}</Text>
          <ScrollView style={{ maxHeight: 220 }}>
            <Text style={m.args}>{JSON.stringify(pending?.args, null, 2)}</Text>
          </ScrollView>
          <View style={m.row}>
            <TouchableOpacity
              style={[m.btn, { backgroundColor: '#f0f0f3' }]}
              onPress={() => {
                pending?.resolve(false);
                setPending(null);
              }}
            >
              <Text style={m.btnTxt}>{t('approval.deny')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[m.btn, { backgroundColor: '#0a84ff' }]}
              onPress={() => {
                pending?.resolve(true);
                setPending(null);
              }}
            >
              <Text style={[m.btnTxt, { color: '#fff' }]}>{t('approval.allow')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function BudgetModal({
  ask,
  setAsk,
  t,
}: {
  ask: { used: number; budget: number; resolve: (extra: number) => void } | null;
  setAsk: (v: null) => void;
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
              onPress={() => {
                ask?.resolve(0);
                setAsk(null);
              }}
            >
              <Text style={m.btnTxt}>{t('budget.stop')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[m.btn, { backgroundColor: '#0a84ff' }]}
              onPress={() => {
                ask?.resolve(100000);
                setAsk(null);
              }}
            >
              <Text style={[m.btnTxt, { color: '#fff' }]}>{t('budget.more')}</Text>
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
  row: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  btnTxt: { fontWeight: '600' },
});
