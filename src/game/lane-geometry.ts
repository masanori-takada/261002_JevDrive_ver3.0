// 車線の幾何（game・vision・server・sim・UI で共有する唯一の定義）。
// 道路は u∈[-1,1]（縁の白線は u=±1）、区切り線は u=±1/3 の 3 車線。
export const LANE_HALF = 1 / 3;
export const LANE_CENTERS: readonly number[] = [-2 / 3, 0, 2 / 3];
/** 自車の横位置の範囲（車線の中心の外側へは行けない） */
export const PLAYER_X_MAX = 2 / 3;

/** x に最も近い車線の中心との差（絶対値）。車線をまたいでいる度合い */
export function laneOffset(x: number): number {
  let best = Infinity;
  for (const c of LANE_CENTERS) best = Math.min(best, Math.abs(x - c));
  return best;
}
