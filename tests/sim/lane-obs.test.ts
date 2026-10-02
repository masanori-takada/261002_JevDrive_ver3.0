import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/game/racer';
import { LANES3, LANES5 } from '../../src/vision/lanes';
import { selectLaneIdx } from '../../src/vision/lane-plan';
import { makeLanePolicy } from '../../src/sim/lane-obs';
import { buildSimObservation } from '../../src/sim/observe';
import { runEpisode, simulate } from '../../src/sim/run';
import { makePolicy } from '../../src/sim/policies';

describe('selectLaneIdx', () => {
  it('全レーンが同じ余裕なら現在のレーンを維持', () => {
    expect(selectLaneIdx([1, 1, 1], 2, 0.1)).toBe(2);
  });
  it('現在のレーンより 0.1 以上余裕のあるレーンがあれば移る', () => {
    expect(selectLaneIdx([1, 0.3, 1], 1, 0.1)).toBe(0); // 同点は中央に近い順→同距離なら左
  });
  it('差が閾値未満なら維持する', () => {
    expect(selectLaneIdx([0.5, 0.45, 0.4], 1, 0.1)).toBe(1);
  });
  it('閾値は引数で変えられる', () => {
    expect(selectLaneIdx([0.5, 0.45, 0.4], 1, 0.02)).toBe(0);
  });
  it('同点の最大が複数なら中央に近いレーンを優先する', () => {
    expect(selectLaneIdx([1, 0.2, 0.2, 1, 1], 2, 0.1)).toBe(3);
  });
});

describe('makeLanePolicy', () => {
  const base = { spec: LANES3, margin: 0.1, throttleNear: 0.3, compensateL: 0, round: false };
  it('正面に障害物があれば別レーンを選び、近ければ throttle=0', () => {
    const p = makeLanePolicy(base);
    const s = { ...createGame(1), speed: 0.5, obstacles: [{ id: 1, x: -0.05, z: 0.2 }] };
    const d = p.decide(s, p.initial);
    expect(d.idx).toBe(2); // 中央・左が塞がれ右が空き
    expect(d.throttle).toBe(1); // 右レーンは空いていて speed<0.8 → 加速
  });
  it('現在のレーンの脅威が近いと throttle=0', () => {
    const p = makeLanePolicy({ ...base, margin: 5 }); // 常に維持
    const s = { ...createGame(1), speed: 0.5, obstacles: [{ id: 1, x: 0, z: 0.2 }] };
    expect(p.decide(s, p.initial).throttle).toBe(0);
  });
  it('遅延補償ありは、反映時点で通過している障害物を無視する', () => {
    const s = { ...createGame(1), speed: 0.7, obstacles: [{ id: 1, x: 0, z: 0.1 }] };
    const noComp = makeLanePolicy({ ...base, margin: 5 }).decide(s, { idx: 1, throttle: 0 });
    expect(noComp.throttle).toBe(0);
    const comp = makeLanePolicy({ ...base, margin: 5, compensateL: 0.55 }); // 0.5*0.7*0.55 進む
    expect(comp.decide(s, { idx: 1, throttle: 0 }).throttle).toBe(0 + 1); // 障害物は通過扱いで加速
  });
  it('5 レーンの初期は中央（idx=2）', () => {
    expect(makeLanePolicy({ ...base, spec: LANES5 }).initial.idx).toBe(2);
  });
  it('toAction は目標レーン中心へ向けて舵を切る', () => {
    const p = makeLanePolicy({ ...base, spec: LANES5 });
    const s = createGame(1); // playerX=0
    expect(p.toAction({ idx: 4, throttle: 0 }, s).steer).toBe(1);
    expect(p.toAction({ idx: 0, throttle: 0 }, s).steer).toBe(-1);
    expect(p.toAction({ idx: 2, throttle: 1 }, s)).toEqual({ steer: 0, throttle: 1 });
  });
  it('シミュレーションを最後まで走らせられる', () => {
    const r = runEpisode(makeLanePolicy(base), 1, 20, 0.55);
    expect(r.distance).toBeGreaterThan(0);
  });
});

describe('buildSimObservation の round オプション', () => {
  it('round:false は丸めない', () => {
    const s = { ...createGame(1), playerX: 0.123456, obstacles: [{ id: 1, x: 0.1234567, z: 0.3333333 }] };
    expect(buildSimObservation(s, { round: false }).road.centerOffset).toBe(0.123456);
    expect(buildSimObservation(s).road.centerOffset).toBe(0.123);
  });
});

describe('simulate', () => {
  it('指定フレーム後の状態と反映済みの判断を返す', () => {
    const r = simulate(makePolicy('noop'), 1, 30, 0.55);
    expect(r.state.frame).toBe(30);
    expect(r.applied).toEqual({ steer: 0, throttle: 0 });
  });
});

import { observeClearances } from '../../src/sim/lane-obs';
import { decideFromClearances } from '../../src/vision/lane-plan';

describe('decideFromClearances（正解の関数）', () => {
  const cfg = { spec: LANES5, margin: 0.05, throttleNear: 0.15, compensateL: 0.55, round: true };
  it('現在のレーンが塞がれていれば最も余裕のあるレーンへ移る', () => {
    expect(decideFromClearances([1, 1, 0.2, 1, 1], 2, 0.5, cfg)).toEqual({ idx: 1, throttle: 1 });
  });
  it('選んだレーンの余裕が throttleNear 未満なら throttle=0', () => {
    expect(decideFromClearances([0.1, 0.1, 0.1, 0.1, 0.1], 2, 0.5, cfg)).toEqual({ idx: 2, throttle: 0 });
  });
  it('速度が 0.8 以上なら throttle=0', () => {
    expect(decideFromClearances([1, 1, 1, 1, 1], 2, 0.9, cfg)).toEqual({ idx: 2, throttle: 0 });
  });
});

describe('observeClearances', () => {
  it('補償込みの余裕を返す（decide と同じ値）', () => {
    const cfg = { spec: LANES3, margin: 0.1, throttleNear: 0.3, compensateL: 0.55, round: true };
    const s = { ...createGame(1), speed: 0.7, obstacles: [{ id: 1, x: 0, z: 0.5 }] };
    const r = observeClearances(s, cfg);
    expect(r.speed).toBeCloseTo(0.7, 3);
    expect(r.cl[1]).toBeCloseTo(0.5 - 0.7 * 0.5 * 0.55, 2);
  });
});
