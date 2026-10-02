import type { Action, Observation } from '../lib/types';

/** 旧ルール式の操作（シミュレーションの比較基準 rule-raw 用。製品では使わない） */
export function ruleAction(obs: Observation): Action {
  const threat = obs.obstacles.find(
    (o) => o.y + o.h > 0.55 && Math.abs(o.x + o.w / 2 - 0.5) < o.w,
  );
  if (threat) {
    return { steer: threat.x + threat.w / 2 < 0.5 ? 1 : -1, throttle: 0 };
  }
  const off = obs.road.centerOffset;
  const steer = off > 0.15 ? -1 : off < -0.15 ? 1 : 0;
  return { steer, throttle: obs.speed < 0.8 ? 1 : 0 };
}
