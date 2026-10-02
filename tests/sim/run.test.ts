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
});
