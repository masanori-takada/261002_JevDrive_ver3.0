'use client';
import { useEffect, useReducer, useRef, useState } from 'react';
import { detailToRows, type DetailRowView } from '../driver/detail-view';
import { Driver, type DriverStatus } from '../driver/driver';
import { INITIAL_MODEL_LOAD, modelLoadLabel, modelLoadReducer } from '../driver/model-load';
import { postObservation } from '../driver/post';
import { warmUpJev } from '../driver/warm-up';
import { manualAction } from '../game/keys';
import { baseY, screenX } from '../game/projection';
import { createGame, DT, step, type GameState } from '../game/racer';
import { renderGame } from '../game/render';
import { isRunning, nextStarted } from '../game/run-state';
import { laneSteer } from '../game/steer';
import type { Detection, JevDetail, Plan } from '../lib/types';
import { nearestLaneIdx } from '../vision/lane-plan';
import { LANES5 } from '../vision/lanes';
import { createVision } from '../vision/pipeline';

const W = 640;
const H = 360;
const IDLE: DriverStatus = { running: false, source: 'idle', latencyMs: null, failures: 0, stopReason: null, ratePerSec: null };

/** 水平棒グラフ 1 本（幅は CSS transition で滑らかに動く） */
function BarRow({ row }: { row: DetailRowView }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '3em 1fr 3.2em', gap: 8, alignItems: 'center', fontSize: 13 }}>
      <span style={{ color: row.highlight ? '#ffcc00' : '#bbb' }}>{row.label}</span>
      <div style={{ background: '#2a2a2a', height: 12, borderRadius: 2, overflow: 'hidden' }}>
        <div
          style={{
            width: `${row.widthPct}%`,
            height: '100%',
            background: row.highlight ? '#ffcc00' : '#777',
            transition: 'width 150ms ease-out',
          }}
        />
      </div>
      <span style={{ textAlign: 'right', color: row.highlight ? '#ffcc00' : '#bbb', fontVariantNumeric: 'tabular-nums' }}>
        {row.percentText}
      </span>
    </div>
  );
}

function DetailPanel({ title, rows }: { title: string; rows: DetailRowView[] }) {
  return (
    <div style={{ display: 'grid', gap: 3 }}>
      <div style={{ fontSize: 13, color: '#eee', fontWeight: 600 }}>{title}</div>
      {rows.map((r) => (
        <BarRow key={r.label} row={r} />
      ))}
    </div>
  );
}

type Vision = Awaited<ReturnType<typeof createVision>>;

