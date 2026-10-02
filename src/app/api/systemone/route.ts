import { decide } from '../../../server/jev';
import { allow } from '../../../server/rate-limit';
import { ruleDecision } from '../../../server/rule';
import { ObservationSchema } from '../../../server/schema';
import type { SystemOneResponse } from '../../../lib/types';

const JEV_TIMEOUT_MS = 1000;

export async function POST(req: Request): Promise<Response> {
  // 同一オリジンのみ許可
  const origin = req.headers.get('origin');
  if (origin) {
    let sameHost = false;
    try {
      sameHost = new URL(origin).host === new URL(req.url).host;
    } catch {
      sameHost = false;
    }
    if (!sameHost) return Response.json({ error: 'forbidden' }, { status: 403 });
  } else if (req.headers.get('sec-fetch-site') !== 'same-origin') {
    // Origin が無い場合は Sec-Fetch-Site が same-origin のときだけ許可
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  // 簡易レート制限（x-forwarded-for の最初の値をキーにする）
  const key = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  if (!allow(key, Date.now())) {
    return Response.json({ error: 'too many requests' }, { status: 429 });
  }

  const mock = process.env.JEV_MOCK === '1';
  if (!mock && (!process.env.AI_GATEWAY_API_KEY || !process.env.JEV_MODEL)) {
    return Response.json({ error: 'server not configured' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = ObservationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'invalid observation' }, { status: 400 });
  }

  const start = Date.now();
  const decision = mock
    ? ruleDecision(parsed.data)
    : await decide(parsed.data, { model: process.env.JEV_MODEL!, timeoutMs: JEV_TIMEOUT_MS });
  const res: SystemOneResponse = {
    plan: decision?.plan ?? null,
    latencyMs: Date.now() - start,
    source: decision ? 'jev' : 'hold',
    // 失敗（plan が null）のときは detail を付けない
    ...(decision ? { detail: decision.detail } : {}),
  };
  return Response.json(res);
}
