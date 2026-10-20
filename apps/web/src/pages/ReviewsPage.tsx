import { useState } from 'react';
import { Link } from 'react-router';
import { useResolveReview, useReviews } from '../api/hooks.ts';
import type { ReviewItem } from '../api/types.ts';
import { JobCard } from '../components/JobCard.tsx';
import { Card, ConfirmDialog, EmptyState, ErrorState, Loading, PageHeader, Pagination } from '../components/ui.tsx';
import { formatDateTime } from '../lib/format.ts';
import s from './pages.module.css';

export function ReviewsPage() {
  const [status, setStatus] = useState<'pending' | 'merged' | 'dismissed'>('pending');
  const [page, setPage] = useState(1);
  const reviews = useReviews(status, page);
  const resolve = useResolveReview();
  const [merging, setMerging] = useState<ReviewItem | null>(null);

  return (
    <>
      <PageHeader
        title="Revisão de duplicatas"
        subtitle="Pares parecidos demais para ignorar, mas sem certeza para unir automaticamente. Nada é unido sem a sua decisão."
      />
      <div className={s.tabs} role="tablist" style={{ marginBottom: 16 }}>
        {(['pending', 'merged', 'dismissed'] as const).map((x) => (
          <button key={x} role="tab" aria-selected={status === x} className={`${s.tab} ${status === x ? s.tabOn : ''}`} onClick={() => (setStatus(x), setPage(1))}>
            {{ pending: 'Pendentes', merged: 'Unidas', dismissed: 'Mantidas separadas' }[x]}
          </button>
        ))}
      </div>
      {reviews.isPending ? (
        <Loading />
      ) : reviews.isError ? (
        <ErrorState error={reviews.error} retry={() => void reviews.refetch()} />
      ) : reviews.data.items.length === 0 ? (
        <Card>
          <EmptyState title={status === 'pending' ? 'Nenhum par para revisar' : 'Nada por aqui ainda'} />
        </Card>
      ) : (
        <div className={s.stack}>
          {reviews.data.items.map((r) => (
            <Card
              key={r.id}
              title={`Semelhança ${Math.round(r.confidence * 100)}%`}
              actions={
                status === 'pending' ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-sm" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: r.id, action: 'dismiss' })}>
                      São vagas diferentes
                    </button>
                    <button className="btn btn-sm btn-primary" disabled={resolve.isPending} onClick={() => setMerging(r)}>
                      Unir
                    </button>
                  </div>
                ) : (
                  <span className="muted">{formatDateTime(r.resolvedAt)}</span>
                )
              }
            >
              {status === 'merged' ? (
                <p style={{ margin: 0 }}>
                  “{r.mergedTitle}” ({r.mergedCompany ?? '—'}) foi unida a{' '}
                  {r.keptJobId ? <Link to={`/vagas/${r.keptJobId}`}>vaga #{r.keptJobId}</Link> : 'uma vaga que não existe mais'}.
                </p>
              ) : (
                <div className={s.pair}>
                  {r.a ? <JobCard job={r.a} /> : <EmptyState title="Vaga removida" />}
                  {r.b ? <JobCard job={r.b} /> : <EmptyState title="Vaga removida" />}
                </div>
              )}
            </Card>
          ))}
          <Pagination page={page} pageSize={reviews.data.pageSize} total={reviews.data.total} onPage={setPage} />
        </div>
      )}
      <ConfirmDialog
        open={merging !== null}
        title="Unir estas vagas?"
        confirmLabel="Unir vagas"
        onCancel={() => setMerging(null)}
        onConfirm={() => {
          if (merging) resolve.mutate({ id: merging.id, action: 'merge' });
          setMerging(null);
        }}
      >
        As fontes das duas passam a apontar para uma única vaga (a mais antiga). Notas e estado da candidatura são preservados. Esta ação não pode ser desfeita.
      </ConfirmDialog>
    </>
  );
}
