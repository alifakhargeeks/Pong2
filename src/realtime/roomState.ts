"use client";

import { getRealtimeClient } from "@/src/realtime/client";
import type { MatchState, PlayerPresence, RoomSettings, Team } from "@/src/types/game";

export interface RoomConnection {
  roomId: string;
  playerId: string;
  updatePresence: (patch: Partial<PlayerPresence>) => void;
  broadcastMatchState: (match: MatchState) => void;
  leave: () => void;
}

type StateHandler = (state: MatchState) => void;
type PresenceHandler = (players: PlayerPresence[]) => void;

function buildInitialPresence(playerId: string, playerName: string, team: Team): PlayerPresence {
  return {
    id: playerId,
    name: playerName,
    team,
    paddleY: 180,
    connected: true,
  };
}

export function connectRoom(
  roomId: string,
  playerId: string,
  playerName: string,
  team: Team,
  onPlayers: PresenceHandler,
  onState: StateHandler,
): RoomConnection {
  const { room, leave } = getRealtimeClient().enterRoom(roomId, {
    initialPresence: buildInitialPresence(playerId, playerName, team),
  });

  const syncPlayers = () => {
    const me = room.getPresence() as PlayerPresence;
    const others = room.getOthers();
    const players: PlayerPresence[] = [
      me,
      ...others.map((other) => ({
        ...(other.presence as PlayerPresence),
        connected: true,
      })),
    ].filter((presence) => Boolean(presence?.id));
    onPlayers(players);
  };

  const unsubOthers = room.subscribe("others", syncPlayers);
  const unsubPresence = room.subscribe("my-presence", syncPlayers);
  const unsubEvents = room.subscribe("event", (message) => {
    const event = message.event as { type?: string; payload?: MatchState } | undefined;
    if (event?.type === "match_state" && event.payload) onState(event.payload);
  });

  syncPlayers();

  return {
    roomId,
    playerId,
    updatePresence: (patch) => room.updatePresence(patch),
    broadcastMatchState: (match) => room.broadcastEvent({ type: "match_state", payload: match } as never),
    leave: () => {
      unsubOthers();
      unsubPresence();
      unsubEvents();
      leave();
    },
  };
}

export function getDefaultRoomSettings(roomName: string): RoomSettings {
  return {
    roomName,
    durationSec: 5 * 60,
    maxPlayersPerTeam: 25,
  };
}
