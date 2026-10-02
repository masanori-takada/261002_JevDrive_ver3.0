import { describe, expect, it } from 'vitest';
import { createGame, step } from '../../src/game/racer';

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
    for (let i = 0; i < 200; i++) s = step(s, idle);
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

  it('路外（|playerX|>1）では速度が 0.3 以下に制限される', () => {
    const s = step({ ...createGame(1), playerX: 1.2, speed: 1 }, idle);
    expect(s.speed).toBeLessThanOrEqual(0.3);
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
});
