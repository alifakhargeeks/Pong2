import { createClient } from "@liveblocks/client";

let singletonClient: ReturnType<typeof createClient> | null = null;

export function getRealtimeClient() {
  if (singletonClient) return singletonClient;

  const publicApiKey = process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY;
  if (!publicApiKey) {
    throw new Error("NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY is required for realtime features.");
  }

  // throttle batches outgoing presence/events; 50ms matches the app-level
  // throttles in GameCanvas and keeps realtime load predictable at 20 players.
  singletonClient = createClient({ publicApiKey, throttle: 50 });
  return singletonClient;
}
