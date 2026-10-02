import { experimental_evaluate as evaluate } from 'ai';
import type { Action, Observation, Steer } from '../lib/types';

const STEER_CRITERIA = {
  left: '左へハンドルを切る',
  straight: '直進する（ハンドル操作なし）',
  right: '右へハンドルを切る',
} as const;
const THROTTLE_CRITERIA = {
  brake: '減速する',
  hold: '速度を維持する',
  accelerate: '加速する',
} as const;
const STEER_MAP: Record<keyof typeof STEER_CRITERIA, Steer> = { left: -1, straight: 0, right: 1 };
const THROTTLE_MAP: Record<keyof typeof THROTTLE_CRITERIA, Steer> = { brake: -1, hold: 0, accelerate: 1 };

/** Jev に渡す共有状態の読み方（観測 JSON の意味） */
export const STATE_GUIDE =
  'レーシングゲームの観測。座標はすべて画面比（0..1）。自車は常に水平中央 0.5 にいる。' +
  'obstacles は前方の他車で、x,y は左上、w,h は大きさ。y+h が大きいほど近い。' +
  '中心（x+w/2）が 0.5 に近く、y+h が 0.55 を超えるものは衝突の脅威。' +
  'road.centerOffset は自車が道路中央より右にずれている量（-1..1）。正なら左へ戻す。';

export const STEER_INSTRUCTIONS =
  '脅威となる前方車がいれば、余裕のある側へよけるハンドル操作を選ぶ。いなければ道路中央に戻る方向（centerOffset が正なら左、負なら右、ほぼ0なら直進）。';
export const THROTTLE_INSTRUCTIONS =
  '脅威となる前方車が非常に近い（y+h > 0.8）なら減速。そうでなく speed が 0.8 未満なら加速。それ以外は維持。';

export type EvaluateFn = (args: {
  model: string;
  state: Record<string, unknown>;
  questions: Record<string, unknown>;
  maxRetries: number;
  abortSignal: AbortSignal;
}) => Promise<{
  answers: { steer: { choice: string }; throttle: { choice: string } };
}>;

export async function decide(
  obs: Observation,
  opts: { model: string; timeoutMs: number; evaluate?: EvaluateFn },
): Promise<Action | null> {
  const run = opts.evaluate ?? (evaluate as unknown as EvaluateFn);
  try {
    const r = await run({
      model: opts.model,
      state: { 説明: STATE_GUIDE, 観測: obs },
      questions: {
        steer: { type: 'choice', instructions: STEER_INSTRUCTIONS, criteria: STEER_CRITERIA },
        throttle: { type: 'choice', instructions: THROTTLE_INSTRUCTIONS, criteria: THROTTLE_CRITERIA },
      },
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(opts.timeoutMs),
    });
    const steer = STEER_MAP[r.answers.steer.choice as keyof typeof STEER_MAP];
    const throttle = THROTTLE_MAP[r.answers.throttle.choice as keyof typeof THROTTLE_MAP];
    if (steer === undefined || throttle === undefined) return null;
    return { steer, throttle };
  } catch (e) {
    // メッセージのみ出力する（秘密は出さない）
    console.error('[jev] evaluate failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
}
