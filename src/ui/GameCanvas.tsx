"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { buildPaddles, createInitialMatchState, tickMatch, toSnapshot } from "@/src/game/engine";
import { clampPaddleY } from "@/src/game/physics";
import { connectRoom, type RoomConnection } from "@/src/realtime/roomState";
import type { MatchSnapshot, MatchState, PlayerPresence, RoomSummary, Team } from "@/src/types/game";

const FIELD = { width: 920, height: 440 };
// Cap on how far the ball is extrapolated past the last snapshot, so a
// goal/reset between snapshots can't fling it across the field.
const MAX_EXTRAPOLATION_SEC = 0.15;

interface Props {
  room: RoomSummary;
}

export function GameCanvas({ room }: Props) {
  const [playerName, setPlayerName] = useState("");
  const [team, setTeam] = useState<Team>("red");
  const [joined, setJoined] = useState(false);
  const [myId, setMyId] = useState("");
  const [players, setPlayers] = useState<PlayerPresence[]>([]);
  const [match, setMatch] = useState<MatchSnapshot>(() => createInitialMatchState(room.durationSec, FIELD));
  const [gameStarted, setGameStarted] = useState(false);

  const connectionRef = useRef<RoomConnection | null>(null);
  const playersRef = useRef<PlayerPresence[]>([]);
  const rosterSigRef = useRef("");
  const matchRef = useRef<MatchState>(createInitialMatchState(room.durationSec, FIELD));
  const snapshotRef = useRef<{ snap: MatchSnapshot; receivedAt: number } | null>(null);
  const myPaddleYRef = useRef(180);
  const lastPresenceUpdateRef = useRef(0);
  const hudRef = useRef({ red: -1, blue: -1, remaining: -1, phase: "" });
  const joinInfoRef = useRef<{ name: string; team: Team }>({ name: "Player", team: "red" });

  // DOM refs for imperative, re-render-free motion during live play.
  const ballElRef = useRef<HTMLDivElement | null>(null);
  const paddleElsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  const isHost = useMemo(() => {
    if (!players.length || !myId) return false;
    return [...players].sort((a, b) => a.id.localeCompare(b.id))[0]?.id === myId;
  }, [myId, players]);

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

  useEffect(() => {
    if (!joined) return;
    const connection = connectRoom(
      room.id,
      myId,
      joinInfoRef.current.name,
      joinInfoRef.current.team,
      (nextPlayers) => {
        playersRef.current = nextPlayers;
        // Re-render only when the roster identity changes (join/leave/team
        // switch/rename) — not when a paddle moves. Paddle motion is drawn
        // imperatively by the rAF loop.
        const sig = nextPlayers
          .map((p) => `${p.id}:${p.team}:${p.name}`)
          .sort()
          .join("|");
        if (sig !== rosterSigRef.current) {
          rosterSigRef.current = sig;
          setPlayers(nextPlayers);
        }
      },
      (snap) => {
        snapshotRef.current = { snap, receivedAt: performance.now() };
        // Keep matchRef roughly current so a promoted host (failover) has
        // recent state to continue physics from.
        matchRef.current = { ...snap, paddles: matchRef.current.paddles };
        if (snap.phase === "live") setGameStarted(true);
        maybeSyncHud(snap);
      },
    );
    connectionRef.current = connection;

    return () => {
      connection.leave();
      connectionRef.current = null;
    };
  }, [joined, myId, room.id, maybeSyncHud]);

  // Host physics loop — authoritative 60 fps, broadcasts a slim snapshot at
  // ~20 fps. Writes only to refs; no per-tick React re-render.
  useEffect(() => {
    if (!joined || !isHost || !gameStarted) return;

    let lastTick = performance.now();
    let lastBroadcast = 0;

    const ticker = setInterval(() => {
      const now = performance.now();
      const dtSec = Math.min(0.05, (now - lastTick) / 1000);
      lastTick = now;

      // Use my own live paddle position rather than my throttled presence.
      const livePlayers = playersRef.current.map((p) =>
        p.id === myId ? { ...p, paddleY: myPaddleYRef.current } : p,
      );
      const nextState = tickMatch(matchRef.current, livePlayers, FIELD, dtSec);
      matchRef.current = nextState;

      if (now - lastBroadcast > 50) {
        connectionRef.current?.broadcastMatchState(toSnapshot(nextState));
        lastBroadcast = now;
      }
      maybeSyncHud(nextState);
    }, 1000 / 60);

    return () => clearInterval(ticker);
  }, [isHost, joined, gameStarted, myId, maybeSyncHud]);

  // rAF render loop — draws ball + paddles imperatively at display rate.
  // Non-hosts extrapolate the ball from the last snapshot for smooth motion
  // despite the ~20 fps network update rate.
  useEffect(() => {
    if (!joined || match.phase !== "live") return;

    let raf = 0;
    const render = () => {
      raf = requestAnimationFrame(render);

      let ballX: number;
      let ballY: number;
      if (isHost) {
        ballX = matchRef.current.ball.x;
        ballY = matchRef.current.ball.y;
      } else {
        const s = snapshotRef.current;
        if (!s) return;
        const dt = Math.min(MAX_EXTRAPOLATION_SEC, (performance.now() - s.receivedAt) / 1000);
        ballX = s.snap.ball.x + s.snap.ball.vx * dt;
        ballY = s.snap.ball.y + s.snap.ball.vy * dt;
      }
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
  }, [joined, match.phase, isHost, myId]);

  const startGame = () => {
    const liveState: MatchState = { ...matchRef.current, phase: "live" };
    matchRef.current = liveState;
    connectionRef.current?.broadcastMatchState(toSnapshot(liveState));
    setGameStarted(true);
    maybeSyncHud(liveState);
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
    connectionRef.current?.broadcastMatchState(toSnapshot(finishedState));
    maybeSyncHud(finishedState);
    void fetch(`/api/rooms/${room.id}`, { method: "DELETE" });
  };

  const changeTeam = (next: Team) => {
    if (match.phase !== "lobby" || next === team) return;
    const teamCount = players.filter((p) => p.team === next).length;
    if (teamCount >= room.maxPlayersPerTeam) return;
    setTeam(next);
    connectionRef.current?.updatePresence({ team: next });
  };

  const onMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.currentTarget.getBoundingClientRect();
    const y = ((event.clientY - target.top) / target.height) * FIELD.height;
    myPaddleYRef.current = y;

    const now = performance.now();
    if (now - lastPresenceUpdateRef.current > 50) {
      connectionRef.current?.updatePresence({ paddleY: y });
      lastPresenceUpdateRef.current = now;
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
