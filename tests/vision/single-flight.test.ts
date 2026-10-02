import { describe, expect, it } from 'vitest';
import { createSingleFlight } from '../../src/vision/single-flight';

/** 外から解決・拒否できる Promise */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('createSingleFlight', () => {
  it('実行中に 2 回目を呼ぶと fn を呼ばずに reject する', async () => {
    const d = deferred<number>();
    let calls = 0;
    const run = createSingleFlight(() => { calls += 1; return d.promise; });
    const first = run();
    await expect(run()).rejects.toThrow('detector busy');
    expect(calls).toBe(1);
    d.resolve(7);
    await expect(first).resolves.toBe(7);
  });

  it('完了後は再び実行できる', async () => {
    let calls = 0;
    const run = createSingleFlight(async () => ++calls);
    await expect(run()).resolves.toBe(1);
    await expect(run()).resolves.toBe(2);
  });

  it('fn が reject してもロックが解除される', async () => {
    let calls = 0;
    const run = createSingleFlight(async () => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
      return calls;
    });
    await expect(run()).rejects.toThrow('boom');
    await expect(run()).resolves.toBe(2);
  });

  it('fn が同期的に throw してもロックが解除される', async () => {
    let calls = 0;
    const run = createSingleFlight((): Promise<number> => {
      calls += 1;
      if (calls === 1) throw new Error('sync boom');
      return Promise.resolve(calls);
    });
    await expect(run()).rejects.toThrow('sync boom');
    await expect(run()).resolves.toBe(2);
  });
});
