# フェーズ2 レビュー（2026-10-02、7e72afb 以降の差分）

## 自動チェック

- `npm test`: 28 ファイル / 155 テスト すべて成功
- `npm run typecheck`: エラーなし
- `npm run build`: 成功（3000 番ポートは空きを確認してから実行。ルート `/`、`/debug`、`/api/systemone`）
- `npm run gate`: 再現率 0.990（197/199）、適合率 0.990（197/199）、平均推論 30.0ms（Node CPU）、PASS（基準 0.8）。適合率はゲートの判定条件に含まれていない（再現率のみ）

## 高

指摘なし

## 中

- src/vision/lanes.ts:8 — LANES5 の `halfWidth: 0.4` が、ゲームの衝突判定幅 `HIT_DX = 0.55`（src/game/racer.ts:26）より狭い。製品の判断は `HIT_DX` を使わず 0.4 を直書きしている。例: 障害物 u=0.45・z=0.5 は、レーン 0.4 とレーン 0.8 の余裕には入るが、レーン 0（|0.45-0|=0.45 > 0.4）には入らない。center の余裕が 1 と報告され、Jev は center を維持するが、実際は |0.45-0|<0.55 なので z<=0.1 で衝突する。各レーンの両側 0.15 の帯が「安全」と誤って渡される。実機の距離あたり衝突 0.608 が残る一因になりうる — 修正案: `halfWidth` を `HIT_DX`（0.55）以上、または車幅 + 横移動の余裕を含む値にして、sim（scripts/sim.ts にレーン幅のグリッドを追加）で 0.4 / 0.5 / 0.55 を比べて採用する。`HIT_DX` を racer.ts から export して共有すると定数のずれを防げる

## 低

- src/components/RacerGame.tsx:131-135 — 停止ボタン押下時に `analyze` が処理中だと、`onStatus`（行 143-151）が `detectionsRef.current = []` で消した後に、`analyze` の完了で行 133 が古い検出を書き戻す。ループ（行 85-90）は `jevRunningRef` に関係なく `detectionsRef` を描くため、停止後も緑のボックスが残る。サイクルの大半は Jev 待ちだが、検出の約 90ms の間に押せば再現する — 修正案: 行 133 を `if (jevRunningRef.current) detectionsRef.current = r.detections` にする、または描画側を `jevRunningRef.current` でガードする
- src/server/schema.ts:5 — `ActionSchema` はどこからも使われていない（`rg` で参照ゼロ）。契約が Plan に変わった名残 — 修正案: 削除する（`Action` 型は racer が使うので types.ts は残す）
- src/vision/lanes.ts:43-46 — `laneClearances` は tests 以外から呼ばれない（製品は `observationClearances` を使う）。LANES3（行 7）は sim/テストのみが使う — 修正案: `laneClearances` と対応するテストを削除する。LANES3 は sim 比較用として残すなら、コメントで「sim 専用」と明記する
- src/sim/lane.ts（全体）、src/sim/policies.ts:33-40 — 3 レーン・世界座標の旧 `lane-target` は、`scripts/sim.ts:48,49,109` のラベルで「現行」と書かれているが、製品は 5 レーン・観測ベースの方式（`lane-obs`）に移っている。比較基準としては有効だが、「現行」の表記は誤解を招く — 修正案: ラベルを「旧・世界座標 3 レーン（参考）」に改める
- src/sim/lane.ts:46、src/sim/lane-obs.ts:22 — 互換のための再 export（`laneSteer`、`decideFromClearances`、`selectLaneIdx`）が残っている。`lane-obs.ts` の `decideFromClearances` 再 export は `scripts/jev-accuracy.ts:9` と tests が使うので、参照元を `src/vision/lane-plan` に直せば再 export は不要 — 修正案: import 元を製品側に付け替えて再 export を削除する
- docs/superpowers/specs/2026-10-02-jev-racer-design.md:41,45,81 — §4 以外の記述が古い。行 41 は `applyAction(action)`、行 45 は「Action を返す」、行 81 は「steer と throttle の choice」。実装は Plan（目標レーンと throttle）で、Jev の質問は lane と throttle — 修正案: 「Plan を返す」「lane（5 択）と throttle の choice」に直す。また §4 の `Observation` の型リテラル本体（行 52-58 付近）に `targetX?` が無く、コメントでのみ触れている。型に `targetX?: number` を足す
- src/server/jev.ts:50 — Jev が想定外の選択肢を返した場合、ログを出さずに `null`（hold）を返す。タイムアウトや例外はログされるのに、この経路だけ原因が追えない — 修正案: `console.error('[jev] unexpected choice:', r.answers.lane.choice, r.answers.throttle.choice)` を足す（選択肢名のみ、秘密は含まれない）
- docs/superpowers/plans/2026-10-02-jev-racer-phase2.md:57（P4）— 「キー未設定時に `instrumentation.ts` が throw したときの Next 16 の挙動を `next dev` で確認し記録する」について、`docs/` に記録が見当たらない（`rg instrumentation docs` は前回レビューの「未確認」記述と計画のみ）。実 Jev の hold 率の記録もなし（jev-log.md の補足は衝突数・失敗 0・応答時間のみ） — 修正案: 結果を jev-log.md か本計画の末尾に 1 行ずつ記録する。未実施なら未実施と明記する
- docs/decisions/jev-log.md の P2 補足 — Jev の選択 A の確率が 0.48 で、計画（phase2.md 16 行目）の採用基準 0.8 未満。オーケストレーターが「元に戻せる」として続行した旨は書かれているが、50ms 目標は未達（約 90ms、WASM フォールバック約 132ms）のまま — 修正案: 最終報告で「P2 は目標未達（90ms）、基準 0.8 未満の判断を続行した」と明記し、ユーザーの承認を取る

