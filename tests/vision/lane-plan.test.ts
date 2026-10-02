import { describe, expect, it } from 'vitest';
import { obstacleBox } from '../../src/game/projection';
import { V_CAR, Z_RATE } from '../../src/game/racer';
import type { Observation } from '../../src/lib/types';
import {
  decideFromClearances, LATENCY_S, nearestLaneIdx, observationClearances, planFromObservation, selectLaneIdx,
} from '../../src/vision/lane-plan';

const obsOf = (o: { at?: { x: number; z: number }[]; targetX?: number; speed?: number } = {}): Observation => ({
  frame: 0,
  speed: o.speed ?? 0.5,
  road: { left: 0.2, right: 0.8, centerOffset: 0 },
  obstacles: (o.at ?? []).map((p) => ({ ...obstacleBox(p, 0), cls: 'car' as const, conf: 1 })),
  ...(o.targetX !== undefined ? { targetX: o.targetX } : {}),
});

describe('selectLaneIdx', () => {
  it('全レーンが同じ余裕なら現在のレーンを維持', () => {
    expect(selectLaneIdx([1, 1, 1], 2, 0.1)).toBe(2);
  });
  it('現在のレーンより margin 以上余裕のあるレーンがあれば移る（同点は中央に近い順、同距離なら左）', () => {
    expect(selectLaneIdx([1, 0.3, 1], 1, 0.1)).toBe(0);
    expect(selectLaneIdx([0.2, 0.2, 1], 0, 0.1)).toBe(2);
  });
  it('差が margin 未満なら維持する', () => {
    expect(selectLaneIdx([0.5, 0.45, 0.4], 1, 0.1)).toBe(1);
    expect(selectLaneIdx([0.5, 0.45, 0.4], 1, 0.02)).toBe(0);
  });
});

describe('decideFromClearances', () => {
  const p = { margin: 0.1, throttleNear: 0.3 };
  it('塞がれていれば最も余裕のあるレーンへ、遠ければ加速', () => {
    expect(decideFromClearances([1, 0.2, 1], 1, 0.5, p)).toEqual({ idx: 0, throttle: 1 });
  });
  it('選んだレーンの余裕が throttleNear 未満なら throttle=0', () => {
    expect(decideFromClearances([0.2, 0.2, 0.2], 1, 0.5, p)).toEqual({ idx: 1, throttle: 0 });
  });
  it('速度が 0.8 以上なら throttle=0', () => {
    expect(decideFromClearances([1, 1, 1], 1, 0.9, p)).toEqual({ idx: 1, throttle: 0 });
  });
});

describe('nearestLaneIdx', () => {
  it('最寄りの 3 車線の番号を返す', () => {
    expect(nearestLaneIdx(0)).toBe(1);
    expect(nearestLaneIdx(0.55)).toBe(2);
    expect(nearestLaneIdx(-0.2)).toBe(1);
    expect(nearestLaneIdx(-1.3)).toBe(0);
    expect(nearestLaneIdx(1.3)).toBe(2);
  });
});

describe('observationClearances', () => {
  it('遅延補償（max(0, speed − V_CAR) * Z_RATE * LATENCY_S）を引いた 3 レーンの余裕を返す', () => {
    const cl = observationClearances(obsOf({ at: [{ x: 0.05, z: 0.5 }] }));
    expect(cl).toHaveLength(3);
    expect(cl[1]).toBeCloseTo(0.5 - (0.5 - V_CAR) * Z_RATE * LATENCY_S, 6);
    expect(cl[0]).toBe(1); // 左車線は範囲外（半幅 1/3）
  });
  it('速度が V_CAR 以下なら障害物は近づかないので、補償しない', () => {
    const cl = observationClearances(obsOf({ at: [{ x: 0.05, z: 0.5 }], speed: V_CAR }));
    expect(cl[1]).toBeCloseTo(0.5, 6);
  });
});

describe('planFromObservation', () => {
  it('障害物がなければ中央を維持して加速', () => {
    expect(planFromObservation(obsOf())).toEqual({ targetX: 0, throttle: 1 });
  });
  it('正面を塞がれたら空いているレーンへ（同点は左。targetX は 3 車線の中心）', () => {
    expect(planFromObservation(obsOf({ at: [{ x: 0.05, z: 0.5 }] }))).toEqual({ targetX: -2 / 3, throttle: 1 });
  });
  it('観測の targetX を現在のレーンとして維持する', () => {
    expect(planFromObservation(obsOf({ targetX: 2 / 3 }))).toEqual({ targetX: 2 / 3, throttle: 1 });
  });
  it('速度が 0.8 以上なら throttle=0', () => {
    expect(planFromObservation(obsOf({ speed: 0.9 })).throttle).toBe(0);
  });
});
