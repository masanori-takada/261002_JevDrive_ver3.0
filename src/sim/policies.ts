// 方式ごとの政策。判断（decide）は遅延の対象、toAction は毎フレーム動く低レベル制御
import type { GameState } from '../game/racer';
import type { Action } from '../lib/types';
import { ruleAction } from './rule-raw';
import { laneSteer } from '../game/steer';
import { laneThrottle, LANE_X, selectLane, type Lane } from './lane';
import { buildSimObservation } from './observe';

export type Policy<D> = {
  /** 最初の判断が反映されるまでの保持値 */
  initial: D;
  /** 時刻 t の状態から判断を決める */
  decide: (s: GameState, current: D) => D;
  /** 反映済みの判断と現在の状態から、そのフレームの操作を作る */
  toAction: (d: D, s: GameState) => Action;
};

export type Method = 'noop' | 'rule-raw' | 'oracle' | 'lane-target';
export type LaneDecision = { lane: Lane; throttle: Action['throttle'] };

const noop: Policy<Action> = {
  initial: { steer: 0, throttle: 0 },
  decide: () => ({ steer: 0, throttle: 0 }),
  toAction: (d) => d,
};

/** rule-raw と oracle は同じ政策（oracle は L=0 で走らせる） */
const ruleRaw: Policy<Action> = {
  initial: { steer: 0, throttle: 0 },
  decide: (s) => ruleAction(buildSimObservation(s)),
  toAction: (d) => d,
};

const laneTarget: Policy<LaneDecision> = {
  initial: { lane: 'center', throttle: 0 },
  decide: (s, current) => {
    const lane = selectLane(s.obstacles, current.lane);
    return { lane, throttle: laneThrottle(s.obstacles, lane, s.speed) };
  },
  toAction: (d, s) => ({ steer: laneSteer(s.playerX, LANE_X[d.lane]), throttle: d.throttle }),
};

export function makePolicy(method: 'noop' | 'rule-raw' | 'oracle'): Policy<Action>;
export function makePolicy(method: 'lane-target'): Policy<LaneDecision>;
export function makePolicy(method: Method): Policy<any>;
export function makePolicy(method: Method): Policy<any> {
  switch (method) {
    case 'noop': return noop;
    case 'rule-raw':
    case 'oracle': return ruleRaw;
    case 'lane-target': return laneTarget;
  }
}
