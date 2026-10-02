// 実 Jev の判断精度を測る（npm run jev-accuracy）。
// sim の途中の観測を 100 サンプル取り、各サンプルで Jev に目標レーンと throttle を選ばせ、方式の関数（正解）と比べる。
// 1 回の実行で 1 回だけ測る（リトライなし）。--dry を付けると Jev を呼ばずサンプルの内訳だけ出す。
import { readFileSync } from 'node:fs';
import { experimental_evaluate as evaluate } from 'ai';
import { BEST_CONFIG, SIM_LATENCY } from '../src/sim/config';
import { buildJevQuestion, LANE_NAMES } from '../src/server/jev-question';
import { classifyLane } from '../src/sim/jev-question';
import { makeLanePolicy, observeClearances } from '../src/sim/lane-obs';
import { decideFromClearances } from '../src/vision/lane-plan';
import { simulate } from '../src/sim/run';

const N = 100;
const FPS = 60;
const dry = process.argv.includes('--dry');

// .env.local を読み込む（値は表示しない）
if (!dry) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const policy = makeLanePolicy(BEST_CONFIG);
const lf = Math.round(SIM_LATENCY * FPS);

// サンプル: シードと判断時刻を変えて取る（i ごとに別シード、時刻は 1.6〜110 秒ほどに散らす）
const samples = Array.from({ length: N }, (_, i) => {
  const seed = i + 1;
  const k = 3 + ((i * 37) % 200);
  const { state, applied } = simulate(policy, seed, k * lf + 1, SIM_LATENCY);
  const { speed, cl } = observeClearances(state, BEST_CONFIG);
  const correct = decideFromClearances(cl, applied.idx, speed, BEST_CONFIG);
  return { seed, current: applied.idx, speed, cl, correct };
});

const moveCount = samples.filter((s) => s.correct.idx !== s.current).length;
console.log(`サンプル ${N} 件（正解が「移動」: ${moveCount} 件、「維持」: ${N - moveCount} 件、`
  + `正解 throttle=1: ${samples.filter((s) => s.correct.throttle === 1).length} 件）`);
if (dry) process.exit(0);

async function main() {
type Row = { laneOk: boolean; kind: string; thrOk: boolean; thrConsistent: boolean; prob: number | null; ms: number };
const rows: Row[] = [];
let failures = 0;
const THR = ['brake', 'hold', 'accelerate'] as const;
const THR_VAL = { brake: -1, hold: 0, accelerate: 1 } as const;

for (const s of samples) {
  const q = buildJevQuestion(s.cl, s.current, s.speed, BEST_CONFIG.margin, BEST_CONFIG.throttleNear);
  const t0 = Date.now();
  try {
    const r = (await (evaluate as unknown as (a: unknown) => Promise<{
      answers: { lane: { choice: string; probabilities?: Record<string, number> }; throttle: { choice: string } };
    }>)({
      model: process.env.JEV_MODEL,
      state: q.state,
      questions: { lane: q.lane, throttle: q.throttle },
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(30000),
    }));
    const jevIdx = (LANE_NAMES as readonly string[]).indexOf(r.answers.lane.choice);
    const jevThr = THR_VAL[r.answers.throttle.choice as (typeof THR)[number]];
    if (jevIdx < 0 || jevThr === undefined) throw new Error('想定外の選択');
    // Jev 自身の選んだレーンに対して、throttle が指示どおりか
    const expectedOnJevLane = s.cl[jevIdx] < BEST_CONFIG.throttleNear ? 0 : s.speed < 0.8 ? 1 : 0;
    rows.push({
      laneOk: jevIdx === s.correct.idx,
      kind: classifyLane(s.correct.idx, jevIdx, s.current),
      thrOk: jevThr === s.correct.throttle,
      thrConsistent: jevThr === expectedOnJevLane,
      prob: r.answers.lane.probabilities?.[r.answers.lane.choice] ?? null,
      ms: Date.now() - t0,
    });
  } catch (e) {
    failures += 1;
    console.error(`seed ${s.seed}: 失敗（${e instanceof Error ? e.message : String(e)}）`);
  }
}

const n = rows.length;
const pct = (a: number, b: number) => (b === 0 ? '-' : `${((a / b) * 100).toFixed(1)}%`);
const count = (f: (r: Row) => boolean) => rows.filter(f).length;
console.log(`\n有効 ${n} 件 / 失敗 ${failures} 件`);
console.log(`目標レーン一致: ${count((r) => r.laneOk)}/${n} (${pct(count((r) => r.laneOk), n)})`);
console.log(`throttle 一致（正解のレーン基準）: ${count((r) => r.thrOk)}/${n} (${pct(count((r) => r.thrOk), n)})`);
console.log(`throttle 一致（Jev 自身のレーン基準）: ${count((r) => r.thrConsistent)}/${n} (${pct(count((r) => r.thrConsistent), n)})`);
console.log(`両方一致: ${count((r) => r.laneOk && r.thrOk)}/${n} (${pct(count((r) => r.laneOk && r.thrOk), n)})`);
console.log('\n目標レーンの不一致の内訳');
for (const k of ['維持すべきなのに移動', '移動すべきなのに維持', '移動先が違う']) {
  console.log(`  ${k}: ${count((r) => r.kind === k)} 件`);
}
const mv = samples.filter((s) => s.correct.idx !== s.current);
const hold = samples.filter((s) => s.correct.idx === s.current);
console.log('\n場面別のレーン一致率（正解が移動 / 維持）');
console.log(`  移動すべき場面: ${pct(mv.length - count((r) => r.kind === '移動すべきなのに維持') - count((r) => r.kind === '移動先が違う'), mv.length)}`);
console.log(`  維持すべき場面: ${pct(hold.length - count((r) => r.kind === '維持すべきなのに移動'), hold.length)}`);
const probs = rows.map((r) => r.prob).filter((p): p is number => p !== null);
if (probs.length) console.log(`\nレーン選択の平均確率: ${(probs.reduce((a, b) => a + b, 0) / probs.length).toFixed(3)}`);
const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
if (ms.length) console.log(`応答時間: 中央値 ${ms[Math.floor(ms.length / 2)]}ms、最大 ${ms[ms.length - 1]}ms`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
