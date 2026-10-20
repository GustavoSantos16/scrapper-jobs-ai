import { createHash } from 'node:crypto';
import type { MatchMethod, NormalizedJob, RemoteType } from '@ajh/shared';
import { fold } from './normalize/classify.ts';

/** Similarity at or above this merges automatically. */
export const AUTO_MERGE_THRESHOLD = 0.88;
/** Similarity in [REVIEW, AUTO_MERGE) goes to the manual review queue. */
export const REVIEW_THRESHOLD = 0.65;

const COMPANY_SUFFIXES =
  /\b(inc|incorporated|llc|ltd|limited|gmbh|ag|s\.?a\.?|ltda|corp|corporation|co|company|plc|bv|oy|ab|sas|srl|sarl|pty|me|eireli)\b\.?/g;

export function normalizeCompany(name: string | null | undefined): string | null {
  if (!name) return null;
  const s = fold(name)
    .replace(/&/g, ' and ')
    .replace(/\(.*?\)/g, ' ')
    .replace(COMPANY_SUFFIXES, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return s || null;
}

export function normalizeTitle(title: string): string {
  return fold(title)
    .replace(/\((m|f|w|d|x|all genders?)[/|,]?.*?\)/g, ' ') // (m/w/d)
    .replace(/\[.*?\]/g, ' ')
    .replace(/\bfront[\s-]+end\b/g, 'frontend')
    .replace(/\bback[\s-]+end\b/g, 'backend')
    .replace(/\bfull[\s-]+stack\b/g, 'fullstack')
    .replace(/\bsr\.?(?=\s|$)/g, 'senior')
    .replace(/\bjr\.?(?=\s|$)/g, 'junior')
    .replace(/\b(remote|remoto|100% remote|fully remote|worldwide|latam|brazil|brasil)\b/g, ' ')
    .replace(/[^a-z0-9#+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function locationKey(remoteType: RemoteType, country: string | null, locationRaw: string | null): string {
  if (remoteType === 'remote') return 'remote';
  if (country) return country.toLowerCase();
  return fold(locationRaw).replace(/[^a-z0-9]+/g, ' ').trim() || 'unknown';
}

/** Layer 4 key: company + title + location, normalized. Null when company is unknown. */
export function identityHash(job: Pick<NormalizedJob, 'company' | 'title' | 'remoteType' | 'country' | 'locationRaw'>): string | null {
  const company = normalizeCompany(job.company);
  if (!company) return null;
  const key = `${company}|${normalizeTitle(job.title)}|${locationKey(job.remoteType, job.country, job.locationRaw)}`;
  return createHash('sha1').update(key).digest('hex');
}

export function trigrams(s: string): Set<string> {
  const t = ` ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

export function shingles(text: string, k = 3, maxWords = 400): Set<string> {
  const words = fold(text).match(/[a-z0-9#+]+/g)?.slice(0, maxWords) ?? [];
  const out = new Set<string>();
  for (let i = 0; i + k <= words.length; i++) out.add(words.slice(i, i + k).join(' '));
  return out;
}

export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export interface SimilarityResult {
  score: number;
  title: number;
  description: number | null;
}

/** Combined similarity: 0.4 × title trigram Jaccard + 0.6 × description shingle Jaccard. */
export function similarity(
  a: { title: string; descriptionText: string | null },
  b: { title: string; descriptionText: string | null },
): SimilarityResult {
  const title = jaccard(trigrams(normalizeTitle(a.title)), trigrams(normalizeTitle(b.title)));
  if (!a.descriptionText || !b.descriptionText) return { score: title, title, description: null };
  const sa = shingles(a.descriptionText);
  const sb = shingles(b.descriptionText);
  if (sa.size < 10 || sb.size < 10) return { score: title, title, description: null };
  const description = jaccard(sa, sb);
  return { score: 0.4 * title + 0.6 * description, title, description };
}

export interface DedupCandidate {
  jobId: number;
  sources: string[];
  canonicalUrls: string[];
  atsKeys: string[];
  identityHash: string | null;
  companyNormalized: string | null;
  title: string;
  descriptionText: string | null;
}

export type DedupDecision =
  | { action: 'merge'; jobId: number; method: MatchMethod; confidence: number }
  | { action: 'new'; reviews: { jobId: number; confidence: number; method: MatchMethod }[] };

/**
 * Layers 2–5 of dedup (layer 1, source + original id, is an exact DB lookup done before).
 * Stops at the first certain match. Fuzzy layers never merge two listings of the same source
 * (distinct ids in one source are distinct postings) and never merge across companies.
 */
export function decideMatch(
  incoming: Pick<NormalizedJob, 'source' | 'title' | 'descriptionText' | 'canonicalUrl' | 'atsKey' | 'company'> & {
    identityHash: string | null;
  },
  candidates: DedupCandidate[],
): DedupDecision {
  if (incoming.canonicalUrl) {
    const hit = candidates.find((c) => c.canonicalUrls.includes(incoming.canonicalUrl!));
    if (hit) return { action: 'merge', jobId: hit.jobId, method: 'url', confidence: 1 };
  }
  if (incoming.atsKey) {
    const hit = candidates.find((c) => c.atsKeys.includes(incoming.atsKey!));
    if (hit) return { action: 'merge', jobId: hit.jobId, method: 'ats_id', confidence: 0.99 };
  }
  const fuzzy = candidates.filter((c) => !c.sources.includes(incoming.source));
  if (incoming.identityHash) {
    const hit = fuzzy.find((c) => c.identityHash === incoming.identityHash);
    if (hit) return { action: 'merge', jobId: hit.jobId, method: 'identity', confidence: 0.95 };
  }
  const company = normalizeCompany(incoming.company);
  if (!company) return { action: 'new', reviews: [] };

  const reviews: { jobId: number; confidence: number; method: MatchMethod }[] = [];
  let best: { jobId: number; score: number } | null = null;
  for (const c of fuzzy) {
    if (c.companyNormalized !== company) continue;
    const sim = similarity(incoming, c);
    // auto-merge needs description evidence: similar titles alone are never enough
    if (sim.description !== null && sim.score >= AUTO_MERGE_THRESHOLD && sim.title >= 0.5) {
      if (!best || sim.score > best.score) best = { jobId: c.jobId, score: sim.score };
    } else if (sim.score >= REVIEW_THRESHOLD && sim.title >= 0.5) {
      // shared company boilerplate makes different roles look alike: titles must agree too
      reviews.push({ jobId: c.jobId, confidence: round2(sim.score), method: 'similarity' });
    }
  }
  if (best) return { action: 'merge', jobId: best.jobId, method: 'similarity', confidence: round2(best.score) };
  return { action: 'new', reviews };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
