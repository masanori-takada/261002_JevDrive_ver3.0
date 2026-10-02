import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/game/racer';
import { buildSimObservation } from '../../src/sim/observe';
import { makePolicy, type Policy } from '../../src/sim/policies';
import { runEpisode } from '../../src/sim/run';

describe('buildSimObservation', () => {
  it('車の位置を centerOffset に、画面内の障害物を検出として入れる', () => {
    const s = { ...createGame(1), playerX: 0.3, obstacles: [{ id: 1, x: 0, z: 0.2 }] };
    const o = buildSimObservation(s);
    expect(o.road.centerOffset).toBeCloseTo(0.3, 3);
    expect(o.obstacles).toHaveLength(1);
    expect(o.speed).toBeCloseTo(0.5, 3);
  });
});

describe('runEpisode', () => {
  it('同じシードなら結果は決定的', () => {
    const a = runEpisode(makePolicy('rule-raw'), 3, 20, 0.55);
    const b = runEpisode(makePolicy('rule-raw'), 3, 20, 0.55);
    expect(a).toEqual(b);
  });
  it('判断は L 秒遅れて反映され、それまでは直前の操作を保持する', () => {
    const log: { frame: number; decided: number }[] = [];
    const applied: Array<{ steer: number; throttle: number }> = [];
    const policy: Policy<number> = {
      initial: 0,
      decide: (s) => { log.push({ frame: s.frame, decided: s.frame }); return s.frame; },
      toAction: (d) => { applied.push({ steer: 0, throttle: 0 }); return { steer: d > 0 ? 1 : 0, throttle: 0 }; },
    };
    const lf = Math.round(0.55 * 60);
    runEpisode(policy, 1, (lf * 3 + 1) / 60, 0.55);
    // 判断は L ごとに 1 回（0, lf, 2lf, 3lf フレーム）
    expect(log.map((l) => l.frame)).toEqual([0, lf, lf * 2, lf * 3]);
  });
  it('L=0 は毎フレーム判断する', () => {
    let n = 0;
    const policy: Policy<number> = {
      initial: 0,
      decide: () => { n += 1; return 0; },
      toAction: () => ({ steer: 0, throttle: 0 }),
    };
    runEpisode(policy, 1, 1, 0);
    expect(n).toBe(60);
  });
  it('noop は加減速せず距離が進む', () => {
    const r = runEpisode(makePolicy('noop'), 1, 10, 0.55);
    expect(r.distance).toBeGreaterThan(0);
    expect(r.crashes).toBeGreaterThanOrEqual(0);
  });
  it('出現間隔を指定でき、間隔が広いと noop の衝突が減る', () => {
    // 全開で加速して走る（noop は速度が V_CAR に落ちると障害物が近づかなくなるため使わない）
    const full: Policy<{ steer: 0; throttle: 1 }> = {
      initial: { steer: 0, throttle: 1 },
      decide: () => ({ steer: 0, throttle: 1 }),
      toAction: (d) => d,
    };
    const dense = runEpisode(full, 1, 60, 0.55, 0.5);
    const sparse = runEpisode(full, 1, 60, 0.55, 2.5);
    expect(dense.crashes).toBeGreaterThan(0);
    expect(sparse.crashes).toBeLessThan(dense.crashes);
  });
  it('画面内に車がいる時間の割合（0..1）を返し、間隔が広いと小さくなる', () => {
    const dense = runEpisode(makePolicy('noop'), 1, 60, 0.55, 0.5);
    const sparse = runEpisode(makePolicy('noop'), 1, 60, 0.55, 2.5);
    expect(dense.visibleRatio).toBeGreaterThan(0);
    expect(dense.visibleRatio).toBeLessThanOrEqual(1);
    expect(sparse.visibleRatio).toBeLessThan(dense.visibleRatio);
  });
  it('判断の周期 period と遅延 L を分けて指定できる（period 省略時は period = L）', () => {
    const decided: number[] = [];
    const seen = new Map<number, number>(); // フレーム → そのフレームで反映済みの判断
    const policy: Policy<number> = {
      initial: 0,
      decide: (s) => { decided.push(s.frame); return s.frame + 1; },
      toAction: (d, s) => { seen.set(s.frame, d); return { steer: 0, throttle: 0 }; },
    };
    // period=0.15 秒（9 フレーム）、L=0.45 秒（27 フレーム）
    runEpisode(policy, 1, 80 / 60, 0.45, undefined, 0.15);
    expect(decided.slice(0, 4)).toEqual([0, 9, 18, 27]);
    expect(seen.get(26)).toBe(0); // 最初の判断（frame 0）は 27 フレーム目に反映される
    expect(seen.get(27)).toBe(1);
    expect(seen.get(35)).toBe(1);
    expect(seen.get(36)).toBe(10); // frame 9 の判断が 36 で反映
    expect(seen.get(40)).toBe(10);
  });
  it('period 省略時は従来どおり L ごとに 1 回判断する', () => {
    const decided: number[] = [];
    const policy: Policy<number> = {
      initial: 0,
      decide: (s) => { decided.push(s.frame); return 0; },
      toAction: () => ({ steer: 0, throttle: 0 }),
    };
    runEpisode(policy, 1, 100 / 60, 0.45);
    expect(decided).toEqual([0, 27, 54, 81]);
  });
  it('衝突の瞬間の「最寄りの車線の中心からのずれ」と、またいでいる時間の割合を返す', () => {
    const full: Policy<{ steer: 0; throttle: 1 }> = {
      initial: { steer: 0, throttle: 1 },
      decide: () => ({ steer: 0, throttle: 1 }),
      toAction: (d) => d,
    };
    const r = runEpisode(full, 1, 60, 0.55, 0.5);
    expect(r.crashOffsets).toHaveLength(r.crashes);
    expect(r.crashes).toBeGreaterThan(0);
    for (const d of r.crashOffsets) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1 / 3 + 1e-9 + 1);
    }
    expect(r.straddleRatio).toBeGreaterThanOrEqual(0);
    expect(r.straddleRatio).toBeLessThanOrEqual(1);
  });
  it('直進するだけなら、車線の中心を走り続けるので、またいでいる時間は 0', () => {
    const r = runEpisode(makePolicy('noop'), 1, 10, 0.55);
    expect(r.straddleRatio).toBe(0);
  });
});
