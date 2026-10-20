// Runs one capture from the terminal: pnpm capture [sourceId ...]
import { openDatabase } from '@ajh/database';
import { CONNECTORS } from '@ajh/job-sources';
import { readCompanies } from '../config/companies.ts';
import { CaptureRunner } from '../pipeline/runner.ts';

const sources = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const database = openDatabase();
const log = {
  debug() {},
  info(o: object, m?: string) {
    if (m === 'source finished') console.log('  ', JSON.stringify(o));
  },
  warn(o: object, m?: string) {
    console.warn('  !', m, JSON.stringify(o));
  },
  error(o: object, m?: string) {
    console.error('  x', m, o);
  },
};
const runner = new CaptureRunner({ database, connectors: CONNECTORS, env: process.env, log, loadCompanies: readCompanies });
runner.recover();
const { runId, done } = runner.start({ trigger: 'cli', ...(sources.length && { sources }) });
console.log(`Run #${runId} started (${sources.length ? sources.join(', ') : 'all sources'})`);
const summary = await done;
console.table(summary.sources.map((s) => ({ source: s.source, status: s.status, found: s.found, new: s.new, error: s.error ?? '' })));
const skipped = database.q.all(database.q.db.selectFrom('run_sources').select(['source', 'skip_reason']).where('run_id', '=', runId).where('status', '=', 'skipped'));
for (const s of skipped) console.log(`  skipped ${s.source}: ${s.skip_reason}`);
const total = database.q.get(database.q.db.selectFrom('jobs').select((eb) => eb.fn.countAll<number>().as('n')))!.n;
console.log(`Run #${runId}: ${summary.status}. Jobs in database: ${total}`);
await database.close();
