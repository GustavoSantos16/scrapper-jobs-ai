import type { AnyConnector } from '../types.ts';
import { adzuna } from './adzuna.ts';
import { arbeitnow } from './arbeitnow.ts';
import { ashby } from './ashby.ts';
import { greenhouse } from './greenhouse.ts';
import { himalayas } from './himalayas.ts';
import { hnJobs, hnWhoIsHiring } from './hn.ts';
import { jobicy } from './jobicy.ts';
import { jooble } from './jooble.ts';
import { lever } from './lever.ts';
import { remoteok } from './remoteok.ts';
import { remotive } from './remotive.ts';
import { weworkremotely } from './weworkremotely.ts';

/** Every automated connector, in display order. */
export const CONNECTORS: AnyConnector[] = [
  remotive,
  arbeitnow,
  jobicy,
  remoteok,
  himalayas,
  weworkremotely,
  hnWhoIsHiring,
  hnJobs,
  greenhouse,
  lever,
  ashby,
  adzuna,
  jooble,
];

export function getConnector(id: string): AnyConnector | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

export { MANUAL_SOURCES } from './manual.ts';
export { parseHiringComment, parseJobStoryTitle } from './hn.ts';
export { parseWwrFeed } from './weworkremotely.ts';
export {
  adzuna, arbeitnow, ashby, greenhouse, himalayas, hnJobs, hnWhoIsHiring, jobicy, jooble, lever, remoteok, remotive, weworkremotely,
};
