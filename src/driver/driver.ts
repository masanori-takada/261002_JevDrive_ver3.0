import type { Action, Detection, Observation, Road, SystemOneResponse } from '../lib/types';
import { buildObservation } from '../vision/observation';

export type DriverStatus = {
  running: boolean;
  source: 'jev' | 'hold' | 'idle';
  latencyMs: number | null;
  failures: number;
  stopReason: string | null;
};

export type DriverDeps = {
  analyze: () => Promise<{ road: Road; detections: Detection[] }>;
  getSpeed: () => number;
  getFrame: () => number;
  post: (obs: Observation) => Promise<SystemOneResponse>;
  apply: (a: Action) => void;
  onStatus: (s: DriverStatus) => void;
  now: () => number;
};

export type DriverOptions = { intervalMs: number; maxFailures: number; maxRunMs: number };
export const DEFAULT_OPTIONS: DriverOptions = { intervalMs: 150, maxFailures: 5, maxRunMs: 180_000 };

const IDLE: DriverStatus = { running: false, source: 'idle', latencyMs: null, failures: 0, stopReason: null };

export class Driver {
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private startedAt = 0;
  private status: DriverStatus = IDLE;

  constructor(private deps: DriverDeps, private opts: DriverOptions = DEFAULT_OPTIONS) {}

  start(): void {
    if (this.timer) return;
    this.startedAt = this.deps.now();
    this.set({ running: true, source: 'idle', latencyMs: null, failures: 0, stopReason: null });
    this.timer = setInterval(() => void this.tick(), this.opts.intervalMs);
  }

  stop(reason = '停止しました'): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.set({ ...this.status, running: false, stopReason: reason });
  }

  async tick(): Promise<void> {
    if (!this.status.running || this.inFlight) return;
    if (this.deps.now() - this.startedAt >= this.opts.maxRunMs) {
      this.stop('連続稼働の上限（3分）に達しました');
      return;
    }
    this.inFlight = true;
    try {
      const { road, detections } = await this.deps.analyze();
      const obs = buildObservation({
        frame: this.deps.getFrame(),
        speed: this.deps.getSpeed(),
        road,
        detections,
      });
      const res = await this.deps.post(obs);
      if (!this.status.running) return; // 処理中に停止された
      if (res.action) {
        this.deps.apply(res.action);
        this.set({ ...this.status, source: 'jev', latencyMs: res.latencyMs, failures: 0 });
      } else {
        this.fail(res.latencyMs);
      }
    } catch {
      if (this.status.running) this.fail(null);
    } finally {
      this.inFlight = false;
    }
  }

  /** 失敗時は直前の Action を維持する（apply しない） */
  private fail(latencyMs: number | null): void {
    const failures = this.status.failures + 1;
    this.set({ ...this.status, source: 'hold', latencyMs, failures });
    if (failures >= this.opts.maxFailures) this.stop('Jev 応答なし');
  }

  private set(s: DriverStatus): void {
    this.status = s;
    this.deps.onStatus(s);
  }
}
