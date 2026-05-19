export { RoomRunner } from "./room";
export { RoomsRegistry } from "./registry";

interface Env {
  ROOM: DurableObjectNamespace;
  REGISTRY: DurableObjectNamespace;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Room metadata routes → RoomsRegistry DO (single global instance)
    if (pathname === "/rooms" || pathname.startsWith("/rooms/")) {
      const id = env.REGISTRY.idFromName("global");
      const stub = env.REGISTRY.get(id);
      return stub.fetch(req);
    }

    // WebSocket game routes → RoomRunner DO (one per room)
    const roomId = pathname.slice(1); // strip leading "/"
    if (!roomId || roomId.includes("/")) {
      return new Response("Not found", { status: 404, headers: CORS_HEADERS });
    }

    const upgrade = req.headers.get("Upgrade");
    if (!upgrade || upgrade.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426, headers: CORS_HEADERS });
    }

    const id = env.ROOM.idFromName(roomId);
    const stub = env.ROOM.get(id);
    return stub.fetch(req);
  },
};
