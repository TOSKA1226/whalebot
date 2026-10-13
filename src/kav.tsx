/**
 * KeyboardAvoidingView 包装：
 * - 正式包里用 react-native-keyboard-controller（原生 IME insets，Android 15 edge-to-edge 才准）
 * - 模块不存在时（例如 Expo Go）自动退回 React Native 自带的实现，绝不因为缺模块而崩
 */
import React, { useEffect, useState } from 'react';
import { Dimensions, Keyboard, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { diag } from './diag';

type LibModule = { KeyboardAvoidingView?: any; KeyboardProvider?: any };

let lib: LibModule = {};
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  lib = require('react-native-keyboard-controller') as LibModule;
} catch {
  lib = {};
}

export const hasNativeKeyboard = !!lib.KeyboardAvoidingView;

export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  const P = lib.KeyboardProvider;
  return P ? <P>{children}</P> : <>{children}</>;
}

/**
 * 没有原生模块时的纯 JS 兜底（Expo Go / 未安装模块）：
 * 直接拿键盘高度当底部内边距，把内容顶上去。RN 自带的 KAV 在 Android 15
 * edge-to-edge 下不生效，所以自己算。
 */
function FallbackKAV({ children, style, ...rest }: ViewProps) {
  const insets = useSafeAreaInsets();
  const [pad, setPad] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      // 用「窗口高度 - 键盘顶部屏幕坐标」算，比 endCoordinates.height 准
      // （后者在部分机型上少算了 IME 的工具栏高度）
      const win = Dimensions.get('window').height;
      const screenH = Dimensions.get('screen').height;
      const top = e?.endCoordinates?.screenY ?? 0;
      const insetTop = insets.top;
      // 少算的部分就是状态栏：screenY 是屏幕坐标，窗口坐标从状态栏下面开始
      const lift = top > 0 ? win - top + insetTop : (e?.endCoordinates?.height ?? 0);
      diag('kbd', {
        win,
        screenH,
        top,
        insetTop,
        insetBottom: insets.bottom,
        kbHeight: e?.endCoordinates?.height,
        pad: Math.max(0, Math.round(lift)),
      });
      setPad(Math.max(0, Math.round(lift)));
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

export function KeyboardAvoidingView(props: any) {
  if (lib.KeyboardAvoidingView) {
    return <lib.KeyboardAvoidingView {...props} behavior="padding" />;
  }
  return <FallbackKAV {...props} />;
}
