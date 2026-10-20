import type { Q } from '../exec.ts';

/**
 * Persistent mutex row. Acquiring succeeds when no row exists or the existing lock expired
 * (a crashed process cannot block captures forever). The holder must `renew` periodically.
 */
export function acquireLock(q: Q, name: string, owner: string, ttlMs: number, now = new Date()): boolean {
  const expires = new Date(now.getTime() + ttlMs).toISOString();
  return q.tx(() => {
    const current = q.get(q.db.selectFrom('locks').selectAll().where('name', '=', name));
    if (current && current.expires_at > now.toISOString() && current.owner !== owner) return false;
    q.run(
      q.db
        .insertInto('locks')
        .values({ name, owner, acquired_at: now.toISOString(), expires_at: expires })
        .onConflict((oc) => oc.column('name').doUpdateSet({ owner, acquired_at: now.toISOString(), expires_at: expires })),
    );
    return true;
  });
}

export function renewLock(q: Q, name: string, owner: string, ttlMs: number, now = new Date()): boolean {
  const r = q.run(
    q.db
      .updateTable('locks')
      .set({ expires_at: new Date(now.getTime() + ttlMs).toISOString() })
      .where('name', '=', name)
      .where('owner', '=', owner),
  );
  return r.changes === 1;
}

export function releaseLock(q: Q, name: string, owner: string): void {
  q.run(q.db.deleteFrom('locks').where('name', '=', name).where('owner', '=', owner));
}

export function readLock(q: Q, name: string) {
  return q.get(q.db.selectFrom('locks').selectAll().where('name', '=', name));
}
