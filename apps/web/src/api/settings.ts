import type { Profile } from '@ajh/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client.ts';

export interface PipelineSettings {
  concurrency: number;
  sourceTimeoutSeconds: number;
  missedRunsThreshold: number;
  retentionDays: number | null;
}
export interface SchedulerSettings {
  interval: 'manual' | '30m' | '1h' | '3h' | '6h' | '24h';
  paused: boolean;
}
export interface AllSettings {
  profile: Profile;
  pipeline: PipelineSettings;
  display: { timezone: string };
  scheduler: SchedulerSettings;
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api<AllSettings>('/settings'), staleTime: 60_000 });
}

export function useSaveSetting<K extends 'profile' | 'pipeline' | 'display'>(key: K) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (value: AllSettings[K]) => api<Record<string, unknown>>(`/settings/${key}`, { method: 'PUT', json: value }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings'] });
      if (key === 'profile') for (const k of ['jobs', 'job', 'stats']) void qc.invalidateQueries({ queryKey: [k] });
      if (key === 'display') void qc.invalidateQueries();
    },
  });
}
