import { Link, useNavigate, useParams } from 'react-router';
import { useJob } from '../api/hooks.ts';
import { Icon } from '../components/Icon.tsx';
import { geoTone, SourceLink } from '../components/JobCard.tsx';
import { DeleteJobButton } from '../components/DeleteJobButton.tsx';
import { TrackingPanel } from '../components/TrackingPanel.tsx';
import { Badge, Card, ChipRow, EmptyState, ErrorState, Loading, ScoreBadge } from '../components/ui.tsx';
import { formatDate, formatDateTime, formatRelative, formatSalary } from '../lib/format.ts';
import { CONTRACT_LABEL, GEO_LABEL, LANGUAGE_LABEL, REMOTE_LABEL, SENIORITY_LABEL } from '../lib/labels.ts';
import s from './pages.module.css';

const MATCH_LABEL: Record<string, string> = {
  primary: 'Fonte principal',
  url: 'Mesma URL',
  ats_id: 'Mesmo ID no ATS',
  identity: 'Mesma empresa + cargo + local',
  similarity: 'Texto muito semelhante',
  manual: 'Unida manualmente',
};

export function JobDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const job = useJob(id);
  if (job.isPending) return <Loading label="Carregando vaga…" />;
  if (job.isError) {
    return (job.error as { status?: number }).status === 404 ? (
      <EmptyState title="Vaga não encontrada" action={<Link to="/vagas">Voltar para a lista</Link>} />
    ) : (
      <ErrorState error={job.error} retry={() => void job.refetch()} />
    );
  }
  const j = job.data;
  const salary = formatSalary(j.salaryMin, j.salaryMax, j.salaryCurrency, j.salaryPeriod);

  return (
    <article>
      <p style={{ margin: '0 0 12px' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => (history.length > 1 ? navigate(-1) : navigate('/vagas'))}>
          ← Voltar
        </button>
      </p>
      <header style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 20 }}>
        <ScoreBadge score={j.score} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ fontSize: 22 }}>{j.title}</h1>
          <p className="muted" style={{ margin: '4px 0 10px', fontSize: 15 }}>
            {j.company ?? 'Empresa não informada'}
            {j.locationRaw ? ` · ${j.locationRaw.length > 120 ? `${j.locationRaw.slice(0, 120)}…` : j.locationRaw}` : ''}
          </p>
          <ChipRow>
            {j.status === 'possibly_closed' && <Badge tone="warning">Possivelmente encerrada</Badge>}
            <Badge tone={j.remoteType === 'remote' ? 'accent' : 'neutral'}>{REMOTE_LABEL[j.remoteType]}</Badge>
            {j.geoEligibility.map((g) => (
              <Badge key={g} tone={geoTone(g)}>
                {GEO_LABEL[g]}
              </Badge>
            ))}
            <Badge>{SENIORITY_LABEL[j.seniority]}</Badge>
            {j.contractTypes.map((c) => (
              <Badge key={c}>{CONTRACT_LABEL[c]}</Badge>
            ))}
            {salary && <Badge tone="success">{salary}</Badge>}
          </ChipRow>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <DeleteJobButton
            id={j.id}
            title={j.title}
            label="Excluir"
            personal={{ favorite: j.tracking.favorite, hasNotes: j.tracking.notes !== '', applied: j.tracking.state !== 'new' }}
            onDeleted={() => navigate('/vagas', { replace: true })}
          />
          <a className="btn btn-primary" href={j.url} target="_blank" rel="noopener">
            <Icon name="external" size={16} /> Abrir vaga original
          </a>
        </div>
      </header>

      <div className={s.twoCol}>
        <div className={s.stack}>
          <Card title="Descrição">
            {j.descriptionHtml ? (
              // HTML was sanitized on the backend (allowlist); CSP blocks inline scripts as a second layer
              <div className={s.description} dangerouslySetInnerHTML={{ __html: j.descriptionHtml }} />
            ) : j.descriptionText ? (
              <div className={s.description} style={{ whiteSpace: 'pre-wrap' }}>
                {j.descriptionText}
              </div>
            ) : (
              <p className="muted">A fonte não forneceu descrição. Veja a vaga original.</p>
            )}
          </Card>
          {j.technologies.length > 0 && (
            <Card title="Tecnologias detectadas">
              <ChipRow>
                {j.technologies.map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </ChipRow>
            </Card>
          )}
        </div>

        <aside className={s.stack}>
          <TrackingPanel key={j.id} job={j} />
          <Card title="Datas">
            <dl className={s.dl}>
              <dt>Publicada</dt>
              <dd>{j.publishedAt ? `${formatDateTime(j.publishedAt)} (${formatRelative(j.publishedAt)})` : <em>Desconhecida (a fonte não informa)</em>}</dd>
              <dt>Vista pela 1ª vez</dt>
              <dd>{formatDateTime(j.firstSeenAt)}</dd>
              <dt>Vista por último</dt>
              <dd>{formatDateTime(j.lastSeenAt)}</dd>
              <dt>Atualizada</dt>
              <dd>{formatDateTime(j.updatedAt)}</dd>
              {j.language && (
                <>
                  <dt>Idioma</dt>
                  <dd>{LANGUAGE_LABEL[j.language] ?? j.language}</dd>
                </>
              )}
            </dl>
          </Card>

          <Card title={`Por que ${j.score} pontos`}>
            <ul className={s.reasonList}>
              {j.scoreBreakdown.map((r) => (
                <li key={r.key} className={s.reason}>
                  <span>
                    <strong>{r.label}</strong>
                    <br />
                    <span className="muted">{r.reason}</span>
                  </span>
                  <span className={r.points < 0 ? s.neg : r.points >= r.max ? s.pos : undefined} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {r.points > 0 ? '+' : ''}
                    {r.points.toLocaleString('pt-BR')} / {r.max.toLocaleString('pt-BR')}
                  </span>
                  <span className={s.reasonBar} aria-hidden="true">
                    <span
                      style={{
                        display: 'block',
                        height: '100%',
                        width: `${Math.min(100, (Math.abs(r.points) / (r.max || 1)) * 100)}%`,
                        background: r.points < 0 ? 'var(--danger)' : 'var(--accent)',
                      }}
                    />
                  </span>
                </li>
              ))}
            </ul>
            <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
              Pesos editáveis em <Link to="/perfil">Perfil e preferências</Link>. Informação ausente vale pontuação neutra; incompatibilidade explícita desconta.
            </p>
          </Card>

          <Card title={`Fontes (${j.listings.length})`}>
            <ul className={s.timeline}>
              {j.listings.map((l) => (
                <li key={l.id}>
                  <SourceLink name={l.sourceName} url={l.url} />{' '}
                  {l.status === 'possibly_closed' && <Badge tone="warning">não vista em {l.missedRuns} execuções</Badge>}
                  <div className="muted" style={{ fontSize: 12 }}>
                    {MATCH_LABEL[l.matchMethod] ?? l.matchMethod}
                    {!l.isPrimary && ` · confiança ${Math.round(l.matchConfidence * 100)}%`} · vista {formatDate(l.firstSeenAt)} → {formatDate(l.lastSeenAt)}
                    {l.publishedAt && ` · publicada ${formatDate(l.publishedAt)}`}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {j.reviews.length > 0 && (
            <Card title="Possíveis duplicatas" actions={<Link to="/duplicatas">Revisar</Link>}>
              <ul className={s.timeline}>
                {j.reviews.map((r) => (
                  <li key={r.id}>
                    <Link to={`/vagas/${r.otherJobId}`}>{r.otherTitle}</Link>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {r.otherCompany} · semelhança {Math.round(r.confidence * 100)}%
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </article>
  );
}
