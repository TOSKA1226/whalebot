/**
 * 本地通知 + 通知行内回复
 *
 * ⚠️ 关键限制（实测 + 文档核对）：
 *   SDK 53 起，Android 的 **Expo Go 已移除 expo-notifications**——连 `import` 都会抛错
 *   （"Android Push notifications ... was removed from Expo Go"）。
 *   所以这里必须**懒加载 + 兜底**：Expo Go 里通知不可用，但调度/预算/会话逻辑照常工作；
 *   一旦跑在 dev build（M4）里，通知层会自动生效。
 */
import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import { fetch as expoFetch } from 'expo/fetch';

type NotifModule = typeof import('expo-notifications');

export const REPLY_CATEGORY = 'whalebot_reply';
export const REPLY_ACTION = 'whalebot_reply_action';

let mod: NotifModule | null = null;
let loadFailed = false;
let loading: Promise<NotifModule | null> | null = null;

export function notificationsAvailable(): boolean {
  return !!mod;
}

/** 'expo-go' = 当前环境拿不到该模块；'loading' = 还在加载；null = 正常 */
export function notificationsUnavailableReason(): 'expo-go' | 'loading' | null {
  if (mod) return null;
  return loadFailed ? 'expo-go' : 'loading';
}

/** 当前是否处于 Android 的 Expo Go（该环境下 expo-notifications 不可用） */
export function isAndroidExpoGo(): boolean {
  try {
    return Platform.OS === 'android' && isRunningInExpoGo();
  } catch {
    return false;
  }
}

async function load(): Promise<NotifModule | null> {
  if (mod) return mod;
  if (loadFailed) return null;
  // 关键：Android Expo Go 里连模块都不要加载。
  // 该库的 TokenEmitter 有模块级副作用会直接抛错，并可能产生未捕获的 Promise 拒绝。
  if (isAndroidExpoGo()) {
    loadFailed = true;
    return null;
  }
  if (!loading) {
    loading = (async () => {
      try {
        const m = (await import('expo-notifications')) as NotifModule;
        // Expo Go(Android) 的坑：import 可能"成功"，但函数全是 undefined。
        // 所以必须逐个校验我们真正要用的 API，缺一个就当作不可用。
        const required = [
          'setNotificationHandler',
          'getPermissionsAsync',
          'requestPermissionsAsync',
          'setNotificationCategoryAsync',
          'scheduleNotificationAsync',
          'addNotificationResponseReceivedListener',
        ] as const;
        const missing = required.filter((k) => typeof (m as any)?.[k] !== 'function');
        if (missing.length) {
          loadFailed = true;
          return null;
        }
        mod = m;
        return m;
      } catch {
        loadFailed = true;
        return null;
      }
    })();
  }
  return loading;
}

/** 初始化：权限、Android 通道、行内回复分类。返回是否可用/已授权。 */
export async function setupNotifications(): Promise<{
  available: boolean;
  granted: boolean;
}> {
  const N = await load();
  if (!N) return { available: false, granted: false };

  try {
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    const current = await N.getPermissionsAsync();
    let granted = current.granted;
    if (!granted) {
      const asked = await N.requestPermissionsAsync();
      granted = asked.granted;
    }

    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('whalebot', {
        name: 'whalebot',
        importance: N.AndroidImportance.HIGH,
        vibrationPattern: [0, 120, 80, 120],
      });
    }

    await N.setNotificationCategoryAsync(REPLY_CATEGORY, [
      {
        identifier: REPLY_ACTION,
        buttonTitle: '回复',
        textInput: { placeholder: '回复 whalebot…', submitButtonTitle: '发送' },
      },
    ]);

    return { available: true, granted };
  } catch {
    return { available: false, granted: false };
  }
}

/**
 * 发通知。优先用原生通知模块；Expo Go(Android) 里模块不可用，
 * 就退回到"容器设备桥"发通知——两条路都能让通知真的弹出来。
 */
export async function notifyNow(
  cfg: { execUrl: string; execToken: string },
  title: string,
  body: string,
  opts: { withReply?: boolean; data?: Record<string, unknown> } = {},
): Promise<'native' | 'bridge' | 'none'> {
  const N = await load();
  if (N) {
    const ok = await notifyNative(N, title, body, opts);
    if (ok) return 'native';
  }
  return (await notifyViaBridge(cfg, title, body)) ? 'bridge' : 'none';
}

/** 兜底通道：让容器去调 DSHA 桥发通知（Expo Go 下唯一可行的真通知） */
async function notifyViaBridge(
  cfg: { execUrl: string; execToken: string },
  title: string,
  body: string,
): Promise<boolean> {
  try {
    const res = await expoFetch(`${cfg.execUrl}/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.execToken}`,
      },
      body: JSON.stringify({
        capability: 'phone.notify',
        args: { title: title.slice(0, 60), text: body.slice(0, 400) },
      }),
    });
    const json = await res.json();
    return !!json?.ok;
  } catch {
    return false;
  }
}

async function notifyNative(
  N: NotifModule,
  title: string,
  body: string,
  opts: { withReply?: boolean; data?: Record<string, unknown> } = {},
): Promise<boolean> {
  try {
    await N.scheduleNotificationAsync({
      content: {
        title,
        body: body.slice(0, 900),
        sound: true,
        categoryIdentifier: opts.withReply ? REPLY_CATEGORY : undefined,
        data: opts.data ?? {},
      },
      trigger: null,
    });
    return true;
  } catch {
    return false;
  }
}

/** 注册行内回复监听；不可用时返回 noop 订阅。 */
export function onNotificationResponse(
  handler: (payload: { userText?: string; actionIdentifier: string; data: any }) => void,
) {
  let sub: { remove: () => void } | null = null;
  void (async () => {
    try {
      const N = await load();
      if (!N) return;
      const register = N.addNotificationResponseReceivedListener;
      if (typeof register !== 'function') return;
      sub = register((response: any) => {
        handler({
          userText: response.userText ?? undefined,
          actionIdentifier: response.actionIdentifier,
          data: response.notification?.request?.content?.data ?? {},
        });
      });
    } catch {
      // 通知不可用时静默降级，不影响其它功能
    }
  })();
  return {
    remove: () => {
      try {
        sub?.remove();
      } catch {
        // ignore
      }
    },
  };
}
