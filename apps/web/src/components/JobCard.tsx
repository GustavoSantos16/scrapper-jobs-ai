import type { JobSummary } from '@ajh/shared';
import { Link } from 'react-router';
import { formatDate, formatRelative, formatSalary } from '../lib/format.ts';
import { CONTRACT_LABEL, GEO_LABEL, REMOTE_LABEL, SENIORITY_LABEL, STATE_LABEL } from '../lib/labels.ts';
import { Icon } from './Icon.tsx';
import { Badge, ChipRow, ScoreBadge } from './ui.tsx';
import s from './JobCard.module.css';
import type { ReactNode } from 'react';

export const geoTone = (g: string) => (['worldwide', 'americas', 'latam', 'brazil'].includes(g) ? 'success' : 'danger');

/**
 * Source attribution link. Deliberately without rel="nofollow"/"noreferrer": boards such as
 * Remote OK require a followed link back that sends them the traffic.
 */
export function SourceLink({ name, url }: { name: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener">
      via {name}
    </a>
  );
}

export function JobCard({ job, actions }: { job: JobSummary; actions?: ReactNode }) {
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryPeriod);
  const location = [job.city, job.locationRaw && job.locationRaw.length < 60 ? job.locationRaw : null, job.country].find(Boolean);
  return (
    <article className={`${s.card} ${job.status === 'possibly_closed' ? s.closed : ''}`}>
      <ScoreBadge score={job.score} />
      <div style={{ minWidth: 0 }}>
        <Link to={`/vagas/${job.id}`} className={s.title}>
          {job.title}
        </Link>
        <div className={s.meta}>
          <span>{job.company ?? 'Empresa não informada'}</span>
          {location && <span>· {location}</span>}
          {salary && <span>· {salary}</span>}
        </div>
        <div className={s.badges}>
          <ChipRow>
            {job.remoteType !== 'unknown' && <Badge tone={job.remoteType === 'remote' ? 'accent' : 'neutral'}>{REMOTE_LABEL[job.remoteType]}</Badge>}
            {job.geoEligibility.slice(0, 3).map((g) => (
              <Badge key={g} tone={geoTone(g)}>
                {GEO_LABEL[g]}
              </Badge>
            ))}
            {job.seniority !== 'unknown' && <Badge>{SENIORITY_LABEL[job.seniority]}</Badge>}
            {job.contractTypes.slice(0, 2).map((c) => (
              <Badge key={c}>{CONTRACT_LABEL[c]}</Badge>
            ))}
            {job.tracking.state !== 'new' && <Badge tone="info">{STATE_LABEL[job.tracking.state]}</Badge>}
            {job.status === 'possibly_closed' && <Badge tone="warning">Possivelmente encerrada</Badge>}
            {job.technologies.slice(0, 6).map((t) => (
              <span key={t} className={s.tech}>
                {t}
              </span>
            ))}
          </ChipRow>
        </div>
        <div className={s.footer}>
          <span title={job.publishedAt ? formatDate(job.publishedAt, { dateStyle: 'full', timeStyle: 'short' }) : undefined}>
            {job.publishedAt ? `Publicada ${formatRelative(job.publishedAt)}` : 'Data de publicação desconhecida'}
          </span>
          <span title={formatDate(job.firstSeenAt, { dateStyle: 'full', timeStyle: 'short' })}>Capturada {formatRelative(job.firstSeenAt)}</span>
          <SourceLink name={job.primarySource.name} url={job.primarySource.url} />
          {job.sourceCount > 1 && <span>+{job.sourceCount - 1} fonte(s)</span>}
          {job.tracking.hasNotes && <span>Com notas</span>}
        </div>
      </div>
      <div className={s.actions}>
        {actions}
        <a className="btn btn-sm" href={job.url} target="_blank" rel="noopener" title="Abrir a vaga no site de origem">
          <Icon name="external" size={14} /> Original
        </a>
      </div>
    </article>
  );
}

export { s as jobCardStyles };
