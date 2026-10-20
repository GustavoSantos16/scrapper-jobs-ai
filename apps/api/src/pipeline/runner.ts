import { randomUUID } from 'node:crypto';
import {
  acquireLock,
  applyRetention,
  createRun,
  createRunSource,
  failOrphanRuns,
  getSourceState,
  httpCacheStore,
  markUnseen,
  readLock,
  releaseLock,
  renewLock,
  updateRun,
  updateRunSource,
  upsertSourceState,
  type Database,
} from '@ajh/database';
import {
  HttpClient,
  type AnyConnector,
  type CompanyConfig,
  type Logger,
  type Resolver,
  type Transport,
} from '@ajh/job-sources';
import { NormalizedJob, type Profile } from '@ajh/shared';
import { readSettings, type PipelineSettings } from '../config/settings.ts';
import { ingestJob, rescoreAll } from './ingest.ts';

export const LOCK_NAME = 'capture';
const LOCK_TTL_MS = 2 * 60_000;
const HEARTBEAT_MS = 30_000;

export type RunTrigger = 'manual' | 'scheduled' | 'cli';
export type SkipReason = 'disabled' | 'missing_credentials' | 'no_companies' | 'min_interval';

export class RunConflictError extends Error {
  override name = 'RunConflictError';
}

class SourceTimeoutError extends Error {
  override name = 'SourceTimeoutError';
}

export interface RunnerDeps {
  database: Database;
  connectors: AnyConnector[];
  log: Logger & { error(obj: object, msg?: string): void };
  env: Record<string, string | undefined>;
  loadCompanies: () => CompanyConfig[];
  /** Test seams. */
  transport?: Transport;
  resolve?: Resolver;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => Date;
}

export interface StartOptions {
  trigger: RunTrigger;
  /** Restrict to these source ids (default: all). */
  sources?: string[];
}

export interface RunSummary {
  runId: number;
  status: 'success' | 'partial' | 'failed' | 'cancelled' | 'skipped';
  sources: { source: string; status: string; found: number; new: number; error?: string | null; skipReason?: string | null }[];
}

interface Planned {
  connector: AnyConnector;
  runSourceId: number;
}

export function effectiveIntervalMinutes(connector: AnyConnector, override: number | null | undefined): number {
  return Math.max(connector.rateLimit.minIntervalMinutes, override ?? 0);
}

export function requestCap(connector: AnyConnector, override: number | null | undefined): number {
  return Math.min(connector.rateLimit.maxRequestsPerRun, override ?? Infinity);
}

/**
 * Orchestrates a capture: persistent lock (no overlapping runs, recoverable after a crash),
 * limited concurrency, per-source timeout, cancellation, partial persistence, and
 * runs/run_sources bookkeeping. A failing source never stops the others.
 */
export class CaptureRunner {
  readonly owner = `${process.pid}:${randomUUID()}`;
  private active: { runId: number; controller: AbortController; done: Promise<RunSummary> } | null = null;

