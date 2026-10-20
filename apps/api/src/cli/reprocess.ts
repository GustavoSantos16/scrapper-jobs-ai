// Re-normalizes stored listings from their raw payloads (no network): pnpm reprocess
import { openDatabase } from '@ajh/database';
import { CONNECTORS } from '@ajh/job-sources';
import { reprocessAll } from '../pipeline/reprocess.ts';

const database = openDatabase();
console.log(reprocessAll(database, CONNECTORS));
await database.close();
