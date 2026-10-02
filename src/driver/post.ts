import type { Observation, SystemOneResponse } from '../lib/types';

/** サーバー側の Jev 待ち（1000ms）より少し長く待つ */
export async function postObservation(obs: Observation, timeoutMs = 1200): Promise<SystemOneResponse> {
  const res = await fetch('/api/systemone', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obs),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`systemone ${res.status}`);
  return (await res.json()) as SystemOneResponse;
}
