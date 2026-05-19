import { bounceFromPaddle, bounceFromWalls, checkGoal, clampPaddleY, moveBall, type FieldSize } from "@/src/game/physics";
import { getBallSpeedMultiplier, getPaddleHeight } from "@/src/game/scaling";
import type { MatchSnapshot, MatchState, PaddleState, PlayerPresence, Team } from "@/src/types/game";

const BASE_BALL_SPEED = 280;
const PADDLE_WIDTH = 12;
const LEFT_X = 18;

export function buildPaddles(field: FieldSize, players: PlayerPresence[]): PaddleState[] {
  const redPlayers = players.filter((p) => p.team === "red");
  const bluePlayers = players.filter((p) => p.team === "blue");
  const maxTeamHeight = field.height * 0.7;
  const redHeight = Math.min(getPaddleHeight(redPlayers.length || 1), Math.floor(maxTeamHeight / (redPlayers.length || 1)));
  const blueHeight = Math.min(getPaddleHeight(bluePlayers.length || 1), Math.floor(maxTeamHeight / (bluePlayers.length || 1)));

  return players.map((player) => {
    const height = player.team === "red" ? redHeight : blueHeight;
    const x = player.team === "red" ? LEFT_X : field.width - LEFT_X - PADDLE_WIDTH;
    return {
      playerId: player.id,
      team: player.team,
      x,
      y: clampPaddleY(player.paddleY, field.height, height),
      width: PADDLE_WIDTH,
      height,
    };
  });
}

function resetBall(field: FieldSize, towardTeam: Team, speed: number) {
  const direction = towardTeam === "red" ? -1 : 1;
  return {
    x: field.width / 2,
    y: field.height / 2,
    vx: speed * direction,
    vy: speed * 0.25,
    radius: 8,
    speed,
  };
}

export function createInitialMatchState(durationSec: number, field: FieldSize): MatchState {
  return {
    phase: "lobby",
    elapsedSec: 0,
    durationSec,
    score: { red: 0, blue: 0 },
    paddles: [],
    ball: {
      x: field.width / 2,
      y: field.height / 2,
      vx: BASE_BALL_SPEED,
      vy: BASE_BALL_SPEED * 0.25,
      radius: 8,
      speed: BASE_BALL_SPEED,
    },
    winner: null,
    speedElapsedSec: 0,
  };
}

// Strips the player-count-scaling `paddles` array for the wire. Clients
// rebuild paddles locally from presence via buildPaddles().
export function toSnapshot(state: MatchState): MatchSnapshot {
  const { paddles: _paddles, ...snapshot } = state;
  return snapshot;
}

export function tickMatch(state: MatchState, players: PlayerPresence[], field: FieldSize, dtSec: number): MatchState {
  if (state.phase !== "live") return { ...state, paddles: buildPaddles(field, players) };
  const speedMultiplier = getBallSpeedMultiplier(state.speedElapsedSec);
  const speed = BASE_BALL_SPEED * speedMultiplier;

  let ball = {
    ...state.ball,
    vx: Math.sign(state.ball.vx || 1) * speed,
    vy: Math.sign(state.ball.vy || 1) * Math.max(80, Math.abs(state.ball.vy)),
    speed,
  };
  const paddles = buildPaddles(field, players);

  ball = moveBall(ball, dtSec);
  ball = bounceFromWalls(ball, field);
  for (const paddle of paddles) {
    ball = bounceFromPaddle(ball, paddle);
  }

  const goalFor = checkGoal(ball, field);
  const elapsedSec = Math.min(state.durationSec, state.elapsedSec + dtSec);
  const nextScore = { ...state.score };
  let nextSpeedElapsedSec = state.speedElapsedSec + dtSec;
  if (goalFor) {
    nextScore[goalFor] += 1;
    ball = resetBall(field, goalFor === "red" ? "blue" : "red", BASE_BALL_SPEED);
    nextSpeedElapsedSec = 0;
  }

  const hasEnded = elapsedSec >= state.durationSec;
  const winner = hasEnded
    ? nextScore.red === nextScore.blue
      ? "draw"
      : nextScore.red > nextScore.blue
        ? "red"
        : "blue"
    : null;

  return {
    ...state,
    elapsedSec,
    speedElapsedSec: nextSpeedElapsedSec,
    score: nextScore,
    ball,
    paddles,
    phase: hasEnded ? "finished" : "live",
    winner,
  };
}