  constructor(private readonly deps: RunnerDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  /** Clears runs left "running" by a crashed process, unless another live process holds the lock. */
  recover(): number {
    const { q } = this.deps.database;
    const lock = readLock(q, LOCK_NAME);
    if (lock && lock.expires_at > this.now().toISOString() && lock.owner !== this.owner) return 0;
    return failOrphanRuns(q, this.now().toISOString());
  }

  get currentRunId(): number | null {
    return this.active?.runId ?? null;
  }

  /** Why a source would be skipped right now (or null if it would run). */
  skipReason(connector: AnyConnector, companies: CompanyConfig[], at: Date = this.now()): { reason: SkipReason; detail: string } | null {
    const state = getSourceState(this.deps.database.q, connector.id);
    if (state && !state.enabled) return { reason: 'disabled', detail: 'Fonte desativada' };
    const missing = (connector.requiredEnv ?? []).filter((k) => !this.deps.env[k]);
    if (missing.length) return { reason: 'missing_credentials', detail: `Requer credencial: ${missing.join(', ')}` };
    if (connector.usesCompanies && !companies.some((c) => c.ats === connector.usesCompanies && c.enabled !== false)) {
      return { reason: 'no_companies', detail: 'Nenhuma empresa configurada para este ATS' };
    }
    if (state?.last_run_at) {
      const minutes = effectiveIntervalMinutes(connector, state.min_interval_minutes);
      const next = Date.parse(state.last_run_at) + minutes * 60_000;
      if (next > at.getTime()) {
        return { reason: 'min_interval', detail: `Intervalo mínimo de ${minutes} min; próxima captura após ${new Date(next).toISOString()}` };
      }
    }
    return null;
  }

  start(opts: StartOptions): { runId: number; done: Promise<RunSummary> } {
    if (this.active) throw new RunConflictError(`Run ${this.active.runId} is already in progress`);
    const { q } = this.deps.database;
    const nowDate = this.now();
    if (!acquireLock(q, LOCK_NAME, this.owner, LOCK_TTL_MS, nowDate)) {
      throw new RunConflictError('Another capture is running (lock held by another process)');
    }
    try {
      const companies = this.deps.loadCompanies();
      const selected = this.deps.connectors.filter((c) => !opts.sources || opts.sources.includes(c.id));
      const now = nowDate.toISOString();
      const runId = createRun(q, opts.trigger, selected.length, now);
      const planned: Planned[] = [];
      for (const connector of selected) {
        const skip = this.skipReason(connector, companies, nowDate);
        const runSourceId = createRunSource(q, {
          run_id: runId,
          source: connector.id,
          status: skip ? 'skipped' : 'pending',
          skip_reason: skip ? `${skip.reason}: ${skip.detail}` : null,
        });
        if (!skip) planned.push({ connector, runSourceId });
      }
      const controller = new AbortController();
      const done = this.execute(runId, planned, companies, controller.signal).finally(() => {
        this.active = null;
        releaseLock(q, LOCK_NAME, this.owner);
      });
      this.active = { runId, controller, done };
      return { runId, done };
    } catch (err) {
      releaseLock(q, LOCK_NAME, this.owner);
      throw err;
    }
  }

  cancel(runId: number): boolean {
    if (this.active?.runId !== runId) return false;
    this.active.controller.abort(new Error('Cancelled by user'));
    return true;
  }

  /** Waits for the current run (used on shutdown and in tests). */
  async idle(): Promise<void> {
    await this.active?.done.catch(() => undefined);
  }

  private async execute(runId: number, planned: Planned[], companies: CompanyConfig[], signal: AbortSignal): Promise<RunSummary> {
    const { q } = this.deps.database;
    const started = Date.now();
    const heartbeat = setInterval(() => renewLock(q, LOCK_NAME, this.owner, LOCK_TTL_MS, this.now()), HEARTBEAT_MS);
    heartbeat.unref();
    const profile = readSettings(q, 'profile');
    const settings = readSettings(q, 'pipeline');
    const results: RunSummary['sources'] = [];
    try {
      await pool(planned, settings.concurrency, async (p) => {
        results.push(await this.runSource(runId, p, profile, settings, companies, signal));
        updateRun(q, runId, {
          sources_done: results.length,
          sources_failed: results.filter((r) => r.status === 'failed').length,
          jobs_found: sum(results, 'found'),
          jobs_new: sum(results, 'new'),
        });
      });
      rescoreAll(q, profile, this.now());
      const removed = applyRetention(q, settings.retentionDays, this.now());
      if (removed) this.deps.log.info({ removed, retentionDays: settings.retentionDays }, 'retention removed closed jobs');
    } catch (err) {
      this.deps.log.error({ err, runId }, 'capture run crashed');
    } finally {
      clearInterval(heartbeat);
    }

    const attempted = results.filter((r) => r.status !== 'cancelled');
    const failed = attempted.filter((r) => r.status === 'failed').length;
    const status: RunSummary['status'] = signal.aborted
      ? 'cancelled'
      : !planned.length
        ? 'skipped'
        : failed === attempted.length
          ? 'failed'
          : failed > 0
            ? 'partial'
            : 'success';
    const totals = q.get(
      q.db
        .selectFrom('run_sources')
        .select((eb) => [eb.fn.sum<number>('updated').as('updated'), eb.fn.sum<number>('merged').as('merged')])
        .where('run_id', '=', runId),
    );
    updateRun(q, runId, {
      status,
      finished_at: this.now().toISOString(),
      duration_ms: Date.now() - started,
      sources_done: results.length,
      sources_failed: failed,
      jobs_found: sum(results, 'found'),
      jobs_new: sum(results, 'new'),
      jobs_updated: Number(totals?.updated ?? 0),
      jobs_merged: Number(totals?.merged ?? 0),
      error: signal.aborted ? 'Cancelled by user' : null,
    });
    this.deps.log.info({ runId, status, sources: results.length, failed }, 'capture finished');
    return { runId, status, sources: results };
  }

  private async runSource(
    runId: number,
    { connector, runSourceId }: Planned,
    profile: Profile,
    settings: PipelineSettings,
    companies: CompanyConfig[],
    runSignal: AbortSignal,
  ): Promise<RunSummary['sources'][number]> {
    const { q } = this.deps.database;
    const log = this.deps.log;
    const startedAt = this.now();
    const t0 = Date.now();
    const timeoutCtl = new AbortController();
    const timer = setTimeout(
      () => timeoutCtl.abort(new SourceTimeoutError(`Timeout after ${settings.sourceTimeoutSeconds}s`)),
      settings.sourceTimeoutSeconds * 1000,
    );
    const signal = AbortSignal.any([runSignal, timeoutCtl.signal]);
    const state = getSourceState(q, connector.id);
    const secrets = (connector.requiredEnv ?? []).map((k) => this.deps.env[k]).filter((v): v is string => Boolean(v));
    const http = new HttpClient({
      allowedHosts: connector.allowedHosts,
      secrets,
      signal,
      cache: httpCacheStore(q),
      minDelayMs: connector.rateLimit.minDelayMs,
      maxRequests: requestCap(connector, state?.max_requests),
      respectRobots: connector.respectRobots ?? false,
      ...(this.deps.transport && { transport: this.deps.transport }),
      ...(this.deps.resolve && { resolve: this.deps.resolve }),
      ...(this.deps.sleep && { sleep: this.deps.sleep }),
      onRequest: (info) => log.debug({ source: connector.id, ...info }, 'http request'),
    });
    updateRunSource(q, runSourceId, { status: 'running', started_at: startedAt.toISOString() });

    const counts = { found: 0, new: 0, updated: 0, merged: 0, invalid: 0 };
    const seen = new Set<number>();
    let status: 'success' | 'failed' | 'cancelled' = 'success';
    let error: string | null = null;
    try {
      const ctx = { http, profile, signal, log, now: startedAt, env: this.deps.env, companies };
      for await (const raw of connector.fetchJobs(ctx)) {
        signal.throwIfAborted();
        let candidate: unknown;
        try {
          candidate = connector.normalize(raw, { now: startedAt });
        } catch (err) {
          counts.invalid++;
          log.debug({ source: connector.id, err: (err as Error).message }, 'normalize failed');
          continue;
        }
        if (candidate === null) continue;
        const parsed = NormalizedJob.safeParse(candidate);
        if (!parsed.success) {
          counts.invalid++;
          log.debug({ source: connector.id, issues: parsed.error.issues.slice(0, 3) }, 'invalid job skipped');
          continue;
        }
        const r = ingestJob(q, parsed.data, profile, this.now(), raw);
        if (seen.has(r.listingId)) continue; // same posting returned by two queries
        seen.add(r.listingId);
        counts.found++;
        if (r.kind === 'new') counts.new++;
        else if (r.kind === 'updated') counts.updated++;
        else if (r.kind === 'merged') counts.merged++;
        if (counts.found % 25 === 0) updateRunSource(q, runSourceId, { ...counts });
      }
      // an empty result is suspicious (format change, outage): never age listings on it
      if (counts.found > 0) markUnseen(q, connector.id, [...seen], settings.missedRunsThreshold, this.now().toISOString());
    } catch (err) {
      const reason = signal.reason ?? err;
      status = runSignal.aborted ? 'cancelled' : 'failed';
      error = (reason instanceof Error ? reason.message : String(reason)).slice(0, 1000);
      log.warn({ source: connector.id, err: error }, 'source failed');
    } finally {
      clearTimeout(timer);
    }

    const finishedAt = this.now().toISOString();
    const durationMs = Date.now() - t0;
    updateRunSource(q, runSourceId, {
      ...counts,
      status,
      errors: status === 'failed' ? 1 : 0,
      error_message: error,
      attempts: http.requestCount,
      finished_at: finishedAt,
      duration_ms: durationMs,
    });
    if (status !== 'cancelled') {
      upsertSourceState(q, connector.id, {
        last_run_at: startedAt.toISOString(),
        last_status: status,
        last_error: error,
        last_found: counts.found,
        last_new: counts.new,
        last_duration_ms: durationMs,
        ...(status === 'success' && counts.found > 0 && { last_success_at: finishedAt }),
        consecutive_failures: status === 'failed' ? (state?.consecutive_failures ?? 0) + 1 : 0,
      });
    }
    log.info({ source: connector.id, status, ...counts, durationMs }, 'source finished');
    return { source: connector.id, status, found: counts.found, new: counts.new, error };
  }
}

async function pool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await worker(item);
    }
  });
  await Promise.all(lanes);
}

function sum<T extends Record<K, number>, K extends keyof T>(rows: T[], key: K): number {
  return rows.reduce((acc, r) => acc + r[key], 0);
}
