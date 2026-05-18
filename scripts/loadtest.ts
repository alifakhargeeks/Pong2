/**
 * Load test: 20 WebSocket clients (10 red, 10 blue) send paddle moves at 15 Hz
 * for LOADTEST_DURATION_SEC seconds and report snapshot receipt rate.
 *
 * Usage:
 *   $env:NEXT_PUBLIC_GAME_WS_URL="ws://localhost:8787"
 *   $env:LOADTEST_DURATION_SEC="60"
 *   npm run loadtest
 */

import WebSocket from "ws";

const WS_URL = process.env.NEXT_PUBLIC_GAME_WS_URL ?? "ws://localhost:8787";
const DURATION_SEC = Number(process.env.LOADTEST_DURATION_SEC ?? "60");
const CLIENTS_PER_TEAM = 10;
const ROOM_ID = `loadtest-${Date.now()}`;
const PADDLE_HZ = 15;
const PADDLE_INTERVAL_MS = Math.round(1000 / PADDLE_HZ);
const MIN_EXPECTED_HZ = 10;

interface ClientStats {
  id: string;
  team: string;
  snapshots: number;
  errors: string[];
  connected: boolean;
}

async function run(): Promise<void> {
  const wsUrl = `${WS_URL}/${ROOM_ID}?duration=300&max=${CLIENTS_PER_TEAM}`;
  console.log(`Loadtest: ${CLIENTS_PER_TEAM * 2} clients → ${wsUrl}`);
  console.log(`Duration: ${DURATION_SEC}s  |  Paddle rate: ${PADDLE_HZ} Hz`);

  const stats: ClientStats[] = [];
  const sockets: WebSocket[] = [];
  const paddleTimers: ReturnType<typeof setInterval>[] = [];
  let firstConnected = false;

  for (let i = 0; i < CLIENTS_PER_TEAM * 2; i++) {
    const team = i < CLIENTS_PER_TEAM ? "red" : "blue";
    const playerId = `lt-${team}-${i}`;
    const stat: ClientStats = { id: playerId, team, snapshots: 0, errors: [], connected: false };
    stats.push(stat);

    const ws = new WebSocket(wsUrl);
    sockets.push(ws);

    ws.on("open", () => {
      stat.connected = true;
      ws.send(JSON.stringify({ type: "join", playerId, name: playerId, team }));

      // Start the game from the first client
      if (!firstConnected) {
        firstConnected = true;
        setTimeout(() => ws.send(JSON.stringify({ type: "start" })), 500);
      }

      // Send paddle moves at PADDLE_HZ
      let y = 100;
      let dir = 1;
      const timer = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        y += dir * 5;
        if (y > 380 || y < 60) dir = -dir;
        ws.send(JSON.stringify({ type: "paddle", y }));
      }, PADDLE_INTERVAL_MS);
      paddleTimers.push(timer);
    });

    ws.on("message", (data: Buffer | string) => {
      try {
        const msg = JSON.parse(data.toString()) as { type: string; message?: string };
        if (msg.type === "snapshot") stat.snapshots++;
        else if (msg.type === "error" && msg.message) stat.errors.push(msg.message);
      } catch {
        // ignore parse errors
      }
    });

    ws.on("close", () => {
      stat.connected = false;
    });

    ws.on("error", (err: Error) => {
      stat.errors.push(err.message);
    });

    // Stagger connections by 50ms to avoid thundering herd
    await delay(50);
  }

  console.log(`All ${CLIENTS_PER_TEAM * 2} clients connecting… waiting ${DURATION_SEC}s`);
  await delay(DURATION_SEC * 1000);

  // Tear down
  for (const timer of paddleTimers) clearInterval(timer);
  for (const ws of sockets) ws.close();
  await delay(200);

  // Report
  console.log("\n── Results ──────────────────────────────────────────────────");
  let failures = 0;
  for (const s of stats) {
    const hz = (s.snapshots / DURATION_SEC).toFixed(1);
    const ok = s.snapshots / DURATION_SEC >= MIN_EXPECTED_HZ;
    if (!ok) failures++;
    const flag = ok ? "✓" : "✗";
    const errStr = s.errors.length ? ` [errors: ${s.errors.slice(0, 3).join(", ")}]` : "";
    console.log(`  ${flag} ${s.id.padEnd(14)} ${hz.padStart(5)} snapshots/s${errStr}`);
  }

  const totalSnaps = stats.reduce((a, s) => a + s.snapshots, 0);
  const avgHz = (totalSnaps / stats.length / DURATION_SEC).toFixed(1);
  console.log(`\n  Total snapshots: ${totalSnaps}  |  Avg per client: ${avgHz}/s`);

  if (failures > 0) {
    console.error(`\n  FAILED: ${failures} client(s) received fewer than ${MIN_EXPECTED_HZ} snapshots/s`);
    process.exit(1);
  } else {
    console.log(`\n  PASSED: all clients received ≥ ${MIN_EXPECTED_HZ} snapshots/s`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
