import { nanoid } from "nanoid";
import type { MatchPhase, RoomSummary, RoomSettings } from "@/src/types/game";

const memoryStore = new Map<string, RoomSummary>();

export function listRooms(): RoomSummary[] {
  return [...memoryStore.values()].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function createRoom(settings: RoomSettings): RoomSummary {
  const room: RoomSummary = {
    id: nanoid(10),
    roomName: settings.roomName.trim(),
    status: "lobby",
    durationSec: settings.durationSec,
    maxPlayersPerTeam: settings.maxPlayersPerTeam,
    redCount: 0,
    blueCount: 0,
    createdAt: new Date().toISOString(),
  };
  memoryStore.set(room.id, room);
  return room;
}

export function getRoom(roomId: string): RoomSummary | null {
  return memoryStore.get(roomId) ?? null;
}

export function updateRoomStatus(roomId: string, status: MatchPhase): RoomSummary | null {
  const room = memoryStore.get(roomId);
  if (!room) return null;
  const next = { ...room, status };
  memoryStore.set(roomId, next);
  return next;
}
