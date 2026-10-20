import type { Selectable, Updateable } from 'kysely';
import type { Q } from '../exec.ts';
import type { SourceStateTable } from '../schema.ts';

export type SourceStateRow = Selectable<SourceStateTable>;

export function getSourceState(q: Q, source: string): SourceStateRow | undefined {
  return q.get(q.db.selectFrom('source_state').selectAll().where('source', '=', source));
}

export function listSourceStates(q: Q): SourceStateRow[] {
  return q.all(q.db.selectFrom('source_state').selectAll());
}

export function upsertSourceState(q: Q, source: string, patch: Updateable<SourceStateTable>): void {
  q.run(
    q.db
      .insertInto('source_state')
      .values({ source, ...patch } as SourceStateRow)
      .onConflict((oc) => oc.column('source').doUpdateSet(patch)),
  );
}
