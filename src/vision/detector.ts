import type { Detection } from '../lib/types';
import { selectBackend, wasmFallback, type Backend } from './backend';
import { decodeYolo } from './decode';
import { toTensorData } from './preprocess';

export const INPUT_SIZE = 320;
export type Detector = { detect(source: CanvasImageSource): Promise<Detection[]> };

// onnxruntime-web は public/ort から <script> で読み込む（バンドラ経由にしない）
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    ort?: any;
  }
}

let detectorPromise: Promise<Detector> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`スクリプトを読み込めません: ${src}`));
    document.head.appendChild(s);
  });
}

async function createSession(backend: Backend) {
  await loadScript(backend.script);
  const ort = window.ort;
  ort.env.wasm.wasmPaths = '/ort/';
  ort.env.wasm.numThreads = backend.numThreads;
  const session = await ort.InferenceSession.create('/models/yolo11n-jev.onnx', {
    executionProviders: backend.executionProviders,
  });
  return { ort, session };
}

async function create(): Promise<Detector> {
  const backend = selectBackend({
    hasWebGpu: 'gpu' in navigator,
    crossOriginIsolated: window.crossOriginIsolated,
    hardwareConcurrency: navigator.hardwareConcurrency ?? 1,
  });
  // WebGPU のスクリプト読み込み・セッション作成のどちらかが失敗したら、WASM で作り直して続行する
  let made: Awaited<ReturnType<typeof createSession>>;
  try {
    made = await createSession(backend);
  } catch (e) {
    const fallback = wasmFallback(backend);
    if (!fallback) throw e;
    console.warn('[detector] WebGPU を使えないため WASM に切り替えます:', e instanceof Error ? e.message : String(e));
    made = await createSession(fallback);
  }
  const { ort, session } = made;

  const canvas = document.createElement('canvas');
  canvas.width = INPUT_SIZE;
  canvas.height = INPUT_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  return {
    async detect(source) {
      ctx.drawImage(source, 0, 0, INPUT_SIZE, INPUT_SIZE);
      const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
      const input = toTensorData(data, INPUT_SIZE);
      const tensor = new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
      const results = await session.run({ [session.inputNames[0]]: tensor });
      const out = results[session.outputNames[0]];
      if (out.dims[1] !== 84) throw new Error(`想定外の出力形状: ${out.dims.join('x')}`);
      return decodeYolo(out.data as Float32Array, out.dims[2], {
        inputSize: INPUT_SIZE,
        confThreshold: 0.25,
        iouThreshold: 0.45,
      });
    },
  };
}

export function getDetector(): Promise<Detector> {
  detectorPromise ??= create().catch((e) => {
    // 失敗したら破棄して、次回の呼び出しで再試行できるようにする
    detectorPromise = null;
    throw e;
  });
  return detectorPromise;
}
