import type { Box } from '../lib/types';
import type { GameState } from './racer';
import { LANE_HALF } from './lane-geometry';
import { dashStarts, DASH_LEN } from './road-dash';
import { ASPECT, baseY, HORIZON, obstacleBox, screenX, T_BOTTOM } from './projection';

// 路面色は vision/road.ts の判定（彩度が低く明るさ50以上）に合わせた灰色にする
export const COLORS = { sky: '#7ec8ff', grass: '#2e8b3c', road: '#5a5a5f', line: '#f2f2f2' };
const OBSTACLE_COLORS = ['#d62828', '#1d4ed8', '#f4a300', '#e8590c']; // 灰色・白は路面と紛れるので使わない

export type RenderOptions = { width: number; height: number; player: boolean };

function drawCar(ctx: CanvasRenderingContext2D, b: Box, color: string, W: number, H: number) {
  const x = b.x * W, y = b.y * H, w = b.w * W, h = b.h * H;
  ctx.fillStyle = '#111';
  ctx.fillRect(x - w * 0.04, y + h * 0.72, w * 0.16, h * 0.28);
  ctx.fillRect(x + w * 0.88, y + h * 0.72, w * 0.16, h * 0.28);
  ctx.fillStyle = color;
  ctx.fillRect(x, y + h * 0.25, w, h * 0.6);
  ctx.fillRect(x + w * 0.12, y, w * 0.76, h * 0.35);
  ctx.fillStyle = '#1b2a3a';
  ctx.fillRect(x + w * 0.2, y + h * 0.06, w * 0.6, h * 0.22);
  ctx.fillStyle = '#ff2d2d';
  ctx.fillRect(x + w * 0.04, y + h * 0.5, w * 0.18, h * 0.1);
  ctx.fillRect(x + w * 0.78, y + h * 0.5, w * 0.18, h * 0.1);
  ctx.fillStyle = '#222';
  ctx.fillRect(x + w * 0.3, y + h * 0.78, w * 0.4, h * 0.07);
}

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

export function renderGame(ctx: CanvasRenderingContext2D, s: GameState, o: RenderOptions): void {
  const { width: W, height: H } = o;
  ctx.fillStyle = COLORS.sky;
  ctx.fillRect(0, 0, W, H * HORIZON);
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, H * HORIZON, W, H * (1 - HORIZON));

  // 路面
  const yTop = H * HORIZON;
  const xl0 = screenX(-1, s.playerX, 0) * W, xr0 = screenX(1, s.playerX, 0) * W;
  const xl1 = screenX(-1, s.playerX, T_BOTTOM) * W, xr1 = screenX(1, s.playerX, T_BOTTOM) * W;
  ctx.fillStyle = COLORS.road;
  ctx.beginPath();
  ctx.moveTo(xl0, yTop);
  ctx.lineTo(xr0, yTop);
  ctx.lineTo(xr1, H);
  ctx.lineTo(xl1, H);
  ctx.closePath();
  ctx.fill();

  // 路肩の白線
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = Math.max(2, W * 0.008);
  line(ctx, xl0, yTop, xl1, H);
  line(ctx, xr0, yTop, xr1, H);

  // レーン破線（走行距離に応じて手前へ流れる）
  // 破線は世界の奥行き z に置き、障害物と同じ投影（t = 1 − z、線形）で描く
  const zMin = 1 - T_BOTTOM;
  for (const u of [-LANE_HALF, LANE_HALF]) {
    for (const z of dashStarts(s.distance)) {
      const zNear = Math.max(z, zMin);
      const zFar = Math.min(z + DASH_LEN, 1);
      if (zFar <= zNear) continue;
      const t0 = 1 - zFar, t1 = 1 - zNear;
      ctx.lineWidth = 1 + 5 * t1;
      line(ctx, screenX(u, s.playerX, t0) * W, baseY(t0) * H, screenX(u, s.playerX, t1) * W, baseY(t1) * H);
    }
  }

  // 障害物（奥から手前の順）
  const sorted = [...s.obstacles].sort((a, b) => b.z - a.z);
  for (const ob of sorted) {
    drawCar(ctx, obstacleBox(ob, s.playerX), OBSTACLE_COLORS[ob.id % OBSTACLE_COLORS.length], W, H);
  }

  // 自車（検出用フレームでは描かない）
  if (o.player && !(s.frame < s.crashedUntil && s.frame % 8 < 4)) {
    const w = 0.22, h = w * ASPECT * 0.8;
    drawCar(ctx, { x: 0.5 - w / 2, y: 0.97 - h, w, h }, '#c026d3', W, H);
  }
}
