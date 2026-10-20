import { useSearchParams } from 'react-router';
import { useCancelRun, useRun, useRuns } from '../api/hooks.ts';
import { Badge, Card, EmptyState, ErrorState, Loading, PageHeader, Pagination, type Tone } from '../components/ui.tsx';
import { formatDateTime, formatDuration } from '../lib/format.ts';
import { RUN_STATUS_LABEL } from '../lib/labels.ts';
import s from './pages.module.css';

export const runTone = (status: string): Tone =>
  status === 'success' ? 'success' : status === 'failed' ? 'danger' : status === 'partial' ? 'warning' : status === 'running' ? 'info' : 'neutral';

const TRIGGER: Record<string, string> = { manual: 'Manual', scheduled: 'Agendada', cli: 'Terminal' };

export function RunsPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  const selected = params.get('run') ? Number(params.get('run')) : null;
  const runs = useRuns(page);

  return (
    <>
      <PageHeader title="Histórico de capturas" subtitle="Cada execução registra, por fonte, as vagas encontradas, novas, atualizadas, unidas, os erros e a duração." />
      <div className={s.twoCol} style={{ gridTemplateColumns: selected ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr' }}>
        <Card bodyClass={s.tableWrap}>
          {runs.isPending ? (
            <Loading />
          ) : runs.isError ? (
            <ErrorState error={runs.error} retry={() => void runs.refetch()} />
          ) : runs.data.items.length === 0 ? (
            <EmptyState title="Nenhuma captura ainda">Use “Capturar agora” no topo da página.</EmptyState>
          ) : (
            <>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Início</th>
                    <th>Gatilho</th>
                    <th>Status</th>
                    <th className={s.num}>Encontradas</th>
                    <th className={s.num}>Novas</th>
                    <th className={s.num}>Duração</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.data.items.map((r) => (
                    <tr key={r.id} style={{ cursor: 'pointer', background: r.id === selected ? 'var(--accent-2)' : undefined }} onClick={() => setParams({ page: String(page), run: String(r.id) })}>
                      <td>
                        <button className="btn btn-ghost btn-sm" aria-label={`Ver captura ${r.id}`}>
                          {r.id}
                        </button>
                      </td>
                      <td>{formatDateTime(r.started_at)}</td>
                      <td>{TRIGGER[r.trigger] ?? r.trigger}</td>
                      <td>
                        <Badge tone={runTone(r.status)}>{RUN_STATUS_LABEL[r.status] ?? r.status}</Badge>
                        {r.sources_failed > 0 && <span className="muted"> {r.sources_failed} falha(s)</span>}
                      </td>
                      <td className={s.num}>{r.jobs_found}</td>
                      <td className={s.num}>{r.jobs_new}</td>
                      <td className={s.num}>{formatDuration(r.duration_ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '0 12px' }}>
                <Pagination page={page} pageSize={runs.data.pageSize} total={runs.data.total} onPage={(p) => setParams({ page: String(p) })} />
              </div>
            </>
          )}
        </Card>
        {selected !== null && <RunDetailCard id={selected} />}
      </div>
    </>
  );
}

function RunDetailCard({ id }: { id: number }) {
  const run = useRun(id);
  const cancel = useCancelRun();
  if (run.isPending) return <Card><Loading /></Card>;
  if (run.isError) return <Card><ErrorState error={run.error} /></Card>;
  const r = run.data;
  return (
    <Card
      title={`Captura #${r.id}`}
      actions={
        r.status === 'running' ? (
          <button className="btn btn-sm btn-danger" onClick={() => cancel.mutate(r.id)}>
            Cancelar
          </button>
        ) : (
          <Badge tone={runTone(r.status)}>{RUN_STATUS_LABEL[r.status] ?? r.status}</Badge>
        )
      }
      bodyClass={s.tableWrap}
    >
      <div style={{ padding: '12px 16px' }} className="muted">
        {formatDateTime(r.started_at)} → {r.finished_at ? formatDateTime(r.finished_at) : 'em andamento'} · {formatDuration(r.duration_ms)} · {r.jobs_found} encontradas, {r.jobs_new} novas,{' '}
        {r.jobs_updated} atualizadas, {r.jobs_merged} unidas a outras fontes
        {r.error && <div className={s.error}>{r.error}</div>}
      </div>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Fonte</th>
            <th>Status</th>
            <th className={s.num}>Achadas</th>
            <th className={s.num}>Novas</th>
            <th className={s.num}>Atual.</th>
            <th className={s.num}>Unidas</th>
            <th className={s.num}>Req.</th>
            <th className={s.num}>Duração</th>
          </tr>
        </thead>
        <tbody>
          {r.sources.map((x) => (
            <tr key={x.id}>
              <td>
                {x.source}
                {(x.error_message || x.skip_reason) && <div className={x.error_message ? s.error : 'muted'} style={{ fontSize: 12 }}>{x.error_message ?? x.skip_reason}</div>}
                {x.invalid > 0 && <div className="muted" style={{ fontSize: 12 }}>{x.invalid} registro(s) inválido(s) ignorado(s)</div>}
              </td>
              <td>
                <Badge tone={runTone(x.status)}>{RUN_STATUS_LABEL[x.status] ?? x.status}</Badge>
              </td>
              <td className={s.num}>{x.found}</td>
              <td className={s.num}>{x.new}</td>
              <td className={s.num}>{x.updated}</td>
              <td className={s.num}>{x.merged}</td>
              <td className={s.num}>{x.attempts}</td>
              <td className={s.num}>{formatDuration(x.duration_ms)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
