import BetterSqlite3 from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { migrate } from './migrate.ts';
import { defaultDatabasePath } from './paths.ts';

const path = defaultDatabasePath();
mkdirSync(dirname(path), { recursive: true });
const sqlite = new BetterSqlite3(path);
sqlite.pragma('journal_mode = WAL');
const result = migrate(sqlite);
sqlite.close();
console.log(
  result.applied.length
    ? `Applied ${result.applied.join(', ')} to ${path}`
    : `Database ${path} is up to date (${result.current ?? 'empty'})`,
);
