import { createCanvas } from '@napi-rs/canvas';
import * as ort from 'onnxruntime-node';
import { obstacleBox } from '../src/game/projection';
import { renderGame } from '../src/game/render';
import { makeScene } from '../src/game/scene';
import { MODEL as DEFAULT_MODEL } from '../src/vision/model-config';
import { decodeYolo } from '../src/vision/decode';
import { toTensorData } from '../src/vision/preprocess';
import { computePrecision, computeRecall } from '../src/vision/recall';

const W = 640;
const H = 360;
// 環境変数 GATE_SIZE / GATE_MODEL で入力サイズとモデルを切り替える（既定は model-config）
const INPUT = Number(process.env.GATE_SIZE ?? DEFAULT_MODEL.size);
const SCENES = 100;
const GATE = 0.8;
const MODEL = process.env.GATE_MODEL ?? `public${DEFAULT_MODEL.url}`;

async function main(): Promise<void> {
  const session = await ort.InferenceSession.create(MODEL, { executionProviders: ['cpu'] });
  const src = createCanvas(W, H);
  const srcCtx = src.getContext('2d');
  const inp = createCanvas(INPUT, INPUT);
  const inpCtx = inp.getContext('2d');

  let matched = 0, total = 0, precMatched = 0, detectedCount = 0, ms = 0;
  for (let i = 0; i < SCENES; i++) {
    const s = makeScene(i);
    renderGame(srcCtx as unknown as CanvasRenderingContext2D, s, { width: W, height: H, player: false });
    inpCtx.drawImage(src, 0, 0, INPUT, INPUT); // 入力サイズに引き伸ばす
    const { data } = inpCtx.getImageData(0, 0, INPUT, INPUT);
    const tensor = new ort.Tensor('float32', toTensorData(data, INPUT), [1, 3, INPUT, INPUT]);

    const t0 = performance.now();
    const results = await session.run({ [session.inputNames[0]]: tensor });
    ms += performance.now() - t0;

    const out = results[session.outputNames[0]];
    if (out.dims[1] !== 84) throw new Error(`想定外の出力形状: ${out.dims.join('x')}`);
    const detections = decodeYolo(out.data as Float32Array, out.dims[2], {
      inputSize: INPUT,
      confThreshold: 0.25,
      iouThreshold: 0.45,
    });
    const expected = s.obstacles.map((o) => obstacleBox(o, s.playerX));
    const r = computeRecall(expected, detections);
    matched += r.matched;
    total += r.total;
    const p = computePrecision(expected, detections);
    precMatched += p.matched;
    detectedCount += p.detected;
  }

  const recall = matched / total;
  const precision = detectedCount === 0 ? 1 : precMatched / detectedCount;
  console.log(`再現率 ${recall.toFixed(3)}（${matched}/${total}）、適合率 ${precision.toFixed(3)}（${precMatched}/${detectedCount}）`);
  console.log(`平均推論時間 ${(ms / SCENES).toFixed(1)}ms（Node CPU。ブラウザの値とは別物）`);
  console.log(`ゲート ${recall >= GATE ? 'PASS' : 'FAIL'}（基準 ${GATE}）`);
  process.exit(recall >= GATE ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
