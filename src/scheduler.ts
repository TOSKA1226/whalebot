/**
 * 例程调度器（M3）
 *
 * 现实边界（Expo Go 里必须诚实）：
 *  - 只在 App 进程活着时触发（前台或最近使用）。真正的后台常驻要 dev build + 原生 AlarmManager/WorkManager，属 M4。
 *  - 因此本调度器是"前台心跳"：每 30 秒检查一次，错过的例程会补一次（catch-up once）。
 */
import * as store from './store';

export type Parsed =
  | { kind: 'interval'; ms: number }
  | { kind: 'daily'; hour: number; minute: number }
  | { kind: 'once'; ms: number };

export function parseSchedule(raw: string): Parsed | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();

  // 一次性：「once:60000」（毫秒）——remind_in 生成的形式
  const onceMs = t.match(/^once:(\d+)$/);
  if (onceMs) return { kind: 'once', ms: Math.max(1000, Number(onceMs[1])) };

  // 一次性：「N 分钟后」「N 小时后」「in N minutes」
  const onceMin = t.match(/(\d+)\s*分\s*钟?\s*后/) || t.match(/in\s*(\d+)\s*m(?:in(?:ute)?s?)?/);
  if (onceMin) return { kind: 'once', ms: Math.max(1, Number(onceMin[1])) * 60_000 };
  const halfHour = t.match(/半\s*(?:个)?\s*小时\s*后/);
  if (halfHour) return { kind: 'once', ms: 1800_000 };
  const quarter = t.match(/一刻钟\s*后/);
  if (quarter) return { kind: 'once', ms: 900_000 };
  const onceHour = t.match(/(\d+)\s*(?:个)?\s*小时\s*后/);
  if (onceHour) return { kind: 'once', ms: Math.max(1, Number(onceHour[1])) * 3600_000 };
  const onceSec = t.match(/(\d+)\s*秒\s*后/);
  if (onceSec) return { kind: 'once', ms: Math.max(1, Number(onceSec[1])) * 1000 };

  // 每天 HH:MM / 每天 8 点 / daily 08:00
  const daily = t.match(/(?:每天|每日|daily)\s*(\d{1,2})\s*[:：]\s*(\d{2})/);
  if (daily) return { kind: 'daily', hour: Number(daily[1]), minute: Number(daily[2]) };
  const daily2 = t.match(/(?:每天|每日|daily)\s*(\d{1,2})\s*点/);
  if (daily2) return { kind: 'daily', hour: Number(daily2[1]), minute: 0 };

  // 每 N 小时 / every Nh
  const h = t.match(/(?:每|every)\s*(\d+)\s*(?:个)?\s*(?:小时|h(?:ours?)?|hr)/);
  if (h) return { kind: 'interval', ms: Math.max(1, Number(h[1])) * 3600_000 };
  if (/每\s*(?:个)?\s*小时|hourly/.test(t)) return { kind: 'interval', ms: 3600_000 };

  // 每 N 分钟 / every Nm
  const m = t.match(/(?:每|every)\s*(\d+)\s*(?:个)?\s*(?:分钟|分|m(?:in(?:ute)?s?)?)/);
  if (m) return { kind: 'interval', ms: Math.max(1, Number(m[1])) * 60_000 };

  return null;
}

export function nextDue(routine: store.Routine, now = Date.now()): number | null {
  const p = parseSchedule(routine.schedule);
  if (!p) return null;
  const anchor = routine.lastRunAt ?? routine.createdAt;

  if (p.kind === 'once') return routine.createdAt + p.ms;
  if (p.kind === 'interval') return anchor + p.ms;

  // daily：今天的时间点，若已过或已运行则顺延到明天
  const d = new Date(now);
  d.setHours(p.hour, p.minute, 0, 0);
  let t = d.getTime();
  if (t <= anchor) t += 24 * 3600_000;
  return t;
}

export function isDue(routine: store.Routine, now = Date.now()): boolean {
  const due = nextDue(routine, now);
  return due !== null && due <= now;
}

/**
 * 取出「到点该跑」的例程，并**先**把运行时间标记掉（避免前台心跳和后台任务同时触发同一个例程）。
 * 前台调度器和后台任务共用这一份。
 */
export async function takeDueRoutines(now = Date.now()): Promise<store.Routine[]> {
  const routines = await store.listRoutines();
  const hit: store.Routine[] = [];
  for (const r of routines) {
    if (!r.enabled) continue;
    if (!parseSchedule(r.schedule)) continue;
    if (!isDue(r, now)) continue;
    await store.setRoutineLastRun(r.id, now);
    // 一次性例程：触发后立即暂停，避免重复提醒
    if (r.once) await store.setRoutineEnabled(r.id, false);
    hit.push(r);
  }
  return hit;
}

export type FireHandler = (routine: store.Routine) => Promise<void>;
export type StatusHandler = (state: { running: boolean; lastTickAt: number; nextAt?: number }) => void;

let timer: ReturnType<typeof setInterval> | null = null;

/** 启动前台心跳调度；返回停止函数。 */
export function startScheduler(onFire: FireHandler, onStatus?: StatusHandler) {
  const tick = async () => {
    const routines = await store.listRoutines();
    // 和后台任务共用同一份"取到点例程"的逻辑，避免两边同时触发同一个
    const due = await takeDueRoutines();
    for (const r of due) {
      try {
        await onFire(r);
      } catch {
        // 单个例程失败不影响其他
      }
    }
    if (onStatus) {
      const enabled = routines.filter((r) => r.enabled && parseSchedule(r.schedule));
      const dues = enabled
        .map((r) => nextDue(r, Date.now()))
        .filter((x): x is number => typeof x === 'number');
      onStatus({
        running: true,
        lastTickAt: Date.now(),
        nextAt: dues.length ? Math.min(...dues) : undefined,
      });
    }
  };

  void tick();
  timer = setInterval(() => void tick(), 30_000);
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
