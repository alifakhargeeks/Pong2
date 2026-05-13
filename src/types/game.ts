export type Team = "red" | "blue";
export type MatchPhase = "lobby" | "countdown" | "live" | "finished";

export interface RoomSettings {
  roomName: string;
  durationSec: number;
  maxPlayersPerTeam: number;
}

export interface PlayerPresence {
  [key: string]: string | number | boolean;
  id: string;
  name: string;
  team: Team;
  paddleY: number;
  connected: boolean;
}

export interface PaddleState {
  playerId: string;
  team: Team;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  speed: number;
}

export interface ScoreState {
  red: number;
  blue: number;
}

export interface MatchState {
  phase: MatchPhase;
  elapsedSec: number;
  durationSec: number;
  score: ScoreState;
  paddles: PaddleState[];
  ball: BallState;
  winner: Team | "draw" | null;
}

export interface RoomSummary {
  id: string;
  roomName: string;
  status: MatchPhase;
  durationSec: number;
  maxPlayersPerTeam: number;
  redCount: number;
  blueCount: number;
  createdAt: string;
}
