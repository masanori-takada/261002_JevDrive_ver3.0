# デモ動画の録画方法と、Playwright MCP の課題メモ

公開用のデモ動画を追加しました。

- [デモ動画（jev-drive-demo-x2.mp4）](./jev-drive-demo-x2.mp4)
- [動画を直接開く・ダウンロードする](https://raw.githubusercontent.com/masanori-takada/261002_JevDrive_ver3.0/main/docs/demo/jev-drive-demo-x2.mp4)

元の動画（`jev-drive-demo.mp4`）や `motion-check.png` は引き続きgitの対象外です（`.gitignore`）。判断は Jev（docs/decisions/jev-log.md）。

## 最終的な録画方法（Windows の画面録画＋Playwright MCP で操作）

Playwright MCP のブラウザは、Windows 上に表示される Chrome の窓。これを操作しながら、その窓の範囲を ffmpeg で画面録画する。

1. 本番ビルドで起動する（開発サーバーは初回コンパイルが遅く、運転開始が失敗するため）: `npm run build` → `npm run start -- -p 3000`。
2. PowerShell で Chrome の窓を最前面にして、位置と大きさを決める（`SetProcessDPIAware`、`MoveWindow(h, 0, 0, 1366, 720)`、`SetForegroundWindow`）。
3. ffmpeg で画面の範囲を録画（バックグラウンド）:
   `ffmpeg -f gdigrab -framerate 30 -offset_x 0 -offset_y 0 -video_size 1366x720 -t 100 -i desktop -c:v libx264 -preset ultrafast -crf 24 -pix_fmt yuv420p screen.mp4`
4. 録画中に、Playwright MCP で `http://localhost:3000/` を開き、「モデル準備完了」を待って「Jev に運転させる」を押し、約 90 秒待つ。
5. ブラウザの枠（タブ、アドレスバー、警告バー）を切り落として mp4 にする:
   `ffmpeg -ss 2 -i screen.mp4 -vf "crop=1350:566:8:146" -c:v libx264 -preset medium -crf 26 -pix_fmt yuv420p -movflags +faststart -an jev-drive-demo.mp4`

## Playwright MCP の課題と対応

| 課題 | 原因・影響 | 対応 |
|---|---|---|
| 録画を開始するツールが無い | `page.video()` が null（録画なしのコンテキスト） | `browser_run_code_unsafe` で `browser.newContext({ recordVideo })` を作れば録画できる（試して成功。webm が大きく、約 20MB/112 秒）。最終的には Windows の画面録画のほうが簡単で綺麗なので、そちらを採用（ユーザーの提案） |
| `browser_run_code_unsafe` で状態が次の呼び出しに残らない | 呼び出しごとに実行環境が分かれる（`globalThis` は消える） | `page.context().browser().contexts()` から対象を探し直す |
| `gdigrab -i title=...`（窓単位の取得）が白紙になる | Chrome の GPU 描画は GDI で取れない | 画面の範囲指定（`-i desktop` ＋ offset/size）で録画。窓が最前面にある必要がある |
| 録画中に Chrome の「サポートされていないコマンドラインフラグ」警告バーが出る | Playwright が付ける起動フラグ | 録画後に crop で切り落とす |
| `browser_wait_for` は 1 回 30 秒まで・既定の待ちは 5 秒 | ツールの仕様 | 長い待ちは繰り返す。条件待ちは `browser_run_code_unsafe` の中でループ |
| 作業フォルダに `.playwright-mcp/`（スナップショット、コンソールログ）が増える | MCP の出力先がカレント | `.gitignore` に追加し、作業後に削除 |
| 組み込みブラウザ（Claude_Browser）は窓が非表示だと `requestAnimationFrame` が止まる | ブラウザが非表示扱い | ゲームの動作確認は Playwright MCP（表示される Chrome）で行う |
| 開発サーバーの初回アクセスが遅い（コンパイル約 28 秒） | `next dev` はオンデマンドでコンパイル | 録画・実機確認は本番ビルドで行う。ウォームアップの再試行（4 回）も入れた |

## 録画で見つかった製品の課題と対応（Jev の判断）

- 運転開始の直後に「Jev 応答なし」で止まる → ウォームアップ（再試行 4 回）を追加。
- モデル読み込みが長く、その間もゲームが動いて衝突する → ページ表示後に事前読み込み＋進捗表示、開始前は待機状態。
- 車が多すぎる → 出現間隔 1.2 → 2.4。
- 車と路面の速度感が合わない → 破線と障害物を同じ奥行きの式で動かし、障害物は自車より遅く走る前方の車（`V_CAR`）に。
- 判断が遅い → リクエストを重ねて送り、古い応答を捨てる（判断 約 2〜3 回/秒 → 約 5 回/秒）。
