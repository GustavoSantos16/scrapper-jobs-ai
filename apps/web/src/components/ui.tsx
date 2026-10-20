import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import s from './ui.module.css';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

export function Badge({ children, tone = 'neutral', title }: { children: ReactNode; tone?: Tone; title?: string }) {
  return (
    <span className={`${s.badge} ${tone !== 'neutral' ? s[`tone-${tone}`] : ''}`} title={title}>
      {children}
    </span>
  );
}

export function Card({ title, actions, children, bodyClass }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; bodyClass?: string }) {
  return (
    <section className={s.card}>
      {(title || actions) && (
        <header className={s.cardHeader}>
          {title && <h2 className={s.cardTitle}>{title}</h2>}
          {actions}
        </header>
      )}
      <div className={bodyClass ?? s.cardBody}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className={s.pageHeader}>
      <div>
        <h1 className={s.pageTitle}>{title}</h1>
        {subtitle && <p className={s.pageSubtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={s.pageActions}>{actions}</div>}
    </header>
  );
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <span role="status" aria-label={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className={s.spinner} />
    </span>
  );
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className={s.state}>
      <Spinner label={label} />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={s.state}>
      <div className={s.stateTitle}>{title}</div>
      {children && <div>{children}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Erro inesperado';
  return (
    <div className={`${s.state} ${s.stateError}`} role="alert">
      <div className={s.stateTitle}>Não foi possível carregar</div>
      <div>{msg.includes('Failed to fetch') ? 'A API local não está respondendo. Ela está rodando? (pnpm dev)' : msg}</div>
      {retry && (
        <button className="btn btn-sm" onClick={retry}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}

export function ScoreBadge({ score, size }: { score: number; size?: 'sm' }) {
  const cls = score >= 70 ? s.scoreHigh : score >= 45 ? s.scoreMid : s.scoreLow;
  return (
    <span className={`${s.score} ${cls}`} style={size === 'sm' ? { minWidth: 32, height: 28, fontSize: 13 } : undefined} title={`Pontuação de aderência ao perfil: ${score}/100`}>
      {score}
    </span>
  );
}

export function Kpi({ label, value, hint, to }: { label: string; value: ReactNode; hint?: ReactNode; to?: string }) {
  const body = (
    <div className={`${s.card} ${s.kpi}`}>
      <div className={s.kpiLabel}>{label}</div>
      <div className={s.kpiValue}>{value}</div>
      {hint && <div className={s.kpiHint}>{hint}</div>}
    </div>
  );
  return to ? (
    <Link to={to} className={s.kpiLink}>
      {body}
    </Link>
  ) : (
    body
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className={s.pagination} aria-label="Paginação">
      <span>
        {from}–{to} de {total.toLocaleString('pt-BR')}
      </span>
      <div className={s.pager}>
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ← Anterior
        </button>
        <span>
          Página {page} de {pages}
        </span>
        <button className="btn btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Próxima →
        </button>
      </div>
    </nav>
  );
}

/** Confirmation for destructive actions (native <dialog>). */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirmar',
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={s.dialog} onCancel={onCancel} aria-labelledby="confirm-title">
      <div className={s.dialogBody}>
        <h2 id="confirm-title" style={{ fontSize: 16 }}>
          {title}
        </h2>
        {children && <div className="muted">{children}</div>}
      </div>
      <div className={s.dialogActions}>
        <button className="btn" onClick={onCancel}>
          Cancelar
        </button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <div className={s.chipRow}>{children}</div>;
}
