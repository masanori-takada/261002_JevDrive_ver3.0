import type { Detection } from '../lib/types';
import { selectBackend, wasmFallback, type Backend } from './backend';
import { decodeYolo } from './decode';
import { toTensorData } from './preprocess';
import { MODEL, type ModelConfig } from './model-config';
import { createSingleFlight } from './single-flight';

export type Detector = { detect(source: CanvasImageSource): Promise<Detection[]> };

// onnxruntime-web は public/ort から <script> で読み込む（バンドラ経由にしない）
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    ort?: any;
  }
}

let detectorPromise: Promise<Detector> | null = null;
let detectorUrl: string | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`スクリプトを読み込めません: ${src}`));
    document.head.appendChild(s);
  });
}

async function createSession(backend: Backend, model: ModelConfig) {
  await loadScript(backend.script);
  const ort = window.ort;
  ort.env.wasm.wasmPaths = '/ort/';
  ort.env.wasm.numThreads = backend.numThreads;
  const session = await ort.InferenceSession.create(model.url, {
    executionProviders: backend.executionProviders,
  });
  return { ort, session };
}

async function create(model: ModelConfig): Promise<Detector> {
  const INPUT_SIZE = model.size;
  const backend = selectBackend({
    hasWebGpu: 'gpu' in navigator,
    crossOriginIsolated: window.crossOriginIsolated,
    hardwareConcurrency: navigator.hardwareConcurrency ?? 1,
  });
  // WebGPU のスクリプト読み込み・セッション作成のどちらかが失敗したら、WASM で作り直して続行する
  let made: Awaited<ReturnType<typeof createSession>>;
  try {
    made = await createSession(backend, model);
  } catch (e) {
    const fallback = wasmFallback(backend);
    if (!fallback) throw e;
    console.warn('[detector] WebGPU を使えないため WASM に切り替えます:', e instanceof Error ? e.message : String(e));
    made = await createSession(fallback, model);
  }
  const { ort, session } = made;

  const canvas = document.createElement('canvas');
  canvas.width = INPUT_SIZE;
  canvas.height = INPUT_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  // 推論本体。session.run は打ち切れないため、実行中は次の推論を始めさせない（single-flight）
  const infer = async (input: Float32Array) => {
    const tensor = new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
    const results = await session.run({ [session.inputNames[0]]: tensor });
    return results[session.outputNames[0]];
  };

  // 暖機: 初回はシェーダのコンパイルで遅いので、ゼロ入力で 1 回だけ推論する（結果は捨てる）。失敗しても続行する
  try {
    await infer(new Float32Array(3 * INPUT_SIZE * INPUT_SIZE));
  } catch (e) {
    console.warn('[detector] 暖機推論に失敗しました（続行します）:', e instanceof Error ? e.message : String(e));
  }

  // 実行中でなければ（single-flight が通した呼び出しだけ）描画・前処理・推論を行う。
  // source は runOnce が同期的に読み取るので、実行中の呼び出しが値を上書きしても影響しない
  let pending: CanvasImageSource | null = null;
  const runOnce = createSingleFlight(async () => {
    ctx.drawImage(pending!, 0, 0, INPUT_SIZE, INPUT_SIZE);
    const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
    const out = await infer(toTensorData(data, INPUT_SIZE));
    if (out.dims[1] !== 84) throw new Error(`想定外の出力形状: ${out.dims.join('x')}`);
    return decodeYolo(out.data as Float32Array, out.dims[2], {
      inputSize: INPUT_SIZE,
      confThreshold: 0.25,
      iouThreshold: 0.45,
    });
  });

  return {
    detect(source) {
      pending = source;
      return runOnce();
    },
  };
}

export function getDetector(model: ModelConfig = MODEL): Promise<Detector> {
  // モデルが変わったときは作り直す（通常は既定のまま 1 回だけ作る）
  if (detectorUrl !== model.url) detectorPromise = null;
  detectorUrl = model.url;
  detectorPromise ??= create(model).catch((e) => {
    // 失敗したら破棄して、次回の呼び出しで再試行できるようにする
    detectorPromise = null;
    throw e;
  });
  return detectorPromise;
}
