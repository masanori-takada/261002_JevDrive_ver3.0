// 観測（検出ボックス）だけで判断するレーン目標方式。レーン数・閾値・遅延補償を設定で変えられる
import { Z_RATE, type GameState } from '../game/racer';
import { clearancesFor, type LaneSpec } from '../vision/lanes';
import { laneSteer } from '../game/steer';
import { decideFromClearances, type LaneDecision } from '../vision/lane-plan';
import { buildSimObservation } from './observe';
import type { Policy } from './policies';

export type LaneConfig = {
  spec: LaneSpec;
  /** 現在のレーンを維持する余裕の差の閾値 */
  margin: number;
  /** 目標レーンの余裕がこれ未満なら減速（throttle=0） */
  throttleNear: number;
  /** 遅延補償に使う L（秒）。0 なら補償なし */
  compensateL: number;
  /** 観測を 3 桁に丸めるか */
  round: boolean;
};
export type ObsLaneDecision = LaneDecision;

/** 判断時点の速度と、（遅延補償込みの）各レーンの余裕。観測だけから作る */
export function observeClearances(s: GameState, c: LaneConfig): { speed: number; cl: number[] } {
  const obs = buildSimObservation(s, { round: c.round });
  const advance = obs.speed * Z_RATE * c.compensateL;
  return { speed: obs.speed, cl: clearancesFor(obs, c.spec, advance) };
}

export function makeLanePolicy(c: LaneConfig): Policy<ObsLaneDecision> {
  return {
    initial: { idx: Math.floor(c.spec.centers.length / 2), throttle: 0 },
    decide: (s, current) => {
      const { speed, cl } = observeClearances(s, c);
      return decideFromClearances(cl, current.idx, speed, c);
    },
    toAction: (d, s) => ({ steer: laneSteer(s.playerX, c.spec.centers[d.idx]), throttle: d.throttle }),
  };
}
