import { z } from 'zod';
import { buildJob, cleanText, decodeEntities, detectRemoteType, htmlToText, parseDate } from '../normalize/index.ts';
import type { Connector } from '../types.ts';

// ------------------------------------------------------------ "Ask HN: Who is hiring?"

const Story = z.object({ objectID: z.string(), title: z.string(), created_at: z.string() });
const Comment = z.object({
  objectID: z.string(),
  comment_text: z.string().nullish(),
  author: z.string().nullish(),
  created_at: z.string(),
  parent_id: z.number().nullish(),
  story_id: z.number().nullish(),
});
type Comment = z.infer<typeof Comment>;

const ROLE_HINT = /\b(engineer|developer|dev|frontend|front-end|backend|back-end|full[- ]?stack|software|mobile|react|angular|ios|android|designer|architect|lead|sre|devops|programmer|cto|staff|principal)\b/i;
const MODE_ONLY = /^(remote|onsite|on-site|in[- ]office|hybrid|full[- ]?time|part[- ]?time|contract(or)?|intern(ship)?|visa( sponsorship)?|no visa|equity|ft|pt)$/i;
const MONEY = /[$€£]|\b\d+\s?k\b|\b(usd|eur|gbp|salary|comp)\b/i;
const PLACE = /,|\b(remote|worldwide|anywhere|global|usa|us|uk|eu|europe|emea|latam|americas|canada|brazil|germany|london|nyc|new york|san francisco|sf|berlin|amsterdam|toronto|paris|bay area)\b/i;

/**
 * Heuristic parse of the conventional first line "Company | Role | Location | REMOTE | …".
 * Returns null for comments that do not follow the format (questions, replies, meta).
 */
export function parseHiringComment(html: string): { company: string; title: string; location: string | null; headline: string } | null {
  const firstLine = decodeEntities(html.split(/<p>/i)[0] ?? '').replace(/<[^>]+>/g, '').trim();
  const parts = firstLine.split(/\s+\|\s+|\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2 || firstLine.length > 400) return null;
  const company = parts[0]!.replace(/\s*\(.*?\)\s*$/, '').slice(0, 120);
  const rest = parts.slice(1);
  const title = (rest.find((p) => ROLE_HINT.test(p)) ?? rest[0]!).slice(0, 200);
  const location = rest.find((p) => p !== title && !MODE_ONLY.test(p) && !MONEY.test(p) && PLACE.test(p)) ?? null;
  if (!company || !title) return null;
  return { company, title, location, headline: firstLine };
}

export const hnWhoIsHiring: Connector<Comment> = {
  id: 'hn-whoishiring',
  name: 'Hacker News: Who is hiring?',
  kind: 'official_api',
  homepageUrl: 'https://news.ycombinator.com/submitted?id=whoishiring',
  docsUrl: 'https://hn.algolia.com/api',
  attribution: 'Vaga publicada no Hacker News (news.ycombinator.com)',
  description: 'Thread mensal "Who is hiring?" via API Algolia do HN. Texto livre: parsing heurístico.',
  rateLimit: { minIntervalMinutes: 360, maxRequestsPerRun: 2, minDelayMs: 1000 },
  allowedHosts: ['hn.algolia.com'],
  async *fetchJobs({ http }) {
    const stories = z
      .object({ hits: z.array(Story) })
      .parse(await http.getJson('https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=10'));
    const story = stories.hits.find((s) => /^Ask HN: Who is hiring\?/i.test(s.title));
    if (!story) throw new Error('No "Who is hiring?" thread found');
    const comments = z
      .object({ hits: z.array(z.unknown()) })
      .parse(await http.getJson(`https://hn.algolia.com/api/v1/search?tags=comment,story_${story.objectID}&hitsPerPage=1000`));
    const storyId = Number(story.objectID);
    for (const raw of comments.hits) {
      const c = Comment.safeParse(raw);
      // only top-level comments are job posts; replies are discussion
      if (c.success && c.data.parent_id === storyId && c.data.comment_text) yield c.data;
    }
  },
  normalize(c, { now }) {
    const parsed = parseHiringComment(c.comment_text ?? '');
    if (!parsed) return null;
    const text = htmlToText(c.comment_text);
    return buildJob({
      source: 'hn-whoishiring',
      sourceJobId: c.objectID,
      title: parsed.title,
      url: `https://news.ycombinator.com/item?id=${c.objectID}`,
      company: parsed.company,
      descriptionHtml: c.comment_text,
      descriptionText: text,
      locations: [parsed.location],
      remoteType: detectRemoteType(parsed.headline),
      contractHints: [parsed.headline],
      publishedAt: parseDate(c.created_at, now),
    });
  },
};

