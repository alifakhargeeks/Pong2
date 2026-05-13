import { createRoom, listRooms } from "@/src/server/roomStore";

export async function GET() {
  return Response.json({ rooms: listRooms() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    roomName?: string;
    durationSec?: number;
    maxPlayersPerTeam?: number;
  };

  const roomName = (body.roomName ?? "").trim();
  const durationSec = Number(body.durationSec ?? 300);
  const maxPlayersPerTeam = Number(body.maxPlayersPerTeam ?? 25);

  if (!roomName) {
    return Response.json({ error: "Room name is required." }, { status: 400 });
  }
  if (durationSec < 60 || durationSec > 1800) {
    return Response.json({ error: "Duration must be between 60 and 1800 seconds." }, { status: 400 });
  }
  if (maxPlayersPerTeam < 1 || maxPlayersPerTeam > 25) {
    return Response.json({ error: "Max players per team must be between 1 and 25." }, { status: 400 });
  }

  const room = createRoom({ roomName, durationSec, maxPlayersPerTeam });
  return Response.json({ room }, { status: 201 });
}
