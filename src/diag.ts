/**
 * 诊断上报：把启动阶段进度和 JS 崩溃栈 POST 到容器里的执行服务（127.0.0.1:8770/diag）。
 * 只走本机回环，失败静默 —— 纯诊断用，不影响功能。
 */
const EXEC = 'http://127.0.0.1:8770';

export function diag(tag: string, extra?: unknown) {
  try {
    let detail = '';
    if (extra !== undefined && extra !== null) {
      detail =
        typeof extra === 'string'
          ? extra
          : String((extra as any)?.stack ?? (extra as any)?.message ?? JSON.stringify(extra));
    }
    const body = JSON.stringify({ tag, detail: detail.slice(0, 4000), at: new Date().toISOString() });
    fetch(`${EXEC}/diag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => {});
  } catch {
    // 诊断本身绝不能抛
  }
}

/** 接管全局 JS 错误处理（release 构建里原本会白屏退出） */
export function installErrorReport() {
  const EU = (globalThis as any).ErrorUtils;
  if (!EU?.setGlobalHandler) return;
  const prev = typeof EU.getGlobalHandler === 'function' ? EU.getGlobalHandler() : undefined;
  EU.setGlobalHandler((err: any, isFatal?: boolean) => {
    diag('js-error', { message: err?.message ?? String(err), stack: err?.stack, isFatal });
    try {
      prev?.(err, isFatal);
    } catch {
      // 忽略
    }
  });
}
