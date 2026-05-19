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
  speedElapsedSec: number; // seconds since last goal; drives ball speed ramp
}

// Slim wire shape broadcast by the host. Excludes `paddles` — clients derive
// those locally from presence, so the payload stays constant regardless of
// player count.
export type MatchSnapshot = Omit<MatchState, "paddles">;

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

// Client → Worker WebSocket messages
export type ClientMessage =
  | { type: "join"; playerId: string; name: string; team: Team }
  | { type: "paddle"; y: number }
  | { type: "switch_team"; team: Team }
  | { type: "start" }
  | { type: "finish" };

// Worker → Client WebSocket messages
export type ServerMessage =
  | { type: "snapshot"; payload: MatchSnapshot; players: PlayerPresence[] }
  | { type: "joined"; playerId: string; team: Team; maxPerTeam: number }
  | { type: "error"; message: string };
