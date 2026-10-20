import { BRAZIL_ELIGIBLE_GEO, type ContractType, type GeoTag, type NormalizedJob, type RemoteType, type SalaryPeriod, type Seniority } from '@ajh/shared';
import {
  detectContractTypes,
  detectCountry,
  detectLanguage,
  detectRemoteType,
  detectSeniority,
  detectTechnologies,
  geoFromLocation,
  geoFromText,
  mergeGeo,
  techFromTag,
} from './classify.ts';
import { cleanText, htmlToText, sanitizeDescription, summarize } from './text.ts';
import { canonicalizeUrl, extractAtsKey, findAtsKeyInHtml } from './url.ts';

/**
 * What a connector knows about a job. Only the identity fields are required; anything the
 * source states explicitly should be passed, and the rest is inferred from the text.
 */
export interface JobDraft {
  source: string;
  sourceJobId: string | number;
  title: string;
  url: string;
  company?: string | null;
  descriptionHtml?: string | null;
  /** Set when the source HTML is entity-escaped (Greenhouse). */
  descriptionEscaped?: boolean;
  descriptionText?: string | null;
  /** Location strings exactly as published (eligibility/location fields). */
  locations?: (string | null | undefined)[];
  country?: string | null;
  region?: string | null;
  city?: string | null;
  remoteType?: RemoteType | null;
  geoEligibility?: GeoTag[];
  contractTypes?: ContractType[];
  /** Raw contract/employment strings; parsed with detectContractTypes. */
  contractHints?: (string | null | undefined)[];
  seniority?: Seniority | null;
  seniorityHints?: (string | null | undefined)[];
  /** Tags from the source; merged with technologies found in title/description. */
  tags?: (string | null | undefined)[];
  language?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: SalaryPeriod | null;
  publishedAt: string | null;
}

export function buildJob(d: JobDraft): NormalizedJob {
  const title = cleanText(d.title) ?? '(sem título)';
  const descriptionHtml = sanitizeDescription(d.descriptionHtml, { escaped: d.descriptionEscaped });
  const descriptionText = d.descriptionText?.trim() || htmlToText(d.descriptionHtml, { escaped: d.descriptionEscaped });
  const locations = (d.locations ?? []).map((l) => cleanText(l)).filter((l): l is string => Boolean(l));
  const locationRaw = locations.length ? [...new Set(locations)].join(' · ') : null;
  const head = descriptionText?.slice(0, 3000) ?? '';

  const remoteType =
    d.remoteType && d.remoteType !== 'unknown' ? d.remoteType : detectRemoteType(title, locationRaw, head);
  const language = d.language ?? detectLanguage(descriptionText ?? title);
  const structured = mergeGeo(d.geoEligibility ?? [], ...locations.map(geoFromLocation));
  let textual = geoFromText(`${title}\n${head}`);
  // A structured restriction ("Mexico") is more specific than regional boilerplate in the text
  // ("remote from Latin America"): then only an explicit Brazil statement can widen it.
  if (structured.length && !structured.some((g) => BRAZIL_ELIGIBLE_GEO.includes(g))) {
    textual = textual.filter((g) => g === 'brazil');
  }
  const geo = mergeGeo(
    structured,
    textual,
    // a remote job written in Portuguese is aimed at people in Brazil
    remoteType === 'remote' && language === 'pt' ? ['brazil'] : [],
  );

  const country = d.country?.toUpperCase() ?? (locations.length ? detectCountry(locations.join(' / ')) : null);
  const techs = new Set<string>(detectTechnologies(title, ...(d.tags ?? []), descriptionText));
  for (const tag of d.tags ?? []) {
    const tech = techFromTag(tag);
    if (tech) techs.add(tech);
  }
  const contractTypes = d.contractTypes?.length
    ? d.contractTypes
    : detectContractTypes(...(d.contractHints ?? []), title, head);
  const seniority =
    d.seniority && d.seniority !== 'unknown' ? d.seniority : detectSeniority(title, ...(d.seniorityHints ?? []));

  const url = d.url.trim();
  const atsKey = extractAtsKey(url) ?? findAtsKeyInHtml(d.descriptionHtml ?? null);
  const salaryMin = d.salaryMin ?? null;
  const salaryMax = d.salaryMax ?? null;

  return {
    source: d.source,
    sourceJobId: String(d.sourceJobId),
    title,
    company: cleanText(d.company),
    descriptionHtml,
    descriptionText,
    summary: summarize(descriptionText),
    url,
    canonicalUrl: canonicalizeUrl(url),
    atsKey,
    country: country && /^[A-Z]{2}$/.test(country) ? country : null,
    region: cleanText(d.region),
    city: cleanText(d.city),
    locationRaw,
    remoteType,
    geoEligibility: geo,
    contractTypes,
    seniority,
    technologies: [...techs],
    language,
    salaryMin,
    salaryMax,
    salaryCurrency: salaryMin !== null || salaryMax !== null ? (d.salaryCurrency ?? null) : null,
    salaryPeriod: salaryMin !== null || salaryMax !== null ? (d.salaryPeriod ?? null) : null,
    publishedAt: d.publishedAt,
  };
}
