import type { JobSummary, JobsQueryInput } from '@ajh/shared';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useJobs } from '../api/hooks.ts';
import { Filters } from '../components/Filters.tsx';
import { JobCard } from '../components/JobCard.tsx';
import { EmptyState, ErrorState, Loading, PageHeader, Pagination } from '../components/ui.tsx';
import { paramsToQuery } from '../lib/jobQuery.ts';

export interface JobsPageProps {
  title: string;
  subtitle?: ReactNode;
  fixed?: JobsQueryInput;
  hide?: string[];
  emptyTitle?: string;
  emptyText?: ReactNode;
  headerActions?: ReactNode;
  filterExtra?: ReactNode;
  renderActions?: (job: JobSummary) => ReactNode;
}

/** Server-side search page: filters/sorting/page live in the URL. */
export function JobsPage({ title, subtitle, fixed, hide, emptyTitle, emptyText, headerActions, filterExtra, renderActions }: JobsPageProps) {
  const [params, setParams] = useSearchParams();
  const query = paramsToQuery(params, fixed);
  const jobs = useJobs(query);
  const page = Number(params.get('page') ?? 1);

  const goPage = (p: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(p));
    setParams(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle ?? (jobs.data ? `${jobs.data.total.toLocaleString('pt-BR')} vaga(s)` : undefined)}
        actions={headerActions}
      />
      <Filters hide={hide} extra={filterExtra} />
      <div style={{ marginTop: 16, opacity: jobs.isPlaceholderData ? 0.6 : 1, transition: 'opacity .15s' }} aria-busy={jobs.isFetching}>
        {jobs.isPending ? (
          <Loading label="Buscando vagas…" />
        ) : jobs.isError ? (
          <ErrorState error={jobs.error} retry={() => void jobs.refetch()} />
        ) : jobs.data.items.length === 0 ? (
          <EmptyState title={emptyTitle ?? 'Nenhuma vaga encontrada'}>
            {emptyText ?? 'Ajuste ou limpe os filtros. Se o acervo estiver vazio, rode uma captura em "Capturar agora".'}
          </EmptyState>
        ) : (
          <>
            {jobs.data.items.map((j) => (
              <JobCard key={j.id} job={j} actions={renderActions?.(j)} />
            ))}
            <Pagination page={page} pageSize={jobs.data.pageSize} total={jobs.data.total} onPage={goPage} />
          </>
        )}
      </div>
    </>
  );
}
