/**
 * 助手头像：按「分组」决定色系，组内每个助手分到一个深浅不同的色号。
 * 例：查找资料组 = 蓝色系（深蓝 / 蓝 / 天蓝…），开发组 = 紫色系。
 *
 * 色系优先级：用户在「分组与接口」里手动指定的 > 按分组名猜（资料→蓝、开发→紫…）
 * > 按分组名哈希。
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Agent } from './store';
import { PRESENCE_COLOR, type Presence } from './ui';

export type Family = { key: string; label: string; colors: string[] };

/** 色系表：每个色系 6 个深浅（由深到浅），组内成员依次取用 */
export const FAMILIES: Family[] = [
  {
    key: 'blue',
    label: '蓝色系',
    colors: ['#0B3D91', '#1565C0', '#1E88E5', '#42A5F5', '#64B5F6', '#90CAF9'],
  },
  {
    key: 'indigo',
    label: '靛蓝色系',
    colors: ['#1A237E', '#283593', '#3949AB', '#5C6BC0', '#7986CB', '#9FA8DA'],
  },
  {
    key: 'purple',
    label: '紫色系',
    colors: ['#4A148C', '#6A1B9A', '#8E24AA', '#AB47BC', '#BA68C8', '#CE93D8'],
  },
  {
    key: 'pink',
    label: '粉色系',
    colors: ['#880E4F', '#AD1457', '#C2185B', '#D81B60', '#EC407A', '#F48FB1'],
  },
  {
    key: 'red',
    label: '红色系',
    colors: ['#B71C1C', '#C62828', '#D32F2F', '#E53935', '#EF5350', '#EF9A9A'],
  },
  {
    key: 'orange',
    label: '橙色系',
    colors: ['#E65100', '#EF6C00', '#F57C00', '#FB8C00', '#FFA726', '#FFCC80'],
  },
  {
    key: 'brown',
    label: '棕色系',
    colors: ['#3E2723', '#4E342E', '#5D4037', '#6D4C41', '#8D6E63', '#BCAAA4'],
  },
  {
    key: 'green',
    label: '绿色系',
    colors: ['#1B5E20', '#2E7D32', '#388E3C', '#43A047', '#66BB6A', '#A5D6A7'],
  },
  {
    key: 'teal',
    label: '青绿色系',
    colors: ['#004D40', '#00695C', '#00796B', '#00897B', '#26A69A', '#80CBC4'],
  },
  {
    key: 'cyan',
    label: '天青色系',
    colors: ['#006064', '#00838F', '#0097A7', '#00ACC1', '#26C6DA', '#80DEEA'],
  },
];

export const familyByKey = (key: string): Family | undefined => FAMILIES.find((f) => f.key === key);

/** 分组名里带这些词 → 用对应色系（只是默认建议，用户可以改） */
const SEMANTIC: { re: RegExp; family: string }[] = [
  { re: /(资料|搜索|检索|查询|情报|研究|调研|知识|百科|新闻)/, family: 'blue' },
  { re: /(代码|开发|编程|工程|技术|运维|测试|调试|架构)/, family: 'purple' },
  { re: /(生活|日常|家务|健康|运动|饮食|旅行)/, family: 'green' },
  { re: /(工作|办公|商务|会议|项目|管理|任务|日程)/, family: 'orange' },
  { re: /(学习|教育|读书|语言|考试|课程|翻译)/, family: 'teal' },
  { re: /(写作|文案|创意|设计|绘画|音乐|视频)/, family: 'pink' },
  { re: /(财务|记账|理财|数据|报表|分析|统计)/, family: 'indigo' },
  { re: /(娱乐|闲聊|游戏|陪聊|朋友|吐槽)/, family: 'cyan' },
  { re: /(客服|接待|助理|秘书|前台)/, family: 'brown' },
];

const hash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

/** 某个分组用哪个色系 */
export function familyKeyForGroup(
  group: string,
  overrides?: Record<string, string>,
): string {
  const g = (group || '').trim() || '未分组';
  const manual = overrides?.[g];
  if (manual && familyByKey(manual)) return manual;
  for (const s of SEMANTIC) if (s.re.test(g)) return s.family;
  return FAMILIES[hash(g) % FAMILIES.length].key;
}

/** 组内第几位（按创建时间排）→ 决定取色系里的第几个深浅 */
export function shadeIndexOf(agent: Agent, agents: Agent[]): number {
  const g = (agent.group || '').trim() || '未分组';
  const same = agents
    .filter((a) => ((a.group || '').trim() || '未分组') === g)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const i = same.findIndex((a) => a.id === agent.id);
  return i < 0 ? 0 : i;
}

export function colorForAgent(
  agent: Agent,
  agents: Agent[],
  overrides?: Record<string, string>,
): string {
  const fam = familyByKey(familyKeyForGroup(agent.group, overrides)) ?? FAMILIES[0];
  return fam.colors[shadeIndexOf(agent, agents) % fam.colors.length];
}

/** 亮底用深字、暗底用白字 */
function textOn(bg: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(bg);
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#1c1c1e' : '#fff';
}

/** 头像里显示的字：名字的第一个字符（中文/emoji 都取一个） */
export function initialOf(name: string): string {
  const chars = Array.from((name || '?').trim());
  return chars[0] ?? '?';
}

export function Avatar({
  agent,
  agents,
  overrides,
  size = 36,
  presence,
  style,
}: {
  agent: Agent;
  /** 全部助手（用来算它在组里排第几，决定深浅） */
  agents?: Agent[];
  overrides?: Record<string, string>;
  size?: number;
  presence?: Presence;
  style?: any;
}) {
  const bg = colorForAgent(agent, agents ?? [agent], overrides);
  const dot = Math.max(8, Math.round(size * 0.3));
  return (
    <View style={[{ width: size, height: size }, style]}>
      <View
        style={[
          a.circle,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        ]}
      >
        <Text style={[a.txt, { color: textOn(bg), fontSize: Math.round(size * 0.44) }]}>
          {initialOf(agent.name)}
        </Text>
      </View>
      {presence ? (
        <View
          style={[
            a.dot,
            {
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor: PRESENCE_COLOR[presence],
            },
          ]}
        />
      ) : null}
    </View>
  );
}

/** 只画一个色块（分组列表里当预览用） */
export function FamilySwatch({ familyKey, size = 14 }: { familyKey: string; size?: number }) {
  const fam = familyByKey(familyKey) ?? FAMILIES[0];
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {fam.colors.slice(0, 4).map((c) => (
        <View
          key={c}
          style={{ width: size, height: size, borderRadius: 4, backgroundColor: c }}
        />
      ))}
    </View>
  );
}

const a = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  txt: { fontWeight: '700' },
  dot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
});
