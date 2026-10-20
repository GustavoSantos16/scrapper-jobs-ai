import BetterSqlite3 from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { listMigrations, migrate, openDatabase } from '../src/index.ts';

describe('migrations', () => {
  it('applies all migrations on an empty database and is idempotent', () => {
    const sqlite = new BetterSqlite3(':memory:');
    const first = migrate(sqlite);
    expect(first.applied).toEqual(listMigrations().map((m) => m.version));
    const second = migrate(sqlite);
    expect(second.applied).toEqual([]);
    expect(second.current).toBe(first.current);
    sqlite.close();
  });

  it('creates every expected table, FTS index and trigger', () => {
    const { sqlite } = openDatabase({ path: ':memory:' });
    const names = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','trigger')")
      .all()
      .map((r) => (r as { name: string }).name);
    for (const t of [
      'jobs',
      'job_listings',
      'jobs_fts',
      'job_tracking',
      'job_state_history',
      'dedup_reviews',
      'runs',
      'run_sources',
      'source_state',
      'settings',
      'saved_filters',
      'http_cache',
      'locks',
      'jobs_ai',
      'jobs_au',
      'jobs_ad',
    ]) {
      expect(names).toContain(t);
    }
    sqlite.close();
  });

  it('keeps the FTS index in sync through triggers', () => {
    const { sqlite } = openDatabase({ path: ':memory:' });
    const now = new Date().toISOString();
    const insert = sqlite.prepare(
      `INSERT INTO jobs (title, company, description_text, technologies, url, first_seen_at, last_seen_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const { lastInsertRowid } = insert.run('Senior React Engineer', 'Acme', 'Build UIs', '["react"]', 'https://x.test/1', now, now, now);
    const search = sqlite.prepare("SELECT rowid FROM jobs_fts WHERE jobs_fts MATCH ?");
    expect(search.all('react')).toHaveLength(1);
    sqlite.prepare('UPDATE jobs SET title = ? WHERE id = ?').run('Angular Developer', lastInsertRowid);
    expect(search.all('react')).toHaveLength(1); // still in technologies
    expect(search.all('title:react')).toHaveLength(0);
    expect(search.all('angular')).toHaveLength(1);
    sqlite.prepare('DELETE FROM jobs WHERE id = ?').run(lastInsertRowid);
    expect(search.all('angular')).toHaveLength(0);
    sqlite.close();
  });

  it('enables WAL and foreign keys on file databases', async () => {
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'ajh-'));
    const handle = openDatabase({ path: join(dir, 'test.db') });
    expect(handle.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(handle.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    await handle.close();
  });
});
