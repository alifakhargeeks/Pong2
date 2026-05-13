import type { BallState, PaddleState, Team } from "@/src/types/game";

export interface FieldSize {
  width: number;
  height: number;
}

export function moveBall(ball: BallState, dtSec: number): BallState {
  return {
    ...ball,
    x: ball.x + ball.vx * dtSec,
    y: ball.y + ball.vy * dtSec,
  };
}

export function clampPaddleY(y: number, fieldHeight: number, paddleHeight: number): number {
  return Math.max(0, Math.min(fieldHeight - paddleHeight, y));
}

export function bounceFromWalls(ball: BallState, field: FieldSize): BallState {
  if (ball.y - ball.radius <= 0 && ball.vy < 0) {
    return { ...ball, y: ball.radius, vy: -ball.vy };
  }
  if (ball.y + ball.radius >= field.height && ball.vy > 0) {
    return { ...ball, y: field.height - ball.radius, vy: -ball.vy };
  }
  return ball;
}

export function bounceFromPaddle(ball: BallState, paddle: PaddleState): BallState {
  const intersectsX = ball.x + ball.radius >= paddle.x && ball.x - ball.radius <= paddle.x + paddle.width;
  const intersectsY = ball.y + ball.radius >= paddle.y && ball.y - ball.radius <= paddle.y + paddle.height;

  if (!intersectsX || !intersectsY) return ball;

  const paddleMid = paddle.y + paddle.height / 2;
  const offset = (ball.y - paddleMid) / (paddle.height / 2);
  const nextVx = paddle.team === "red" ? Math.abs(ball.vx) : -Math.abs(ball.vx);
  const nextVy = ball.vy + offset * 120;

  return {
    ...ball,
    vx: nextVx * 1.02,
    vy: nextVy,
  };
}

export function checkGoal(ball: BallState, field: FieldSize): Team | null {
  if (ball.x + ball.radius < 0) return "blue";
  if (ball.x - ball.radius > field.width) return "red";
  return null;
}
