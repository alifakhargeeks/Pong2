"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { GameCanvas } from "@/src/ui/GameCanvas";
import type { RoomSummary } from "@/src/types/game";

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const loadRoom = async () => {
      const response = await fetch(`/api/rooms/${params.roomId}`);
      if (!response.ok) {
        setNotFound(true);
        return;
      }
      const data = (await response.json()) as { room: RoomSummary };
      setRoom(data.room);
    };
    if (params.roomId) {
      void loadRoom();
    }
  }, [params.roomId]);

  if (notFound) {
    return (
      <main className="home">
        <h1>Room not found</h1>
      </main>
    );
  }
  if (!room) return <main className="home">Loading room...</main>;

  return (
    <main className="roomsPage">
      <GameCanvas room={room} />
    </main>
  );
}