// 注: この画面コンポーネントはブラウザ依存（canvas・requestAnimationFrame・WebGPU）のため自動テスト対象外。
// 判定ロジックは src/game/run-state.ts、src/driver/model-load.ts、src/driver/warm-up.ts に純関数として出してテストしている。
export function RacerGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GameState>(createGame(1));
  const keysRef = useRef(new Set<string>());
  const jevPlanRef = useRef<Plan>({ targetX: 0, throttle: 0 });
  const jevRunningRef = useRef(false);
  const detectionsRef = useRef<Detection[]>([]);
  const driverRef = useRef<Driver | null>(null);
  const mountedRef = useRef(true);
  /** 待機状態から動き出したか（矢印キーの最初の押下、または Jev 運転開始で true） */
  const startedRef = useRef(false);
  /** モデル事前読み込みの Promise。createVision は 1 回だけ呼び、ボタン押下時も同じものを待つ */
  const visionRef = useRef<Promise<Vision> | null>(null);
  const loadStartRef = useRef<number | null>(null);
  const busyRef = useRef(false);

  const [status, setStatus] = useState<DriverStatus>(IDLE);
  const [started, setStarted] = useState(false);
  const [attempt, setAttempt] = useState<{ n: number; max: number } | null>(null);
  const [busy, setBusy] = useState<'model' | 'jev' | null>(null);
  const [modelLoad, dispatchLoad] = useReducer(modelLoadReducer, INITIAL_MODEL_LOAD);
  const [detail, setDetail] = useState<JevDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hud, setHud] = useState({ speed: 0, distance: 0, crashes: 0 });

  /** 自車を描かない検出用フレームを作る */
  function captureFrame(): HTMLCanvasElement {
    if (!offscreenRef.current) {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      offscreenRef.current = c;
    }
    const c = offscreenRef.current;
    renderGame(c.getContext('2d', { willReadFrequently: true })!, stateRef.current, {
      width: W, height: H, player: false,
    });
    return c;
  }

  /** モデルの読み込みを開始する（開始済みなら同じ Promise を返す）。失敗時は再試行できるよう Promise を捨てる */
  function ensureVision(): Promise<Vision> {
    if (visionRef.current) return visionRef.current;
    loadStartRef.current = Date.now();
    const p = createVision();
    visionRef.current = p;
    p.then(
      () => {
        // アンマウント後は state を更新しない
        if (mountedRef.current) dispatchLoad({ type: 'ready' });
      },
      (e) => {
        if (visionRef.current === p) visionRef.current = null;
        if (mountedRef.current) dispatchLoad({ type: 'failed', message: e instanceof Error ? e.message : String(e) });
      },
    );
    return p;
  }

  function retryLoad() {
    dispatchLoad({ type: 'retry' });
    ensureVision().catch(() => {});
  }

  // ページ表示後、アイドル時にモデルを事前読み込みする（requestIdleCallback が無ければ setTimeout）
  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    const run = () => {
      ensureVision().catch(() => {});
    };
    if (w.requestIdleCallback) {
      const h = w.requestIdleCallback(run);
      return () => w.cancelIdleCallback?.(h);
    }
    const h = setTimeout(run, 0);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 読み込み中は 1 秒ごとに経過秒を更新する（状態が変わる・アンマウントでタイマーを止める）
  useEffect(() => {
    if (modelLoad.status !== 'loading') return;
    const t = setInterval(() => {
      const start = loadStartRef.current ?? Date.now();
      dispatchLoad({ type: 'tick', elapsedSec: Math.floor((Date.now() - start) / 1000) });
    }, 1000);
    return () => clearInterval(t);
  }, [modelLoad.status]);

  useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d')!;
    let acc = 0;
    let last = performance.now();
    let raf = 0;
    let frames = 0;

    const down = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      // 矢印キーの最初の押下で待機から発進する
      const next = nextStarted(startedRef.current, e.key);
      if (next !== startedRef.current) {
        startedRef.current = next;
        setStarted(next);
      }
      if (e.key.startsWith('Arrow')) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    // フォーカスを失ったらキー状態をクリアして張り付きを防ぐ
    const blur = () => keysRef.current.clear();
    window.addEventListener('blur', blur);
    mountedRef.current = true;

    const loop = (now: number) => {
      acc += Math.min(now - last, 100) / 1000;
      last = now;
      const running = isRunning(startedRef.current, jevRunningRef.current);
      // 待機中は step を呼ばず、時間も溜めない（発進時にまとめて進まないようにする）
      if (!running) acc = 0;
      while (running && acc >= DT) {
        // Jev 運転中は、目標レーンへ向かうハンドル操作を毎フレーム車側で計算する
        const action = jevRunningRef.current
          ? { steer: laneSteer(stateRef.current.playerX, jevPlanRef.current.targetX), throttle: jevPlanRef.current.throttle }
          : manualAction(keysRef.current);
        stateRef.current = step(stateRef.current, action);
        acc -= DT;
        frames += 1;
      }
      renderGame(ctx, stateRef.current, { width: W, height: H, player: true });
      // 検出ボックスの重ね描き
      ctx.lineWidth = 2;
      ctx.font = '12px sans-serif';
      for (const d of detectionsRef.current) {
        ctx.strokeStyle = '#00ff88';
        ctx.fillStyle = '#00ff88';
        ctx.strokeRect(d.x * W, d.y * H, d.w * W, d.h * H);
        ctx.fillText(`${d.cls} ${d.conf.toFixed(2)}`, d.x * W, Math.max(12, d.y * H - 4));
      }
      // 目標レーンを示す細い線（Jev 運転中のみ）
      if (jevRunningRef.current) {
        const px = stateRef.current.playerX;
        const tx = jevPlanRef.current.targetX;
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(screenX(tx, px, 0) * W, baseY(0) * H);
        ctx.lineTo(screenX(tx, px, 1) * W, baseY(1) * H);
        ctx.stroke();
      }
      // 待機中の案内（半透明の帯）
      if (!running) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, H / 2 - 36, W, 72);
        ctx.fillStyle = '#fff';
        ctx.font = '22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('↑ 矢印キーで発進 / 下の『Jev に運転させる』', W / 2, H / 2);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }
      if (frames >= 30) {
        frames = 0;
        const s = stateRef.current;
        setHud({ speed: s.speed, distance: s.distance, crashes: s.crashes });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      mountedRef.current = false;
      driverRef.current?.stop('画面を離れました');
    };
  }, []);

  async function startJev() {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    setBusy('model');
    try {
      // 事前読み込み済み（または読み込み中）の同じ Promise を待つ
      const vision = await ensureVision();
      // モデル読み込み中にアンマウントされたら Driver を作らない
      if (!mountedRef.current) return;
      // 運転開始前に Jev をウォームアップする。失敗したら 5 回待たずに開始を中止する
      setBusy('jev');
      try {
        await warmUpJev(postObservation, undefined, { onAttempt: (n, max) => mountedRef.current && setAttempt({ n, max }) });
      } catch (e) {
        if (mountedRef.current) setError(`Jev に接続できません（${e instanceof Error ? e.message : String(e)}）`);
        return;
      }
      if (!mountedRef.current) return;
      // ウォームアップ成功でゲームが動き出す
      startedRef.current = true;
      setStarted(true);
      // 開始時の目標は、今いる位置に最も近いレーン
      jevPlanRef.current = { targetX: LANES5.centers[nearestLaneIdx(stateRef.current.playerX)], throttle: 0 };
      const driver = new Driver({
        analyze: async () => {
          const r = await vision.analyze(captureFrame());
          // 停止後に遅れて返った検出結果は書き戻さない（古い枠が残るのを防ぐ）
          if (jevRunningRef.current) detectionsRef.current = r.detections;
          return r;
        },
        getSpeed: () => stateRef.current.speed,
        getFrame: () => stateRef.current.frame,
        getTargetX: () => jevPlanRef.current.targetX,
        post: (obs) => postObservation(obs),
        apply: (p) => {
          jevPlanRef.current = p;
        },
        onDetail: (d) => {
          if (mountedRef.current) setDetail(d);
        },
        onStatus: (s) => {
          jevRunningRef.current = s.running;
          if (!s.running) {
            detectionsRef.current = [];
            setDetail(null);
            // 停止時は目標を現在位置に最も近いレーンへ戻す
            jevPlanRef.current = { targetX: LANES5.centers[nearestLaneIdx(stateRef.current.playerX)], throttle: 0 };
          }
          setStatus(s);
        },
        now: () => Date.now(),
      });
      driverRef.current = driver;
      driver.start();
    } catch {
      // モデル読み込みの失敗は、モデル状態の表示（再試行ボタン）側で扱う
    } finally {
      busyRef.current = false;
      if (mountedRef.current) {
        setBusy(null);
        setAttempt(null);
      }
    }
  }

  const connectingLabel = attempt ? `Jev に接続中…（${attempt.n}/${attempt.max}）` : 'Jev に接続中…';
  // 運転していない間は全ての棒を 0% にする
  const shownRows = detailToRows(status.running ? detail : null);

  return (
    <div>
      {/* キャンバスは最大 960px。パネルは右側に置き、狭い画面では下に回り込む */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        {/* 幅は表示領域の高さに合わせて縮める（見出し・ステータス行・操作説明で約 170px を差し引く）。下限 320px */}
        <div style={{ flex: '0 1 auto', width: 'min(100%, 960px, max(320px, calc((100dvh - 170px) * 16 / 9)))', minWidth: 0 }}>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            style={{ width: '100%', aspectRatio: '16 / 9', display: 'block', background: '#000' }}
          />
        </div>
        <div style={{ flex: '0 1 260px', minWidth: 220, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <strong style={{ fontSize: 15 }}>Jev の判断</strong>
            {!status.running && <span style={{ fontSize: 12, color: '#aaa' }}>待機中</span>}
          </div>
          <DetailPanel title="目標レーン" rows={shownRows.lane} />
          <DetailPanel title="加減速" rows={shownRows.throttle} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '6px 0 0', flexWrap: 'wrap' }}>
        {status.running ? (
          <button onClick={() => driverRef.current?.stop('手動で停止しました')}>停止</button>
        ) : (
          <button onClick={startJev} disabled={busy !== null || modelLoad.status === 'error'}>
            {busy === 'model' ? 'モデル読み込み中…' : busy === 'jev' ? connectingLabel : 'Jev に運転させる'}
          </button>
        )}
        <span id="status">
          {status.running
            ? `Jev 運転中（${status.source}）`
            : busy === 'jev'
              ? connectingLabel
              : started
                ? '手動操作'
                : '待機中'}
          {status.latencyMs !== null && ` / ${status.latencyMs}ms`}
          {status.running && status.ratePerSec !== null && ` / 判断 ${status.ratePerSec.toFixed(1)}回/秒`}
          {` / 失敗 ${status.failures}`}
          {status.stopReason && ` / ${status.stopReason}`}
        </span>
        <span id="model-status">
          {modelLoadLabel(modelLoad)}
          {modelLoad.status === 'error' && <button onClick={retryLoad}>再試行</button>}
        </span>
        <span id="hud">
          速度 {hud.speed.toFixed(2)} / 距離 {hud.distance.toFixed(1)} / 衝突 {hud.crashes}
        </span>
      </div>
      {error && <p style={{ color: '#f66' }}>{error}</p>}
    </div>
  );
}
