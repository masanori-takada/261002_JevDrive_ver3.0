/** ゲームが進行中か。待機（未開始かつ Jev 非運転）の間は step を呼ばない */
export function isRunning(started: boolean, jevRunning: boolean): boolean {
  return started || jevRunning;
}

const START_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/** 発進のトリガーになるキーか（矢印 4 方向） */
export function isStartKey(key: string): boolean {
  return START_KEYS.has(key);
}

/** キー押下後の「開始済み」状態。一度開始したら戻らない */
export function nextStarted(started: boolean, key: string): boolean {
  return started || isStartKey(key);
}
