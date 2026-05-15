@AGENTS.md

# Online Team Pong — Project Guide

Multiplayer browser Pong: many players each control their own paddle on one of two
teams (Red / Blue) in a shared room. Next.js App Router + Liveblocks realtime.

## Commands

- `npm run dev` — dev server at http://localhost:3000
- `npm run build` — production build; also runs the TypeScript typecheck. Run this to verify changes.
- `npm run lint` — ESLint (eslint-config-next)
- `npm start` — serve the production build

No test suite exists. Verify with `npm run build` plus manual multi-tab testing.

## Stack

- Next.js 16.2.6 (App Router, Turbopack), React 19.2.4
- TypeScript strict mode — avoid `any`
- `@liveblocks/client` 3.x for realtime; `nanoid` for IDs
- Plain global CSS in `app/globals.css` (class-based). No Tailwind, no CSS modules.

## Architecture — host-authoritative realtime

Understand this before touching game code.

- **One host per room.** The player whose `id` sorts first alphabetically is the host
  (`isHost` in `src/ui/GameCanvas.tsx`). Only the host runs physics.
- **Host loop:** a 60 fps `setInterval` calls `tickMatch()` (`src/game/engine.ts`), then
  broadcasts a slim `MatchSnapshot` (ball/score/phase/timer — no paddle array) via a
  Liveblocks event, throttled to ~50 ms.
- **Non-hosts are pure renderers.** They receive `match_state` events and render, with a
  `requestAnimationFrame` loop extrapolating the ball between snapshots for smoothness.
  They never compute physics and never broadcast match state.
- **Paddle positions** sync separately via Liveblocks **presence** (`updatePresence`),
  throttled to 50 ms per player. Every client derives paddle geometry locally via
  `buildPaddles()`; the host reads everyone's presence each tick.
- **Match phases:** `lobby` → `live` → `finished`. The host drives transitions
  (Start Game / Finish Game). `countdown` exists in the type but is unused.
- Designed for 20+ concurrent players per room — the 50 ms throttles are deliberate.
  Don't lower them without weighing realtime load.

## Layering — keep these boundaries

- `src/game/` — pure game logic. No React, no I/O, no Liveblocks. `engine.ts`,
  `physics.ts`, `scaling.ts`. Keep it pure and deterministic.
- `src/realtime/` — Liveblocks only. `client.ts` (singleton), `roomState.ts` (`connectRoom`).
- `src/server/` — server-only modules. `roomStore.ts`.
- `src/types/game.ts` — shared types; single source of truth for game shapes.
- `src/ui/` — React components.
- `app/` — App Router routes and `app/api/` REST endpoints.

Do not put game/physics logic inside components. Do not import Liveblocks into `src/game/`.

## Conventions & gotchas

- **Path alias:** `@/*` maps to the repo root — import as `@/src/game/engine`.
- **Route handlers:** Next 16 typed context — `context: RouteContext<"/api/rooms/[roomId]">`,
  and `params` is a Promise: `const { roomId } = await context.params;`.
- **Client components** need `"use client"`. The game UI is entirely client-side.
- **Game loop closures:** inside `setInterval`, read from refs (`matchRef`, `playersRef`),
  never from React state — state is stale in the closure.
- **`PlayerPresence`** has an index signature (`[key: string]: ...`) required by Liveblocks
  presence typing — keep it.
- **`getRealtimeClient()`** throws if `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY` is unset. Copy
  `.env.example` to `.env.local`.
- **Room storage is in-memory** (`src/server/roomStore.ts`) — does NOT persist across
  server restarts and is NOT shared across serverless instances on Vercel. Known
  limitation; production needs a real store.

## Deployment

GitHub: https://github.com/alifakhargeeks/Pong2 — pushes go to `main`. Deployed on Vercel;
set `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY` in Vercel env vars.
