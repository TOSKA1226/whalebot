/**
 * 助手群（房间）：一个群 = 一个组长（leader）+ 若干成员。
 * 群里发任务时由组长拆活、成员各自干活、组长最后汇总。
 * 存在 AsyncStorage，重启不丢。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Room = {
  id: string;
  name: string;
  /** 组长：负责拆任务 + 汇总汇报 */
  leaderId: string;
  /** 其他成员（不含组长） */
  memberIds: string[];
  createdAt: number;
};

const KEY = 'whalebot.rooms.v1';

export const newRoomId = () =>
  `r${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

export async function listRooms(): Promise<Room[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const arr: Room[] = raw ? JSON.parse(raw) : [];
    return arr.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function getRoom(id: string): Promise<Room | undefined> {
  return (await listRooms()).find((r) => r.id === id);
}

export async function upsertRoom(input: {
  id?: string;
  name: string;
  leaderId: string;
  memberIds: string[];
}): Promise<Room> {
  const items = await listRooms();
  const idx = input.id ? items.findIndex((r) => r.id === input.id) : -1;
  const members = input.memberIds.filter((m) => m !== input.leaderId);
  if (idx >= 0) {
    const merged: Room = {
      ...items[idx],
      name: input.name.trim() || items[idx].name,
      leaderId: input.leaderId,
      memberIds: members,
    };
    items[idx] = merged;
    await AsyncStorage.setItem(KEY, JSON.stringify(items));
    return merged;
  }
  const r: Room = {
    id: newRoomId(),
    name: input.name.trim() || '助手群',
    leaderId: input.leaderId,
    memberIds: members,
    createdAt: Date.now(),
  };
  items.push(r);
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
  return r;
}

export async function removeRoom(id: string): Promise<void> {
  const items = await listRooms();
  await AsyncStorage.setItem(KEY, JSON.stringify(items.filter((r) => r.id !== id)));
}

/** 群成员 id（组长排第一） */
export const roomAgentIds = (r: Room): string[] => [r.leaderId, ...r.memberIds];
