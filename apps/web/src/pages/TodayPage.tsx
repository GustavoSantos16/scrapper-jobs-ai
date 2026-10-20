import { useSearchParams } from 'react-router';
import { useJobs } from '../api/hooks.ts';
import { JobCard } from '../components/JobCard.tsx';
import { Card, EmptyState, ErrorState, Loading, PageHeader, Pagination } from '../components/ui.tsx';
import { periodRange } from '../lib/jobQuery.ts';
import { startOfDayIso } from '../lib/format.ts';
import s from './pages.module.css';

const TABS = [
  { value: 'today', label: 'Hoje' },
  { value: '24h', label: '24 horas' },
  { value: '3d', label: '3 dias' },
  { value: '7d', label: '7 dias' },
  { value: 'custom', label: 'Personalizado' },
];

/** Jobs by publication date (publishedAt), plus jobs captured today whose date is unknown. */
export function TodayPage() {
  const [params, setParams] = useSearchParams();
  const period = params.get('period') ?? 'today';
  const page = Number(params.get('page') ?? 1);
  const range = periodRange(period, params.get('from'), params.get('to'));
  const published = useJobs({ ...range, sort: 'published', page, pageSize: 25 });
  const unknown = useJobs({ publishedUnknown: true, seenFrom: startOfDayIso(0), sort: 'score', pageSize: 50 });

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    next.delete('page');
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader title="Vagas de hoje" subtitle="Filtradas pela data de publicação informada pela fonte (não pela data de captura)." />
      <div className={s.tabs} role="tablist" aria-label="Período">
        {TABS.map((t) => (
          <button key={t.value} role="tab" aria-selected={period === t.value} className={`${s.tab} ${period === t.value ? s.tabOn : ''}`} onClick={() => set({ period: t.value })}>
            {t.label}
          </button>
        ))}
        {period === 'custom' && (
          <span className={s.inline}>
            <label className="visually-hidden" htmlFor="t-from">De</label>
            <input id="t-from" type="date" className="input" value={params.get('from') ?? ''} onChange={(e) => set({ from: e.target.value || null })} />
            <span className="muted">até</span>
            <label className="visually-hidden" htmlFor="t-to">Até</label>
            <input id="t-to" type="date" className="input" value={params.get('to') ?? ''} onChange={(e) => set({ to: e.target.value || null })} />
          </span>
        )}
      </div>

      <section style={{ marginTop: 16 }}>
        <h2 className={s.sectionTitle}>
          Publicadas no período {published.data && <span className="muted">· {published.data.total}</span>}
        </h2>
        {published.isPending ? (
          <Loading />
        ) : published.isError ? (
          <ErrorState error={published.error} retry={() => void published.refetch()} />
        ) : published.data.items.length === 0 ? (
          <EmptyState title="Nenhuma vaga publicada neste período">Tente um período maior ou rode uma captura.</EmptyState>
        ) : (
          <>
            {published.data.items.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
            <Pagination page={page} pageSize={25} total={published.data.total} onPage={(p) => setParams((prev) => { const n = new URLSearchParams(prev); n.set('page', String(p)); return n; })} />
          </>
        )}
      </section>

      <section style={{ marginTop: 28 }}>
        <Card title={<>Capturadas hoje, data de publicação desconhecida {unknown.data && <span className="muted">· {unknown.data.total}</span>}</>}>
          <p className="muted" style={{ marginTop: 0 }}>
            A fonte não informa quando estas vagas foram publicadas. Elas não entram na lista acima porque a data de captura não é a data de publicação.
          </p>
          {unknown.isPending ? (
            <Loading />
          ) : unknown.isError ? (
            <ErrorState error={unknown.error} />
          ) : unknown.data.items.length === 0 ? (
            <EmptyState title="Nenhuma vaga sem data capturada hoje" />
          ) : (
            unknown.data.items.map((j) => <JobCard key={j.id} job={j} />)
          )}
        </Card>
      </section>
    </>
  );
}
