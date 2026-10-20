import type { Q } from '../exec.ts';

export function getSetting<T>(q: Q, key: string): T | undefined {
  const row = q.get(q.db.selectFrom('settings').select('value').where('key', '=', key));
  return row ? (JSON.parse(row.value) as T) : undefined;
}

export function setSetting(q: Q, key: string, value: unknown, now = new Date()): void {
  q.run(
    q.db
      .insertInto('settings')
      .values({ key, value: JSON.stringify(value), updated_at: now.toISOString() })
      .onConflict((oc) => oc.column('key').doUpdateSet({ value: JSON.stringify(value), updated_at: now.toISOString() })),
  );
}
