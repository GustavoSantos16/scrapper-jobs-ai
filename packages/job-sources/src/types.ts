import type { NormalizedJob, Profile, SourceKind } from '@ajh/shared';
import type { HttpClient } from './http/client.ts';

export interface RateLimit {
  /** The source's own minimum interval between runs; the scheduler can never go below it. */
  minIntervalMinutes: number;
  /** Request cap per run (each connector keeps far below what the source allows). */
  maxRequestsPerRun: number;
  /** Minimum spacing between requests to this source. */
  minDelayMs: number;
}

export interface CompanyConfig {
  name: string;
  ats: 'greenhouse' | 'lever' | 'ashby';
  slug: string;
  enabled?: boolean;
}

export interface Logger {
  debug(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
}

export interface ConnectorContext {
  http: HttpClient;
  profile: Profile;
  signal: AbortSignal;
  log: Logger;
  now: Date;
  env: Record<string, string | undefined>;
  companies: CompanyConfig[];
}

/**
 * One job source. `fetchJobs` yields raw records exactly as the source returns them and
 * `normalize` turns one into a NormalizedJob (or null to skip a record that is not a job).
 * Both are testable with recorded fixtures by injecting a fake HTTP transport.
 */
export interface Connector<Raw = unknown> {
  id: string;
  name: string;
  kind: SourceKind;
  homepageUrl: string;
  docsUrl: string;
  /** Attribution the source asks for (shown in the UI next to each job). */
  attribution: string;
  description: string;
  rateLimit: RateLimit;
  /** Hosts the HTTP client may contact for this source. */
  allowedHosts: readonly string[];
  /** Env vars that must be set for the connector to run (Layer C). */
  requiredEnv?: readonly string[];
  /** Check robots.txt before requests (feeds and public pages). */
  respectRobots?: boolean;
  /** True when the connector uses config/companies.json. */
  usesCompanies?: CompanyConfig['ats'];
  fetchJobs(ctx: ConnectorContext): AsyncIterable<Raw>;
  normalize(raw: Raw, ctx: Pick<ConnectorContext, 'now'>): NormalizedJob | null;
}

/** A connector of any raw type, for registries. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyConnector = Connector<any>;

/** Sources without automated capture (Layer D). */
export interface ManualSource {
  id: string;
  name: string;
  kind: 'manual_link' | 'unavailable';
  homepageUrl: string;
  reason: string;
  searchLinks(profile: Profile): { label: string; url: string }[];
}
