"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RoomLobby } from "@/src/ui/RoomLobby";
import type { RoomSummary } from "@/src/types/game";

export default function RoomsPage() {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);

  useEffect(() => {
    const loadRooms = async () => {
      const response = await fetch("/api/rooms");
      if (!response.ok) return;
      const data = (await response.json()) as { rooms: RoomSummary[] };
      setRooms(data.rooms);
    };
    void loadRooms();
  }, []);


  return (
    <main className="roomsPage">
      <h1>Team Pong Rooms</h1>
      <RoomLobby />
      <section className="roomList">
        <h2>Public rooms</h2>
        {rooms.length ? (
          rooms.map((room) => (
            <Link href={`/rooms/${room.id}`} key={room.id} className="roomCard">
              <strong>{room.roomName}</strong>
              <span>
                {room.redCount}/{room.maxPlayersPerTeam} Red | {room.blueCount}/{room.maxPlayersPerTeam} Blue
              </span>
              <span>{Math.floor(room.durationSec / 60)} min match</span>
            </Link>
          ))
        ) : (
          <p className="muted">No rooms yet. Create the first one.</p>
        )}
      </section>
    </main>
  );
}
