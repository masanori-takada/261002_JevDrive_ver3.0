// 判断遅延つきでゲームを走らせる
import { createGame, DT, step, type GameState } from '../game/racer';
import type { Policy } from './policies';

export type EpisodeResult = { crashes: number; distance: number };

const FPS = Math.round(1 / DT);

/**
 * frames フレーム走らせて、最後の状態と反映済みの判断を返す。判断は L 秒ごとに 1 回（重ならない）。
 * 時刻 t に決めた判断は t + L に反映され、それまでは直前の判断を保持する。
 * L=0 は毎フレーム判断して即反映（遅延ゼロの上限）。
 */
export function simulate<D>(
  policy: Policy<D>, seed: number, frames: number, L: number,
): { state: GameState; applied: D } {
  const lf = Math.round(L * FPS);
  let s = createGame(seed);
  let applied = policy.initial;
  let pending: D | null = null;
  for (let f = 0; f < frames; f++) {
    if (lf === 0) {
      applied = policy.decide(s, applied);
    } else if (f % lf === 0) {
      if (pending !== null) applied = pending;
      pending = policy.decide(s, applied);
    }
    s = step(s, policy.toAction(applied, s));
  }
  return { state: s, applied };
}

/** seconds 秒走らせて、衝突回数と走行距離を返す */
export function runEpisode<D>(policy: Policy<D>, seed: number, seconds: number, L: number): EpisodeResult {
  const { state } = simulate(policy, seed, Math.round(seconds * FPS), L);
  return { crashes: state.crashes, distance: state.distance };
}
