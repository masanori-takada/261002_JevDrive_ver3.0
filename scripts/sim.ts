// 模擬実験: 判断遅延のもとで運転方式ごとの衝突回数を比べる（npm run sim）
import { HIT_DX } from '../src/game/racer';
import { makeLanePolicy, type LaneConfig } from '../src/sim/lane-obs';
import { makePolicy, type Policy } from '../src/sim/policies';
import { runEpisode } from '../src/sim/run';
import { LANES3, LANES5, type LaneSpec } from '../src/vision/lanes';

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const HOLDOUT = Array.from({ length: 40 }, (_, i) => i + 21);
const SECONDS = 120;
const L = 0.55;

type Row = { crashes: number; distance: number; rate: number };

function evaluate<D>(policy: Policy<D>, lat: number, seeds = SEEDS): Row {
  let crashes = 0;
  let distance = 0;
  for (const seed of seeds) {
    const r = runEpisode(policy, seed, SECONDS, lat);
    crashes += r.crashes;
    distance += r.distance;
  }
  return { crashes, distance, rate: crashes / distance };
}

const pad = (v: string, n: number) => v.padStart(n, ' ');
const header = `${'方式'.padEnd(40, ' ')}${pad('衝突合計', 8)}${pad('距離合計', 12)}${pad('衝突/距離', 12)}${pad('rule-raw比', 12)}`;
let ruleRate = 1;
const line = (label: string, r: Row) =>
  `${label.padEnd(40, ' ')}${pad(String(r.crashes), 8)}${pad(r.distance.toFixed(1), 12)}${pad(r.rate.toFixed(3), 12)}` +
  `${pad(`${((1 - r.rate / ruleRate) * 100).toFixed(1)}%減`, 12)}`;

const cfg = (spec: LaneSpec, margin: number, throttleNear: number, comp: boolean, round = true): LaneConfig => ({
  spec, margin, throttleNear, compensateL: comp ? L : 0, round,
});
const lanePolicy = (c: LaneConfig) => makeLanePolicy(c);

console.log(`シード 1〜${SEEDS.length} 各 ${SECONDS} 秒 (60fps)、検出は完全、判断の遅延 L=${L} 秒（oracle のみ L=0）`);
console.log('「rule-raw比」は距離あたり衝突回数の削減率（負なら悪化）\n');

// 基準
const rule = evaluate(makePolicy('rule-raw'), L);
ruleRate = rule.rate;
console.log('【基準】');
console.log(header);
console.log(line('noop', evaluate(makePolicy('noop'), L)));
console.log(line('rule-raw', rule));
console.log(line('oracle（L=0）', evaluate(makePolicy('oracle'), 0)));
// 世界座標の現行 lane-target は src/sim/policies の makePolicy('lane-target')
console.log(line('lane-target（世界座標・比較用）', evaluate(makePolicy('lane-target'), L)));

// 1) 観測だけ
console.log('\n【観測（検出ボックス）だけで判断。3 レーン、ヒステリシス 0.1、throttle 閾値 0.3】');
console.log(header);
const base3 = cfg(LANES3, 0.1, 0.3, false);
console.log(line('lane-obs 3レーン 丸めなし', evaluate(lanePolicy({ ...base3, round: false }), L)));
console.log(line('lane-obs 3レーン 3桁丸め', evaluate(lanePolicy(base3), L)));

// 2) 改善を 1 つずつ（丸めありの lane-obs 3 レーンが土台）
console.log('\n【改善を 1 つずつ（土台: lane-obs 3レーン 3桁丸め）】');
console.log(header);
console.log(line('a. 遅延補償', evaluate(lanePolicy(cfg(LANES3, 0.1, 0.3, true)), L)));
console.log(line('b. 5レーン', evaluate(lanePolicy(cfg(LANES5, 0.1, 0.3, false)), L)));

