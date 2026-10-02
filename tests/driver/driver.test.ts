import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Driver, DEFAULT_OPTIONS, type DriverDeps, type DriverStatus } from '../../src/driver/driver';
import type { Observation, Plan, SystemOneResponse } from '../../src/lib/types';

const road = { left: 0.3, right: 0.7, centerOffset: 0 };

function setup(post: DriverDeps['post'], nowRef = { t: 0 }, getTargetX = () => 0) {
  const applied: Plan[] = [];
  const statuses: DriverStatus[] = [];
  const deps: DriverDeps = {
    analyze: async () => ({ road, detections: [] }),
    getSpeed: () => 0.5,
    getFrame: () => 1,
    getTargetX,
    post,
    apply: (a) => applied.push(a),
    onStatus: (s) => statuses.push(s),
    now: () => nowRef.t,
  };
  const driver = new Driver(deps, DEFAULT_OPTIONS);
  return { driver, applied, statuses, nowRef };
}
const ok = (plan: Plan | null): SystemOneResponse => ({ plan, latencyMs: 80, source: plan ? 'jev' : 'hold' });
const last = (s: DriverStatus[]) => s[s.length - 1];

describe('Driver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('成功したら Plan を適用し、失敗カウントを0に戻す', async () => {
    const { driver, applied, statuses } = setup(async () => ok({ targetX: 0.4, throttle: 1 }));
    driver.start();
    await driver.tick();
    expect(applied).toEqual([{ targetX: 0.4, throttle: 1 }]);
    expect(last(statuses)).toMatchObject({ running: true, source: 'jev', latencyMs: 80, failures: 0 });
    driver.stop();
  });

  it('plan が null なら適用せず保持（hold）、失敗を数える', async () => {
    const { driver, applied, statuses } = setup(async () => ok(null));
    driver.start();
    await driver.tick();
    expect(applied).toEqual([]);
    expect(last(statuses)).toMatchObject({ source: 'hold', failures: 1 });
    driver.stop();
  });

  it('通信エラーも保持として数える', async () => {
    const { driver, applied, statuses } = setup(async () => {
      throw new Error('network');
    });
    driver.start();
    await driver.tick();
    expect(applied).toEqual([]);
    expect(last(statuses)).toMatchObject({ source: 'hold', failures: 1 });
    driver.stop();
  });

  it('途中で成功すれば失敗カウントがリセットされる', async () => {
    const results = [ok(null), ok(null), ok({ targetX: 0, throttle: 1 }), ok(null)];
    const { driver, statuses } = setup(async () => results.shift()!);
    driver.start();
    for (let i = 0; i < 4; i++) await driver.tick();
    expect(last(statuses)).toMatchObject({ running: true, failures: 1 });
    driver.stop();
  });

  it('連続5回失敗で「Jev 応答なし」を出して停止する', async () => {
    const { driver, statuses } = setup(async () => ok(null));
    driver.start();
    for (let i = 0; i < 5; i++) await driver.tick();
    expect(last(statuses)).toMatchObject({ running: false, stopReason: 'Jev 応答なし' });
  });

  it('連続稼働3分で停止する', async () => {
    const { driver, statuses, nowRef } = setup(async () => ok({ targetX: 0, throttle: 0 }));
    driver.start();
    nowRef.t = 180_000;
    await driver.tick();
    expect(last(statuses).running).toBe(false);
    expect(last(statuses).stopReason).toContain('3分');
  });

  it('処理中の tick は重ならない', async () => {
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const { driver } = setup(async () => {
      calls += 1;
      await gate;
      return ok({ targetX: 0, throttle: 0 });
    });
    driver.start();
    const p1 = driver.tick();
    const p2 = driver.tick();
    release();
    await Promise.all([p1, p2]);
    expect(calls).toBe(1);
    driver.stop();
  });

  it('処理中に stop されたら Plan を適用しない', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const { driver, applied } = setup(async () => {
      await gate;
      return ok({ targetX: 0.4, throttle: 1 });
    });
    driver.start();
    const p = driver.tick();
    driver.stop('手動停止');
    release();
    await p;
    expect(applied).toEqual([]);
  });

  it('観測に現在の targetX を含めて送る', async () => {
    const sent: Observation[] = [];
    const { driver } = setup(async (o) => { sent.push(o); return ok({ targetX: 0, throttle: 0 }); }, { t: 0 }, () => -0.4);
    driver.start();
    await driver.tick();
    expect(sent[0].targetX).toBe(-0.4);
    driver.stop();
  });

  describe('analyze のタイムアウト', () => {
    function hung(nowRef = { t: 0 }) {
      const statuses: DriverStatus[] = [];
      let calls = 0;
      const deps: DriverDeps = {
        analyze: () => { calls += 1; return new Promise(() => {}); },
        getSpeed: () => 0.5,
        getFrame: () => 1,
        getTargetX: () => 0,
        post: async () => ok({ targetX: 0, throttle: 0 }),
        apply: () => {},
        onStatus: (s) => statuses.push(s),
        now: () => nowRef.t,
      };
      const driver = new Driver(deps, { ...DEFAULT_OPTIONS, analyzeTimeoutMs: 3000 });
      return { driver, statuses, nowRef, calls: () => calls };
    }

    it('解決しない analyze は 3000ms で失敗扱いになり、5 回で「Jev 応答なし」停止する', async () => {
      const { driver, statuses, calls } = hung();
      driver.start();
      // 最初の tick は 150ms 後に始まるので、3000ms 経過時点ではまだ失敗していない
      await vi.advanceTimersByTimeAsync(3100);
      expect(last(statuses).failures).toBe(0);
      await vi.advanceTimersByTimeAsync(100);
      expect(last(statuses)).toMatchObject({ source: 'hold', failures: 1, running: true });
      // inFlight が解除され、次の tick が回る
      await vi.advanceTimersByTimeAsync(3200 * 5);
      expect(calls()).toBeGreaterThanOrEqual(5);
      expect(last(statuses)).toMatchObject({ running: false, stopReason: 'Jev 応答なし' });
    });

    it('ハング中でも 3 分上限が働く', async () => {
      const { driver, statuses, nowRef } = hung();
      driver.start();
      await vi.advanceTimersByTimeAsync(3100);
      nowRef.t = 180_000;
      await vi.advanceTimersByTimeAsync(300);
      expect(last(statuses).running).toBe(false);
      expect(last(statuses).stopReason).toContain('3分');
    });
  });
});
