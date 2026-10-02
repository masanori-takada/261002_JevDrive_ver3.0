'use client';
import { useEffect, useRef } from 'react';
import { createGame, DT, step } from '../game/racer';
import { manualAction } from '../game/keys';
import { renderGame } from '../game/render';

export const W = 640;
export const H = 360;

export function RacerGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d')!;
    const keys = new Set<string>();
    let state = createGame(1);
    let acc = 0;
    let last = performance.now();
    let raf = 0;

    const down = (e: KeyboardEvent) => {
      keys.add(e.key);
      if (e.key.startsWith('Arrow')) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);

    const loop = (now: number) => {
      acc += Math.min(now - last, 100) / 1000;
      last = now;
      while (acc >= DT) {
        state = step(state, manualAction(keys));
        acc -= DT;
      }
      renderGame(ctx, state, { width: W, height: H, player: true });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  return <canvas ref={canvasRef} width={W} height={H} style={{ width: '100%', maxWidth: 960, background: '#000' }} />;
}
