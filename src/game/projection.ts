import type { Box } from '../lib/types';

export const ASPECT = 16 / 9;       // キャンバスの縦横比
export const HORIZON = 0.4;         // 地平線の高さ（画面比）
export const BASE_NEAR = 0.92;      // 最も手前（t=1）の接地位置（画面比）
export const T_BOTTOM = (1 - HORIZON) / (BASE_NEAR - HORIZON); // 画面下端に対応する t

/** t は 0=奥（地平線）〜 1=手前 */
export function roadHalf(t: number): number {
  return 0.05 + 0.45 * t;
}

export function baseY(t: number): number {
  return HORIZON + (BASE_NEAR - HORIZON) * t;
}

/** 道路上の横位置 u（-1..1 が路面）を画面の x（画面比）に変換する。カメラは自車に追従する */
export function screenX(u: number, playerX: number, t: number): number {
  return 0.5 + (u - playerX) * roadHalf(t);
}

/** 障害物（z: 1=奥 0=手前）の画面上のボックス。描画と正解データで共用する */
export function obstacleBox(o: { x: number; z: number }, playerX: number): Box {
  const t = 1 - o.z;
  const w = 0.6 * roadHalf(t);
  const h = w * ASPECT * 0.8;
  const cx = screenX(o.x, playerX, t);
  return { x: cx - w / 2, y: baseY(t) - h, w, h };
}
