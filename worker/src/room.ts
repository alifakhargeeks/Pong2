import { buildPaddles, createInitialMatchState, tickMatch, toSnapshot } from "@/src/game/engine";
import type { ClientMessage, MatchState, PlayerPresence, ServerMessage, Team } from "@/src/types/game";

const FIELD = { width: 920, height: 440 };
const TICK_MS = 40; // 25 Hz
const SNAPSHOT_INTERVAL_MS = 40; // broadcast every tick

export class RoomRunner implements DurableObject {
  private state: DurableObjectState;
  private match: MatchState;
  private players: Map<string, PlayerPresence> = new Map();
  private durationSec = 300;
  private maxPerTeam = 10;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private lastTickAt = 0;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.match = createInitialMatchState(this.durationSec, FIELD);
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const upgrade = req.headers.get("Upgrade");
    if (!upgrade || upgrade.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    // Read room config from query params on first connection
    const duration = Number(url.searchParams.get("duration"));
    const max = Number(url.searchParams.get("max"));
    if (duration > 0 && this.players.size === 0) {
      this.durationSec = duration;
      this.match = createInitialMatchState(this.durationSec, FIELD);
    }
    if (max > 0 && this.players.size === 0) {
      this.maxPerTeam = max;
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, rawMsg: string | ArrayBuffer): void {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(typeof rawMsg === "string" ? rawMsg : new TextDecoder().decode(rawMsg)) as ClientMessage;
    } catch {
      return;
    }

    if (msg.type === "join") {
      this.handleJoin(ws, msg.playerId, msg.name, msg.team);
    } else if (msg.type === "paddle") {
      this.handlePaddle(ws, msg.y);
    } else if (msg.type === "switch_team") {
      this.handleSwitchTeam(ws, msg.team);
    } else if (msg.type === "start") {
      this.handleStart();
    } else if (msg.type === "finish") {
      this.handleFinish();
    }
  }

  webSocketClose(ws: WebSocket): void {
    const attachment = ws.deserializeAttachment() as { playerId?: string } | null;
    const playerId = attachment?.playerId;
    if (playerId) {
      this.players.delete(playerId);
      this.broadcastSnapshot();
    }
    if (this.players.size === 0) {
      this.stopTick();
    }
  }

  webSocketError(ws: WebSocket): void {
    this.webSocketClose(ws);
  }

  private handleJoin(ws: WebSocket, playerId: string, name: string, team: Team): void {
    const teamCount = [...this.players.values()].filter((p) => p.team === team).length;
    if (teamCount >= this.maxPerTeam) {
      this.send(ws, { type: "error", message: `Team ${team} is full (max ${this.maxPerTeam})` });
      ws.close(1008, "team full");
      return;
    }

    const presence: PlayerPresence = { id: playerId, name, team, paddleY: FIELD.height / 2 - 60, connected: true };
    this.players.set(playerId, presence);

    // Associate playerId with this WS via attachment
    const attachment: Record<string, string> = { playerId };
    ws.serializeAttachment(attachment);

    this.send(ws, { type: "joined", playerId, team, maxPerTeam: this.maxPerTeam });
    this.broadcastSnapshot();
    this.startTick();
  }

  private handlePaddle(ws: WebSocket, y: number): void {
    const attachment = ws.deserializeAttachment() as { playerId?: string } | null;
    const playerId = attachment?.playerId;
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player) return;
    player.paddleY = Math.max(0, Math.min(FIELD.height, y));
  }

  private handleSwitchTeam(ws: WebSocket, team: Team): void {
    if (this.match.phase !== "lobby") return;
    const attachment = ws.deserializeAttachment() as { playerId?: string } | null;
    const playerId = attachment?.playerId;
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player || player.team === team) return;
    const teamCount = [...this.players.values()].filter((p) => p.team === team).length;
    if (teamCount >= this.maxPerTeam) {
      this.send(ws, { type: "error", message: `Team ${team} is full (max ${this.maxPerTeam})` });
      return;
    }
    player.team = team;
    this.broadcastSnapshot();
  }

  private handleStart(): void {
    if (this.match.phase === "lobby") {
      this.match = { ...this.match, phase: "live" };
      this.broadcastSnapshot();
    }
  }

  private handleFinish(): void {
    if (this.match.phase === "live") {
      this.match = { ...this.match, phase: "finished" };
      this.broadcastSnapshot();
      this.stopTick();
    }
  }

  private startTick(): void {
    if (this.tickTimer !== null) return;
    this.lastTickAt = Date.now();
    this.tickTimer = setInterval(() => {
      const now = Date.now();
      const dtSec = Math.min((now - this.lastTickAt) / 1000, 0.1);
      this.lastTickAt = now;

      if (this.match.phase === "live") {
        const playerList = [...this.players.values()];
        this.match = tickMatch(this.match, playerList, FIELD, dtSec);
        if (this.match.phase === "finished") {
          this.stopTick();
        }
      }

      this.broadcastSnapshot();
    }, TICK_MS);
  }

  private stopTick(): void {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private broadcastSnapshot(): void {
    const playerList = [...this.players.values()];
    const paddles = buildPaddles(FIELD, playerList);
    const matchWithPaddles = { ...this.match, paddles };
    const snapshot = toSnapshot(matchWithPaddles);
    const msg: ServerMessage = { type: "snapshot", payload: snapshot, players: playerList };
    const raw = JSON.stringify(msg);

    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(raw);
      } catch {
        // client disconnected mid-send; webSocketClose will clean up
      }
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // ignore
    }
  }
}
