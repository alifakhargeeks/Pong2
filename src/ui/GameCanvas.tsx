"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { buildPaddles } from "@/src/game/engine";
import { clampPaddleY } from "@/src/game/physics";
import type { ClientMessage, MatchSnapshot, PlayerPresence, RoomSummary, ServerMessage, Team } from "@/src/types/game";

const FIELD = { width: 920, height: 440 };
// Cap on how far the ball is extrapolated past the last snapshot, so a
// goal/reset between snapshots can't fling it across the field.
const MAX_EXTRAPOLATION_SEC = 0.15;

const INITIAL_SNAPSHOT: MatchSnapshot = {
  phase: "lobby",
  elapsedSec: 0,
  durationSec: 300,
  score: { red: 0, blue: 0 },
  ball: { x: FIELD.width / 2, y: FIELD.height / 2, vx: 280, vy: 70, radius: 8, speed: 280 },
  winner: null,
  speedElapsedSec: 0,
};

interface Props {
  room: RoomSummary;
}

export function GameCanvas({ room }: Props) {
  const [playerName, setPlayerName] = useState("");
  const [team, setTeam] = useState<Team>("red");
  const [joined, setJoined] = useState(false);
  // myId is stable for the lifetime of this component instance
  const [myId] = useState(() => nanoid(8));
  const [players, setPlayers] = useState<PlayerPresence[]>([]);
  const [match, setMatch] = useState<MatchSnapshot>(() => ({
    ...INITIAL_SNAPSHOT,
    durationSec: room.durationSec,
  }));

  const wsRef = useRef<WebSocket | null>(null);
  const playersRef = useRef<PlayerPresence[]>([]);
  const rosterSigRef = useRef("");
  const snapshotRef = useRef<{ snap: MatchSnapshot; receivedAt: number } | null>(null);
  const myPaddleYRef = useRef(180);
  const lastPaddleSendRef = useRef(0);
  const hudRef = useRef({ red: -1, blue: -1, remaining: -1, phase: "" });
  const joinInfoRef = useRef<{ name: string; team: Team }>({ name: "Player", team: "red" });

  // DOM refs for imperative, re-render-free motion during live play.
  const ballElRef = useRef<HTMLDivElement | null>(null);
  const paddleElsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  // Pushes a re-render only when a HUD-visible value (score, timer second,
  // phase) actually changes — keeps motion off the React render path.
  const maybeSyncHud = useCallback((s: MatchSnapshot) => {
    const remaining = Math.max(0, Math.ceil(s.durationSec - s.elapsedSec));
    const h = hudRef.current;
    if (s.score.red === h.red && s.score.blue === h.blue && remaining === h.remaining && s.phase === h.phase) {
      return;
    }
    hudRef.current = { red: s.score.red, blue: s.score.blue, remaining, phase: s.phase };
    setMatch({ ...s });
  }, []);

  // WebSocket connection to the authoritative game Worker.
  useEffect(() => {
    if (!joined) return;

    const wsUrl = process.env.NEXT_PUBLIC_GAME_WS_URL;
    if (!wsUrl) {
      console.error("NEXT_PUBLIC_GAME_WS_URL is not set");
      return;
    }

    const url = `${wsUrl}/${room.id}?duration=${room.durationSec}&max=${room.maxPlayersPerTeam}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      const msg: ClientMessage = {
        type: "join",
        playerId: myId,
        name: joinInfoRef.current.name,
        team: joinInfoRef.current.team,
      };
      ws.send(JSON.stringify(msg));
    };

    ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string) as ServerMessage;
      } catch {
        return;
      }

      if (msg.type === "snapshot") {
        snapshotRef.current = { snap: msg.payload, receivedAt: performance.now() };
        const nextPlayers = msg.players;
        playersRef.current = nextPlayers;
        // Re-render only when roster identity changes — not on every paddle move.
        const sig = nextPlayers
          .map((p) => `${p.id}:${p.team}:${p.name}`)
          .sort()
          .join("|");
        if (sig !== rosterSigRef.current) {
          rosterSigRef.current = sig;
          setPlayers(nextPlayers);
        }
        maybeSyncHud(msg.payload);
      } else if (msg.type === "error") {
        console.error("Server:", msg.message);
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [joined, myId, room.id, room.durationSec, room.maxPlayersPerTeam, maybeSyncHud]);

  // rAF render loop — draws ball + paddles imperatively at display rate.
  // Extrapolates the ball from the last server snapshot for smooth 60fps motion
  // despite the ~25 Hz network update rate.
  useEffect(() => {
    if (!joined || match.phase !== "live") return;

    let raf = 0;
    const render = () => {
      raf = requestAnimationFrame(render);

      const s = snapshotRef.current;
      if (!s) return;

      const dt = Math.min(MAX_EXTRAPOLATION_SEC, (performance.now() - s.receivedAt) / 1000);
      const ballX = s.snap.ball.x + s.snap.ball.vx * dt;
      const ballY = s.snap.ball.y + s.snap.ball.vy * dt;

      if (ballElRef.current) {
        ballElRef.current.style.left = `${(ballX / FIELD.width) * 100}%`;
        ballElRef.current.style.top = `${(ballY / FIELD.height) * 100}%`;
      }

      const paddles = buildPaddles(FIELD, playersRef.current);
      for (const paddle of paddles) {
        const el = paddleElsRef.current.get(paddle.playerId);
        if (!el) continue;
        const y =
          paddle.playerId === myId
            ? clampPaddleY(myPaddleYRef.current, FIELD.height, paddle.height)
            : paddle.y;
        el.style.left = `${(paddle.x / FIELD.width) * 100}%`;
        el.style.top = `${(y / FIELD.height) * 100}%`;
        el.style.width = `${(paddle.width / FIELD.width) * 100}%`;
        el.style.height = `${(paddle.height / FIELD.height) * 100}%`;
      }
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [joined, match.phase, myId]);

  const sendWs = (msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  const startGame = () => sendWs({ type: "start" });

  const finishGame = () => {
    sendWs({ type: "finish" });
    void fetch(`/api/rooms/${room.id}`, { method: "DELETE" });
  };

  const changeTeam = (next: Team) => {
    if (match.phase !== "lobby" || next === team) return;
    const teamCount = players.filter((p) => p.team === next).length;
    if (teamCount >= room.maxPlayersPerTeam) return;
    setTeam(next);
    sendWs({ type: "switch_team", team: next });
  };

  const onMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.currentTarget.getBoundingClientRect();
    const y = ((event.clientY - target.top) / target.height) * FIELD.height;
    myPaddleYRef.current = y;

    const now = performance.now();
    if (now - lastPaddleSendRef.current > 50) {
      sendWs({ type: "paddle", y });
      lastPaddleSendRef.current = now;
    }
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
            joinInfoRef.current = { name: playerName.trim() || "Player", team };
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
    const cap = room.maxPlayersPerTeam;

    const renderTeam = (label: string, teamId: Team, roster: PlayerPresence[]) => {
      const isMyTeam = team === teamId;
      const full = roster.length >= cap;
      return (
        <div className={`lobbyTeam ${teamId}${isMyTeam ? " mine" : ""}`}>
          <h3>
            {label} ({roster.length}/{cap})
          </h3>
          {roster.map((p) => (
            <div key={p.id} className="lobbyPlayer">
              {p.name}
              {p.id === myId ? " (you)" : ""}
            </div>
          ))}
          {roster.length === 0 && <div className="muted">No players yet</div>}
          {!isMyTeam && (
            <button
              type="button"
              className={`switchTeam ${teamId}`}
              disabled={full}
              onClick={() => changeTeam(teamId)}
            >
              {full ? "Team full" : `Switch to ${label}`}
            </button>
          )}
        </div>
      );
    };

    return (
      <section className="panel lobbyWait">
        <h2>{room.roomName} — Waiting for players</h2>
        <div className="lobbyTeams">
          {renderTeam("Red", "red", redPlayers)}
          {renderTeam("Blue", "blue", bluePlayers)}
        </div>
        <button type="button" className="startButton" onClick={startGame}>
          Start Game
        </button>
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
  const livePaddles = buildPaddles(FIELD, players);
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
          <button type="button" className="finishButton" onClick={finishGame}>
            Finish Game
          </button>
        </div>
      </header>
      <div className="field" onMouseMove={onMove}>
        <div className="centerLine" />
        <div
          ref={ballElRef}
          className="ball"
          style={{
            left: `${(match.ball.x / FIELD.width) * 100}%`,
            top: `${(match.ball.y / FIELD.height) * 100}%`,
            width: match.ball.radius * 2,
            height: match.ball.radius * 2,
          }}
        />
        {livePaddles.map((paddle) => {
          const isMe = paddle.playerId === myId;
          return (
            <div
              key={paddle.playerId}
              ref={(el) => {
                if (el) paddleElsRef.current.set(paddle.playerId, el);
                else paddleElsRef.current.delete(paddle.playerId);
              }}
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
