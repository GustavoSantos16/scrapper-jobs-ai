import { getSetting, setSetting, type Q } from '@ajh/database';
import { DEFAULT_PROFILE, Profile } from '@ajh/shared';
import { z } from 'zod';

export const SCHEDULE_INTERVALS = ['manual', '30m', '1h', '3h', '6h', '24h'] as const;
export const ScheduleInterval = z.enum(SCHEDULE_INTERVALS);
export type ScheduleInterval = z.infer<typeof ScheduleInterval>;
export const INTERVAL_MS: Record<Exclude<ScheduleInterval, 'manual'>, number> = {
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
  '3h': 3 * 60 * 60_000,
  '6h': 6 * 60 * 60_000,
  '24h': 24 * 60 * 60_000,
};

export const SchedulerSettings = z.object({
  interval: ScheduleInterval,
  paused: z.boolean(),
});
export type SchedulerSettings = z.infer<typeof SchedulerSettings>;

export const PipelineSettings = z.object({
  concurrency: z.number().int().min(1).max(8),
  sourceTimeoutSeconds: z.number().int().min(10).max(1800),
  /** Successful runs a listing may be absent before it becomes "possibly closed". */
  missedRunsThreshold: z.number().int().min(1).max(50),
  /** Delete possibly-closed jobs older than N days; null = never (default). */
  retentionDays: z.number().int().min(7).max(3650).nullable(),
});
export type PipelineSettings = z.infer<typeof PipelineSettings>;

export const DisplaySettings = z.object({ timezone: z.string().min(1) });
export type DisplaySettings = z.infer<typeof DisplaySettings>;

export const DEFAULTS = {
  profile: DEFAULT_PROFILE,
  scheduler: { interval: 'manual', paused: false } as SchedulerSettings,
  pipeline: { concurrency: 3, sourceTimeoutSeconds: 180, missedRunsThreshold: 3, retentionDays: null } as PipelineSettings,
  display: { timezone: 'America/Sao_Paulo' } as DisplaySettings,
};

const SCHEMAS = { profile: Profile, scheduler: SchedulerSettings, pipeline: PipelineSettings, display: DisplaySettings };
export type SettingsKey = keyof typeof SCHEMAS;
type SettingsValue<K extends SettingsKey> = z.infer<(typeof SCHEMAS)[K]>;

/** Reads a setting, falling back to defaults when missing or no longer valid. */
export function readSettings<K extends SettingsKey>(q: Q, key: K): SettingsValue<K> {
  const stored = getSetting<unknown>(q, key);
  const parsed = SCHEMAS[key].safeParse(stored === undefined ? DEFAULTS[key] : { ...DEFAULTS[key], ...(stored as object) });
  return (parsed.success ? parsed.data : DEFAULTS[key]) as SettingsValue<K>;
}

export function writeSettings<K extends SettingsKey>(q: Q, key: K, value: SettingsValue<K>): SettingsValue<K> {
  const parsed = SCHEMAS[key].parse(value) as SettingsValue<K>;
  setSetting(q, key, parsed);
  return parsed;
}
