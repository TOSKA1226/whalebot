/** 共用 UI 小件（保持各页面代码短） */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function Header({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={u.header}>
      <View style={{ flex: 1 }}>
        <Text style={u.title}>{title}</Text>
        {subtitle ? <Text style={u.sub}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return <View style={u.card}>{children}</View>;
}

export function Row({
  title,
  desc,
  right,
  onPress,
}: {
  title: string;
  desc?: string;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  const body = (
    <View style={u.row}>
      <View style={{ flex: 1 }}>
        <Text style={u.rowTitle}>{title}</Text>
        {desc ? <Text style={u.rowDesc}>{desc}</Text> : null}
      </View>
      {right}
    </View>
  );
  if (!onPress) return body;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      {body}
    </TouchableOpacity>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={u.section}>{children}</Text>;
}

export function Btn({
  label,
  onPress,
  kind = 'primary',
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'danger';
  style?: any;
}) {
  const bg = kind === 'primary' ? '#0a84ff' : kind === 'danger' ? '#ffe9e9' : '#e8e8ec';
  const fg = kind === 'primary' ? '#fff' : kind === 'danger' ? '#ff3b30' : '#111';
  return (
    <TouchableOpacity style={[u.btn, { backgroundColor: bg }, style]} onPress={onPress}>
      <Text style={[u.btnTxt, { color: fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export const u = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 8,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#666', marginTop: 2 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    gap: 10,
  },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  rowDesc: { fontSize: 12, color: '#888', marginTop: 3, lineHeight: 17 },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
    marginTop: 18,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  btn: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  btnTxt: { fontWeight: '700', fontSize: 15 },
});
