import { APPLICATION_STATES, type JobDetail } from '@ajh/shared';
import { useState } from 'react';
import { useUpdateTracking } from '../api/tracking.ts';
import { formatDateTime, localDay, dayToIso } from '../lib/format.ts';
import { STATE_LABEL } from '../lib/labels.ts';
import { FavoriteButton } from './FavoriteButton.tsx';
import { Card } from './ui.tsx';

const FIELD_LABEL: Record<string, string> = {
  state: 'Estado',
  favorite: 'Favorita',
  ignored: 'Ignorada',
  notes: 'Notas editadas',
  appliedAt: 'Data da candidatura',
  recruiter: 'Recrutador(a)',
  processUrl: 'Link do processo',
};

const show = (field: string, v: string | null) =>
  v === null ? '—' : field === 'state' ? (STATE_LABEL[v as keyof typeof STATE_LABEL] ?? v) : field === 'favorite' || field === 'ignored' ? (v === '1' ? 'sim' : 'não') : field === 'appliedAt' ? formatDateTime(v) : v;

/** Personal data for a job. Opening the original link never changes any of it. */
export function TrackingPanel({ job }: { job: JobDetail }) {
  const t = job.tracking;
  const update = useUpdateTracking();
  const [notes, setNotes] = useState(t.notes);
  const [recruiter, setRecruiter] = useState(t.recruiter ?? '');
  const [processUrl, setProcessUrl] = useState(t.processUrl ?? '');
  const dirty = notes !== t.notes || recruiter !== (t.recruiter ?? '') || processUrl !== (t.processUrl ?? '');

  return (
    <Card title="Meu acompanhamento" actions={<FavoriteButton id={job.id} favorite={t.favorite} />}>
      <div style={{ display: 'grid', gap: 10 }}>
        <div>
          <label className="label" htmlFor="t-state">
            Estado
          </label>
          <select id="t-state" className="select" value={t.state} disabled={update.isPending} onChange={(e) => update.mutate({ id: job.id, state: e.target.value as JobDetail['tracking']['state'] })}>
            {APPLICATION_STATES.map((s) => (
              <option key={s} value={s}>
                {STATE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="t-applied">
            Data da candidatura
          </label>
          <input
            id="t-applied"
            type="date"
            className="input"
            value={t.appliedAt ? localDay(t.appliedAt) : ''}
            onChange={(e) => update.mutate({ id: job.id, appliedAt: e.target.value ? dayToIso(e.target.value) : null })}
          />
        </div>
        <form
          style={{ display: 'grid', gap: 10 }}
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ id: job.id, notes, recruiter: recruiter.trim() || null, processUrl: processUrl.trim() || null });
          }}
        >
          <div>
            <label className="label" htmlFor="t-rec">
              Recrutador(a)
            </label>
            <input id="t-rec" className="input" value={recruiter} onChange={(e) => setRecruiter(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="t-url">
              Link do processo
            </label>
            <input id="t-url" className="input" type="url" placeholder="https://" value={processUrl} onChange={(e) => setProcessUrl(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="t-notes">
              Notas
            </label>
            <textarea id="t-notes" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" disabled={!dirty || update.isPending}>
              Salvar
            </button>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
              <input type="checkbox" checked={t.ignored} onChange={(e) => update.mutate({ id: job.id, ignored: e.target.checked })} />
              Ignorar esta vaga
            </label>
          </div>
          {update.error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{update.error.message}</div>}
        </form>
        {job.history.length > 0 && (
          <details>
            <summary className="muted" style={{ cursor: 'pointer' }}>
              Histórico ({job.history.length})
            </summary>
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 6, fontSize: 12 }}>
              {job.history.map((h) => (
                <li key={h.id}>
                  <span className="muted">{formatDateTime(h.changedAt)}</span> · {FIELD_LABEL[h.field] ?? h.field}
                  {h.field !== 'notes' && (
                    <>
                      : {show(h.field, h.oldValue)} → <strong>{show(h.field, h.newValue)}</strong>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Card>
  );
}
