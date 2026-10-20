import type { Q } from '../exec.ts';
import type { RunSourcesTable, RunsTable } from '../schema.ts';
import type { Insertable, Selectable, Updateable } from 'kysely';

export type RunRow = Selectable<RunsTable>;
export type RunSourceRow = Selectable<RunSourcesTable>;

export function createRun(q: Q, trigger: string, sourcesTotal: number, now: string): number {
  return q.get(
    q.db.insertInto('runs').values({ trigger, status: 'running', started_at: now, sources_total: sourcesTotal }).returning('id'),
  )!.id;
}

export function updateRun(q: Q, id: number, patch: Updateable<RunsTable>): void {
  q.run(q.db.updateTable('runs').set(patch).where('id', '=', id));
}

export function createRunSource(q: Q, row: Insertable<RunSourcesTable>): number {
  return q.get(q.db.insertInto('run_sources').values(row).returning('id'))!.id;
}

export function updateRunSource(q: Q, id: number, patch: Updateable<RunSourcesTable>): void {
  q.run(q.db.updateTable('run_sources').set(patch).where('id', '=', id));
}

export function getRun(q: Q, id: number): (RunRow & { sources: RunSourceRow[] }) | undefined {
  const run = q.get(q.db.selectFrom('runs').selectAll().where('id', '=', id));
  if (!run) return undefined;
  const sources = q.all(q.db.selectFrom('run_sources').selectAll().where('run_id', '=', id).orderBy('id'));
  return { ...run, sources };
}

export function listRuns(q: Q, limit: number, offset = 0): RunRow[] {
  return q.all(q.db.selectFrom('runs').selectAll().orderBy('id', 'desc').limit(limit).offset(offset));
}

export function countRuns(q: Q): number {
  return q.get(q.db.selectFrom('runs').select((eb) => eb.fn.countAll<number>().as('n')))!.n;
}

export function runningRun(q: Q): RunRow | undefined {
  return q.get(q.db.selectFrom('runs').selectAll().where('status', '=', 'running').orderBy('id', 'desc').limit(1));
}

/** Marks runs left "running" by a crashed process as failed (called at startup). */
export function failOrphanRuns(q: Q, now: string): number {
  const n = q.run(
    q.db.updateTable('runs').set({ status: 'failed', finished_at: now, error: 'Interrupted (process stopped during the run)' }).where('status', '=', 'running'),
  ).changes;
  q.run(
    q.db
      .updateTable('run_sources')
      .set({ status: 'cancelled', finished_at: now, error_message: 'Interrupted' })
      .where('status', 'in', ['pending', 'running']),
  );
  return n;
}

/** Successful runs of a source finished after `since` (used for "missed N runs"). */
export function lastRunSources(q: Q, source: string, limit: number): RunSourceRow[] {
  return q.all(q.db.selectFrom('run_sources').selectAll().where('source', '=', source).orderBy('id', 'desc').limit(limit));
}
