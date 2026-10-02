// 検出ボックスだけから、車線ごとの余裕（clearance）を求める純関数。
// src/game/projection.ts の投影の逆: 接地位置 y+h = baseY(t) から t、中心 cx = 0.5 + (u - playerX)*roadHalf(t) から u を求める。
import { BASE_NEAR, HORIZON, roadHalf } from '../game/projection';
import { HIT_DX } from '../game/racer';
import type { Observation } from '../lib/types';

export type LaneSpec = { centers: number[]; halfWidth: number };
// レーン幅はゲームの衝突判定幅（HIT_DX）に合わせる。狭いとレーン端の障害物を「余裕あり」と誤判定する
export const LANES3: LaneSpec = { centers: [-0.55, 0, 0.55], halfWidth: HIT_DX };
export const LANES5: LaneSpec = { centers: [-0.8, -0.4, 0, 0.4, 0.8], halfWidth: HIT_DX };

const PASSED_Z = -0.02; // これ以下の z は通過済みで無視（ゲームの衝突判定は z > -0.02）
const T_MAX = 1.1;      // これを超える t は異常値として無視

/** 道路上の横位置 u と奥行き z（1=奥, 0=手前）。異常なボックス（接地位置が地平線以下など）は含めない */
export function backProject(obs: Observation): { u: number; z: number }[] {
  const out: { u: number; z: number }[] = [];
  const playerX = obs.road.centerOffset;
  for (const d of obs.obstacles) {
    const t = (d.y + d.h - HORIZON) / (BASE_NEAR - HORIZON);
    if (!Number.isFinite(t) || t <= 0 || t > T_MAX) continue;
    const cx = d.x + d.w / 2;
    out.push({ u: playerX + (cx - 0.5) / roadHalf(t), z: 1 - t });
  }
  return out;
}

/**
 * 各レーン上で最も近い障害物の z（なければ 1.0）。
 * advance だけ z を手前に進めてから評価する（遅延補償用。通過してしまうものは無視）。
 */
export function clearancesFor(obs: Observation, spec: LaneSpec, advance = 0): number[] {
  const res = spec.centers.map(() => 1);
  for (const p of backProject(obs)) {
    const z = p.z - advance;
    if (z <= PASSED_Z) continue;
    spec.centers.forEach((c, i) => {
      if (Math.abs(p.u - c) < spec.halfWidth && z < res[i]) res[i] = z;
    });
  }
  return res;
}
