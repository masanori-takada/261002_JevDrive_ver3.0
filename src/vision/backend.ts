// 推論バックエンドの選択（純関数。ブラウザの能力を引数で受け取る）
export type BackendEnv = {
  hasWebGpu: boolean;
  crossOriginIsolated: boolean;
  hardwareConcurrency: number;
};

export type Backend = {
  script: string;
  executionProviders: string[];
  numThreads: number;
};

const MAX_THREADS = 4; // 実測で 3〜4 が最速。それ以上は増やさない

export function selectBackend(env: BackendEnv): Backend {
  // マルチスレッドはクロスオリジン分離（SharedArrayBuffer）が前提。1 コアは UI 用に残す
  const numThreads = env.crossOriginIsolated
    ? Math.min(MAX_THREADS, Math.max(1, Math.floor(env.hardwareConcurrency) - 1))
    : 1;
  return env.hasWebGpu
    ? { script: '/ort/ort.webgpu.min.js', executionProviders: ['webgpu', 'wasm'], numThreads }
    : { script: '/ort/ort.wasm.min.js', executionProviders: ['wasm'], numThreads };
}

/** WebGPU でセッション作成に失敗したときの再試行先（WASM 専用スクリプト。スレッド数は従来どおり）。すでに WASM 専用なら null */
export function wasmFallback(b: Backend): Backend | null {
  if (!b.executionProviders.includes('webgpu')) return null;
  return { script: '/ort/ort.wasm.min.js', executionProviders: ['wasm'], numThreads: b.numThreads };
}
