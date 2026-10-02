import type { Observation, SystemOneResponse } from '../lib/types';

/** 初回の /api/systemone は、開発サーバーの初回コンパイルと Jev 初回呼び出しで長くかかるため、長めに待つ */
export const WARM_UP_TIMEOUT_MS = 15_000;

/** ウォームアップ用のサンプル観測（道の中央・障害物なし） */
export const WARM_UP_SAMPLE: Observation = {
  frame: 0,
  speed: 0.5,
  road: { left: 0.3, right: 0.7, centerOffset: 0 },
  obstacles: [],
  targetX: 0,
};

export type WarmUpOptions = {
  /** 最大試行回数（既定 4） */
  attempts?: number;
  /** 失敗してから次の試行までの待ち時間（既定 600ms） */
  delayMs?: number;
  /** 待ち処理。テストでは待たないように差し替える */
  sleep?: (ms: number) => Promise<void>;
  /** 各試行の直前に (試行番号, 最大回数) を通知する */
  onAttempt?: (n: number, max: number) => void;
};

/**
 * 運転開始前に Jev へ観測を送り、応答（plan あり）を確認する。
 * 冷えた状態では最初の呼び出しが Jev の待ち時間を超えて plan が null になりうるため、
 * 成功するまで attempts 回まで再試行する。全て失敗したときだけ、最後の失敗の理由つきで throw する。
 */
export async function warmUpJev(
  post: (obs: Observation, timeoutMs?: number) => Promise<SystemOneResponse>,
  sample: Observation = WARM_UP_SAMPLE,
  opts: WarmUpOptions = {},
): Promise<SystemOneResponse> {
  const { attempts = 4, delayMs = 600, sleep = (ms) => new Promise<void>((r) => setTimeout(r, ms)), onAttempt } = opts;
  let reason = '';
  for (let n = 1; n <= attempts; n++) {
    onAttempt?.(n, attempts);
    try {
      const res = await post(sample, WARM_UP_TIMEOUT_MS);
      if (res.plan) return res;
      reason = 'Jev から plan が返りませんでした';
    } catch (e) {
      reason = e instanceof Error ? e.message : String(e);
    }
    if (n < attempts) await sleep(delayMs);
  }
  throw new Error(`${reason}（${attempts}回試行）`);
}
