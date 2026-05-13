import { getRoom } from "@/src/server/roomStore";

export async function GET(_request: Request, context: RouteContext<"/api/rooms/[roomId]">) {
  const { roomId } = await context.params;
  const room = getRoom(roomId);
  if (!room) {
    return Response.json({ error: "Room not found." }, { status: 404 });
  }
  return Response.json({ room });
}
