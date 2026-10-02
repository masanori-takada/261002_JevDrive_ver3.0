/** 判断の頻度（回/秒）を求めるときに使う、直近の適用時刻の件数 */
const WINDOW = 10;

/** 直近 10 件の適用時刻（ミリ秒、昇順）から、適用間隔の平均を回/秒にして返す。求められなければ null */
export function decisionRate(times: number[]): number | null {
  const t = times.slice(-WINDOW);
  if (t.length < 2) return null;
  const span = t[t.length - 1] - t[0];
  if (span <= 0) return null;
  return ((t.length - 1) * 1000) / span;
}
