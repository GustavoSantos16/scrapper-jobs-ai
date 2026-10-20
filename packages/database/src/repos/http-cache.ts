import type { Q } from '../exec.ts';

export interface CacheEntry {
  etag: string | null;
  lastModified: string | null;
  status: number;
  contentType: string | null;
  body: Buffer;
  fetchedAt: string;
}

/** SQLite-backed conditional HTTP cache (ETag / Last-Modified). */
export function httpCacheStore(q: Q) {
  return {
    get(url: string): CacheEntry | undefined {
      const r = q.get(q.db.selectFrom('http_cache').selectAll().where('url', '=', url));
      return r
        ? { etag: r.etag, lastModified: r.last_modified, status: r.status, contentType: r.content_type, body: r.body, fetchedAt: r.fetched_at }
        : undefined;
    },
    set(url: string, e: CacheEntry): void {
      const row = { url, etag: e.etag, last_modified: e.lastModified, status: e.status, content_type: e.contentType, body: e.body, fetched_at: e.fetchedAt };
      q.run(q.db.insertInto('http_cache').values(row).onConflict((oc) => oc.column('url').doUpdateSet(row)));
    },
  };
}
