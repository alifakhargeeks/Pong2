const WORKER_BASE = process.env.GAME_HTTP_URL;

export async function GET() {
  if (!WORKER_BASE) {
    return Response.json({ error: "GAME_HTTP_URL not configured." }, { status: 503 });
  }
  const res = await fetch(`${WORKER_BASE}/rooms`);
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

export async function POST(request: Request) {
  if (!WORKER_BASE) {
    return Response.json({ error: "GAME_HTTP_URL not configured." }, { status: 503 });
  }
  const body = await request.text();
  const res = await fetch(`${WORKER_BASE}/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
