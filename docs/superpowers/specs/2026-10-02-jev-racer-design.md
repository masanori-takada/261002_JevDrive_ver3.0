# JevDrive ver3.0 設計仕様

作成日: 2026-10-02 / 作成: Sonnet 5.5

## 1. 目的

Ollama の投稿（2026-09-30）が紹介していた「意思決定モデル Nimble が、ローカル API `/v1/systemone` 経由でレーシングゲーム Ollama racer をリアルタイムに操作するデモ」と同等のものを作る。

- 意思決定モデル（Jev）: Vercel AI Gateway 経由の `typesafe-ai/jev`（`.env.local` の `JEV_MODEL`）
- 画像認識 AI: YOLO11n（COCO 学習済み、ONNX、ブラウザ内推論）
- ゲーム: 自作の後方視点（疑似3D）レーシングゲーム（Canvas）

非ローカル構成（Jev はクラウド側）である点が元デモとの差。`/api/systemone` という同名のエンドポイントを自前で用意し、見た目と構造を揃える。

## 2. スコープ

含む:
- Canvas のレースゲーム（左・右・加速・減速）
- 画面フレームからの物体検出と、コース端の検出
- 検出結果を Jev に渡し、目標レーンと加減速（Plan）を決めさせる Route Handler
- 手動操作（キーボード）と Jev 操作の切り替え、停止ボタン
- 単体テストと、実 Jev での完走確認

含まない（YAGNI）:
- チケット振り分け、モデルルーティング、モデレーション等の他用途
- YOLO の学習・微調整（検出精度が基準未満の場合のみ、別サブタスクとして追加）
- マルチプレイ、ランキング、永続化

## 3. アーキテクチャ

Next.js（App Router、TypeScript）。Vercel へそのままデプロイできる構成。

```
[racer] --frame--> [vision] --Observation--> [driver] --POST--> /api/systemone --> AI Gateway --> Jev
   ^                                            |                                      |
   +------------------ Action <-----------------+<-------------- Plan ---------------+
```

| ユニット | 責務 | 依存 |
|---|---|---|
| `racer` | ゲーム状態の更新と Canvas 描画。`step(state, action)` で操作を受け付ける。Jev 運転中は、毎フレーム `laneSteer(playerX, targetX)` が目標レーンへ操舵する | なし |
| `vision` | `detect(imageData) -> Detections`。YOLO11n（onnxruntime-web）で物体検出し、画素走査でコース端を取る | onnxruntime-web |
| `observation` | Detections を Jev 向けの `Observation` JSON に変換する純関数 | なし |
| `driver` | 約150ms周期（処理中は重ねない）で observation を送り、Jev の Plan（目標レーン・throttle）を受け取って保持する。タイムアウトと失敗時の保持を担う | racer, vision |
| `/api/systemone` | Observation を受け、3車線の余裕を計算して Jev に問い合わせ、Plan を返す。API キーはここだけが持つ | AI Gateway |

`vision` は `detect()` というインターフェースの裏に隠し、検出器を差し替え可能にする。色ブロブ検出は作らない（テストの正解はゲーム内部の座標から計算でき、予備は「直前の操作を維持」で足りるため）。

## 4. データ契約

```ts
type Observation = {
  frame: number;
  speed: number;              // 0..1 に正規化
  road: { left: number; right: number; centerOffset: number }; // -1..1
  obstacles: { cls: 'car' | 'truck' | 'bus' | 'motorcycle'; conf: number;
               x: number; y: number; w: number; h: number }[]; // 画面比 0..1
};
type Action = { steer: -1 | 0 | 1; throttle: -1 | 0 | 1 };           // ゲーム（racer）が受け取る操作
type Plan = { targetX: number; throttle: -1 | 0 | 1 };               // Jev の判断。targetX は 3 車線の中心（-2/3, 0, 2/3）。車は常に車線内に収まる
type SystemOneResponse = { plan: Plan | null; latencyMs: number; source: 'jev' | 'hold' }; // Jev が失敗したら plan は null
// クライアントが送る観測 Observation には、現在の目標レーン targetX（省略可）を含める。

// 【2026-10-02 変更】Jev は「左・直進・右」の生の操作ではなく、目標レーンと加減速を選ぶ（Plan）。
// サーバーが観測から 3 車線の余裕（clearance、遅延補償つき）を計算して Jev に渡し、Jev は目標レーン（3択）と throttle（3択）を選ぶ。
// ゲーム側の低レベル制御が、毎フレーム、目標レーンへ操舵する（steer = laneSteer(playerX, targetX)）。
// 理由: 判断の更新が約0.5秒に1回で、切りっぱなしだと衝突が多い。模擬実験で距離あたり衝突が約40%減（1.016→0.605）、
// 実 Jev・ブラウザ65秒でも 0.92→0.608（操作なしは約1.19）。
```

