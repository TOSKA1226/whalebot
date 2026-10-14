/**
 * 键盘避让：纯 JS 实现（不依赖任何原生模块）。
 *
 * 为什么不用 react-native-keyboard-controller / reanimated：
 * 它们在 release 包里会在 JS 起来之前把进程搞崩（实测：装上后 App 白屏秒退，
 * 连启动日志都发不出来）。下面这套用键盘事件 + 屏幕坐标自己算。
 *
 * 关键点：不要用 Dimensions.get('window').height 去算抬升量。
 *   edge-to-edge（SDK 54+ 默认）下 window 高度 == 屏幕高度；非 edge-to-edge 下
 *   window 高度 = 屏幕高度 - 状态栏高度。两种情况下窗口底部都在屏幕底部，
 *   所以「键盘上沿之上的可见区域」= 屏幕高度 - 键盘上沿，一步就够。
 *   之前多加了 insets.top，在 edge-to-edge 的正式包里就会多抬约 40px
 *   （表现就是输入框飘在键盘上方）。
 */
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { diag } from './diag';

export const hasNativeKeyboard = false;

/** 保留这个壳只是为了调用处不用改（已不需要原生 Provider） */
export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

type Props = ViewProps & { behavior?: unknown; keyboardVerticalOffset?: number };

/**
 * 键盘上沿（屏幕坐标）→ 容器需要补的底部内边距。
 * win/screen 用「键盘没弹起来时」量到的值：有些机型弹键盘时会把 window 高度改小，
 * 拿那一刻的窗口高去算会算出个荒谬的小数字。
 */
export function liftFor(
  kbTop: number,
  kbHeight: number,
  insetTop: number,
  base?: { win: number; screen: number },
) {
  const screenH = base?.screen ?? Dimensions.get('screen').height;
  const winH = base?.win ?? Dimensions.get('window').height;
  if (!(kbTop > 0)) return Math.max(0, Math.round(kbHeight));
  // 窗口底部到屏幕底部的距离：edge-to-edge 时为 0；窗口被状态栏/导航栏挤小时补回来
  const bottomGap = Math.max(0, screenH - winH - insetTop);
  return Math.max(0, Math.round(screenH - bottomGap - kbTop));
}

export function KeyboardAvoidingView({ children, style, behavior, keyboardVerticalOffset, ...rest }: Props) {
  const insets = useSafeAreaInsets();
  const [pad, setPad] = useState(0);
  const baseRef = useRef<{ win: number; screen: number }>({
    win: Dimensions.get('window').height,
    screen: Dimensions.get('screen').height,
  });

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const kbTop = e?.endCoordinates?.screenY ?? 0;
      const kbHeight = e?.endCoordinates?.height ?? 0;
      const lift = liftFor(kbTop, kbHeight, insets.top, baseRef.current);
      setPad(lift);
      diag('kbd', {
        win: baseRef.current.win,
        screenH: baseRef.current.screen,
        nowWin: Dimensions.get('window').height,
        top: kbTop,
        insetTop: insets.top,
        insetBottom: insets.bottom,
        kbHeight,
        pad: lift,
      });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setPad(0);
      // 键盘收起后重新量一次基准高度
      baseRef.current = {
        win: Dimensions.get('window').height,
        screen: Dimensions.get('screen').height,
      };
    });
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
