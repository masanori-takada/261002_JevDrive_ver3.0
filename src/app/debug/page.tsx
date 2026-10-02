'use client';
import { useState } from 'react';
import { obstacleBox } from '../../game/projection';
import { renderGame } from '../../game/render';
import { makeScene } from '../../game/scene';
import { getDetector } from '../../vision/detector';
import { pickModel } from '../../vision/model-config';
import { computeRecall } from '../../vision/recall';

const W = 640, H = 360, SCENES = 100, GATE = 0.8;

export default function DebugPage() {
  const [result, setResult] = useState<string>('未実行');

  async function run() {
    setResult('モデル読み込み中…');
    // ?model=256 で 256 モデルを測れる（既定は製品のモデル）
    const model = pickModel(new URLSearchParams(window.location.search).get('model'));
    const detector = await getDetector(model);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    let matched = 0, total = 0, ms = 0;
    for (let i = 0; i < SCENES; i++) {
      const s = makeScene(i);
      renderGame(ctx, s, { width: W, height: H, player: false });
      const t0 = performance.now();
      const detections = await detector.detect(canvas);
      ms += performance.now() - t0;
      const r = computeRecall(s.obstacles.map((o) => obstacleBox(o, s.playerX)), detections);
      matched += r.matched;
      total += r.total;
    }
    const recall = matched / total;
    setResult(
      `${model.url}（${model.size}）再現率 ${recall.toFixed(3)}（${matched}/${total}）、平均推論 ${(ms / SCENES).toFixed(1)}ms、` +
        `ゲート ${recall >= GATE ? 'PASS' : 'FAIL'}（基準 ${GATE}）`,
    );
  }

  return (
    <main style={{ padding: 16 }}>
      <h1>検出基準ゲート</h1>
      <button onClick={run}>{SCENES} シーンで測定</button>
      <p id="result">{result}</p>
    </main>
  );
}
