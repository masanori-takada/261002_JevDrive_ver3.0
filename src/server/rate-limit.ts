type Entry = { windowStart: number; count: number };

const entries = new Map<string, Entry>();

/** 固定ウィンドウの簡易レート制限。ウィンドウごとに最大 limit 回まで true を返す */
export function allow(key: string, now: number, limit = 10, windowMs = 1000): boolean {
  // 古いキーを掃除する
  for (const [k, e] of entries) {
    if (now - e.windowStart >= windowMs) entries.delete(k);
  }
  const e = entries.get(key);
  if (!e) {
    entries.set(key, { windowStart: now, count: 1 });
    return limit >= 1;
  }
  e.count += 1;
  return e.count <= limit;
}
