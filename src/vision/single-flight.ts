// 非同期関数を同時に 1 つしか実行させない（実行中の呼び出しは新しい処理を始めず、すぐ reject する）
export function createSingleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let running = false;
  return async () => {
    if (running) throw new Error('detector busy');
    running = true;
    try {
      return await fn();
    } finally {
      running = false;
    }
  };
}
