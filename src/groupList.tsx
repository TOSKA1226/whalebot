/** 可折叠的分组列表：助手页 / 建群选人 / 加群成员都用它 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Agent } from './store';

/** 按 group 字段分组（保持助手列表原有顺序） */
export function useGroups(agents: Agent[], ungroupedLabel: string): [string, Agent[]][] {
  return useMemo(() => {
    const map = new Map<string, Agent[]>();
    for (const a of agents) {
      const g = a.group?.trim() || ungroupedLabel;
      const cur = map.get(g);
      if (cur) cur.push(a);
      else map.set(g, [a]);
    }
    return Array.from(map.entries());
  }, [agents, ungroupedLabel]);
}

export function CollapsibleGroups({
  groups,
  renderItem,
  defaultOpen,
  toggleLabels,
}: {
  groups: [string, Agent[]][];
  renderItem: (a: Agent, group: string) => React.ReactNode;
  defaultOpen?: (group: string, items: Agent[]) => boolean;
  toggleLabels?: { expand: string; collapse: string };
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const [g, items] of groups) init[g] = defaultOpen ? defaultOpen(g, items) : true;
    return init;
  });
  const allOpen = groups.length > 0 && groups.every(([g]) => open[g]);

  return (
    <View>
      {toggleLabels && groups.length > 1 ? (
        <TouchableOpacity
          style={g.toggleAll}
          onPress={() => {
            const next: Record<string, boolean> = {};
            for (const [name] of groups) next[name] = !allOpen;
            setOpen(next);
          }}
        >
          <Ionicons name={allOpen ? 'chevron-up' : 'chevron-down'} size={13} color="#0a84ff" />
          <Text style={g.toggleAllTxt}>
            {allOpen ? toggleLabels.collapse : toggleLabels.expand}
          </Text>
        </TouchableOpacity>
      ) : null}
      {groups.map(([name, items]) => {
        const isOpen = !!open[name];
        return (
          <View key={name}>
            <TouchableOpacity
              style={g.head}
              activeOpacity={0.7}
              onPress={() => setOpen((p) => ({ ...p, [name]: !p[name] }))}
            >
              <Ionicons
                name={isOpen ? 'chevron-down' : 'chevron-forward'}
                size={14}
                color="#8e8e93"
              />
              <Text style={g.headTxt}>{name}</Text>
              <View style={g.badge}>
                <Text style={g.badgeTxt}>{items.length}</Text>
              </View>
              <View style={{ flex: 1 }} />
            </TouchableOpacity>
            {isOpen ? items.map((a) => <View key={a.id}>{renderItem(a, name)}</View>) : null}
          </View>
        );
      })}
    </View>
  );
}

const g = StyleSheet.create({
  toggleAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  toggleAllTxt: { fontSize: 12, color: '#0a84ff' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 6,
  },
  headTxt: { fontSize: 13, fontWeight: '700', color: '#666' },
  badge: {
    backgroundColor: '#e8e8ec',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  badgeTxt: { fontSize: 11, color: '#666' },
});
