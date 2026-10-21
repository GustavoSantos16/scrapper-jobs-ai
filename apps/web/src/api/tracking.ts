import type { ApplicationState } from '@ajh/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client.ts';

export interface TrackingPatch {
  state?: ApplicationState;
  favorite?: boolean;
  ignored?: boolean;
  notes?: string;
  appliedAt?: string | null;
  recruiter?: string | null;
  processUrl?: string | null;
}

export function useUpdateTracking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: TrackingPatch & { id: number }) => api<{ changed: string[] }>(`/jobs/${id}/tracking`, { method: 'PATCH', json: patch }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['job', v.id] });
      void qc.invalidateQueries({ queryKey: ['jobs'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export interface SavedFilter {
  id: number;
  name: string;
  query: Record<string, string>;
  createdAt: string;
}

export function useSavedFilters() {
  return useQuery({ queryKey: ['saved-filters'], queryFn: () => api<{ items: SavedFilter[] }>('/saved-filters') });
}

export function useCreateSavedFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (f: { name: string; query: Record<string, string> }) => api<SavedFilter>('/saved-filters', { method: 'POST', json: f }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['saved-filters'] }),
  });
}

export function useDeleteSavedFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/saved-filters/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['saved-filters'] }),
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<{ ok: boolean; removedListings: number }>(`/jobs/${id}`, { method: 'DELETE' }),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: ['job', id] });
      for (const k of ['jobs', 'stats', 'facets', 'sources', 'reviews']) void qc.invalidateQueries({ queryKey: [k] });
    },
  });
}
