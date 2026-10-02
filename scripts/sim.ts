// 模擬実験: 判断遅延のもとで運転方式ごとの衝突回数を比べる（npm run sim）
import { HIT_DX } from '../src/game/racer';
import { laneSteer } from '../src/game/steer';
import { makeLanePolicy, observeClearances, type LaneConfig, type ObsLaneDecision } from '../src/sim/lane-obs';
import { selectLaneIdx } from '../src/vision/lane-plan';
import { makePolicy, type Policy } from '../src/sim/policies';
import { runEpisode } from '../src/sim/run';
import { BEST_CONFIG } from '../src/sim/config';
import { THROTTLE_NEAR } from '../src/vision/lane-plan';
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

// 障害物の出現間隔の比較（製品方式 = 5レーン+遅延補償、noop、oracle）。
// `npm run sim -- --spawn-only` でこの比較だけを実行して終了する
const SPAWN_GAPS = [0.5, 0.8, 1.2, 1.6, 2.0, 2.4, 2.5];
/** 採用基準: 製品方式の距離あたり衝突回数がこれ以下になる最小の間隔 */
const SPAWN_TARGET_RATE = 0.15;
/** 目安: 画面内に車がいる時間の割合の下限 */
const SPAWN_MIN_VISIBLE = 0.7;

function spawnTable() {
  const seeds = SEEDS;
  const policies: { label: string; policy: Policy<any>; lat: number }[] = [
    { label: 'noop', policy: makePolicy('noop'), lat: L },
    { label: '製品（5レーン+補償）', policy: lanePolicy(BEST_CONFIG), lat: L },
    { label: 'oracle（L=0）', policy: makePolicy('oracle'), lat: 0 },
  ];
  console.log(`\n【障害物の出現間隔の比較（シード 1〜${seeds.length} 各 ${SECONDS} 秒、製品は L=${L}）】`);
  console.log(
    `${'方式'.padEnd(24, ' ')}${pad('間隔', 6)}${pad('衝突合計', 10)}${pad('距離合計', 10)}${pad('衝突/距離', 11)}${pad('距離/衝突', 11)}${pad('車が見える', 11)}`,
  );
  const adopt: { gap: number; rate: number; visible: number }[] = [];
  for (const p of policies) {
    for (const gap of SPAWN_GAPS) {
      let crashes = 0;
      let distance = 0;
      let visible = 0;
      for (const seed of seeds) {
        const r = runEpisode(p.policy, seed, SECONDS, p.lat, gap);
        crashes += r.crashes;
        distance += r.distance;
        visible += r.visibleRatio;
      }
      const rate = crashes / distance;
      const ratio = visible / seeds.length;
      if (p.label.startsWith('製品')) adopt.push({ gap, rate, visible: ratio });
      console.log(
        `${p.label.padEnd(24, ' ')}${pad(String(gap), 6)}${pad(String(crashes), 10)}${pad(distance.toFixed(1), 10)}${pad(rate.toFixed(3), 11)}` +
          `${pad(crashes > 0 ? (distance / crashes).toFixed(1) : '∞', 11)}${pad(`${(ratio * 100).toFixed(1)}%`, 11)}`,
      );
    }
  }
  const chosen = adopt.find((a) => a.rate <= SPAWN_TARGET_RATE);
  const gap = chosen ? chosen.gap : SPAWN_GAPS[SPAWN_GAPS.length - 1];
  const vis = adopt.find((a) => a.gap === gap)!.visible;
  console.log(
    `
採用基準（衝突/距離 ${SPAWN_TARGET_RATE} 以下の最小間隔）: ${gap}${chosen ? '' : '（基準を満たす間隔なし。最大を採用）'}` +
      ` / 車が見える時間 ${(vis * 100).toFixed(1)}%（目安 ${SPAWN_MIN_VISIBLE * 100}% 以上: ${vis >= SPAWN_MIN_VISIBLE ? '満たす' : '満たさない'}）`,
  );
}
if (process.argv.includes('--spawn-only')) {
  spawnTable();
  process.exit(0);
}

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

// レーン変更中の throttle: 判断に使う余裕を「目標レーンのみ」（現行）と「現在→目標の間（両端含む）の最小」で比べる
function pathPolicy(c: LaneConfig): Policy<ObsLaneDecision> {
  return {
    initial: { idx: Math.floor(c.spec.centers.length / 2), throttle: 0 },
    decide: (s, current) => {
      const { speed, cl } = observeClearances(s, c);
      const idx = selectLaneIdx(cl, current.idx, c.margin);
      const lo = Math.min(current.idx, idx);
      const hi = Math.max(current.idx, idx);
      const pathCl = Math.min(...cl.slice(lo, hi + 1));
      return { idx, throttle: pathCl < c.throttleNear ? 0 : speed < 0.8 ? 1 : 0 };
    },
    toAction: (d, s) => ({ steer: laneSteer(s.playerX, c.spec.centers[d.idx]), throttle: d.throttle }),
  };
}
console.log('\n【レーン変更中の throttle: 目標レーンの余裕のみ（現行）vs 現在→目標の最小の余裕（5レーン+補償、m=0.1、near=0.3）】');
for (const [name, seeds] of [['シード 1〜20', SEEDS], ['シード 21〜60', HOLDOUT]] as const) {
  ruleRate = evaluate(makePolicy('rule-raw'), L, seeds).rate;
  console.log(`\n${name}`);
  console.log(header);
  const c5 = cfg(LANES5, 0.1, 0.3, true);
  console.log(line('現行（目標レーンの余裕のみ）', evaluate(lanePolicy(c5), L, seeds)));
  console.log(line('変種（現在→目標の最小の余裕）', evaluate(pathPolicy(c5), L, seeds)));
}

