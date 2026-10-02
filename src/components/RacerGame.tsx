'use client';
import { useEffect, useRef, useState } from 'react';
import { Driver, type DriverStatus } from '../driver/driver';
import { postObservation } from '../driver/post';
import { manualAction } from '../game/keys';
import { baseY, screenX } from '../game/projection';
import { createGame, DT, step, type GameState } from '../game/racer';
import { renderGame } from '../game/render';
import { laneSteer } from '../game/steer';
import type { Detection, Plan } from '../lib/types';
import { nearestLaneIdx } from '../vision/lane-plan';
import { LANES5 } from '../vision/lanes';
import { createVision } from '../vision/pipeline';

const W = 640;
const H = 360;
const IDLE: DriverStatus = { running: false, source: 'idle', latencyMs: null, failures: 0, stopReason: null };

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

  const [status, setStatus] = useState<DriverStatus>(IDLE);
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d')!;
    let acc = 0;
    let last = performance.now();
    let raf = 0;
    let frames = 0;

    const down = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
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
      while (acc >= DT) {
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
    setError(null);
    setLoading(true);
    try {
      const vision = await createVision();
      // モデル読み込み中にアンマウントされたら Driver を作らない
      if (!mountedRef.current) return;
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
        onStatus: (s) => {
          jevRunningRef.current = s.running;
          if (!s.running) {
            detectionsRef.current = [];
            // 停止時は目標を現在位置に最も近いレーンへ戻す
            jevPlanRef.current = { targetX: LANES5.centers[nearestLaneIdx(stateRef.current.playerX)], throttle: 0 };
          }
          setStatus(s);
        },
        now: () => Date.now(),
      });
      driverRef.current = driver;
      driver.start();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <canvas ref={canvasRef} width={W} height={H} style={{ width: '100%', maxWidth: 960, background: '#000' }} />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '8px 0' }}>
        {status.running ? (
          <button onClick={() => driverRef.current?.stop('手動で停止しました')}>停止</button>
        ) : (
          <button onClick={startJev} disabled={loading}>
            {loading ? 'モデル読み込み中…' : 'Jev に運転させる'}
          </button>
        )}
        <span id="status">
          {status.running ? `Jev 運転中（${status.source}）` : '手動操作'}
          {status.latencyMs !== null && ` / ${status.latencyMs}ms`}
          {` / 失敗 ${status.failures}`}
          {status.stopReason && ` / ${status.stopReason}`}
        </span>
        <span id="hud">
          速度 {hud.speed.toFixed(2)} / 距離 {hud.distance.toFixed(1)} / 衝突 {hud.crashes}
        </span>
      </div>
      {error && <p style={{ color: '#f66' }}>エラー: {error}</p>}
    </div>
  );
}
