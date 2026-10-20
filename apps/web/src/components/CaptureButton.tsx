import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../api/client.ts';
import { useCancelRun, useInvalidateCaptured, useRun, useRuns, useStartRun } from '../api/hooks.ts';
import { RUN_STATUS_LABEL } from '../lib/labels.ts';
import { Icon } from './Icon.tsx';
import { Badge, Spinner } from './ui.tsx';
import s from './CaptureButton.module.css';

const tone = (status: string) =>
  status === 'success' ? 'success' : status === 'failed' ? 'danger' : status === 'partial' ? 'warning' : status === 'running' ? 'info' : 'neutral';

/** Manual capture trigger with real progress (polls the run while it is running). */
export function CaptureButton() {
  const runs = useRuns(1);
  const start = useStartRun();
  const cancel = useCancelRun();
  const invalidate = useInvalidateCaptured();
  const [runId, setRunId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const current = runs.data?.currentRunId ?? null;
  const watched = runId ?? current;
  const run = useRun(watched);
  // refresh data once per watched run when it reaches a final status (even if it finished
  // before the first poll ever saw it "running")
  const refreshedFor = useRef<number | null>(null);
  useEffect(() => {
    const d = run.data;
    if (!d || d.status === 'running' || refreshedFor.current === d.id) return;
    if (d.id === runId || d.id === current) {
      refreshedFor.current = d.id;
      invalidate();
    }
  }, [run.data, runId, current, invalidate]);
  // a capture started elsewhere (scheduler, terminal) finished while this page was open
  const previousCurrent = useRef<number | null>(null);
  useEffect(() => {
    if (previousCurrent.current !== null && current === null) invalidate();
    previousCurrent.current = current;
  }, [current, invalidate]);

  const running = run.data?.status === 'running';
  const done = run.data ? run.data.sources.filter((x) => !['pending', 'running'].includes(x.status)).length : 0;
  const total = run.data?.sources.length ?? 0;
  const conflict = start.error instanceof ApiError && start.error.status === 409;

  const onStart = () => {
    setOpen(true);
    start.mutate(undefined, { onSuccess: (r) => setRunId(r.runId), onError: () => runs.refetch() });
  };

  return (
    <div className={s.wrap}>
      <button className="btn btn-primary" onClick={running ? () => setOpen((o) => !o) : onStart} disabled={start.isPending} aria-expanded={open}>
        {running ? <Spinner label="Capturando" /> : <Icon name="refresh" size={16} />}
        <span className={s.label}>{running ? `Capturando ${done}/${total}` : 'Capturar agora'}</span>
      </button>
      {open && (
        <div className={s.panel} role="dialog" aria-label="Progresso da captura">
          <div className={s.head}>
            <strong>{watched ? `Captura #${watched}` : 'Captura'}</strong>
            <button className="btn btn-ghost btn-sm" aria-label="Fechar" onClick={() => setOpen(false)}>
              <Icon name="close" size={14} />
            </button>
          </div>
          {start.error && !conflict && <p style={{ color: 'var(--danger)' }}>{start.error.message}</p>}
          {conflict && <p className="muted">Já existe uma captura em andamento. Acompanhando o progresso dela.</p>}
          {run.data && (
            <>
              <Badge tone={tone(run.data.status)}>{RUN_STATUS_LABEL[run.data.status] ?? run.data.status}</Badge>
              <div className={s.bar} aria-hidden="true">
                <div className={s.fill} style={{ width: `${total ? (done / total) * 100 : 100}%` }} />
              </div>
              <div className="muted" style={{ marginBottom: 8 }}>
                {run.data.jobs_found} vagas encontradas · {run.data.jobs_new} novas
              </div>
              <div className={s.list}>
                {run.data.sources.map((x) => (
                  <div key={x.id} className={s.row} title={x.error_message ?? x.skip_reason ?? undefined}>
                    <span>{x.source}</span>
                    <span>
                      {x.status === 'running' && <Spinner label="" />}{' '}
                      {x.status === 'skipped' ? (
                        <span className="muted">pulada</span>
                      ) : x.status === 'failed' ? (
                        <span style={{ color: 'var(--danger)' }}>falhou</span>
                      ) : x.status === 'success' ? (
                        `${x.found} (${x.new} novas)`
                      ) : (
                        <span className="muted">{RUN_STATUS_LABEL[x.status] ?? x.status}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'space-between' }}>
                <Link to={`/capturas?run=${run.data.id}`} onClick={() => setOpen(false)}>
                  Ver detalhes
                </Link>
                {running && (
                  <button className="btn btn-sm btn-danger" onClick={() => cancel.mutate(run.data!.id)} disabled={cancel.isPending}>
                    Cancelar
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
