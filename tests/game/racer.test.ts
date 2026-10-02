import { describe, expect, it } from 'vitest';
import { LANE_CENTERS, PLAYER_X_MAX } from '../../src/game/lane-geometry';
import { closingAdvance, createGame, DEFAULT_SPAWN_GAP, step, V_CAR, Z_RATE } from '../../src/game/racer';

const idle = { steer: 0, throttle: 0 } as const;

describe('racer', () => {
  it('初期状態', () => {
    const s = createGame(1);
    expect(s.playerX).toBe(0);
    expect(s.speed).toBe(0.5);
    expect(s.crashes).toBe(0);
    expect(s.obstacles).toEqual([]);
  });

  it('右に操作すると playerX が増える', () => {
    const s = step(createGame(1), { steer: 1, throttle: 0 });
    expect(s.playerX).toBeGreaterThan(0);
  });

  it('加速すると速度が上がり、1で頭打ちになる', () => {
    let s = createGame(1);
    s = step(s, { steer: 0, throttle: 1 });
    expect(s.speed).toBeGreaterThan(0.5);
    // 頭打ち（途中の衝突に影響されないよう、上限の直前から1回だけ進める）
    const near = step({ ...createGame(1), speed: 0.995 }, { steer: 0, throttle: 1 });
    expect(near.speed).toBe(1);
  });

  it('走ると障害物が出現し、横位置は -0.8..0.8', () => {
    let s = createGame(1);
    for (let i = 0; i < 400; i++) s = step(s, idle); // 走行距離 3.3 > 既定の出現間隔
    expect(s.obstacles.length).toBeGreaterThanOrEqual(1);
    for (const o of s.obstacles) {
      expect(o.x).toBeGreaterThanOrEqual(-0.8);
      expect(o.x).toBeLessThanOrEqual(0.8);
    }
  });

  it('正面の障害物に当たると衝突する（速度0、障害物は消える）', () => {
    const base = { ...createGame(1), obstacles: [{ id: 1, x: 0, z: 0.05 }] };
    const s = step(base, idle);
    expect(s.crashes).toBe(1);
    expect(s.speed).toBe(0);
    expect(s.obstacles).toHaveLength(0);
  });

  it('横に離れていれば衝突しない', () => {
    const base = { ...createGame(1), playerX: -0.3, obstacles: [{ id: 1, x: 0.9, z: 0.05 }] };
    const s = step(base, idle);
    expect(s.crashes).toBe(0);
    expect(s.obstacles).toHaveLength(1);
  });

  it('自車の横位置は [-2/3, 2/3]（車線の中心の外側へは行けない）', () => {
    let s = createGame(1);
    for (let i = 0; i < 300; i++) s = { ...step(s, { steer: 1, throttle: 0 }), obstacles: [] };
    expect(s.playerX).toBeCloseTo(PLAYER_X_MAX, 9);
    for (let i = 0; i < 600; i++) s = { ...step(s, { steer: -1, throttle: 0 }), obstacles: [] };
    expect(s.playerX).toBeCloseTo(-PLAYER_X_MAX, 9);
  });

  it('障害物の出現位置は常に 3 つの車線の中心のどれか（複数のシードで確認）', () => {
    for (const seed of [1, 2, 3, 7, 11]) {
      let s = createGame(seed, 0.5);
      const seen = new Set<number>();
      for (let i = 0; i < 2000; i++) {
        s = step({ ...s, speed: 1, crashedUntil: 0 }, idle);
        for (const o of s.obstacles) seen.add(o.x);
      }
      expect([...seen].sort((a, b) => a - b)).toEqual([...LANE_CENTERS]); // 3 車線すべてに出現する
    }
  });

  it('衝突中は操作を無視し、終了時に速度 0.3 で復帰する', () => {
    let s = { ...createGame(1), crashedUntil: 2, crashes: 1, speed: 0 };
    s = step(s, { steer: 1, throttle: 1 });
    expect(s.playerX).toBe(0);
    expect(s.speed).toBe(0);
    s = step(s, idle);
    expect(s.speed).toBe(0.3);
  });

  it('同じシードなら同じ展開になる', () => {
    const run = () => {
      let s = createGame(7);
      for (let i = 0; i < 300; i++) s = step(s, idle);
      return JSON.stringify(s);
    };
    expect(run()).toBe(run());
  });

  it('出現間隔は createGame の引数で差し替えられ、既定値は DEFAULT_SPAWN_GAP', () => {
    expect(createGame(1).spawnGap).toBe(DEFAULT_SPAWN_GAP);
    expect(createGame(1, 2).spawnGap).toBe(2);
  });

  it('間隔が広いほど、同じ走行距離での出現数が少ない（走れば出現する）', () => {
    const count = (gap: number) => {
      // 速度を 1 に固定して 20 秒走る（走行距離 20）。障害物は id の最大値で数える
      let s = { ...createGame(1, gap), speed: 1 };
      for (let i = 0; i < 1200; i++) s = { ...step({ ...s, speed: 1, crashedUntil: 0 }, idle), speed: 1 };
      return s.nextId - 1;
    };
    expect(count(0.5)).toBeGreaterThan(count(2));
    expect(count(2)).toBeGreaterThanOrEqual(1);
    expect(count(2)).toBeLessThanOrEqual(11);
  });

  it('障害物は自車と同じ向きに走る車: z は (speed − V_CAR) * Z_RATE * DT で減る', () => {
    expect(V_CAR).toBe(0.3);
    const base = { ...createGame(1), speed: 0.8, playerX: 0, obstacles: [{ id: 1, x: 0.9, z: 0.5 }] };
    const s = step(base, idle);
    expect(s.obstacles.find((o) => o.id === 1)!.z).toBeCloseTo(0.5 - (0.8 - V_CAR) * Z_RATE * (1 / 60), 9);
  });

  it('自車が V_CAR より遅いと車は遠ざかり、z > 1.02 で削除される', () => {
    const base = { ...createGame(1), speed: 0.1, obstacles: [{ id: 1, x: 0.9, z: 1.0 }, { id: 2, x: -0.9, z: 1.02 }] };
    const s = step(base, idle);
    expect(s.obstacles.find((o) => o.id === 1)!.z).toBeGreaterThan(1.0);
    expect(s.obstacles.find((o) => o.id === 2)).toBeUndefined();
  });

  it('closingAdvance は障害物の接近量（遅延 L 秒ぶん）。V_CAR 以下は 0', () => {
    expect(closingAdvance(0.8, 0.5)).toBeCloseTo((0.8 - V_CAR) * Z_RATE * 0.5, 9);
    expect(closingAdvance(V_CAR, 0.5)).toBe(0);
    expect(closingAdvance(0.1, 0.5)).toBe(0);
  });
});