## 要確認（推測を含む。重大度は付けない）

- src/driver/driver.ts:66-98 と src/vision/detector.ts:29-41 — `analyze` が 3000ms で打ち切られると `inFlight` が解除されるが、裏では `detector.detect`（`session.run`）が走り続ける。次の tick が同じ ONNX セッションで `run` を重ねて呼ぶので、onnxruntime-web がセッションの同時実行を拒否する場合、連続失敗になる（`maxFailures=5`）。また、`create()` にはウォームアップ推論が無く、WebGPU は初回の `run` でシェーダのコンパイルが走るため、初回だけ 3000ms を超えうる。実機（WebGPU）で初回 tick の所要時間と、タイムアウト後の次の `run` の挙動を確認したい — 修正案: `create()` の末尾で 1 回ダミー推論を実行する。`detect` を内部で直列化（実行中の Promise を待つ）する
- src/vision/lane-plan.ts:31 — throttle を「選んだ目標レーン」の余裕で決めている。レーン変更中（0.4 の移動に約 0.5 秒）は車がまだ元のレーンにいるので、元のレーンの障害物が近くても目標レーンが空いていれば accelerate する。sim（0.605）と実機（0.608）が一致しているため大きな問題ではないはずだが、「現在のレーンの余裕」との min を取る案を sim で試したか確認したい
- src/vision/detector.ts:30-34 — WebGPU を `'gpu' in navigator` だけで選ぶ。アダプタが取れない・初期化に失敗した場合は `executionProviders: ['webgpu','wasm']` により ORT が wasm へフォールバックする想定（コードとテストでは未検証。ブラウザでの失敗時の動作は未確認）。フォールバックのとき `numThreads` は WASM 用に決まっているので、スレッド数は適切

## 確認済み（問題なし）

