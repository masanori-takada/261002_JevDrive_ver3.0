import { describe, expect, it, vi } from 'vitest';
import { WARM_UP_SAMPLE, WARM_UP_TIMEOUT_MS, warmUpJev } from '../../src/driver/warm-up';
import type { Observation, SystemOneResponse } from '../../src/lib/types';

const ok: SystemOneResponse = { plan: { targetX: 0, throttle: 0 }, latencyMs: 500, source: 'jev' };

const nullRes: SystemOneResponse = { plan: null, latencyMs: 1000, source: 'hold' };
const noWait = { sleep: async () => {} };

describe('warmUpJev', () => {
  it('成功時は応答を返し、サンプル観測と 15000ms の待ち時間で post を呼ぶ', async () => {
    const post = vi.fn<(o: Observation, t?: number) => Promise<SystemOneResponse>>().mockResolvedValue(ok);
    expect(await warmUpJev(post)).toEqual(ok);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toEqual({
      frame: 0, speed: 0.5, road: { left: 0.3, right: 0.7, centerOffset: 0 }, obstacles: [], targetX: 0,
    });
    expect(post.mock.calls[0][1]).toBe(15000);
    expect(WARM_UP_TIMEOUT_MS).toBe(15000);
  });
  it('サンプルを差し替えられる', async () => {
    const post = vi.fn().mockResolvedValue(ok);
    const sample = { ...WARM_UP_SAMPLE, frame: 7 };
    await warmUpJev(post, sample);
    expect(post.mock.calls[0][0]).toBe(sample);
  });
  it('plan が null なら Error を throw', async () => {
    const post = vi.fn().mockResolvedValue({ plan: null, latencyMs: 1000, source: 'hold' });
    await expect(warmUpJev(post, undefined, noWait)).rejects.toThrow(Error);
    await expect(warmUpJev(post, undefined, noWait)).rejects.toThrow('plan');
  });
  it('post が reject したら理由つきの Error を throw', async () => {
    const post = vi.fn().mockRejectedValue(new Error('systemone 500'));
    await expect(warmUpJev(post, undefined, noWait)).rejects.toThrow('systemone 500');
  });
  it('Error 以外の reject でも Error にする', async () => {
    const post = vi.fn().mockRejectedValue('boom');
    await expect(warmUpJev(post, undefined, noWait)).rejects.toThrow('boom');
  });

  it('1 回目 null・2 回目成功なら成功し、以降は呼ばない', async () => {
    const post = vi.fn().mockResolvedValueOnce(nullRes).mockResolvedValueOnce(ok).mockResolvedValue(nullRes);
    expect(await warmUpJev(post, undefined, noWait)).toEqual(ok);
    expect(post).toHaveBeenCalledTimes(2);
  });
  it('全て失敗なら attempts 回（既定 4 回）試して、最後の失敗の理由つきで throw', async () => {
    const post = vi.fn().mockResolvedValue(nullRes);
    await expect(warmUpJev(post, undefined, noWait)).rejects.toThrow('Jev から plan が返りませんでした（4回試行）');
    expect(post).toHaveBeenCalledTimes(4);
  });
  it('reject と null の混在。最後が reject ならその理由を保つ', async () => {
    const post = vi.fn()
      .mockResolvedValueOnce(nullRes)
      .mockRejectedValueOnce(new Error('systemone 500'))
      .mockResolvedValueOnce(nullRes)
      .mockRejectedValueOnce(new Error('timeout'));
    await expect(warmUpJev(post, undefined, noWait)).rejects.toThrow('timeout（4回試行）');
  });
  it('attempts を変えられ、timeout は毎回 15000 で渡る', async () => {
    const post = vi.fn().mockResolvedValue(nullRes);
    await expect(warmUpJev(post, undefined, { ...noWait, attempts: 2 })).rejects.toThrow('（2回試行）');
    expect(post.mock.calls.map((c) => c[1])).toEqual([15000, 15000]);
  });
  it('失敗のたびに delayMs（既定 600ms）待ち、最後の失敗の後と成功後は待たない', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const post = vi.fn().mockResolvedValueOnce(nullRes).mockResolvedValueOnce(nullRes).mockResolvedValueOnce(ok);
    await warmUpJev(post, undefined, { sleep });
    expect(sleep.mock.calls).toEqual([[600], [600]]);
    const sleep2 = vi.fn().mockResolvedValue(undefined);
    await expect(warmUpJev(vi.fn().mockResolvedValue(nullRes), undefined, { sleep: sleep2, attempts: 3, delayMs: 10 })).rejects.toThrow();
    expect(sleep2.mock.calls).toEqual([[10], [10]]);
  });
  it('onAttempt に (試行番号, 最大) を試行の直前に通知する', async () => {
    const calls: [number, number][] = [];
    const post = vi.fn().mockResolvedValueOnce(nullRes).mockResolvedValueOnce(ok);
    await warmUpJev(post, undefined, { ...noWait, onAttempt: (n, max) => calls.push([n, max]) });
    expect(calls).toEqual([[1, 4], [2, 4]]);
  });
});
