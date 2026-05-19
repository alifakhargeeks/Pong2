const WORKER_BASE = process.env.GAME_HTTP_URL;

export async function GET(_request: Request, context: RouteContext<"/api/rooms/[roomId]">) {
  const { roomId } = await context.params;
  if (!WORKER_BASE) {
    return Response.json({ error: "GAME_HTTP_URL not configured." }, { status: 503 });
  }
  const res = await fetch(`${WORKER_BASE}/rooms/${roomId}`);
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function DELETE(_request: Request, context: RouteContext<"/api/rooms/[roomId]">) {
  const { roomId } = await context.params;
  if (!WORKER_BASE) {
    return Response.json({ error: "GAME_HTTP_URL not configured." }, { status: 503 });
  }
  await fetch(`${WORKER_BASE}/rooms/${roomId}`, { method: "DELETE" });
  return new Response(null, { status: 204 });
}
