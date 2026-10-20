import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Walks up from `start` until it finds the pnpm workspace root. */
export function findRepoRoot(start: string = dirname(fileURLToPath(import.meta.url))): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

export function defaultDatabasePath(): string {
  return process.env.DATABASE_PATH ?? join(findRepoRoot(), 'data', 'jobhunter.db');
}

/**
 * Migrations live in packages/database/migrations. The production bundle copies them
 * next to the bundle (dist/migrations), so both locations are checked.
 */
export function defaultMigrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.MIGRATIONS_DIR,
    join(here, 'migrations'),
    join(here, '..', 'migrations'),
    join(findRepoRoot(), 'packages', 'database', 'migrations'),
  ].filter((p): p is string => Boolean(p));
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`Migrations directory not found (tried: ${candidates.join(', ')})`);
  return found;
}
