import type { ApplicationState } from '@ajh/shared';
import { useSearchParams } from 'react-router';
import { useJobs } from '../api/hooks.ts';
import { JobCard } from '../components/JobCard.tsx';
import { EmptyState, ErrorState, Loading, PageHeader, Pagination } from '../components/ui.tsx';
import { STATE_LABEL } from '../lib/labels.ts';
import s from './pages.module.css';

const PIPELINE: ApplicationState[] = ['want_to_apply', 'applied', 'interview', 'offer', 'rejected', 'closed', 'reviewed'];

function Count({ state }: { state: ApplicationState }) {
  const r = useJobs({ state: [state], status: 'all', ignored: 'include', pageSize: 1 });
  return r.data ? <span className="muted"> {r.data.total}</span> : null;
}

/** Jobs grouped by application state. You apply manually on the original site. */
export function ApplicationsPage() {
  const [params, setParams] = useSearchParams();
  const state = (params.get('state') as ApplicationState) ?? 'applied';
  const page = Number(params.get('page') ?? 1);
  const jobs = useJobs({ state: [state], status: 'all', ignored: 'include', sort: 'captured', page });

  return (
    <>
      <PageHeader title="Candidaturas" subtitle="Acompanhamento manual: a candidatura é sempre feita por você, no link original da vaga." />
      <div className={s.tabs} role="tablist" style={{ marginBottom: 16 }}>
        {PIPELINE.map((x) => (
          <button key={x} role="tab" aria-selected={state === x} className={`${s.tab} ${state === x ? s.tabOn : ''}`} onClick={() => setParams({ state: x })}>
            {STATE_LABEL[x]}
            <Count state={x} />
          </button>
        ))}
      </div>
      {jobs.isPending ? (
        <Loading />
      ) : jobs.isError ? (
        <ErrorState error={jobs.error} retry={() => void jobs.refetch()} />
      ) : jobs.data.items.length === 0 ? (
        <EmptyState title={`Nenhuma vaga em “${STATE_LABEL[state]}”`}>Mude o estado de uma vaga no painel “Meu acompanhamento” do detalhe.</EmptyState>
      ) : (
        <>
          {jobs.data.items.map((j) => (
            <JobCard key={j.id} job={j} />
          ))}
          <Pagination page={page} pageSize={jobs.data.pageSize} total={jobs.data.total} onPage={(p) => setParams({ state, page: String(p) })} />
        </>
      )}
    </>
  );
}