- 契約の整合: `Plan`（types.ts:10）、`SystemOneResponse`（types.ts:11）、`Observation.targetX`（types.ts:8）、`ObservationSchema.targetX`（schema.ts:8、±1.3 は playerX の範囲と一致）、route.ts（`plan`、`source`）、driver.ts（`res.plan`、`getTargetX`）、RacerGame.tsx（`jevPlanRef`、`apply`）、spec §4 の型定義が一致。製品コードに `res.action` など古い `action` の参照は無い（`rg` で確認）
- API キー: `AI_GATEWAY_API_KEY` と `JEV_MODEL` の参照は src/app/api/systemone/route.ts、src/instrumentation.ts、scripts/（check-env.mjs、ask-jev.mjs、jev-accuracy.ts）と tests のみ。`.env.local` は読んでいない。クライアント側（components、driver、vision、game）に参照なし
- COOP/COEP ヘッダ（next.config.ts）: COOP/COEP はレスポンスヘッダの追加のみで、`/api/systemone` の Origin / `Sec-Fetch-Site` の判定（route.ts:10-23）とレート制限（route.ts:26-29、rate-limit.ts）のコードには影響しない。同一オリジンの `/ort`、`/models` は `require-corp` で読み込める（ビルドの静的配信と自動チェックでは破損なし。ブラウザでの確認は報告済みの実測に依拠）
- src/server/jev.ts: タイマーは `finally` で `clearTimeout`。`Promise.race` で負けた `evaluate` の後からの reject は race が購読済みなので未処理 rejection にならない。`r.answers` の欠落は TypeError として catch され `null`。`targetX` からの現在レーンは `nearestLaneIdx`（同距離なら小さい番号）。`Z_RATE` は `racer.ts` から import（lane-plan.ts:2）しており、直書きではない。`PASSED_Z=-0.02` は racer.ts:74 の衝突判定下限と一致
- src/vision/lanes.ts の逆投影: `t=(y+h-HORIZON)/(BASE_NEAR-HORIZON)`、`cx=x+w/2`、`u=playerX+(cx-0.5)/roadHalf(t)` は projection.ts の `obstacleBox`、`screenX`、`baseY`、`roadHalf` の逆演算と一致。`t<=0`（地平線以下）、`t>1.1`、非有限値は除外。`roadHalf(t)>=0.05` なのでゼロ除算なし。`playerX` に使う `road.centerOffset` は、`readRoad` の定義（道路中心 = 0.5 - playerX*roadHalf）と一致
- src/vision/lane-plan.ts: ヒステリシス（現在との差が margin 未満なら維持）、同点は中央に近い順・同距離なら左。遅延補償 `speed*Z_RATE*LATENCY_S` は、sim（lane-obs.ts:25-28）と同じ式。`MARGIN`、`THROTTLE_NEAR`、`LATENCY_S` は sim/config.ts が製品から import
- src/driver/driver.ts: `analyze` は `Promise.race` + `finally` でタイマー解除。`inFlight` は `finally` で必ず解除。停止条件は 5 回連続失敗（fail）、3 分上限（tick 冒頭）、手動停止、のいずれも `stop` に集約され、`clearInterval` される。処理中の stop は、post 後の `!this.status.running` チェックで `apply` されない。`failures` は成功で 0 に戻る
- src/components/RacerGame.tsx の後始末: raf、keydown/keyup/blur リスナー、`driver.stop` をアンマウントで実行。読み込み中のアンマウントは `mountedRef` で Driver を作らない。停止時に目標を最寄りレーンへ戻す。`setStatus` を unmounted で呼んでも React 19 では警告なし
- sim と製品の依存の向き: `src/sim/*` が製品（game、vision、lib）を import する一方向のみ。`src` の sim 以外のファイルから `sim/` への import は無い（`rg` で確認）。scripts と tests だけが両方を import
- src/vision/backend.ts と tests/vision/backend.test.ts: `crossOriginIsolated` でなければ numThreads=1、あれば `min(4, cores-1)`（下限 1）。コア数 1 でも 1。WebGPU が無ければ wasm のみ。`getDetector` は失敗時に Promise を破棄し、再試行できる（detector.ts:67-72）
- src/vision/preprocess.ts: ブラウザ（detector.ts）と gate.ts が同じ `toTensorData` を使う。`computePrecision` は `computeRecall` の割り当てと一致
- scripts/gate.ts: 再現率 0.990 は /debug の 0.995 と近い（Node CPU とブラウザで前処理は共通）。適合率 0.990 を出力
- P4: `ai` は `7.0.127` に固定（package.json）。`experimental_evaluate` の関数エクスポートを tests/server/ai-contract.test.ts が検査。instrumentation、post、route のタイムアウトと `JEV_MODEL` 未設定のテストが追加済み
- 計画 P3 の合格基準: 模擬実験で 1.016→0.605（約 40% 減）、実 Jev 65 秒で 0.608（旧 0.92、操作なし約 1.19）、失敗 0 が jev-log.md に記録されている（実機の再実行はしていない。コンソールエラーなしの記録は jev-log.md に無い）
- レート制限と Origin チェックは変更なし（フェーズ2 の差分は route.ts の `plan` への置換のみ）

