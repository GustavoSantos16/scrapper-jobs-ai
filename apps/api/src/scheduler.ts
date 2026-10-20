import { getSetting, setSetting, type Database } from '@ajh/database';
import { INTERVAL_MS, readSettings, writeSettings, type SchedulerSettings } from './config/settings.ts';
import { RunConflictError, type CaptureRunner } from './pipeline/runner.ts';

/** Grace delay before catching up on a run that was due while the API was stopped. */
export const CATCH_UP_DELAY_MS = 60_000;
const MAX_TIMEOUT = 2_147_483_647;

interface SchedulerState {
  /** When the schedule was last (re)configured or last fired: the base for the next run. */
  anchorAt: string | null;
  lastScheduledRunId: number | null;
  lastSkipReason: string | null;
}

export interface SchedulerDeps {
  database: Database;
  runner: CaptureRunner;
  log: { info(o: object, m?: string): void; warn(o: object, m?: string): void };
  now?: () => Date;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}

export interface SchedulerStatus extends SchedulerSettings {
  nextRunAt: string | null;
  lastScheduledRunId: number | null;
  lastSkipReason: string | null;
  running: boolean;
  currentRunId: number | null;
}

/**
 * In-process scheduler. Runs only while the API is running (nothing runs with the Mac off).
 * Never overlaps: if a capture is already running when a run is due, that slot is skipped.
 * Each source still enforces its own minimum interval inside the runner.
 */
export class Scheduler {
  private timer: unknown = null;
  private stopped = false;

  constructor(private readonly deps: SchedulerDeps) {}

  private now() {
    return this.deps.now?.() ?? new Date();
  }

  private state(): SchedulerState {
    return { anchorAt: null, lastScheduledRunId: null, lastSkipReason: null, ...getSetting<SchedulerState>(this.deps.database.q, 'scheduler_state') };
  }

  private saveState(patch: Partial<SchedulerState>) {
    setSetting(this.deps.database.q, 'scheduler_state', { ...this.state(), ...patch });
  }

  nextRunAt(): Date | null {
    const s = readSettings(this.deps.database.q, 'scheduler');
    if (s.interval === 'manual' || s.paused) return null;
    const anchor = this.state().anchorAt;
    const base = anchor ? Date.parse(anchor) : this.now().getTime();
    const due = base + INTERVAL_MS[s.interval];
    // a run missed while the API was down happens shortly after startup, not in a burst
    return new Date(Math.max(due, this.now().getTime()));
  }

  status(): SchedulerStatus {
    const s = readSettings(this.deps.database.q, 'scheduler');
    const st = this.state();
    return {
      ...s,
      nextRunAt: this.nextRunAt()?.toISOString() ?? null,
      lastScheduledRunId: st.lastScheduledRunId,
      lastSkipReason: st.lastSkipReason,
      running: this.deps.runner.currentRunId !== null,
      currentRunId: this.deps.runner.currentRunId,
    };
  }

  start(): void {
    this.stopped = false;
    if (!this.state().anchorAt) this.saveState({ anchorAt: this.now().toISOString() });
    const next = this.nextRunAt();
    if (next && next.getTime() <= this.now().getTime()) {
      // overdue at startup: catch up once after a short grace period
      this.arm(CATCH_UP_DELAY_MS);
    } else {
      this.reschedule();
    }
  }

  stop(): void {
    this.stopped = true;
    this.disarm();
  }

  /** Persists new settings; changing the interval or resuming restarts the countdown now. */
  configure(next: SchedulerSettings): SchedulerStatus {
    const prev = readSettings(this.deps.database.q, 'scheduler');
    writeSettings(this.deps.database.q, 'scheduler', next);
    if (prev.interval !== next.interval || (prev.paused && !next.paused)) this.saveState({ anchorAt: this.now().toISOString() });
    this.reschedule();
    return this.status();
  }

  private reschedule(): void {
    this.disarm();
    if (this.stopped) return;
    const next = this.nextRunAt();
    if (!next) return;
    this.arm(Math.max(0, next.getTime() - this.now().getTime()));
  }

  private arm(ms: number) {
    this.disarm();
    const set = this.deps.setTimer ?? ((fn, t) => setTimeout(fn, t).unref());
    // long intervals are re-armed in steps (setTimeout max ≈ 24.8 days)
    this.timer = set(() => (ms > MAX_TIMEOUT ? this.reschedule() : void this.fire()), Math.min(ms, MAX_TIMEOUT));
  }

  private disarm() {
    if (this.timer !== null) (this.deps.clearTimer ?? ((t) => clearTimeout(t as NodeJS.Timeout)))(this.timer);
    this.timer = null;
  }

  /** Fires a scheduled capture now (also used by tests). */
  async fire(): Promise<void> {
    this.timer = null;
    const s = readSettings(this.deps.database.q, 'scheduler');
    if (this.stopped || s.paused || s.interval === 'manual') return;
    this.saveState({ anchorAt: this.now().toISOString() });
    try {
      const { runId, done } = this.deps.runner.start({ trigger: 'scheduled' });
      this.saveState({ lastScheduledRunId: runId, lastSkipReason: null });
      this.deps.log.info({ runId }, 'scheduled capture started');
      this.reschedule();
      await done;
    } catch (err) {
      if (err instanceof RunConflictError) {
        this.saveState({ lastSkipReason: `Pulada em ${this.now().toISOString()}: já havia uma captura em andamento` });
        this.deps.log.warn({}, 'scheduled capture skipped: another capture is running');
        this.reschedule();
        return;
      }
      throw err;
    }
  }
}
