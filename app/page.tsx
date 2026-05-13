import Link from "next/link";

export default function Home() {
  return (
    <main className="home">
      <h1>Online Team Pong</h1>
      <p>Create a room, share a public link, and let teams defend with individual paddles.</p>
      <Link href="/rooms" className="primaryAction">
        Browse or create game rooms
      </Link>
    </main>
  );
}
