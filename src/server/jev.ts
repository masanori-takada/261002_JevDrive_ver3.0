import { experimental_evaluate as evaluate } from 'ai';
import type { JevDetail, Observation, Plan, Steer } from '../lib/types';
import { MARGIN, nearestLaneIdx, observationClearances, THROTTLE_NEAR } from '../vision/lane-plan';
import { LANES5 } from '../vision/lanes';
import { buildJevDetail } from './jev-detail';
import { buildJevQuestion, LANE_NAMES } from './jev-question';

const THROTTLE_MAP: Record<string, Steer> = { brake: -1, hold: 0, accelerate: 1 };

export type EvaluateFn = (args: {
  model: string;
  state: Record<string, unknown>;
  questions: Record<string, unknown>;
  maxRetries: number;
  abortSignal: AbortSignal;
}) => Promise<{
  answers: {
    lane: { choice: string; probabilities?: Record<string, number> };
    throttle: { choice: string; probabilities?: Record<string, number> };
  };
}>;

/** 観測から各レーンの余裕を作って Jev に渡し、目標レーンと throttle を選ばせる */
export async function decide(
  obs: Observation,
  opts: { model: string; timeoutMs: number; evaluate?: EvaluateFn },
): Promise<{ plan: Plan; detail: JevDetail } | null> {
  const run = opts.evaluate ?? (evaluate as unknown as EvaluateFn);
  // AbortSignal を無視された場合でも打ち切れるよう、タイマーとも競わせる
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const cl = observationClearances(obs);
    const current = nearestLaneIdx(obs.targetX ?? 0);
    const q = buildJevQuestion(cl, current, obs.speed, MARGIN, THROTTLE_NEAR);
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), opts.timeoutMs);
    });
    const r = await Promise.race([
      run({
        model: opts.model,
        state: q.state,
        questions: { lane: q.lane, throttle: q.throttle },
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(opts.timeoutMs),
      }),
      timeout,
    ]);
    if (r === null) {
      console.error('[jev] evaluate failed:', 'timeout');
      return null;
    }
    const laneIdx = (LANE_NAMES as readonly string[]).indexOf(r.answers.lane.choice);
    const throttle = THROTTLE_MAP[r.answers.throttle.choice];
    if (laneIdx < 0 || throttle === undefined) {
      // 想定外の選択肢（選択肢名のみ出力する）
      console.error('[jev] unexpected choice:', laneIdx < 0 ? r.answers.lane.choice : r.answers.throttle.choice);
      return null;
    }
    return {
      plan: { targetX: LANES5.centers[laneIdx], throttle },
      detail: buildJevDetail(
        r.answers.lane.choice, r.answers.throttle.choice,
        r.answers.lane.probabilities, r.answers.throttle.probabilities,
      ),
    };
  } catch (e) {
    // メッセージのみ出力する（秘密は出さない）
    console.error('[jev] evaluate failed:', e instanceof Error ? e.message : String(e));
    return null;
  } finally {
    clearTimeout(timer);
  }
}
