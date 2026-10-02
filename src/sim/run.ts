// 判断遅延つきでゲームを走らせる
import { createGame, DT, step, type GameState } from '../game/racer';
import { laneOffset } from '../game/lane-geometry';
import type { Policy } from './policies';

export type EpisodeResult = {
  crashes: number;
  distance: number;
  /** 画面内（z が 0 以上）に障害物が 1 台以上いるフレームの割合（0..1） */
  visibleRatio: number;
  /** 衝突の瞬間の、最寄りの車線の中心との差（|playerX − 最寄りの中心|）。衝突ごとに 1 件 */
  crashOffsets: number[];
  /** 車線の中心から STRADDLE_DX より離れている（線をまたいでいる）フレームの割合（0..1） */
  straddleRatio: number;
};

/** これより中心から離れていたら「車線をまたいでいる」とみなす */
export const STRADDLE_DX = 0.1;

const FPS = Math.round(1 / DT);

/**
 * frames フレーム走らせて、最後の状態と反映済みの判断を返す。判断は period 秒ごとに 1 回（省略時は L ごと）。
 * 時刻 t に決めた判断は t + L に反映され、それまでは直前の判断を保持する。
 * period < L のときは、複数の判断が同時に反映待ちになる（応答を待たずに重ねて送る方式）。
 * L=0 は毎フレーム判断して即反映（遅延ゼロの上限）。
 */
export function simulate<D>(
  policy: Policy<D>, seed: number, frames: number, L: number, spawnGap?: number, period?: number,
): { state: GameState; applied: D; visibleFrames: number; straddleFrames: number; crashOffsets: number[] } {
  const lf = Math.round(L * FPS);
  const pf = period === undefined ? Math.max(lf, 1) : Math.max(1, Math.round(period * FPS));
  let s = createGame(seed, spawnGap);
  let visibleFrames = 0;
  let straddleFrames = 0;
  const crashOffsets: number[] = [];
  let applied = policy.initial;
  const pending: { at: number; d: D }[] = [];
  const flush = (f: number) => {
    while (pending.length > 0 && pending[0].at <= f) applied = pending.shift()!.d;
  };
  for (let f = 0; f < frames; f++) {
    flush(f);
    if (f % pf === 0) {
      pending.push({ at: f + lf, d: policy.decide(s, applied) });
      flush(f); // L=0 は即反映
    }
    const before = s.crashes;
    s = step(s, policy.toAction(applied, s));
    if (s.crashes > before) crashOffsets.push(laneOffset(s.playerX));
    if (laneOffset(s.playerX) > STRADDLE_DX) straddleFrames += 1;
    if (s.obstacles.some((o) => o.z >= 0)) visibleFrames += 1;
  }
  return { state: s, applied, visibleFrames, straddleFrames, crashOffsets };
}

/** seconds 秒走らせて、衝突回数と走行距離を返す */
export function runEpisode<D>(
  policy: Policy<D>, seed: number, seconds: number, L: number, spawnGap?: number, period?: number,
): EpisodeResult {
  const frames = Math.round(seconds * FPS);
  const { state, visibleFrames, straddleFrames, crashOffsets } = simulate(policy, seed, frames, L, spawnGap, period);
  return { crashes: state.crashes, distance: state.distance, visibleRatio: frames > 0 ? visibleFrames / frames : 0,
    crashOffsets,
    straddleRatio: frames > 0 ? straddleFrames / frames : 0,
  };
}
