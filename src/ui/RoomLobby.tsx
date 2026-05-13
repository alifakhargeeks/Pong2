"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RoomLobby() {
  const router = useRouter();
  const [roomName, setRoomName] = useState("");
  const [durationSec, setDurationSec] = useState(300);
  const [maxPlayersPerTeam, setMaxPlayersPerTeam] = useState(25);
  const [isCreating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createRoom = async () => {
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName, durationSec, maxPlayersPerTeam }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create room");
      router.push(`/rooms/${data.room.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create room");
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="panel">
      <h2>Create game room</h2>
      <label>
        Room name
        <input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="Friday Pong Cup" />
      </label>
      <label>
        Match time (seconds)
        <input
          type="number"
          min={60}
          max={1800}
          step={30}
          value={durationSec}
          onChange={(e) => setDurationSec(Number(e.target.value))}
        />
      </label>
      <label>
        Max players per team
        <input
          type="number"
          min={1}
          max={25}
          value={maxPlayersPerTeam}
          onChange={(e) => setMaxPlayersPerTeam(Number(e.target.value))}
        />
      </label>
      {error ? <p className="errorText">{error}</p> : null}
      <button type="button" disabled={!roomName.trim() || isCreating} onClick={createRoom}>
        {isCreating ? "Creating..." : "Create room"}
      </button>
    </section>
  );
}
