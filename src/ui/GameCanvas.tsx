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
  const [gameStarted, setGameStarted] = useState(false);
  const connectionRef = useRef<RoomConnection | null>(null);
  const playersRef = useRef<PlayerPresence[]>([]);
  const matchRef = useRef<MatchState>(createInitialMatchState(room.durationSec, FIELD));
  const lastPresenceUpdateRef = useRef(0);

  const isHost = useMemo(() => {
    if (!players.length || !myId) return false;
    return [...players].sort((a, b) => a.id.localeCompare(b.id))[0]?.id === myId;
  }, [myId, players]);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    matchRef.current = match;
  }, [match]);

  useEffect(() => {
    if (!joined) return;
    const connection = connectRoom(
      room.id,
      myId,
      playerName || "Player",
      team,
      (nextPlayers) => setPlayers(nextPlayers),
      (state) => {
        matchRef.current = state;
        setMatch(state);
        if (state.phase === "live") setGameStarted(true);
      },
    );
    connectionRef.current = connection;

    return () => {
      connection.leave();
      connectionRef.current = null;
    };
  }, [joined, myId, playerName, room.id, team]);

  // Host game loop — only runs after explicit start
  useEffect(() => {
    if (!joined || !isHost || !gameStarted) return;

    let lastTick = performance.now();
    let lastBroadcast = 0;

    const ticker = setInterval(() => {
      const now = performance.now();
      const dtSec = Math.min(0.05, (now - lastTick) / 1000);
      lastTick = now;
      const nextState = tickMatch(matchRef.current, playersRef.current, FIELD, dtSec);
      matchRef.current = nextState;
      setMatch(nextState);

      if (now - lastBroadcast > 50) {
        connectionRef.current?.broadcastMatchState(nextState);
        lastBroadcast = now;
      }
    }, 1000 / 60);

    return () => clearInterval(ticker);
  }, [isHost, joined, gameStarted]);

  const startGame = () => {
    const liveState: MatchState = { ...matchRef.current, phase: "live" };
    matchRef.current = liveState;
    setMatch(liveState);
    connectionRef.current?.broadcastMatchState(liveState);
    setGameStarted(true);
  };

  const finishGame = () => {
    const current = matchRef.current;
    const winner =
      current.score.red === current.score.blue
        ? "draw"
        : current.score.red > current.score.blue
          ? "red"
          : "blue";
    const finishedState: MatchState = { ...current, phase: "finished", winner };
    matchRef.current = finishedState;
    setMatch(finishedState);
    connectionRef.current?.broadcastMatchState(finishedState);
    void fetch(`/api/rooms/${room.id}`, { method: "DELETE" });
  };

  const onMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.currentTarget.getBoundingClientRect();
    const y = ((event.clientY - target.top) / target.height) * FIELD.height;
    const now = performance.now();

    if (now - lastPresenceUpdateRef.current > 50) {
      connectionRef.current?.updatePresence({ paddleY: y });
      lastPresenceUpdateRef.current = now;
    }

    setPlayers((current) =>
      current.map((player) => (player.id === myId ? { ...player, paddleY: y } : player)),
    );
  };

  // ── Screen 1: join form ──────────────────────────────────────────────────
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

  // ── Screen 2: lobby waiting room ─────────────────────────────────────────
  if (match.phase === "lobby") {
    const redPlayers = players.filter((p) => p.team === "red");
    const bluePlayers = players.filter((p) => p.team === "blue");

    return (
      <section className="panel lobbyWait">
        <h2>{room.roomName} — Waiting for players</h2>
        <div className="lobbyTeams">
          <div className="lobbyTeam red">
            <h3>Red team ({redPlayers.length})</h3>
            {redPlayers.map((p) => (
              <div key={p.id} className="lobbyPlayer">
                {p.name}
                {p.id === myId ? " (you)" : ""}
              </div>
            ))}
            {redPlayers.length === 0 && <div className="muted">No players yet</div>}
          </div>
          <div className="lobbyTeam blue">
            <h3>Blue team ({bluePlayers.length})</h3>
            {bluePlayers.map((p) => (
              <div key={p.id} className="lobbyPlayer">
                {p.name}
                {p.id === myId ? " (you)" : ""}
              </div>
            ))}
            {bluePlayers.length === 0 && <div className="muted">No players yet</div>}
          </div>
        </div>
        {isHost ? (
          <button type="button" className="startButton" onClick={startGame}>
            Start Game
          </button>
        ) : (
          <p className="muted">Waiting for the host to start the game…</p>
        )}
      </section>
    );
  }

  // ── Screen 3: results ────────────────────────────────────────────────────
  if (match.phase === "finished") {
    const winnerLabel =
      match.winner === "draw" ? "Draw!" : match.winner === "red" ? "Red wins!" : "Blue wins!";
    return (
      <section className="panel resultsPanel">
        <h2>{room.roomName}</h2>
        <p className={`winnerText ${match.winner === "draw" ? "" : (match.winner ?? "")}`}>
          {winnerLabel}
        </p>
        <p>
          Final score: <strong>{match.score.red}</strong> – <strong>{match.score.blue}</strong>
        </p>
        <a href="/rooms">← Back to rooms</a>
      </section>
    );
  }

  // ── Screen 4: live game ──────────────────────────────────────────────────
  return (
    <section className="gameLayout">
      <header className="hud">
        <span>{room.roomName}</span>
        <span>
          {Math.max(0, Math.ceil(match.durationSec - match.elapsedSec))}s left | {match.score.red} –{" "}
          {match.score.blue}
        </span>
        <div className="hudRight">
          <span>{players.length} players</span>
          {isHost && (
            <button type="button" className="finishButton" onClick={finishGame}>
              Finish Game
            </button>
          )}
        </div>
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
        {match.paddles.map((paddle) => {
          const isMe = paddle.playerId === myId;
          return (
            <div
              key={paddle.playerId}
              className={`paddle ${paddle.team}`}
              style={{
                left: `${(paddle.x / FIELD.width) * 100}%`,
                top: `${(paddle.y / FIELD.height) * 100}%`,
                width: `${(paddle.width / FIELD.width) * 100}%`,
                height: `${(paddle.height / FIELD.height) * 100}%`,
                opacity: isMe ? 1 : 0.35,
                boxShadow: isMe ? "0 0 8px 2px currentColor" : "none",
              }}
            />
          );
        })}
      </div>
      <footer className="roster">
        <div>Red: {players.filter((p) => p.team === "red").length}</div>
        <div>Blue: {players.filter((p) => p.team === "blue").length}</div>
      </footer>
    </section>
  );
}
