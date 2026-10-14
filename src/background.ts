/**
 * 后台常驻：用 expo-background-task（Android 走 WorkManager）在 App 被杀之后也能跑例程。
 *
 * 诚实边界：
 *  - Android WorkManager 的最小间隔是 **15 分钟**，而且系统会挑时机跑（省电优先），
 *    所以「7:30 的例程」可能 7:31 才跑，也可能被推迟到下一次唤醒；
 *  - 用户在最近任务里划掉 App，Android 上一般还能跑；被系统"强行停止"或重启后才恢复；
 *  - 后台跑的时候没人在旁边点审批 —— 需要审批的工具一律按拒绝处理（只跑免审批的活）。
 * 定点提醒仍然靠系统通知（scheduler/notify 那条路），两条腿一起走。
 */
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { runDueRoutines } from './bgRunner';
import { diag } from './diag';

export const BG_TASK = 'whalebot-routines';

// 必须在全局作用域定义（无 UI 的后台上下文里也会执行到这一步）
try {
  if (!TaskManager.isTaskDefined?.(BG_TASK)) {
    TaskManager.defineTask(BG_TASK, async () => {
      try {
        diag('bg', 'background task fired');
        const res = await runDueRoutines();
        diag('bg', `background task done: ${JSON.stringify(res)}`);
        return BackgroundTask.BackgroundTaskResult.Success;
      } catch (e: any) {
        diag('bg-fail', { e: String(e?.message ?? e) });
        return BackgroundTask.BackgroundTaskResult.Failed;
      }
    });
  }
} catch (e: any) {
  diag('bg-fail', { where: 'defineTask', e: String(e?.message ?? e) });
}

/** 打开后台常驻（minimumInterval 单位是分钟，系统最小 15） */
export async function enableBackgroundRoutines(minutes = 15): Promise<void> {
  await BackgroundTask.registerTaskAsync(BG_TASK, {
    minimumInterval: Math.max(15, Math.round(minutes)),
  });
}

export async function disableBackgroundRoutines(): Promise<void> {
  await BackgroundTask.unregisterTaskAsync(BG_TASK);
}

export async function backgroundStatus(): Promise<{ available: boolean; registered: boolean }> {
  let available = false;
  try {
    const st = await BackgroundTask.getStatusAsync();
    available = st === BackgroundTask.BackgroundTaskStatus.Available;
  } catch {
    available = false;
  }
  let registered = false;
  try {
    registered = await TaskManager.isTaskRegisteredAsync(BG_TASK);
  } catch {
    registered = false;
  }
  return { available, registered };
}
