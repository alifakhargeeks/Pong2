import { createClient } from "@liveblocks/client";

let singletonClient: ReturnType<typeof createClient> | null = null;

export function getRealtimeClient() {
  if (singletonClient) return singletonClient;

  const publicApiKey = process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY;
  if (!publicApiKey) {
    throw new Error("NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY is required for realtime features.");
  }

  singletonClient = createClient({ publicApiKey });
  return singletonClient;
}
