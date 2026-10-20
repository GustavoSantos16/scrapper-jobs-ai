import type { SummaryRow } from '@ajh/database';
import type { AnyConnector } from '@ajh/job-sources';
import type { ApplicationState, ContractType, GeoTag, JobStatus, JobSummary, RemoteType, SalaryPeriod, Seniority, SourceRef } from '@ajh/shared';

export function sourceRef(connectors: AnyConnector[], source: string, url: string): SourceRef {
  const c = connectors.find((x) => x.id === source);
  return { source, name: c?.name ?? source, url, attribution: c?.attribution ?? source };
}

export const parseJson = <T>(s: string | null): T => (s ? (JSON.parse(s) as T) : ([] as unknown as T));

export function toSummary(r: SummaryRow, connectors: AnyConnector[]): JobSummary {
  return {
    id: r.id,
    title: r.title,
    company: r.company,
    summary: r.summary,
    url: r.url,
    primarySource: sourceRef(connectors, r.primary_source ?? 'unknown', r.primary_url ?? r.url),
    sourceCount: r.source_count,
    country: r.country,
    city: r.city,
    locationRaw: r.location_raw,
    remoteType: r.remote_type as RemoteType,
    geoEligibility: parseJson<GeoTag[]>(r.geo_eligibility),
    contractTypes: parseJson<ContractType[]>(r.contract_types),
    seniority: r.seniority as Seniority,
    technologies: parseJson<string[]>(r.technologies),
    language: r.language,
    salaryMin: r.salary_min,
    salaryMax: r.salary_max,
    salaryCurrency: r.salary_currency,
    salaryPeriod: r.salary_period as SalaryPeriod | null,
    publishedAt: r.published_at,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
    status: r.status as JobStatus,
    score: r.score,
    tracking: {
      state: (r.t_state ?? 'new') as ApplicationState,
      favorite: Boolean(r.t_favorite),
      ignored: Boolean(r.t_ignored),
      hasNotes: Boolean(r.t_has_notes),
    },
  };
}
