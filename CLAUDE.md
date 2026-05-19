@AGENTS.md

# Online Team Pong — Project Guide

Multiplayer browser Pong: many players each control their own paddle on one of two
teams (Red / Blue) in a shared room. Next.js App Router frontend + Cloudflare Workers
authoritative game server (Durable Objects).

## Commands

- `npm run dev` — Next.js dev server at http://localhost:3000
- `npm run build` — production build + TypeScript check. Run this to verify changes.
- `npm run lint` — ESLint (eslint-config-next)
- `npm run typecheck` — `tsc --noEmit` (Next.js files only; excludes `worker/`)
- `npm start` — serve the production build
- `npm run worker:dev` — run Worker locally at ws://localhost:8787 (via Wrangler)
- `npm run worker:deploy:staging` — deploy Worker to Cloudflare staging environment
- `npm run worker:deploy:production` — deploy Worker to Cloudflare production environment
- `npm run loadtest` — 20-client WebSocket load test (set `NEXT_PUBLIC_GAME_WS_URL` + `LOADTEST_DURATION_SEC`)

No test suite exists. Verify with `npm run build` plus manual multi-tab testing.

## Stack

- Next.js 16.2.6 (App Router, Turbopack), React 19.2.4
- TypeScript strict mode — avoid `any`
- Cloudflare Workers + Durable Objects for authoritative game server (`worker/`)
- `nanoid` for IDs; plain global CSS in `app/globals.css`. No Tailwind, no CSS modules.
- `@liveblocks/client` is still installed but NO LONGER USED — do not add new Liveblocks code.

## Architecture — server-authoritative realtime

**The Cloudflare Worker is the single authority for all game state. The browser has no physics.**

### Cloudflare Worker (`worker/`)

- **`worker/src/index.ts`** — main Worker entry. Routes requests:
  - `GET /rooms`, `POST /rooms`, `GET /rooms/:id`, `DELETE /rooms/:id` → `RoomsRegistry` DO
  - `GET /:roomId` (with `Upgrade: websocket`) → `RoomRunner` DO
- **`worker/src/registry.ts`** — `RoomsRegistry` Durable Object. Single global instance
  (keyed `"global"`). Stores all room metadata in SQLite-backed DO storage. Persists across
  Vercel cold-starts; visible to every user globally.
- **`worker/src/room.ts`** — `RoomRunner` Durable Object. One instance per room (keyed by
  roomId). Owns all game state: match phase, score, ball, paddles, players, timer.
  - Ticks at 25 Hz via `setInterval`
  - Clients join via WebSocket, send `join` / `paddle` / `switch_team` / `start` / `finish`
  - Server broadcasts compact `snapshot` messages to all connected clients at every tick
  - Team cap enforced server-side; disconnected players cleaned up via `deserializeAttachment`
- **`wrangler.toml`** (repo root) — Worker config. Has explicit `durable_objects.bindings`
  under BOTH `[env.staging]` and `[env.production]` (required; DO bindings are NOT inherited).

### Next.js Frontend

- **`app/api/rooms/route.ts`** and **`app/api/rooms/[roomId]/route.ts`** — thin proxies to
  `${GAME_HTTP_URL}/rooms[/:id]`. Do NOT use `roomStore.ts` — it is dead code.
- **`src/ui/GameCanvas.tsx`** — connects to Worker via WebSocket on join. Sends paddle moves
  at 20 Hz (throttled 50 ms). Renders server snapshots with rAF ball extrapolation.
  No host election, no local physics tick, no Liveblocks.

### Message Protocol (`src/types/game.ts`)

```
Client → Worker:  join | paddle | switch_team | start | finish
Worker → Client:  snapshot | joined | error
```

### Data Flow

1. Frontend calls `POST /api/rooms` → Next.js proxies to Worker `RoomsRegistry` DO → room stored in DO SQLite
2. Users visit `/rooms/[roomId]` → frontend calls `GET /api/rooms/:id` → proxy to Worker → room data returned
3. `GameCanvas` opens WebSocket to `wss://<worker>/<roomId>?duration=...&max=...`
4. Worker routes WS to the `RoomRunner` DO for that roomId
5. Player sends `join` → DO adds to player map → broadcasts snapshot
6. 25 Hz tick: DO calls `tickMatch()` → broadcasts updated snapshot to all connected clients
7. Clients extrapolate ball position between snapshots using rAF loop

## Layering — keep these boundaries

- `src/game/` — pure game logic. No React, no I/O, no network. `engine.ts`, `physics.ts`,
  `scaling.ts`. Imported by BOTH the Worker and the frontend (via `@/*` path alias).
- `src/realtime/` — legacy Liveblocks code. Unused; do not import in new code.
- `src/server/roomStore.ts` — legacy in-memory store. Unused; do not import in new code.
- `src/types/game.ts` — shared types for frontend AND Worker. Single source of truth.
- `src/ui/` — React components.
- `app/` — App Router routes and `app/api/` REST proxy endpoints.
- `worker/` — Cloudflare Worker source. Has its own `package.json` and `tsconfig.json`.
  Excluded from root `tsc` — checked by Wrangler's own build.

Do not put game/physics logic inside components. Do not import Liveblocks into new code.

## Environment Variables

| Variable | Where set | Used by |
|----------|-----------|---------|
| `NEXT_PUBLIC_GAME_WS_URL` | Vercel (public) + `.env.local` | Browser — WebSocket URL |
| `GAME_HTTP_URL` | Vercel (server) + `.env.local` | Next.js API proxy → Worker |

Local `.env.local`:
```
NEXT_PUBLIC_GAME_WS_URL=ws://localhost:8787
GAME_HTTP_URL=http://localhost:8787
```

Production Vercel values:
```
NEXT_PUBLIC_GAME_WS_URL=wss://pong-room-runner-production.ali-fakhar.workers.dev
GAME_HTTP_URL=https://pong-room-runner-production.ali-fakhar.workers.dev
```

## Conventions & gotchas

- **Path alias:** `@/*` maps to the repo root — import as `@/src/game/engine`. Works in
  both Next.js and Worker (Worker `tsconfig.json` maps it too).
- **Route handlers:** Next 16 typed context — `context: RouteContext<"/api/rooms/[roomId]">`,
  and `params` is a Promise: `const { roomId } = await context.params;`.
- **Client components** need `"use client"`. The game UI is entirely client-side.
- **Worker DO bindings must be repeated per environment** in `wrangler.toml` — they are NOT
  inherited from the top level. Always add `[[env.staging.durable_objects.bindings]]` AND
  `[[env.production.durable_objects.bindings]]` when adding a new DO.
- **Worker migrations:** adding a new Durable Object class requires a new `[[migrations]]`
  tag (e.g. `tag = "v3"`). Never reuse an existing tag.
- **`worker/node_modules/` is gitignored** — run `npm install` inside `worker/` after cloning.
- **Ball speed resets to `BASE_BALL_SPEED` after each goal** (not the ramped speed).
- **Team paddle coverage is capped at 70% of field height** via `buildPaddles()` in `engine.ts`.
- **`PlayerPresence`** has an index signature (`[key: string]: ...`) — keep it.

## Deployment

GitHub: https://github.com/alifakhargeeks/Pong2 — pushes go to `main`.
- Frontend: auto-deployed on Vercel from `main`
- Worker: manually deployed via `npm run worker:deploy:production` (or staging)
- Live URL: https://pong2-woad.vercel.app/rooms
- Worker URL: https://pong-room-runner-production.ali-fakhar.workers.dev
