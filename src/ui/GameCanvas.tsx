"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { createInitialMatchState, tickMatch } from "@/src/game/engine";
import { connectRoom, type RoomConnection } from "@/src/realtime/roomState";
import type { MatchState, PlayerPresence, RoomSummary, Team } from "@/src/types/game";

const FIELD = { width: 920, height: 440 };

interface Props {
  room: RoomSummary;
}

export function GameCanvas({ room }: Props) {
  const [playerName, setPlayerName] = useState("");
  const [team, setTeam] = useState<Team>("red");
  const [joined, setJoined] = useState(false);
  const [myId, setMyId] = useState("");
  const [players, setPlayers] = useState<PlayerPresence[]>([]);
  const [match, setMatch] = useState<MatchState>(() => createInitialMatchState(room.durationSec, FIELD));
  const connectionRef = useRef<RoomConnection | null>(null);

  const isHost = useMemo(() => {
    if (!players.length || !myId) return false;
    return [...players].sort((a, b) => a.id.localeCompare(b.id))[0]?.id === myId;
  }, [myId, players]);

  useEffect(() => {
    if (!joined) return;
    const connection = connectRoom(
      room.id,
      myId,
      playerName || "Player",
      team,
      (nextPlayers) => setPlayers(nextPlayers),
      (state) => setMatch(state),
    );
    connectionRef.current = connection;

    return () => {
      connection.leave();
      connectionRef.current = null;
    };
  }, [joined, myId, playerName, room.id, team]);

  useEffect(() => {
    if (!joined || !isHost) return;
    let matchState: MatchState = { ...match, phase: "live" };
    const ticker = setInterval(() => {
      matchState = tickMatch(matchState, players, FIELD, 1 / 30);
      setMatch(matchState);
      connectionRef.current?.broadcastMatchState(matchState);
    }, 1000 / 30);
    return () => clearInterval(ticker);
  }, [isHost, joined, match, players]);

  const onMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.currentTarget.getBoundingClientRect();
    const y = ((event.clientY - target.top) / target.height) * FIELD.height;
    setPlayers((current) => {
      connectionRef.current?.updatePresence({ paddleY: y });
      return current.map((player) =>
        player.id === myId
          ? {
              ...player,
              paddleY: y,
            }
          : player,
      );
    });
  };

  if (!joined) {
    return (
      <section className="panel">
        <h2>Join {room.roomName}</h2>
        <label>
          Display name
          <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Type your name" />
        </label>
        <div className="teamPicker">
          <button type="button" className={team === "red" ? "active red" : "red"} onClick={() => setTeam("red")}>
            Red
          </button>
          <button type="button" className={team === "blue" ? "active blue" : "blue"} onClick={() => setTeam("blue")}>
            Blue
          </button>
        </div>
        <button
          type="button"
          disabled={!playerName.trim()}
          onClick={() => {
            setMyId(nanoid(8));
            setJoined(true);
          }}
        >
          Join match
        </button>
      </section>
    );
  }

  return (
    <section className="gameLayout">
      <header className="hud">
        <span>{room.roomName}</span>
        <span>
          {Math.max(0, Math.ceil(match.durationSec - match.elapsedSec))}s left | {match.score.red} - {match.score.blue}
        </span>
        <span>Speed x{match.ball.speed / 280}</span>
      </header>
      <div className="field" onMouseMove={onMove}>
        <div className="centerLine" />
        <div
          className="ball"
          style={{
            left: `${(match.ball.x / FIELD.width) * 100}%`,
            top: `${(match.ball.y / FIELD.height) * 100}%`,
            width: match.ball.radius * 2,
            height: match.ball.radius * 2,
          }}
        />
        {match.paddles.map((paddle) => (
          <div
            key={paddle.playerId}
            className={`paddle ${paddle.team}`}
            style={{
              left: `${(paddle.x / FIELD.width) * 100}%`,
              top: `${(paddle.y / FIELD.height) * 100}%`,
              width: `${(paddle.width / FIELD.width) * 100}%`,
              height: `${(paddle.height / FIELD.height) * 100}%`,
            }}
          />
        ))}
      </div>
      <footer className="roster">
        <div>Red: {players.filter((p) => p.team === "red").length}</div>
        <div>Blue: {players.filter((p) => p.team === "blue").length}</div>
      </footer>
    </section>
  );
}
