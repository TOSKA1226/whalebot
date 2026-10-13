/**
 * 键盘避让：纯 JS 实现（不依赖任何原生模块）。
 *
 * 为什么不用 react-native-keyboard-controller / reanimated：
 * 它们在 release 包里会在 JS 起来之前把进程搞崩（实测：装上后 App 白屏秒退，
 * 连启动日志都发不出来）。下面这套用键盘事件 + 窗口高度自己算，已在真机验证有效，
 * 且 Expo Go 与正式包行为一致。
 */
import React, { useEffect, useState } from 'react';
import { Dimensions, Keyboard, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { diag } from './diag';

export const hasNativeKeyboard = false;

/** 保留这个壳只是为了调用处不用改（已不需要原生 Provider） */
export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

type Props = ViewProps & { behavior?: unknown; keyboardVerticalOffset?: number };

export function KeyboardAvoidingView({ children, style, behavior, keyboardVerticalOffset, ...rest }: Props) {
  const insets = useSafeAreaInsets();
  const [pad, setPad] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const win = Dimensions.get('window').height;
      const top = e?.endCoordinates?.screenY ?? 0;
      // 窗口坐标从状态栏下面开始，所以要补回 insets.top；拿不到 screenY 就退回键盘高度
      const lift = top > 0 ? win - top + insets.top : (e?.endCoordinates?.height ?? 0);
      setPad(Math.max(0, Math.round(lift)));
      diag('kbd', {
        win,
        top,
        insetTop: insets.top,
        insetBottom: insets.bottom,
        kbHeight: e?.endCoordinates?.height,
        pad: Math.max(0, Math.round(lift)),
      });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setPad(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [insets.top, insets.bottom]);

  return (
    <View style={[style, { paddingBottom: pad }]} {...rest}>
      {children}
    </View>
  );
}
