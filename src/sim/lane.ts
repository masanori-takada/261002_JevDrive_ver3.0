// 世界座標（x, z）で判断する 3 レーン方式のロジック（シミュレーションの比較用。製品では使わない）
import { LANE_CENTERS } from '../game/lane-geometry';
import type { Steer } from '../lib/types';

export type Lane = 'left' | 'center' | 'right';
export type SimObstacle = { x: number; z: number };

export const LANE_X: Record<Lane, number> = { left: LANE_CENTERS[0], center: LANE_CENTERS[1], right: LANE_CENTERS[2] };
const LANE_ORDER: Lane[] = ['center', 'left', 'right'];

const LANE_HALF_WIDTH = 0.55; // |x - レーン| がこれ未満なら、そのレーン上の障害物とみなす
const TIE_MARGIN = 0.1;       // 最も近い脅威までの距離がこの差未満なら現在のレーンを維持
const PASSED_Z = -0.02;       // これ以下の z は通過済みで無視
const NEAR_Z = 0.3;           // 目標レーンの脅威がこれより近いと減速

/** そのレーン上で最も近い障害物までの距離（z）。なければ Infinity */
export function laneClearance(obstacles: SimObstacle[], lane: Lane): number {
  let best = Infinity;
  for (const o of obstacles) {
    if (o.z <= PASSED_Z) continue;
    if (Math.abs(o.x - LANE_X[lane]) < LANE_HALF_WIDTH && o.z < best) best = o.z;
  }
  return best;
}

/** 最も近い脅威までの距離が最大のレーンを選ぶ。同程度（差 0.1 未満）なら現在のレーンを維持 */
export function selectLane(obstacles: SimObstacle[], current: Lane): Lane {
  let best = current;
  let bestDist = laneClearance(obstacles, current);
  for (const lane of LANE_ORDER) {
    const d = laneClearance(obstacles, lane);
    if (d > bestDist) { best = lane; bestDist = d; }
  }
  const currentDist = laneClearance(obstacles, current);
  // 両方 Infinity のときは差が NaN になるので、等しい場合を先に維持扱いにする
  if (best === current || currentDist === bestDist || bestDist - currentDist < TIE_MARGIN) return current;
  return best;
}

/** ruleAction と同じ考え方: 脅威が非常に近いと減速、speed < 0.8 なら加速 */
export function laneThrottle(obstacles: SimObstacle[], lane: Lane, speed: number): Steer {
  if (laneClearance(obstacles, lane) < NEAR_Z) return 0;
  return speed < 0.8 ? 1 : 0;
}
