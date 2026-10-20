import { useSearchParams } from 'react-router';
import { toQuery } from '../api/client.ts';
import { useJobs } from '../api/hooks.ts';
import { Filters } from '../components/Filters.tsx';
import { Card, PageHeader } from '../components/ui.tsx';
import { paramsToQuery } from '../lib/jobQuery.ts';

/** Exports every job matching the current filters as CSV or JSON. */
export function ExportPage() {
  const [params] = useSearchParams();
  const query = paramsToQuery(params);
  const preview = useJobs({ ...query, pageSize: 1 });
  const href = (format: 'csv' | 'json') => `/api/export${toQuery({ ...(query as Record<string, unknown>), format, page: undefined, pageSize: undefined })}`;
  const total = preview.data?.total;

  return (
    <>
      <PageHeader title="Exportação" subtitle="Escolha os filtros; o arquivo inclui todas as vagas que batem com eles (até 10.000), não só uma página." />
      <Card>
        <Filters />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
          <a className="btn btn-primary" href={href('csv')} download>
            Baixar CSV
          </a>
          <a className="btn" href={href('json')} download>
            Baixar JSON
          </a>
          <span className="muted">{total === undefined ? 'Contando…' : `${total.toLocaleString('pt-BR')} vaga(s) serão exportadas`}</span>
        </div>
      </Card>
    </>
  );
}