// ------------------------------------------------------------ HN job stories (YC companies)

const HnItem = z.object({
  id: z.number(),
  type: z.string(),
  title: z.string().nullish(),
  url: z.string().nullish(),
  text: z.string().nullish(),
  time: z.number().nullish(),
  dead: z.boolean().nullish(),
  deleted: z.boolean().nullish(),
});
type HnItem = z.infer<typeof HnItem>;

const MAX_ITEMS = 60;

/** "Hazel (YC W24) Is Hiring a Full Stack Engineer" → { company: "Hazel", title: "Full Stack Engineer" } */
export function parseJobStoryTitle(raw: string): { company: string | null; title: string } {
  const t = cleanText(raw) ?? raw;
  const m = t.match(/^(.+?)\s*\((YC [A-Z]?\d{2,4}|YC)\)\s*(.*)$/i);
  const company = m ? m[1]!.trim() : (t.match(/^(.+?)\s+(is|are)\s+hiring\b/i)?.[1]?.trim() ?? null);
  const rest = m ? m[3]! : t;
  const role = rest
    .replace(/^.*?\b(is|are)\s+hiring\b\s*/i, '')
    .replace(/^(an?|the|our first|our)\s+/i, '')
    .replace(/^(for|–|-|:)\s*/i, '')
    .trim();
  return { company, title: role.length >= 3 ? role : t };
}

export const hnJobs: Connector<HnItem> = {
  id: 'hn-jobs',
  name: 'Hacker News Jobs (YC)',
  kind: 'official_api',
  homepageUrl: 'https://news.ycombinator.com/jobs',
  docsUrl: 'https://github.com/HackerNews/API',
  attribution: 'Vaga publicada no Hacker News Jobs (news.ycombinator.com/jobs)',
  description: 'Vagas de empresas da Y Combinator publicadas no HN (API oficial Firebase).',
  rateLimit: { minIntervalMinutes: 180, maxRequestsPerRun: MAX_ITEMS + 1, minDelayMs: 150 },
  allowedHosts: ['hacker-news.firebaseio.com'],
  async *fetchJobs({ http }) {
    const ids = z.array(z.number()).parse(await http.getJson('https://hacker-news.firebaseio.com/v0/jobstories.json'));
    for (const id of ids.slice(0, MAX_ITEMS)) {
      const item = HnItem.safeParse(await http.getJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`));
      if (item.success && item.data.type === 'job' && !item.data.dead && !item.data.deleted && item.data.title) yield item.data;
    }
  },
  normalize(item, { now }) {
    const { company, title } = parseJobStoryTitle(item.title ?? '');
    const hnUrl = `https://news.ycombinator.com/item?id=${item.id}`;
    let url = hnUrl;
    try {
      if (item.url && new URL(item.url).protocol.startsWith('http')) url = item.url;
    } catch {
      /* keep the HN url */
    }
    return buildJob({
      source: 'hn-jobs',
      sourceJobId: item.id,
      title,
      url,
      company,
      descriptionHtml: item.text,
      publishedAt: parseDate(item.time, now),
    });
  },
};
