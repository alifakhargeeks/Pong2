import { nanoid } from "nanoid";
import type { MatchPhase, RoomSummary } from "@/src/types/game";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export class RoomsRegistry implements DurableObject {
  private ctx: DurableObjectState;

  constructor(ctx: DurableObjectState) {
    this.ctx = ctx;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    // pathname is e.g. /rooms or /rooms/abc123
    const parts = url.pathname.replace(/^\//, "").split("/");
    // parts[0] === "rooms", parts[1] === optional roomId

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (parts[0] !== "rooms") {
      return new Response("Not found", { status: 404, headers: CORS_HEADERS });
    }

    const roomId = parts[1];

    if (!roomId) {
      // /rooms
      if (req.method === "GET") return this.listRooms();
      if (req.method === "POST") return this.createRoom(req);
    } else {
      // /rooms/:id
      if (req.method === "GET") return this.getRoom(roomId);
      if (req.method === "DELETE") return this.deleteRoom(roomId);
    }

    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  private async listRooms(): Promise<Response> {
    const entries = await this.ctx.storage.list<RoomSummary>({ prefix: "room:" });
    const rooms = [...entries.values()].sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    );
    return json({ rooms });
  }

  private async createRoom(req: Request): Promise<Response> {
    const body = (await req.json()) as {
      roomName?: string;
      durationSec?: number;
      maxPlayersPerTeam?: number;
    };

    const roomName = (body.roomName ?? "").trim();
    const durationSec = Number(body.durationSec ?? 300);
    const maxPlayersPerTeam = Number(body.maxPlayersPerTeam ?? 10);

    if (!roomName) return json({ error: "Room name is required." }, 400);
    if (durationSec < 60 || durationSec > 1800)
      return json({ error: "Duration must be between 60 and 1800 seconds." }, 400);
    if (maxPlayersPerTeam < 1 || maxPlayersPerTeam > 25)
      return json({ error: "Max players per team must be between 1 and 25." }, 400);

    const room: RoomSummary = {
      id: nanoid(10),
      roomName,
      status: "lobby" as MatchPhase,
      durationSec,
      maxPlayersPerTeam,
      redCount: 0,
      blueCount: 0,
      createdAt: new Date().toISOString(),
    };

    await this.ctx.storage.put(`room:${room.id}`, room);
    return json({ room }, 201);
  }

  private async getRoom(roomId: string): Promise<Response> {
    const room = await this.ctx.storage.get<RoomSummary>(`room:${roomId}`);
    if (!room) return json({ error: "Room not found." }, 404);
    return json({ room });
  }

  private async deleteRoom(roomId: string): Promise<Response> {
    await this.ctx.storage.delete(`room:${roomId}`);
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
}
