import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { migrate } from './migrate.ts';
import { defaultDatabasePath } from './paths.ts';
import type { DB } from './schema.ts';

export interface Database {
  sqlite: BetterSqlite3.Database;
  db: Kysely<DB>;
  close(): Promise<void>;
}

export interface OpenOptions {
  /** File path or ':memory:'. Defaults to DATABASE_PATH or data/jobhunter.db. */
  path?: string;
  migrate?: boolean;
  migrationsDir?: string;
}

export function openDatabase(opts: OpenOptions = {}): Database {
  const path = opts.path ?? defaultDatabasePath();
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const sqlite = new BetterSqlite3(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');
  if (opts.migrate !== false) migrate(sqlite, opts.migrationsDir);
  const db = new Kysely<DB>({ dialect: new SqliteDialect({ database: sqlite }) });
  return {
    sqlite,
    db,
    async close() {
      await db.destroy(); // also closes the sqlite handle
    },
  };
}
