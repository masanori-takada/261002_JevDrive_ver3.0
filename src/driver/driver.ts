import type { Detection, Observation, Plan, Road, SystemOneResponse } from '../lib/types';
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
  /** 現在の目標レーンの中心。観測に含めてサーバーへ送る */
  getTargetX: () => number;
  post: (obs: Observation) => Promise<SystemOneResponse>;
  apply: (p: Plan) => void;
  onStatus: (s: DriverStatus) => void;
  now: () => number;
};

export type DriverOptions = {
  intervalMs: number;
  maxFailures: number;
  maxRunMs: number;
  /** analyze() の待ち時間の上限。超えたら失敗として数える */
  analyzeTimeoutMs: number;
};
export const DEFAULT_OPTIONS: DriverOptions = { intervalMs: 150, maxFailures: 5, maxRunMs: 180_000, analyzeTimeoutMs: 3000 };

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
      const { road, detections } = await this.withTimeout(this.deps.analyze());
      const obs: Observation = {
        ...buildObservation({
          frame: this.deps.getFrame(),
          speed: this.deps.getSpeed(),
          road,
          detections,
        }),
        targetX: this.deps.getTargetX(),
      };
      const res = await this.deps.post(obs);
      if (!this.status.running) return; // 処理中に停止された
      if (res.plan) {
        this.deps.apply(res.plan);
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

  /** analyze() がハングしても tick が戻り、inFlight が解除されるようにする */
  private withTimeout<T>(p: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('analyze timeout')), this.opts.analyzeTimeoutMs);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
  }

  /** 失敗時は直前の Plan を維持する（apply しない） */
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
