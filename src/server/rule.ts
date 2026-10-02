import type { Observation, Plan } from '../lib/types';
import { planFromObservation } from '../vision/lane-plan';

/** JEV_MOCK=1 のときだけ使う、Jev の代わりのルール式。5 レーンの余裕から実機と同じ構造の Plan を返す（結合テスト用） */
export function rulePlan(obs: Observation): Plan {
  return planFromObservation(obs);
}
