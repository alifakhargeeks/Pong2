const BASE_PADDLE_HEIGHT = 90;
const MIN_PADDLE_HEIGHT = 10;

export function getPaddleHeight(playerCountPerTeam: number): number {
  const n = Math.max(1, playerCountPerTeam);
  return Math.max(MIN_PADDLE_HEIGHT, Math.round(BASE_PADDLE_HEIGHT / n));
}

const SPEED_GAIN_PER_SEC = 0.03;
const MAX_SPEED_MULT = 2.4;

// elapsedSec should be seconds since the last goal (resets on each goal)
export function getBallSpeedMultiplier(elapsedSec: number): number {
  return Math.min(MAX_SPEED_MULT, 1 + elapsedSec * SPEED_GAIN_PER_SEC);
}
