import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client.ts';
import type { SchedulerSettings } from './settings.ts';

export interface SchedulerStatus extends SchedulerSettings {
  nextRunAt: string | null;
  lastScheduledRunId: number | null;
  lastSkipReason: string | null;
  running: boolean;
  currentRunId: number | null;
}

export function useScheduler() {
  return useQuery({ queryKey: ['scheduler'], queryFn: () => api<SchedulerStatus>('/scheduler'), refetchInterval: 30_000 });
}

export function useConfigureScheduler() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: SchedulerSettings) => api<SchedulerStatus>('/scheduler', { method: 'PUT', json: s }),
    onSuccess: (data) => {
      qc.setQueryData(['scheduler'], data);
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

export function useReprocess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ listings: number; updated: number; pendingReviews: number }>('/maintenance/reprocess', { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries(),
  });
}
