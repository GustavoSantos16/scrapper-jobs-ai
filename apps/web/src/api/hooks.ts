import type { JobDetail, JobSummary, JobsQueryInput, Page, SourceInfo } from '@ajh/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, toQuery } from './client.ts';
import type { Company, Facets, ReviewItem, RunDetail, RunRow, Stats } from './types.ts';

export const keys = {
  jobs: (q: JobsQueryInput) => ['jobs', q] as const,
  job: (id: number) => ['job', id] as const,
  stats: ['stats'] as const,
  facets: ['facets'] as const,
  sources: ['sources'] as const,
  runs: (page: number) => ['runs', page] as const,
  run: (id: number) => ['run', id] as const,
  reviews: (status: string, page: number) => ['reviews', status, page] as const,
  companies: ['companies'] as const,
};

export function useJobs(q: JobsQueryInput) {
  return useQuery({
    queryKey: keys.jobs(q),
    queryFn: () => api<Page<JobSummary>>(`/jobs${toQuery(q as Record<string, unknown>)}`),
    placeholderData: keepPreviousData,
  });
}

export function useJob(id: number) {
  return useQuery({ queryKey: keys.job(id), queryFn: () => api<JobDetail>(`/jobs/${id}`), enabled: Number.isFinite(id) });
}

export function useStats() {
  return useQuery({ queryKey: keys.stats, queryFn: () => api<Stats>('/stats') });
}

export function useFacets() {
  return useQuery({ queryKey: keys.facets, queryFn: () => api<Facets>('/facets'), staleTime: 60_000 });
}

export function useSources() {
  return useQuery({ queryKey: keys.sources, queryFn: () => api<{ items: SourceInfo[] }>('/sources') });
}

export function useRuns(page = 1) {
  return useQuery({
    queryKey: keys.runs(page),
    queryFn: () => api<Page<RunRow> & { currentRunId: number | null }>(`/runs?page=${page}&pageSize=20`),
    refetchInterval: (query) => (query.state.data?.currentRunId ? 2000 : false),
  });
}

export function useRun(id: number | null) {
  return useQuery({
    queryKey: keys.run(id ?? -1),
    queryFn: () => api<RunDetail>(`/runs/${id}`),
    enabled: id !== null,
    refetchInterval: (query) => (query.state.data?.status === 'running' || !query.state.data ? 1000 : false),
  });
}

/** Invalidates everything that a finished capture changes. */
export function useInvalidateCaptured() {
  const qc = useQueryClient();
  return () => {
    for (const k of ['jobs', 'job', 'stats', 'facets', 'sources', 'runs', 'reviews']) void qc.invalidateQueries({ queryKey: [k] });
  };
}

export function useStartRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sources?: string[]) => api<{ runId: number }>('/runs', { method: 'POST', json: sources ? { sources } : {} }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['runs'] }),
  });
}

export function useCancelRun() {
  return useMutation({ mutationFn: (id: number) => api(`/runs/${id}/cancel`, { method: 'POST' }) });
}

export function usePatchSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; enabled?: boolean; minIntervalMinutes?: number | null; maxRequests?: number | null }) =>
      api<SourceInfo>(`/sources/${id}`, { method: 'PATCH', json: body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.sources }),
  });
}

export function useReviews(status: string, page: number) {
  return useQuery({
    queryKey: keys.reviews(status, page),
    queryFn: () => api<Page<ReviewItem>>(`/reviews?status=${status}&page=${page}`),
  });
}

export function useResolveReview() {
  const invalidate = useInvalidateCaptured();
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'merge' | 'dismiss' }) => api(`/reviews/${id}`, { method: 'POST', json: { action } }),
    onSuccess: invalidate,
  });
}

export function useCompanies() {
  return useQuery({ queryKey: keys.companies, queryFn: () => api<{ items: Company[] }>('/companies') });
}

export function useSaveCompanies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (companies: Company[]) => api<{ items: Company[] }>('/companies', { method: 'PUT', json: { companies } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.companies });
      void qc.invalidateQueries({ queryKey: keys.sources });
    },
  });
}

export function useValidateCompany() {
  return useMutation({
    mutationFn: (c: Pick<Company, 'ats' | 'slug'>) => api<{ ok: boolean; jobs: number; message?: string }>('/companies/validate', { method: 'POST', json: c }),
  });
}
