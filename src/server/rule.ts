import type { JevDetail, Observation, Plan } from '../lib/types';
import { nearestLaneIdx, planFromObservation } from '../vision/lane-plan';
import { buildJevDetail } from './jev-detail';
import { LANE_NAMES, THROTTLE_NAMES } from './jev-question';

/** JEV_MOCK=1 のときだけ使う、Jev の代わりのルール式。5 レーンの余裕から実機と同じ構造の Plan を返す（結合テスト用） */
export function rulePlan(obs: Observation): Plan {
  return planFromObservation(obs);
}

/** JEV_MOCK 用。Plan に加えて、選ばれたものが 1、他が 0 の detail を返す */
export function ruleDecision(obs: Observation): { plan: Plan; detail: JevDetail } {
  const plan = rulePlan(obs);
  const detail = buildJevDetail(LANE_NAMES[nearestLaneIdx(plan.targetX)], THROTTLE_NAMES[plan.throttle + 1]);
  return { plan, detail };
}
