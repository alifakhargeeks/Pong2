Online Team Pong built with Next.js App Router.

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Add environment variables:

```bash
cp .env.example .env.local
```

Set `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY` with your Liveblocks public key.

3. Run the app:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Gameplay Features

- Public room creation and room list
- Team join flow (`Red` and `Blue`)
- Per-player independent paddles
- Paddle size scaling based on team player count
- Match timer configuration
- Adaptive ball speed based on elapsed game time and total players
- Clean minimal HUD (timer, score, speed, roster counts)

## Deploy to Vercel

1. Import the project into Vercel.
2. Add environment variable:
   - `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY`
3. Deploy.

Recommended for production room metadata persistence:

- Replace in-memory room storage in `src/server/roomStore.ts` with Vercel KV/Redis or Postgres.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Liveblocks Docs](https://liveblocks.io/docs)
