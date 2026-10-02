import type { Detection } from '../lib/types';
import { decodeYolo } from './decode';

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

async function create(): Promise<Detector> {
  await loadScript('/ort/ort.wasm.min.js');
  const ort = window.ort;
  ort.env.wasm.wasmPaths = '/ort/';
  ort.env.wasm.numThreads = 1; // クロスオリジン分離なしで動かすため
  const session = await ort.InferenceSession.create('/models/yolo11n-jev.onnx', {
    executionProviders: ['wasm'],
  });

  const canvas = document.createElement('canvas');
  canvas.width = INPUT_SIZE;
  canvas.height = INPUT_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const plane = INPUT_SIZE * INPUT_SIZE;

  return {
    async detect(source) {
      ctx.drawImage(source, 0, 0, INPUT_SIZE, INPUT_SIZE);
      const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
      const input = new Float32Array(3 * plane);
      for (let i = 0; i < plane; i++) {
        input[i] = data[i * 4] / 255;
        input[plane + i] = data[i * 4 + 1] / 255;
        input[2 * plane + i] = data[i * 4 + 2] / 255;
      }
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
