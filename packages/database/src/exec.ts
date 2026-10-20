import type BetterSqlite3 from 'better-sqlite3';
import type { Compilable, Kysely } from 'kysely';
import type { DB } from './schema.ts';

/**
 * Builds queries with Kysely (typed) and runs them synchronously on better-sqlite3.
 * Synchronous execution lets a whole upsert run inside one `tx()` without interleaving.
 */
export class Q {
  private readonly statements = new Map<string, BetterSqlite3.Statement>();

  constructor(
    readonly sqlite: BetterSqlite3.Database,
    readonly db: Kysely<DB>,
  ) {}

  private prepare(sql: string): BetterSqlite3.Statement {
    let s = this.statements.get(sql);
    if (!s) {
      s = this.sqlite.prepare(sql);
      if (this.statements.size > 500) this.statements.clear();
      this.statements.set(sql, s);
    }
    return s;
  }

  all<O>(q: Compilable<O>): O[] {
    const c = q.compile();
    return this.prepare(c.sql).all(...(c.parameters as unknown[])) as O[];
  }

  get<O>(q: Compilable<O>): O | undefined {
    const c = q.compile();
    return this.prepare(c.sql).get(...(c.parameters as unknown[])) as O | undefined;
  }

  run(q: Compilable<unknown>): BetterSqlite3.RunResult {
    const c = q.compile();
    return this.prepare(c.sql).run(...(c.parameters as unknown[]));
  }

  tx<T>(fn: () => T): T {
    return this.sqlite.transaction(fn)();
  }
}
