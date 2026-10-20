import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import { defaultMigrationsDir } from './paths.ts';

export interface MigrationResult {
  applied: string[];
  current: string | null;
}

const MIGRATION_FILE = /^(\d{4})_[\w-]+\.sql$/;

export function listMigrations(dir: string = defaultMigrationsDir()): { version: string; file: string }[] {
  return readdirSync(dir)
    .filter((f) => MIGRATION_FILE.test(f))
    .sort()
    .map((file) => ({ version: file.replace(/\.sql$/, ''), file: join(dir, file) }));
}

/** Applies pending migrations in order, each inside its own transaction. */
export function migrate(sqlite: BetterSqlite3.Database, dir?: string): MigrationResult {
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`,
  );
  const done = new Set(
    sqlite
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((r) => (r as { version: string }).version),
  );
  const applied: string[] = [];
  const record = sqlite.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)');
  for (const m of listMigrations(dir)) {
    if (done.has(m.version)) continue;
    const sql = readFileSync(m.file, 'utf8');
    sqlite.transaction(() => {
      sqlite.exec(sql);
      record.run(m.version, new Date().toISOString());
    })();
    applied.push(m.version);
  }
  const last = sqlite
    .prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')
    .get() as { version: string } | undefined;
  return { applied, current: last?.version ?? null };
}
