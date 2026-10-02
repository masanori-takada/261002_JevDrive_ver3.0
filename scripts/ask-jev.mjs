import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { experimental_evaluate as evaluate } from 'ai';

// 使い方: node scripts/ask-jev.mjs <質問JSONファイル>
// 質問JSON: { "title": "見出し", "state": "状況の説明", "instructions": "判断してほしい点",
//             "options": { "A": "選択肢Aの説明", "B": "選択肢Bの説明" } }
// 秘密情報（API キー・トークン等）は質問に含めないこと。
// Jev は評価モデル（共有状態＋型付き質問 → 選択・確率）。テキスト生成 API では呼べない。

// 採用の条件（これ未満なら人間に確認する）
const MIN_CHOICE_PROB = 0.8;   // 選んだ選択肢の確率
// 「情報は十分か」の確率（enough）は校正が未確認のため、判断には使わず記録だけする

// .env.local を読み込む（値は表示しない）
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const file = process.argv[2];
if (!file) {
  console.error('質問JSONファイルを指定してください');
  process.exit(2);
}
const q = JSON.parse(readFileSync(file, 'utf8'));

const t0 = Date.now();
let result;
try {
  const r = await evaluate({
    model: process.env.JEV_MODEL,
    state: q.state,
    questions: {
      decision: { type: 'choice', instructions: q.instructions, criteria: q.options },
      enough: {
        type: 'boolean',
        instructions: '上記の状況の説明だけで、この判断を下してよいか。重要な情報が欠けている、または人間の確認が必要なら false。',
      },
    },
    abortSignal: AbortSignal.timeout(60000),
  });
  const choice = r.answers.decision.choice;
  const prob = r.answers.decision.probabilities?.[choice] ?? null;
  const enough = r.answers.enough.probability;
  const accepted = prob !== null && prob >= MIN_CHOICE_PROB;
  result = {
    ok: true,
    accepted,
    choice,
    probabilities: r.answers.decision.probabilities ?? null,
    enough,
    ms: Date.now() - t0,
  };
} catch (e) {
  result = { ok: false, accepted: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
}

// 判断ログに追記する（追跡用）
mkdirSync('docs/decisions', { recursive: true });
const summary = result.ok
  ? `${result.choice}（${result.accepted ? '採用' : '不採用→人間に確認'}。確率 ${JSON.stringify(result.probabilities)}、情報十分 ${result.enough.toFixed(2)}）`
  : `失敗（${result.error}）`;
appendFileSync(
  'docs/decisions/jev-log.md',
  `\n## ${new Date().toISOString()} ${q.title ?? '無題'}\n\n- 結果: ${summary}\n- 応答時間: ${result.ms}ms\n\n<details><summary>質問</summary>\n\n状況: ${q.state}\n\n判断: ${q.instructions}\n\n選択肢: ${JSON.stringify(q.options)}\n\n</details>\n`,
);

console.log(JSON.stringify(result));
process.exit(result.ok ? 0 : 1);
