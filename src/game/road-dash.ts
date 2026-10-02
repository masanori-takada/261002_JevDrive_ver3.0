import { Z_RATE } from './racer';

/** 路面の破線の本数（1 周期 = z の 1.0 に N 本） */
export const DASH_N = 10;
/** 破線の長さ（z 方向） */
export const DASH_LEN = 0.5 / DASH_N;

const SPACING = 1 / DASH_N;
/** 画面の下端より手前（z が負）側も覆うための下限 */
const Z_FROM = -0.3;

/**
 * 路面の破線の始点の奥行き z（昇順）。z_i = frac(i / N − Z_RATE * distance) の格子を、z = Z_FROM から 1 まで並べたもの。
 * 走行距離が進むほど z が減る（手前へ流れる）。流れる量は障害物（停止物）の接近量 Z_RATE * 距離と一致する。
 */
export function dashStarts(distance: number): number[] {
  const z0 = ((((-Z_RATE * distance) % SPACING) + SPACING) % SPACING);
  const out: number[] = [];
  for (let z = z0 + Math.ceil((Z_FROM - z0) / SPACING) * SPACING; z <= 1 + 1e-9; z += SPACING) out.push(z);
  return out;
}
