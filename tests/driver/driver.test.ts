import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Driver, DEFAULT_OPTIONS, type DriverDeps, type DriverStatus } from '../../src/driver/driver';
import type { Action, SystemOneResponse } from '../../src/lib/types';

const road = { left: 0.3, right: 0.7, centerOffset: 0 };

function setup(post: DriverDeps['post'], nowRef = { t: 0 }) {
  const applied: Action[] = [];
  const statuses: DriverStatus[] = [];
  const deps: DriverDeps = {
    analyze: async () => ({ road, detections: [] }),
    getSpeed: () => 0.5,
    getFrame: () => 1,
    post,
    apply: (a) => applied.push(a),
    onStatus: (s) => statuses.push(s),
    now: () => nowRef.t,
  };
  const driver = new Driver(deps, DEFAULT_OPTIONS);
  return { driver, applied, statuses, nowRef };
}
const ok = (action: Action | null): SystemOneResponse => ({ action, latencyMs: 80, source: action ? 'jev' : 'hold' });
const last = (s: DriverStatus[]) => s[s.length - 1];

describe('Driver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('成功したら Action を適用し、失敗カウントを0に戻す', async () => {
    const { driver, applied, statuses } = setup(async () => ok({ steer: 1, throttle: 1 }));
    driver.start();
    await driver.tick();
    expect(applied).toEqual([{ steer: 1, throttle: 1 }]);
    expect(last(statuses)).toMatchObject({ running: true, source: 'jev', latencyMs: 80, failures: 0 });
    driver.stop();
  });

  it('action が null なら適用せず保持（hold）、失敗を数える', async () => {
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
    const results = [ok(null), ok(null), ok({ steer: 0, throttle: 1 }), ok(null)];
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
    const { driver, statuses, nowRef } = setup(async () => ok({ steer: 0, throttle: 0 }));
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
      return ok({ steer: 0, throttle: 0 });
    });
    driver.start();
    const p1 = driver.tick();
    const p2 = driver.tick();
    release();
    await Promise.all([p1, p2]);
    expect(calls).toBe(1);
    driver.stop();
  });

  it('処理中に stop されたら Action を適用しない', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const { driver, applied } = setup(async () => {
      await gate;
      return ok({ steer: 1, throttle: 1 });
    });
    driver.start();
    const p = driver.tick();
    driver.stop('手動停止');
    release();
    await p;
    expect(applied).toEqual([]);
  });
});
