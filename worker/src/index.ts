export { RoomRunner } from "./room";

interface Env {
  ROOM: DurableObjectNamespace;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    // pathname is "/<roomId>" — strip the leading slash
    const roomId = url.pathname.slice(1);
    if (!roomId || roomId.includes("/")) {
      return new Response("Not found", { status: 404 });
    }

    const id = env.ROOM.idFromName(roomId);
    const stub = env.ROOM.get(id);
    return stub.fetch(req);
  },
};
