import type { Q } from '../exec.ts';

export function listSavedFilters(q: Q) {
  return q.all(q.db.selectFrom('saved_filters').selectAll().orderBy('name'));
}

export function createSavedFilter(q: Q, name: string, query: string, now = new Date().toISOString()) {
  return q.get(q.db.insertInto('saved_filters').values({ name, query, created_at: now }).returningAll())!;
}

export function deleteSavedFilter(q: Q, id: number): boolean {
  return q.run(q.db.deleteFrom('saved_filters').where('id', '=', id)).changes === 1;
}
