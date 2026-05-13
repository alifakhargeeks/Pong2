const BASE_PADDLE_HEIGHT = 108;
const MIN_PADDLE_HEIGHT = 30;
const MAX_PADDLE_HEIGHT = 128;
const MAX_TOTAL_PLAYERS = 50;

export function getPaddleHeight(playerCountPerTeam: number): number {
  const normalized = Math.max(1, Math.min(25, playerCountPerTeam));
  const factor = 1 / Math.sqrt(normalized);
  return Math.max(
    MIN_PADDLE_HEIGHT,
    Math.min(MAX_PADDLE_HEIGHT, Math.round(BASE_PADDLE_HEIGHT * factor)),
  );
}

export function getBallSpeedMultiplier(elapsedSec: number, durationSec: number, totalPlayers: number): number {
  const progress = durationSec <= 0 ? 0 : Math.min(1, Math.max(0, elapsedSec / durationSec));
  const timeRamp = 1 + progress * 0.8;
  const playersRamp = 1 + Math.min(MAX_TOTAL_PLAYERS, Math.max(2, totalPlayers)) / MAX_TOTAL_PLAYERS;
  return Math.min(2.4, timeRamp * playersRamp);
}
