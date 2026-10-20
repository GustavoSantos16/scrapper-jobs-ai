import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useCreateSavedFilter, useDeleteSavedFilter, useSavedFilters, type SavedFilter } from '../api/tracking.ts';
import { ConfirmDialog } from './ui.tsx';

/** Saves the current URL filters under a name and re-applies them later. */
export function SavedFilters() {
  const [params, setParams] = useSearchParams();
  const saved = useSavedFilters();
  const create = useCreateSavedFilter();
  const remove = useDeleteSavedFilter();
  const [deleting, setDeleting] = useState<SavedFilter | null>(null);
  const current = Object.fromEntries([...params].filter(([k]) => k !== 'page'));
  const hasFilters = Object.keys(current).length > 0;
  const items = saved.data?.items ?? [];

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {items.length > 0 && (
        <>
          <label className="visually-hidden" htmlFor="saved-select">
            Filtros salvos
          </label>
          <select
            id="saved-select"
            className="select"
            style={{ width: 'auto' }}
            value=""
            onChange={(e) => {
              const f = items.find((x) => String(x.id) === e.target.value);
              if (f) setParams(new URLSearchParams(f.query));
            }}
          >
            <option value="">Filtros salvos…</option>
            {items.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Excluir filtro salvo"
            className="select"
            style={{ width: 'auto' }}
            value=""
            onChange={(e) => setDeleting(items.find((x) => String(x.id) === e.target.value) ?? null)}
          >
            <option value="">Excluir…</option>
            {items.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </>
      )}
      <button
        className="btn btn-sm"
        disabled={!hasFilters || create.isPending}
        title={hasFilters ? 'Salvar a busca atual' : 'Aplique algum filtro primeiro'}
        onClick={() => {
          const name = window.prompt('Nome do filtro salvo:');
          if (name?.trim()) create.mutate({ name: name.trim(), query: current });
        }}
      >
        Salvar busca
      </button>
      <ConfirmDialog
        open={deleting !== null}
        title={`Excluir o filtro "${deleting?.name}"?`}
        confirmLabel="Excluir"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
}
