import type { Detection, JevDetail, Observation, Plan, Road, SystemOneResponse } from '../lib/types';
import { decisionRate } from './decision-rate';
import { buildObservation } from '../vision/observation';

export type DriverStatus = {
  running: boolean;
  source: 'jev' | 'hold' | 'idle';
  latencyMs: number | null;
  failures: number;
  stopReason: string | null;
  /** 判断（Plan の適用）の頻度（回/秒）。直近 10 件の適用間隔の平均。求められなければ null */
  ratePerSec: number | null;
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
  /** 成功した応答に detail（選択肢ごとの確率）があれば渡す。失敗時は呼ばない */
  onDetail?: (d: JevDetail) => void;
  now: () => number;
};

export type DriverOptions = {
  intervalMs: number;
  maxFailures: number;
  maxRunMs: number;
  /** analyze() の待ち時間の上限。超えたら失敗として数える */
  analyzeTimeoutMs: number;
  /** 応答待ちの Jev リクエストの上限。未満なら、前の応答を待たずに次を送る */
  maxInFlight: number;
};
export const DEFAULT_OPTIONS: DriverOptions = { intervalMs: 150, maxFailures: 5, maxRunMs: 180_000, analyzeTimeoutMs: 3000, maxInFlight: 3 };

const IDLE: DriverStatus = { running: false, source: 'idle', latencyMs: null, failures: 0, stopReason: null, ratePerSec: null };

export class Driver {
  private timer: ReturnType<typeof setInterval> | null = null;
  /** 検出（analyze）の実行中か。重ならないようにする */
  private analyzing = false;
  /** 応答待ちの Jev リクエスト数 */
  private pending = 0;
  /** リクエストの連番と、最後に適用した連番（古い応答を捨てるため） */
  private seq = 0;
  private lastAppliedSeq = 0;
  /** start のたびに増やし、前の運転の応答を無視する */
  private runId = 0;
  private appliedAt: number[] = [];
  private startedAt = 0;
  private status: DriverStatus = IDLE;

  constructor(private deps: DriverDeps, private opts: DriverOptions = DEFAULT_OPTIONS) {}

  start(): void {
    if (this.timer) return;
    this.runId += 1;
    this.pending = 0;
    this.seq = 0;
    this.lastAppliedSeq = 0;
    this.appliedAt = [];
    this.startedAt = this.deps.now();
    this.set({ ...IDLE, running: true });
    this.timer = setInterval(() => void this.tick(), this.opts.intervalMs);
  }

  stop(reason = '停止しました'): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.set({ ...this.status, running: false, stopReason: reason });
  }

  /** 検出して Jev へのリクエストを発行する。応答は待たない（応答は届いた順に onResponse で処理する） */
  async tick(): Promise<void> {
    if (!this.status.running || this.analyzing || this.pending >= this.opts.maxInFlight) return;
    if (this.deps.now() - this.startedAt >= this.opts.maxRunMs) {
      this.stop('連続稼働の上限（3分）に達しました');
      return;
    }
    this.analyzing = true;
    const run = this.runId;
    try {
      const { road, detections } = await this.withTimeout(this.deps.analyze());
      if (!this.status.running || run !== this.runId) return; // 検出中に停止された
      const obs: Observation = {
        ...buildObservation({
          frame: this.deps.getFrame(),
          speed: this.deps.getSpeed(),
          road,
          detections,
        }),
        targetX: this.deps.getTargetX(),
      };
      const seq = ++this.seq;
      this.pending += 1;
      this.deps.post(obs).then(
        (res) => this.onResponse(run, seq, res),
        () => this.onFailure(run, null),
      );
    } catch {
      if (this.status.running && run === this.runId) this.fail(null);
    } finally {
      this.analyzing = false;
    }
  }

  private onResponse(run: number, seq: number, res: SystemOneResponse): void {
    if (run !== this.runId) return;
    this.pending -= 1;
    if (!this.status.running) return; // 停止後の応答は適用しない
    if (res.plan) {
      // 古い応答（既により新しいものを適用済み）は捨てる。失敗としても数えない
      if (seq <= this.lastAppliedSeq) return;
      this.lastAppliedSeq = seq;
      this.deps.apply(res.plan);
      if (res.detail) this.deps.onDetail?.(res.detail);
      this.appliedAt = [...this.appliedAt, this.deps.now()].slice(-10);
      this.set({
        ...this.status, source: 'jev', latencyMs: res.latencyMs, failures: 0, ratePerSec: decisionRate(this.appliedAt),
      });
    } else {
      this.fail(res.latencyMs);
    }
  }

  private onFailure(run: number, latencyMs: number | null): void {
    if (run !== this.runId) return;
    this.pending -= 1;
    if (this.status.running) this.fail(latencyMs);
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