// c) 閾値のグリッド
const MARGINS = [0.05, 0.1, 0.2, 0.3];
const NEARS = [0.15, 0.3, 0.45, 0.6];
function grid(spec: LaneSpec, comp: boolean) {
  const cells: { margin: number; near: number; r: Row }[] = [];
  for (const m of MARGINS) for (const n of NEARS) cells.push({ margin: m, near: n, r: evaluate(lanePolicy(cfg(spec, m, n, comp)), L) });
  return cells;
}
function printGrid(title: string, cells: ReturnType<typeof grid>) {
  console.log(`\n${title}（衝突/距離。行=ヒステリシス閾値、列=throttle 閾値）`);
  console.log(`${''.padEnd(10)}${NEARS.map((n) => pad(`near=${n}`, 10)).join('')}`);
  for (const m of MARGINS) {
    console.log(`${`m=${m}`.padEnd(10)}${NEARS.map((n) => pad(cells.find((c) => c.margin === m && c.near === n)!.r.rate.toFixed(3), 10)).join('')}`);
  }
}
const best = (cells: ReturnType<typeof grid>) => cells.reduce((a, b) => (b.r.rate < a.r.rate ? b : a));

const g3 = grid(LANES3, false);
printGrid('c. 閾値グリッド（3レーン・補償なし）', g3);
const b3 = best(g3);
console.log(line(`c. 最良 (m=${b3.margin}, near=${b3.near})`, b3.r));

// d) 組み合わせ（レーン数 × 補償 で閾値グリッドの最良を採用）
console.log('\n【d. 組み合わせ（各組で閾値グリッドの最良）】');
console.log(header);
const finals: { label: string; c: LaneConfig; r: Row }[] = [];
for (const [name, spec] of [['3レーン', LANES3], ['5レーン', LANES5]] as const) {
  for (const comp of [false, true]) {
    const b = best(grid(spec, comp));
    const c = cfg(spec, b.margin, b.near, comp);
    const label = `d. ${name}${comp ? '+補償' : ''} (m=${b.margin}, near=${b.near})`;
    finals.push({ label, c, r: b.r });
    console.log(line(label, b.r));
  }
}
console.log(line('(参考) 5レーン+補償 (m=0.1, near=0.3)', evaluate(lanePolicy(cfg(LANES5, 0.1, 0.3, true)), L)));
const bestFinal = finals.reduce((a, b) => (b.r.rate < a.r.rate ? b : a));
console.log(`\n最良: ${bestFinal.label}`);

// 別シード（21〜60）での確認（グリッド選択への過適合を見る）
console.log('\n【別シード 21〜60 での確認（各 120 秒）】');
console.log(header);
ruleRate = evaluate(makePolicy('rule-raw'), L, HOLDOUT).rate;
console.log(line('rule-raw', evaluate(makePolicy('rule-raw'), L, HOLDOUT)));
console.log(line('oracle（L=0）', evaluate(makePolicy('oracle'), 0, HOLDOUT)));
console.log(line('lane-target（世界座標・比較用）', evaluate(makePolicy('lane-target'), L, HOLDOUT)));
for (const f of finals) console.log(line(f.label, evaluate(lanePolicy(f.c), L, HOLDOUT)));

// 5 レーンの幅（halfWidth）の比較（遅延補償あり、閾値は製品の既定値）
console.log('\n【5レーンの幅 halfWidth の比較（遅延補償あり、m=0.1、near=0.3）】');
for (const [name, seeds] of [['シード 1〜20', SEEDS], ['シード 21〜60', HOLDOUT]] as const) {
  ruleRate = evaluate(makePolicy('rule-raw'), L, seeds).rate;
  console.log(`\n${name}`);
  console.log(header);
  for (const w of [0.4, 0.5, HIT_DX]) {
    const spec: LaneSpec = { ...LANES5, halfWidth: w };
    console.log(line(`5レーン+補償 halfWidth=${w}`, evaluate(lanePolicy(cfg(spec, 0.1, 0.3, true)), L, seeds)));
  }
}
