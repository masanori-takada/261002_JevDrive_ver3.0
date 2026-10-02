import { describe, expect, it, vi } from 'vitest';
import { decide, type EvaluateFn } from '../../src/server/jev';
import type { Observation } from '../../src/lib/types';

const obs: Observation = {
  frame: 1, speed: 0.5,
  road: { left: 0.3, right: 0.7, centerOffset: 0 },
  obstacles: [],
};

const answer = (steer: string, throttle: string) => ({
  answers: { steer: { choice: steer }, throttle: { choice: throttle } },
});

describe('decide', () => {
  it('Jev の選択を Action に変換する', async () => {
    const evaluate = vi.fn<EvaluateFn>().mockResolvedValue(answer('right', 'accelerate'));
    expect(await decide(obs, { model: 'm', timeoutMs: 1000, evaluate })).toEqual({ steer: 1, throttle: 1 });
  });
  it('left/brake と straight/hold も変換する', async () => {
    const e1 = vi.fn<EvaluateFn>().mockResolvedValue(answer('left', 'brake'));
    expect(await decide(obs, { model: 'm', timeoutMs: 1000, evaluate: e1 })).toEqual({ steer: -1, throttle: -1 });
    const e2 = vi.fn<EvaluateFn>().mockResolvedValue(answer('straight', 'hold'));
    expect(await decide(obs, { model: 'm', timeoutMs: 1000, evaluate: e2 })).toEqual({ steer: 0, throttle: 0 });
  });
  it('観測・モデル・タイムアウト・再試行なしを渡す', async () => {
    const evaluate = vi.fn<EvaluateFn>().mockResolvedValue(answer('straight', 'hold'));
    await decide(obs, { model: 'test/model', timeoutMs: 1000, evaluate });
    const args = evaluate.mock.calls[0][0];
    expect(args.model).toBe('test/model');
    expect(args.state.観測).toEqual(obs);
    expect(args.maxRetries).toBe(0);
    expect(args.abortSignal).toBeInstanceOf(AbortSignal);
    expect(Object.keys(args.questions)).toEqual(['steer', 'throttle']);
  });
  it('評価が失敗したら null', async () => {
    const evaluate = vi.fn<EvaluateFn>().mockRejectedValue(new Error('timeout'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await decide(obs, { model: 'm', timeoutMs: 1000, evaluate })).toBeNull();
    expect(spy).toHaveBeenCalledWith('[jev] evaluate failed:', 'timeout');
    spy.mockRestore();
  });
  it('想定外の選択肢なら null', async () => {
    const evaluate = vi.fn<EvaluateFn>().mockResolvedValue(answer('up', 'accelerate'));
    expect(await decide(obs, { model: 'm', timeoutMs: 1000, evaluate })).toBeNull();
  });
});
