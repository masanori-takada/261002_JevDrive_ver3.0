import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Driver, DEFAULT_OPTIONS, type DriverDeps, type DriverStatus } from '../../src/driver/driver';
import { buildJevDetail } from '../../src/server/jev-detail';
import type { JevDetail, Observation, Plan, SystemOneResponse } from '../../src/lib/types';

const road = { left: 0.3, right: 0.7, centerOffset: 0 };

function setup(post: DriverDeps['post'], nowRef = { t: 0 }, getTargetX = () => 0, opts: Partial<typeof DEFAULT_OPTIONS> = {}) {
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
  const driver = new Driver(deps, { ...DEFAULT_OPTIONS, ...opts });
  return { driver, applied, statuses, nowRef };
}
const ok = (plan: Plan | null): SystemOneResponse => ({ plan, latencyMs: 80, source: plan ? 'jev' : 'hold' });
const last = (s: DriverStatus[]) => s[s.length - 1];
/** tick は post の完了を待たないので、応答の処理が済むまでマイクロタスクを流す */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe('Driver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('成功した応答の detail を onDetail に渡す（失敗時は呼ばない）', async () => {
    const detail = buildJevDetail('center', 'hold');
    const results: SystemOneResponse[] = [
      { plan: { targetX: 0, throttle: 0 }, latencyMs: 80, source: 'jev', detail },
      ok(null),
    ];
    const details: JevDetail[] = [];
    const base = setup(async () => results.shift()!);
    const driver = new Driver(
      { ...(base.driver as unknown as { deps: DriverDeps }).deps, onDetail: (d) => details.push(d) },
      DEFAULT_OPTIONS,
    );
    driver.start();
    await driver.tick();
    await settle();
    await driver.tick();
    expect(details).toEqual([detail]);
    driver.stop();
  });

  it('onDetail が無くても動く（detail 付きの応答でも）', async () => {
    const { driver, applied } = setup(async () => ({
      plan: { targetX: 0, throttle: 0 }, latencyMs: 1, source: 'jev', detail: buildJevDetail('center', 'hold'),
    }));
    driver.start();
    await driver.tick();
    await settle();
    expect(applied).toHaveLength(1);
    driver.stop();
  });

  it('成功したら Plan を適用し、失敗カウントを0に戻す', async () => {
    const { driver, applied, statuses } = setup(async () => ok({ targetX: 0.4, throttle: 1 }));
    driver.start();
    await driver.tick();
    await settle();
    expect(applied).toEqual([{ targetX: 0.4, throttle: 1 }]);
    expect(last(statuses)).toMatchObject({ running: true, source: 'jev', latencyMs: 80, failures: 0 });
    driver.stop();
  });

  it('plan が null なら適用せず保持（hold）、失敗を数える', async () => {
    const { driver, applied, statuses } = setup(async () => ok(null));
    driver.start();
    await driver.tick();
    await settle();
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
    await settle();
    expect(applied).toEqual([]);
    expect(last(statuses)).toMatchObject({ source: 'hold', failures: 1 });
    driver.stop();
  });

  it('途中で成功すれば失敗カウントがリセットされる', async () => {
    const results = [ok(null), ok(null), ok({ targetX: 0, throttle: 1 }), ok(null)];
    const { driver, statuses } = setup(async () => results.shift()!);
    driver.start();
    for (let i = 0; i < 4; i++) {
      await driver.tick();
      await settle();
    }
    expect(last(statuses)).toMatchObject({ running: true, failures: 1 });
    driver.stop();
  });

  it('連続5回失敗で「Jev 応答なし」を出して停止する', async () => {
    const { driver, statuses } = setup(async () => ok(null));
    driver.start();
    for (let i = 0; i < 5; i++) {
      await driver.tick();
      await settle();
    }
    expect(last(statuses)).toMatchObject({ running: false, stopReason: 'Jev 応答なし' });
  });

  it('連続稼働3分で停止する', async () => {
    const { driver, statuses, nowRef } = setup(async () => ok({ targetX: 0, throttle: 0 }));
    driver.start();
    nowRef.t = 180_000;
    await driver.tick();
    await settle();
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
    await settle();
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
    await settle();
    expect(applied).toEqual([]);
  });

  it('観測に現在の targetX を含めて送る', async () => {
    const sent: Observation[] = [];
    const { driver } = setup(async (o) => { sent.push(o); return ok({ targetX: 0, throttle: 0 }); }, { t: 0 }, () => -0.4);
    driver.start();
    await driver.tick();
    await settle();
    expect(sent[0].targetX).toBe(-0.4);
    driver.stop();
  });

  describe('重ねて送る（パイプライン）', () => {
    /** 手動で解決できる post。呼ばれるたびに保留し、resolvers に積む */
    function manual(opts: Partial<typeof DEFAULT_OPTIONS> = {}) {
      const resolvers: ((r: SystemOneResponse) => void)[] = [];
      const rejecters: ((e: Error) => void)[] = [];
      const sent: Observation[] = [];
      const details: JevDetail[] = [];
      const base = setup(
        (o) => { sent.push(o); return new Promise<SystemOneResponse>((res, rej) => { resolvers.push(res); rejecters.push(rej); }); },
        { t: 0 }, () => 0, opts,
      );
      const driver = new Driver(
        { ...(base.driver as unknown as { deps: DriverDeps }).deps, onDetail: (d) => details.push(d) },
        { ...DEFAULT_OPTIONS, ...opts },
      );
      return { ...base, driver, resolvers, rejecters, sent, details };
    }
    const plan = (x: number): SystemOneResponse => ({ plan: { targetX: x, throttle: 0 }, latencyMs: 300, source: 'jev', detail: buildJevDetail('center', 'hold') });
    const ticks = async (d: Driver, n: number) => {
      for (let i = 0; i < n; i++) {
        await d.tick();
        await settle();
      }
    };

    it('tick は post の完了を待たず、未完了が maxInFlight（既定 3）未満なら次を発行する', async () => {
      const m = manual();
      m.driver.start();
      await ticks(m.driver, 5);
      expect(m.sent).toHaveLength(3);
      // 1 つ完了すれば、次の tick で 1 つ発行される
      m.resolvers[0](plan(0.4));
      await settle();
      await ticks(m.driver, 1);
      expect(m.sent).toHaveLength(4);
      m.driver.stop();
    });

    it('maxInFlight はオプションで変えられる', async () => {
      const m = manual({ maxInFlight: 1 });
      m.driver.start();
      await ticks(m.driver, 3);
      expect(m.sent).toHaveLength(1);
      m.driver.stop();
    });

    it('古い応答（seq が最後に適用したものより古い）は捨て、失敗としても数えない', async () => {
      const m = manual();
      m.driver.start();
      await ticks(m.driver, 2);
      m.resolvers[1](plan(0.8)); // 新しい方が先に返る
      await settle();
      m.resolvers[0](plan(-0.8)); // 古い方は捨てる
      await settle();
      expect(m.applied).toEqual([{ targetX: 0.8, throttle: 0 }]);
      expect(m.details).toHaveLength(1);
      expect(last(m.statuses)).toMatchObject({ failures: 0, source: 'jev' });
      m.driver.stop();
    });

    it('古い応答が失敗（plan null）でも、完了順の連続失敗として数える', async () => {
      const m = manual();
      m.driver.start();
      await ticks(m.driver, 2);
      m.resolvers[1](plan(0.8));
      await settle();
      m.resolvers[0](ok(null));
      await settle();
      expect(last(m.statuses)).toMatchObject({ failures: 1, source: 'hold' });
      m.driver.stop();
    });

    it('失敗は完了順に連続で数え、成功でリセットする', async () => {
      const m = manual({ maxInFlight: 10 });
      m.driver.start();
      await ticks(m.driver, 7);
      m.rejecters[0](new Error('x'));
      m.resolvers[1](ok(null));
      await settle();
      expect(last(m.statuses).failures).toBe(2);
      m.resolvers[2](plan(0.4)); // 成功でリセット
      await settle();
      expect(last(m.statuses).failures).toBe(0);
      m.resolvers[3](ok(null));
      m.resolvers[4](ok(null));
      m.rejecters[5](new Error('y'));
      await settle();
      expect(last(m.statuses)).toMatchObject({ failures: 3, running: true });
      m.driver.stop();
    });

    it('5 連続失敗で「Jev 応答なし」停止し、その後に届いた成功応答は適用しない', async () => {
      const m = manual({ maxInFlight: 10 });
      m.driver.start();
      await ticks(m.driver, 6);
      for (let i = 0; i < 5; i++) m.resolvers[i](ok(null));
      await settle();
      expect(last(m.statuses)).toMatchObject({ running: false, stopReason: 'Jev 応答なし' });
      m.resolvers[5](plan(0.8));
      await settle();
      expect(m.applied).toEqual([]);
      expect(m.details).toEqual([]);
    });

    it('状態に判断の頻度（回/秒）を出す: 直近の適用間隔の平均', async () => {
      const m = manual({ maxInFlight: 10 });
      m.driver.start();
      await ticks(m.driver, 3);
      expect(last(m.statuses).ratePerSec).toBeNull();
      for (let i = 0; i < 3; i++) {
        m.nowRef.t = 1000 + i * 200; // 200ms 間隔で適用
        m.resolvers[i](plan(0.4 + i * 0.1));
        await settle();
      }
      expect(last(m.statuses).ratePerSec).toBeCloseTo(5, 5);
      m.driver.stop();
    });
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
