// 観測（検出ボックス）から 5 レーンの余裕を求め、目標レーンと throttle を決める（製品とシミュレーションで共用）
import { Z_RATE } from '../game/racer';
import type { Observation, Plan, Steer } from '../lib/types';
import { clearancesFor, LANES5 } from './lanes';

/** 実 Jev の判断の更新周期（秒）。遅延補償に使う */
export const LATENCY_S = 0.55;
/** 現在のレーンを維持する余裕の差の閾値 */
export const MARGIN = 0.1;
/** 目標レーンの余裕がこれ未満なら減速（throttle=0） */
export const THROTTLE_NEAR = 0.3;

export type LaneDecision = { idx: number; throttle: Steer };

/** 最も余裕のあるレーンの番号。同点は中央に近い順（同距離なら左）。現在との差が margin 未満なら現在を維持 */
export function selectLaneIdx(clearances: number[], current: number, margin: number): number {
  const mid = (clearances.length - 1) / 2;
  const order = clearances
    .map((_, i) => i)
    .sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
  let best = order[0];
  for (const i of order) if (clearances[i] > clearances[best]) best = i;
  return clearances[best] - clearances[current] < margin ? current : best;
}

/** 余裕・現在のレーン・速度から判断を決める純関数（実 Jev の正解にも使う） */
export function decideFromClearances(
  cl: number[], current: number, speed: number, p: { margin: number; throttleNear: number },
): LaneDecision {
  const idx = selectLaneIdx(cl, current, p.margin);
  const throttle: Steer = cl[idx] < p.throttleNear ? 0 : speed < 0.8 ? 1 : 0;
  return { idx, throttle };
}

/** x に最も近い 5 レーンの番号（同距離なら小さい番号） */
export function nearestLaneIdx(x: number): number {
  let best = 0;
  LANES5.centers.forEach((c, i) => {
    if (Math.abs(c - x) < Math.abs(LANES5.centers[best] - x)) best = i;
  });
  return best;
}

/** 5 レーンの余裕。判断が反映される L 秒後の位置に進めて評価する（遅延補償） */
export function observationClearances(obs: Observation): number[] {
  return clearancesFor(obs, LANES5, obs.speed * Z_RATE * LATENCY_S);
}

/** 観測だけから Plan を決める（モックのルール式）。targetX が無ければ中央を現在のレーンとする */
export function planFromObservation(obs: Observation): Plan {
  const cl = observationClearances(obs);
  const current = nearestLaneIdx(obs.targetX ?? 0);
  const d = decideFromClearances(cl, current, obs.speed, { margin: MARGIN, throttleNear: THROTTLE_NEAR });
  return { targetX: LANES5.centers[d.idx], throttle: d.throttle };
}
