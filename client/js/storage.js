const STORAGE_KEY = 'scrapper_jobs_db';

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
      if (viewMatch) return `https://www.linkedin.com/jobs/view/${viewMatch[1]}`;
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
    if (!existing) { byKey.set(key, job); continue; }
    byKey.set(key, mergeDuplicatedJobs(existing, job));
  }
  return [...byKey.values()];
}

function getDB() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { resume: null, jobs: [] };
  } catch (_) {
    return { resume: null, jobs: [] };
  }
}

function setDB(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getJobs() {
  return getDB().jobs || [];
}

function getResume() {
  return getDB().resume || null;
}

function saveResume(resume) {
  const db = getDB();
  db.resume = resume;
  setDB(db);
}

function saveJobs(newJobs) {
  if (!Array.isArray(newJobs) || newJobs.length === 0) return;
  const db = getDB();
  db.jobs = dedupeJobs([...(db.jobs || []), ...newJobs]);
  setDB(db);
}

function updateJob(id, changes) {
  const db = getDB();
  const idx = db.jobs.findIndex(j => j.id === id);
  if (idx !== -1) {
    db.jobs[idx] = { ...db.jobs[idx], ...changes };
    setDB(db);
  }
}

function deleteJob(id) {
  const db = getDB();
  db.jobs = db.jobs.filter(j => j.id !== id);
  setDB(db);
}

// Migração automática one-time: importa database.json para localStorage se ainda não migrou
(function autoMigrate() {
  const MIGRATED_KEY = 'scrapper_jobs_migrated';
  if (localStorage.getItem(MIGRATED_KEY)) return;
  fetch('/api/migrate')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data) return;
      const db = getDB();
      const hasData = (db.jobs && db.jobs.length > 0) || (db.resume && db.resume.text);
      if (hasData) return;
      if (data.resume) db.resume = data.resume;
      if (Array.isArray(data.jobs) && data.jobs.length > 0) {
        db.jobs = dedupeJobs([...(db.jobs || []), ...data.jobs]);
      }
      setDB(db);
      localStorage.setItem(MIGRATED_KEY, '1');
      console.log('[storage] Migração do database.json concluída: ' + (db.jobs || []).length + ' vagas importadas.');
    })
    .catch(function() {});
})();

window.scraperStorage = {
  getJobs,
  getResume,
  saveResume,
  saveJobs,
  updateJob,
  deleteJob
};
