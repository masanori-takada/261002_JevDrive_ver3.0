import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/server/jev', async (orig) => {
  const actual = await orig<typeof import('../../src/server/jev')>();
  return { ...actual, decide: vi.fn() };
});

import { decide } from '../../src/server/jev';
import { buildJevDetail } from '../../src/server/jev-detail';
import { POST } from '../../src/app/api/systemone/route';

const validBody = {
  frame: 1, speed: 0.5,
  road: { left: 0.3, right: 0.7, centerOffset: 0 },
  obstacles: [{ cls: 'car', conf: 0.9, x: 0.4, y: 0.5, w: 0.2, h: 0.2 }],
};

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/api/systemone', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/systemone', () => {
  beforeEach(() => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'test-key');
    vi.stubEnv('JEV_MODEL', 'test/model');
    vi.stubEnv('JEV_MOCK', '');
    vi.mocked(decide).mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('Jev の Plan を返す', async () => {
    vi.mocked(decide).mockResolvedValue({ plan: { targetX: 0.4, throttle: 1 }, detail: buildJevDetail('center', 'hold') });
    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.plan).toEqual({ targetX: 0.4, throttle: 1 });
    expect(json.source).toBe('jev');
    expect(typeof json.latencyMs).toBe('number');
    expect(json.detail.lane).toHaveLength(3);
    expect(json.detail.throttle).toHaveLength(3);
  });

  it('Jev が失敗（null）なら plan: null / source: hold', async () => {
    vi.mocked(decide).mockResolvedValue(null);
    const json = await (await POST(req(validBody))).json();
    expect(json.plan).toBeNull();
    expect(json.source).toBe('hold');
    expect('detail' in json).toBe(false);
  });

  it('targetX は -1.3〜1.3 の数値なら受け付け、範囲外は 400', async () => {
    vi.mocked(decide).mockResolvedValue({ plan: { targetX: 0, throttle: 0 }, detail: buildJevDetail('center', 'hold') });
    expect((await POST(req({ ...validBody, targetX: 0.4 }))).status).toBe(200);
    expect(vi.mocked(decide).mock.calls[0][0].targetX).toBe(0.4);
    expect((await POST(req({ ...validBody, targetX: 2 }))).status).toBe(400);
    expect((await POST(req({ ...validBody, targetX: 'a' }))).status).toBe(400);
  });

  it('不正な入力は 400', async () => {
    expect((await POST(req({ frame: 'x' }))).status).toBe(400);
    expect((await POST(req('not json'))).status).toBe(400);
    expect(decide).not.toHaveBeenCalled();
  });

  it('別オリジンからは 403', async () => {
    const res = await POST(req(validBody, { origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
  });

  it('同一オリジンは通す', async () => {
    vi.mocked(decide).mockResolvedValue({ plan: { targetX: 0, throttle: 0 }, detail: buildJevDetail('center', 'hold') });
    const res = await POST(req(validBody, { origin: 'http://localhost:3000' }));
    expect(res.status).toBe(200);
  });

  it('Origin も Sec-Fetch-Site も無いと 403', async () => {
    const r = new Request('http://localhost:3000/api/systemone', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    expect((await POST(r)).status).toBe(403);
  });

  it('Sec-Fetch-Site が cross-site だと 403', async () => {
    const res = await POST(req(validBody, { 'sec-fetch-site': 'cross-site' }));
    expect(res.status).toBe(403);
  });

  it('同一キーで連続 11 回目は 429', async () => {
    vi.mocked(decide).mockResolvedValue({ plan: { targetX: 0, throttle: 0 }, detail: buildJevDetail('center', 'hold') });
    const h = { 'x-forwarded-for': '203.0.113.9' };
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await POST(req(validBody, h))).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('キー未設定は 500（モックでなければ）', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    const res = await POST(req(validBody));
    expect(res.status).toBe(500);
  });

  it('JEV_MODEL 未設定は 500（モックでなければ）', async () => {
    vi.stubEnv('JEV_MODEL', '');
    // レート制限（同一キー 10 回/秒）に当たらないよう別キーで送る
    const res = await POST(req(validBody, { 'x-forwarded-for': '203.0.113.50' }));
    expect(res.status).toBe(500);
    expect(decide).not.toHaveBeenCalled();
  });

  it('JEV_MOCK=1 ならキー不要でルール式の Plan を返し、Jev を呼ばない', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('JEV_MOCK', '1');
    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.plan).not.toBeNull();
    expect([-2 / 3, 0, 2 / 3]).toContain(json.plan.targetX);
    // 選ばれたものが 1、他が 0 の detail を同じ形で返す
    expect(json.detail.lane).toHaveLength(3);
    expect(json.detail.throttle).toHaveLength(3);
    expect(json.detail.lane.filter((l: { prob: number }) => l.prob === 1)).toHaveLength(1);
    expect(json.detail.lane.find((l: { prob: number }) => l.prob === 1).name).toBe(json.detail.laneChoice);
    expect(decide).not.toHaveBeenCalled();
  });
});