spawnTable();

// 判断の「周期 period」と「遅延 L」を分けた比較（製品方式: 5レーン+遅延補償。補償の L は実際の遅延 L に合わせる）。
// 旧方式は応答を待ってから次を送る（period = L）。新方式は重ねて送る（period 0.15）
type PRow = { crashes: number; distance: number; rate: number; perCrash: number; visible: number };
function evaluateP<D>(policy: Policy<D>, lat: number, period: number, seeds: number[]): PRow {
  let crashes = 0;
  let distance = 0;
  let visible = 0;
  for (const seed of seeds) {
    const r = runEpisode(policy, seed, SECONDS, lat, undefined, period);
    crashes += r.crashes;
    distance += r.distance;
    visible += r.visibleRatio;
  }
  return { crashes, distance, rate: crashes / distance, perCrash: crashes > 0 ? distance / crashes : Infinity, visible: visible / seeds.length };
}
const pline = (label: string, r: PRow) =>
  `${label.padEnd(36, ' ')}${pad(String(r.crashes), 8)}${pad(r.distance.toFixed(1), 10)}${pad(r.rate.toFixed(3), 11)}` +
  `${pad(Number.isFinite(r.perCrash) ? r.perCrash.toFixed(1) : '∞', 11)}${pad(`${(r.visible * 100).toFixed(1)}%`, 10)}`;
const pheader = `${'方式'.padEnd(36, ' ')}${pad('衝突', 8)}${pad('距離', 10)}${pad('衝突/距離', 11)}${pad('距離/衝突', 11)}${pad('車が見える', 10)}`;
const prodPolicy = (compL: number, margin: number) =>
  lanePolicy({ spec: LANES5, margin, throttleNear: THROTTLE_NEAR, compensateL: compL, round: true });

console.log('\n【判断の周期 period と遅延 L の比較（5レーン+補償、m=0.1。補償の L は遅延 L と同じ。120 秒、V_CAR と出現間隔は既定値）】');
const PERIOD = 0.15;
const LS = [0.35, 0.45, 0.55];
const bestL = { value: LS[0], rate: Infinity };
for (const [name, seeds] of [['シード 1〜20', SEEDS], ['シード 21〜60', HOLDOUT]] as const) {
  console.log(`\n${name}`);
  console.log(pheader);
  console.log(pline('noop', evaluateP(makePolicy('noop'), 0.55, 0.55, seeds)));
  console.log(pline('旧: period=0.55, L=0.55', evaluateP(prodPolicy(0.55, 0.1), 0.55, 0.55, seeds)));
  for (const l of LS) {
    const r = evaluateP(prodPolicy(l, 0.1), l, PERIOD, seeds);
    if (seeds === SEEDS && r.rate < bestL.rate) { bestL.value = l; bestL.rate = r.rate; }
    console.log(pline(`新: period=${PERIOD}, L=${l}`, r));
  }
}
console.log(`\n【period=${PERIOD}、L=${bestL.value}（シード 1〜20 で最良）での MARGIN の比較】`);
for (const [name, seeds] of [['シード 1〜20', SEEDS], ['シード 21〜60', HOLDOUT]] as const) {
  console.log(`\n${name}`);
  console.log(pheader);
  for (const m of [0.05, 0.1, 0.2]) {
    console.log(pline(`MARGIN=${m}`, evaluateP(prodPolicy(bestL.value, m), bestL.value, PERIOD, seeds)));
  }
}

// 補償に使う L を、実際の遅延と分けて比べる（実遅延 0.45 / 0.55 × 補償 0.45〜0.75、period=0.15、m=0.1）。
// 車の向きを変えるのにも時間がかかるので、補償は実遅延より大きいほうがよい可能性がある
console.log('\n【補償の L を実遅延と分けて比較（period=0.15、m=0.1）】');
for (const [name, seeds] of [['シード 1〜20', SEEDS], ['シード 21〜60', HOLDOUT]] as const) {
  console.log(`\n${name}`);
  console.log(pheader);
  for (const real of [0.45, 0.55]) {
    for (const comp of [0.45, 0.55, 0.65, 0.75]) {
      console.log(pline(`実遅延 ${real} / 補償 ${comp}`, evaluateP(prodPolicy(comp, 0.1), real, PERIOD, seeds)));
    }
  }
}
