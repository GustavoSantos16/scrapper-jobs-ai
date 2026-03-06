const fs = require('fs').promises;
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'storage', 'database.json');

function normalizeWhitespace(value) {
  return (value || '').toString().trim().replace(/\s+/g, ' ');
}

function normalizeJobLink(link) {
  if (!link || typeof link !== 'string') return '';

  const raw = link.trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    const hostname = (parsed.hostname || '').toLowerCase();
    const isLinkedIn = hostname.endsWith('linkedin.com');

    parsed.search = '';
    parsed.hash = '';

    let pathname = (parsed.pathname || '').replace(/\/+$/g, '');
    if (!pathname) pathname = '/';

    if (isLinkedIn) {
      const viewMatch = pathname.match(/\/jobs\/view\/(\d+)/);
      if (viewMatch) {
        return `https://www.linkedin.com/jobs/view/${viewMatch[1]}`;
      }
      return `https://www.linkedin.com${pathname}`;
    }

    return `${parsed.origin}${pathname}`;
  } catch (_) {
    return raw.replace(/\?.*$/, '').replace(/#.*$/, '').replace(/\/+$/g, '');
  }
}

function getJobUniqueKey(job) {
  if (!job || typeof job !== 'object') return '';

  const normalizedLink = normalizeJobLink(job.link);
  if (normalizedLink) return `link:${normalizedLink}`;

  const title = normalizeWhitespace(job.title).toLowerCase();
  const company = normalizeWhitespace(job.company).toLowerCase();
  if (title || company) return `title-company:${title}::${company}`;

  const id = normalizeWhitespace(job.id);
  if (id) return `id:${id}`;

  return '';
}

function pickLongerText(a, b) {
  const first = normalizeWhitespace(a);
  const second = normalizeWhitespace(b);
  return second.length > first.length ? second : first;
}

function mergeDuplicatedJobs(existing, incoming) {
  const merged = { ...existing };

  merged.id = normalizeWhitespace(existing.id) || normalizeWhitespace(incoming.id) || merged.id;
  merged.title = normalizeWhitespace(existing.title) || normalizeWhitespace(incoming.title) || merged.title;
  merged.company = normalizeWhitespace(existing.company) || normalizeWhitespace(incoming.company) || merged.company;

  const existingLink = normalizeJobLink(existing.link);
  const incomingLink = normalizeJobLink(incoming.link);
  merged.link = existingLink || incomingLink || normalizeWhitespace(existing.link) || normalizeWhitespace(incoming.link);

  merged.description = pickLongerText(existing.description, incoming.description);
  merged.scrapedAt = normalizeWhitespace(existing.scrapedAt) || normalizeWhitespace(incoming.scrapedAt) || null;

  if (merged.score == null && incoming.score != null) merged.score = incoming.score;
  if (!normalizeWhitespace(merged.justificativa) && normalizeWhitespace(incoming.justificativa)) {
    merged.justificativa = incoming.justificativa;
  }
  if (!normalizeWhitespace(merged.status) && normalizeWhitespace(incoming.status)) {
    merged.status = incoming.status;
  }

  const existingApplied = !!existing.applied;
  const incomingApplied = !!incoming.applied;
  merged.applied = existingApplied || incomingApplied;
  if (merged.applied) {
    merged.appliedAt = existingApplied
      ? (existing.appliedAt || incoming.appliedAt || null)
      : (incoming.appliedAt || existing.appliedAt || null);
  } else {
    merged.appliedAt = null;
  }

  return merged;
}

function dedupeJobs(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) return [];

  const byKey = new Map();
  for (const rawJob of jobs) {
    if (!rawJob || typeof rawJob !== 'object') continue;
    const job = { ...rawJob };
    if (job.link) {
      const normalized = normalizeJobLink(job.link);
      if (normalized) job.link = normalized;
    }

    const key = getJobUniqueKey(job) || `fallback:${JSON.stringify(job)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, job);
      continue;
    }
    byKey.set(key, mergeDuplicatedJobs(existing, job));
  }

  return [...byKey.values()];
}

function normalizeDatabase(data) {
  const normalized = {
    resume: data && Object.prototype.hasOwnProperty.call(data, 'resume') ? data.resume : null,
    jobs: dedupeJobs(data && Array.isArray(data.jobs) ? data.jobs : []),
    history: data && Array.isArray(data.history) ? data.history : []
  };
  return normalized;
}

async function readDatabase() {
  try {
    const raw = await fs.readFile(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const normalized = normalizeDatabase(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      await writeDatabase(normalized);
    }
    return normalized;
  } catch (err) {
    if (err.code === 'ENOENT') {
      const initial = {
        resume: null,
        jobs: [],
        history: []
      };
      await writeDatabase(initial);
      return initial;
    }
    throw err;
  }
}

async function writeDatabase(data) {
  const normalized = normalizeDatabase(data || {});
  const json = JSON.stringify(normalized, null, 2);
  await fs.writeFile(DB_PATH, json, 'utf8');
}

module.exports = {
  readDatabase,
  writeDatabase,
  normalizeJobLink,
  dedupeJobs
};

