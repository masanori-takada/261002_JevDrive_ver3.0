import { afterEach, describe, expect, it, vi } from 'vitest';
import { postObservation } from '../../src/driver/post';
import type { Observation } from '../../src/lib/types';

const obs: Observation = { frame: 1, speed: 0.5, road: { left: 0.3, right: 0.7, centerOffset: 0 }, obstacles: [] };

describe('postObservation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('成功時は JSON を返し、signal を渡す', async () => {
    const body = { plan: { targetX: 0, throttle: 0 }, latencyMs: 10, source: 'jev' };
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
    vi.stubGlobal('fetch', f);
    expect(await postObservation(obs)).toEqual(body);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/systemone');
    expect(init.method).toBe('POST');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toEqual(obs);
  });
  it('非 2xx なら throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    await expect(postObservation(obs)).rejects.toThrow('systemone 500');
  });
});
