import { describe, expect, it, vi } from 'vitest';
import { decide, type EvaluateFn } from '../../src/server/jev';
import type { Observation } from '../../src/lib/types';

const obs: Observation = {
  frame: 1, speed: 0.5,
  road: { left: 0.3, right: 0.7, centerOffset: 0 },
  obstacles: [],
};

const answer = (lane: string, throttle: string) => ({
  answers: { lane: { choice: lane }, throttle: { choice: throttle } },
});
const opts = (evaluate: EvaluateFn) => ({ model: 'm', timeoutMs: 1000, evaluate });

describe('decide', () => {
  it('Jev の選択を Plan（目標レーンの中心と throttle）に変換する', async () => {
    const evaluate = vi.fn<EvaluateFn>().mockResolvedValue(answer('right', 'accelerate'));
    expect(await decide(obs, opts(evaluate))).toEqual({ targetX: 0.4, throttle: 1 });
  });
  it('5 レーンと throttle 3 択をすべて変換する', async () => {
    const lanes: [string, number][] = [['far_left', -0.8], ['left', -0.4], ['center', 0], ['right', 0.4], ['far_right', 0.8]];
    for (const [name, x] of lanes) {
      const e = vi.fn<EvaluateFn>().mockResolvedValue(answer(name, 'hold'));
      expect(await decide(obs, opts(e))).toEqual({ targetX: x, throttle: 0 });
    }
    const e = vi.fn<EvaluateFn>().mockResolvedValue(answer('center', 'brake'));
    expect(await decide(obs, opts(e))).toEqual({ targetX: 0, throttle: -1 });
  });
  it('各レーンの余裕と現在のレーンを状態に、モデル・タイムアウト・再試行なしを渡す', async () => {
    const evaluate = vi.fn<EvaluateFn>().mockResolvedValue(answer('center', 'hold'));
    await decide({ ...obs, targetX: 0.4 }, { model: 'test/model', timeoutMs: 1000, evaluate });
    const args = evaluate.mock.calls[0][0];
    expect(args.model).toBe('test/model');
    const st = args.state as { 現在のレーン: string; 各レーンの余裕: Record<string, number> };
    expect(st.現在のレーン).toBe('right');
    expect(Object.keys(st.各レーンの余裕)).toEqual(['far_left', 'left', 'center', 'right', 'far_right']);
    expect(args.maxRetries).toBe(0);
    expect(args.abortSignal).toBeInstanceOf(AbortSignal);
    expect(Object.keys(args.questions)).toEqual(['lane', 'throttle']);
  });
  it('targetX が無ければ中央を現在のレーンとする', async () => {
    const evaluate = vi.fn<EvaluateFn>().mockResolvedValue(answer('center', 'hold'));
    await decide(obs, opts(evaluate));
    expect((evaluate.mock.calls[0][0].state as { 現在のレーン: string }).現在のレーン).toBe('center');
  });
  it('評価が失敗したら null', async () => {
    const evaluate = vi.fn<EvaluateFn>().mockRejectedValue(new Error('timeout'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await decide(obs, opts(evaluate))).toBeNull();
    expect(spy).toHaveBeenCalledWith('[jev] evaluate failed:', 'timeout');
    spy.mockRestore();
  });
  it('想定外の選択肢なら、選択肢名だけを console.error に出して null', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await decide(obs, opts(vi.fn<EvaluateFn>().mockResolvedValue(answer('up', 'accelerate'))))).toBeNull();
    expect(spy).toHaveBeenLastCalledWith('[jev] unexpected choice:', 'up');
    expect(await decide(obs, opts(vi.fn<EvaluateFn>().mockResolvedValue(answer('left', 'fly'))))).toBeNull();
    expect(spy).toHaveBeenLastCalledWith('[jev] unexpected choice:', 'fly');
    spy.mockRestore();
  });
  it('evaluate が永遠に解決しなくても timeoutMs 付近で null を返す', async () => {
    const evaluate: EvaluateFn = () => new Promise(() => {});
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const t0 = Date.now();
    const r = await decide(obs, { model: 'm', timeoutMs: 50, evaluate });
    const dt = Date.now() - t0;
    expect(r).toBeNull();
    expect(dt).toBeGreaterThanOrEqual(40);
    expect(dt).toBeLessThan(500);
    spy.mockRestore();
  });
});