## 5. 検出方式

- COCO 学習済み YOLO11n を ONNX で使う。入力 320px 前後。目標は1フレーム 50ms 以下。
- COCO の `car` / `truck` / `bus` / `motorcycle` を障害物として扱う。
- ゲームは後方視点で、前走車・障害物を車の画像で描く（COCO が前後の写真で学習されているため）。
- コース端は COCO にないため、画面下部の固定行を走査し、路面色と路外色の境界から求める。
- **検出基準ゲート**: 実ゲーム画面 100 枚で障害物の再現率 0.8 以上。未満なら微調整サブタスクを追加し、ユーザーに報告して止まる。

## 6. Jev 連携の注意

- Jev（`typesafe-ai/jev`）は言語モデルではなく評価モデル。AI SDK 7 の `experimental_evaluate` で、共有状態（観測 JSON）と型付き質問（steer と throttle の choice）を渡し、選択肢を得る（2026-10-02 に実機確認）。
- 応答が失敗・タイムアウト・想定外の選択肢だった場合は `hold` として扱い、直前の Action を維持する。

## 7. エラー処理

- Jev が 1000ms 以内に返さない、またはエラーを返した場合は直前の Plan を維持する（`source: 'hold'`）。実測の応答時間は初回 500〜800ms、ウォームアップ後 335〜390ms のため、当初の 400ms から延長した（Jev の回答は A=延長で確率 0.51 と採用基準 0.8 未満だったが、A と C は両立し、実測でも質問数を減らして改善しなかったため A を採用。docs/decisions/jev-log.md）。
- 連続5回失敗した場合は、画面に「Jev 応答なし」を出し、自動で停止する。
- `AI_GATEWAY_API_KEY` 未設定ならサーバー起動時にエラーにする。
- クレジット保護のため、Jev 操作は1回の連続稼働を最大3分で自動停止する。停止ボタンも常に出す。

## 8. セキュリティ

- `.env.local` はコミット・ログ出力・クライアント送信をしない。値を表示しない。
- API キーを参照するのは Route Handler のみ。クライアントには渡さない。
- `/api/systemone` は同一オリジンからの呼び出しのみ許可し、入力をスキーマ検証する。

## 9. テスト

- `observation`: 固定の Detections から期待どおりの JSON になること。
- `vision`: デコード・コース端検出は合成データの単体テスト。検出器そのものは、決定的なシーン（`makeScene`）100 枚を描画し、ゲーム内部の座標から計算した正解ボックスとの再現率で検証する（基準ゲート）。
- `/api/systemone`: Jev をモックし、正常・タイムアウト・不正応答・キー未設定を確認する。
- `racer`: Action 適用後の状態更新（衝突、場外、速度）を確認する。
- 結合: モック Jev で 60 秒間動作すること。最後に実 Jev で完走できること。

## 10. 進行ルール

サブタスクごとに、変更点とテスト結果を3行で要約して停止し、Jev の承認（OK）を待ってから次へ進む。

| # | サブタスク | 担当 | エフォート |
|---|---|---|---|
| 1 | 仕様書 | Sonnet 5.5 | medium |
| 2 | 実装計画 | Sonnet 5.5 | medium |
| 3 | 雛形と環境確認 | gpt-5.6-luna | medium |
| 4 | racer | gpt-5.6-luna | medium |
| 5 | vision（YOLO 推論、コース端、基準ゲート） | gpt-5.6-luna | medium |
| 6 | `/api/systemone` と Jev 連携 | gpt-5.6-luna | medium |
| 7 | driver による結合 | gpt-5.6-luna | medium |
| 8 | コードレビュー | Sonnet 5.5 | medium |

注: 実装担当は当初 gpt-5.6-luna（Codex 経由）の予定だったが、Codex の Windows サンドボックス昇格が起動できなかったため、2026-10-02 に Sonnet 5.5 へ一元化した。オーケストレーター（進行・要約・確認）、実装サブエージェント、レビュー専用サブエージェントは別々に動かす。表の「gpt-5.6-luna」は「Sonnet 5.5（実装サブエージェント）」、サブタスク8は「Sonnet 5.5（レビュー専用サブエージェント）」と読み替える。

## 11. リスク

- ultralytics の重みは AGPL-3.0。個人利用なら問題ないが、一般公開する場合は YOLOX-Nano（Apache-2.0）へ切り替える。
- COCO 学習済みモデルがゲームの絵を検出できない可能性（基準ゲートで検出し、微調整へ分岐）。
- Jev の遅延と無料枠の制限（1000ms 保持と3分停止で緩和）。
- 作業フォルダは git リポジトリではないため、仕様書はコミットしない。