---

## 対応状況（2026-10-02 追記）

修正範囲は Jev の判断（選択肢 A、確率 0.96）。docs/decisions/jev-log.md を参照。

### 修正済み
- 中: `src/vision/lanes.ts` — 5レーン（と3レーン）の半幅を `HIT_DX`（0.55、`src/game/racer.ts` から export）に統一。模擬実験で距離あたり衝突が 0.605→0.545（シード 1〜20）、0.616→0.558（21〜60）に改善。
- 低: `RacerGame.tsx` — 停止後は検出ボックスを書き戻さない。
- 低: `detector.ts` — WebGPU のスクリプト読み込み失敗・セッション作成失敗のどちらでも WASM で作り直す（純関数 `wasmFallback` はテスト済み。実機での WebGPU 失敗時の動作は未確認）。
- 低: 未使用コード（`ActionSchema`、`laneClearances`）の削除、sim の旧 lane-target のラベルを「世界座標・比較用」に変更。
- 低: `jev.ts` — 想定外の選択肢のとき `console.error` を出す。
- 低: 仕様書の古い記述（§3 の構成表、§7）を Plan 構成に更新。

### 修正中に見つかった不具合（対応済み）
- 再 export の削除で `scripts/jev-accuracy.ts` が実行時に落ちた。`npm run typecheck` が増分キャッシュ（`tsconfig.tsbuildinfo`）のため検出できなかったので、`typecheck` を `--incremental false` に変更し、import を直した。

### 検証
- vitest 157/157、typecheck（フル）、build、`npm run gate`（再現率 0.990、適合率 0.990）は成功。
- 実 Jev の判断精度（`npm run jev-accuracy`、半幅 0.55）: 目標レーン一致 98%、throttle 一致 97%、両方一致 95%。
- ブラウザの実運転（実 Jev、65 秒）: 失敗 1、60fps、コンソールエラーなし。距離 38.1・衝突 26（距離あたり 0.68）。1 回の実験は運のぶれが大きい（前回は 0.608）。

### 未対応（記録のみ）
- 要確認: レーン変更中の throttle は、元のレーンの障害物を見ない（目標レーンの余裕だけで決まる）。
- 要確認: analyze が打ち切られても、裏の `session.run` は走り続け、次の推論と重なる可能性がある。WebGPU の初回シェーダコンパイルが 3000ms を超える環境の可能性（実測の初回は 156ms）。
- 低: 実 Jev の衝突数・hold 率の記録は jev-log.md と本追記に簡易に残した。継続的な記録の仕組みは無い。
- P2 の目標（推論 50ms 以下）は未達（WebGPU で約 90ms）。Jev の選択 A（確率 0.48）は採用基準未満だが、元に戻せるため続行した（ユーザーの確認を要する事項として報告済み）。残る手段: 入力サイズ縮小＋再学習、Web Worker。
