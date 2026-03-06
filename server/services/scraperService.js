/**
 * Scraper de vagas do LinkedIn com Puppeteer.
 * - headless: false (navegador visível)
 * - Reuso de sessão (cache/cookies) com userDataDir
 * - Login manual apenas quando necessário
 * - Scroll progressivo com delay aleatório 2–4s
 * - Coleta até esgotar resultados visíveis
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { readDatabase, writeDatabase } = require('./storageService');

const SCROLL_DELAY_MIN = 1500;
const SCROLL_DELAY_MAX = 3000;
const MAX_JOBS = 100;
const LOGIN_WAIT_TIMEOUT_MS = 240000;
const PROFILE_DIR = path.join(__dirname, '..', 'storage', 'browser-profile');

/** Caminhos comuns do Chrome/Chromium no macOS (evita erro -86 no Apple Silicon com o Chromium bundled) */
const MAC_CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
];

function getExecutablePath() {
  if (process.platform === 'darwin') {
    for (const p of MAC_CHROME_PATHS) {
      try {
        if (fs.existsSync(p)) return p;
      } catch (_) {}
    }
  }
  return undefined;
}

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isLinkedInJobsUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('linkedin.com') && parsed.pathname.includes('/jobs');
  } catch (_) {
    return false;
  }
}

async function ensureLoggedIn(page, timeoutMs = LOGIN_WAIT_TIMEOUT_MS) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const current = page.url();
    if (current.includes('/jobs')) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

/**
 * Extrai dados dos cards visíveis em uma única avaliação (evita context destroyed).
 * Retorna array de { jobId, title, company, link }.
 */
async function extractVisibleCardsData(page) {
  return page.evaluate(() => {
    const cards = document.querySelectorAll(
      'li[data-occludable-job-id], div[data-job-id], div.base-card.base-card--link.job-search-card'
    );
    const out = [];
    for (const card of cards) {
      const jobId = card.getAttribute('data-job-id') || card.getAttribute('data-occludable-job-id') || null;
      const linkEl = card.querySelector('a.job-card-container__link, a.job-card-list__title, a.base-card__full-link, a[href*="/jobs/view/"]');
      if (!linkEl) continue;

      const strong = linkEl.querySelector('span[aria-hidden="true"] strong');
      let title = '';
      if (strong) {
        title = strong.textContent.trim();
      } else {
        const visibleSpan = linkEl.querySelector('span[aria-hidden="true"]');
        title = visibleSpan ? visibleSpan.textContent.trim() : linkEl.textContent.trim();
      }
      title = title.replace(/\s*with verification\s*$/i, '').trim();

      const companyEl = card.querySelector(
        'div.artdeco-entity-lockup__subtitle span, h4.base-search-card__subtitle, span.job-card-container__primary-description'
      );
      const company = companyEl ? companyEl.textContent.trim() : '';

      const href = linkEl.href || '';
      const link = href.includes('/jobs/view/') ? href.split('?')[0] : href;

      if (title && link) out.push({ jobId, title, company, link });
    }
    return out;
  });
}

function readDescriptionFromPanel(page) {
  return page.evaluate(() => {
    const el = document.querySelector('#job-details, div[class*="jobs-description-content__text"], div.jobs-box__html-content');
    if (!el) return '';
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.visually-hidden, .a11y-text').forEach((n) => n.remove());
    return (clone.innerText || clone.textContent || '').trim();
  });
}

const SCROLL_CONTAINER_SELECTORS = [
  'div.jobs-search-results-list',
  'div.scaffold-layout__list-container',
  'div.scaffold-layout__list > div',
  'ul.scaffold-layout__list-container'
];

async function scrollJobList(page) {
  const containerSel = await page.evaluate((selectors) => {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight) return sel;
    }
    return null;
  }, SCROLL_CONTAINER_SELECTORS);

  const STEP = 600;
  const MAX_SCROLLS = 25;

  if (containerSel) {
    for (let i = 0; i < MAX_SCROLLS; i++) {
      const { atBottom } = await page.evaluate(
        (sel, step) => {
          const el = document.querySelector(sel);
          if (!el) return { atBottom: true };
          el.scrollBy({ top: step, behavior: 'smooth' });
          return { atBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 10 };
        },
        containerSel,
        STEP
      );
      await new Promise((r) => setTimeout(r, randomDelay(400, 900)));
      if (atBottom) break;
    }
  } else {
    for (let i = 0; i < MAX_SCROLLS; i++) {
      const atBottom = await page.evaluate((step) => {
        window.scrollBy({ top: step, behavior: 'smooth' });
        return window.innerHeight + window.scrollY >= document.body.scrollHeight - 10;
      }, STEP);
      await new Promise((r) => setTimeout(r, randomDelay(400, 900)));
      if (atBottom) break;
    }
  }

  await new Promise((r) => setTimeout(r, 1000));
}

async function collectVisibleJobs(page, jobs, seenLinks) {
  let added = 0;

  await scrollJobList(page);

  let cardsData = [];
  try {
    cardsData = await extractVisibleCardsData(page);
  } catch (e) {
    return added;
  }

  console.log(`[Scraper] Cards encontrados na página: ${cardsData.length}`);

  for (const item of cardsData) {
    const { jobId, title, company, link } = item;
    if (seenLinks.has(link)) continue;

    let description = '';
    try {
      const cardEl = jobId
        ? await page.$(`li[data-occludable-job-id="${jobId}"], div[data-job-id="${jobId}"]`)
        : null;
      if (cardEl) {
        await cardEl.click();
        await page.waitForSelector('#job-details', { timeout: 3000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 800));
        description = await readDescriptionFromPanel(page);
      }
    } catch (_) {}

    const id = jobId || `job-${Date.now()}-${jobs.length}`;
    jobs.push({
      id,
      title: title.trim(),
      company: (company || '').trim(),
      description: (description || '').slice(0, 8000),
      link: link.trim(),
      scrapedAt: new Date().toISOString(),
      score: null,
      justificativa: null,
      status: null,
      applied: false,
      appliedAt: null
    });
    seenLinks.add(link);
    added++;
  }

  return added;
}

async function scrollPaginationIntoView(page) {
  await page.evaluate(() => {
    const el = document.querySelector(
      'div.jobs-search-results-list__pagination, ul.artdeco-pagination__pages, nav[aria-label*="aginat"]'
    );
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await new Promise((r) => setTimeout(r, 1000));
}

async function getVisibleCardIds(page) {
  return page.evaluate(() => {
    const cards = document.querySelectorAll('li[data-occludable-job-id], div[data-job-id]');
    return Array.from(cards).slice(0, 5).map(
      (c) => c.getAttribute('data-occludable-job-id') || c.getAttribute('data-job-id')
    );
  });
}

async function clickNextPage(page, targetPageNum) {
  await scrollPaginationIntoView(page);

  const clickedByNumber = await page.evaluate((num) => {
    const buttons = document.querySelectorAll(
      'li.artdeco-pagination__indicator--number button'
    );
    for (const btn of buttons) {
      const text = (btn.querySelector('span') || btn).textContent.trim();
      if (text === String(num)) {
        btn.click();
        return true;
      }
    }
    return false;
  }, targetPageNum);

  if (clickedByNumber) return true;

  const nextBtnSelectors = [
    'button[aria-label="View next page"]',
    'button[aria-label="Next"]',
    'button.artdeco-pagination__button--next',
    'button.jobs-search-pagination__button--next'
  ];
  for (const sel of nextBtnSelectors) {
    const btn = await page.$(sel);
    if (!btn) continue;
    const isDisabled = await page
      .evaluate((b) => b.disabled || b.getAttribute('aria-disabled') === 'true', btn)
      .catch(() => true);
    if (isDisabled) continue;
    await btn.click();
    return true;
  }

  return false;
}

async function waitForCardsToChange(page, oldCardIds) {
  await page
    .waitForFunction(
      (oldIds) => {
        const cards = document.querySelectorAll('li[data-occludable-job-id], div[data-job-id]');
        if (cards.length === 0) return false;
        const firstId =
          cards[0].getAttribute('data-occludable-job-id') || cards[0].getAttribute('data-job-id');
        return !oldIds.includes(firstId);
      },
      { timeout: 15000 },
      oldCardIds
    )
    .catch(() => {});
}

/**
 * Inicia o scraping. Abre o LinkedIn Jobs, aguarda o usuário fazer login
 * e depois coleta vagas da página de busca atual até esgotar os resultados.
 * @param {string} [searchUrl] - URL da página de vagas do LinkedIn (opcional; se não informada, usa página padrão de vagas)
 * @returns {Promise<{ collected: number, jobs: Array }>}
 */
async function runScraper(searchUrl) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || getExecutablePath();
  const launchOptions = {
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1280, height: 800 },
    userDataDir: PROFILE_DIR
  };
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }
  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const url = isLinkedInJobsUrl(searchUrl)
      ? searchUrl
      : 'https://www.linkedin.com/jobs/search/?keywords=developer';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

    // Se não houver sessão ativa, aguarda login manual.
    const loggedIn = await ensureLoggedIn(page);
    if (!loggedIn) {
      throw new Error('Tempo esgotado aguardando login no LinkedIn. Tente novamente e conclua o login em até 4 minutos.');
    }
    // Garante navegação final para a URL desejada após login redirecionar.
    if (page.url() !== url) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    }
    await new Promise((r) => setTimeout(r, 2500));

    const jobs = [];
    const seenLinks = new Set();
    const MAX_PAGES = 10;
    let emptyPages = 0;

    for (let pageIndex = 0; pageIndex < MAX_PAGES && jobs.length < MAX_JOBS; pageIndex++) {
      if (pageIndex > 0) {
        const cardIdsBefore = await getVisibleCardIds(page);
        console.log(`[Scraper] Navegando para página ${pageIndex + 1}...`);

        const navigated = await clickNextPage(page, pageIndex + 1);
        if (!navigated) {
          console.log('[Scraper] Nenhum botão de paginação encontrado. Parando.');
          break;
        }

        await waitForCardsToChange(page, cardIdsBefore);
        await new Promise((r) => setTimeout(r, randomDelay(3000, 6000)));
      }

      await page.bringToFront().catch(() => {});
      const beforeCount = jobs.length;
      await collectVisibleJobs(page, jobs, seenLinks);
      const addedThisPage = jobs.length - beforeCount;

      console.log(`[Scraper] Página ${pageIndex + 1}: +${addedThisPage} vagas (total: ${jobs.length})`);

      if (addedThisPage === 0) {
        emptyPages++;
        if (emptyPages >= 2) break;
      } else {
        emptyPages = 0;
      }
    }

    const db = await readDatabase();
    const existingIds = new Set((db.jobs || []).map((j) => j.link));
    const newJobs = jobs.filter((j) => !existingIds.has(j.link));
    db.jobs = (db.jobs || []).concat(newJobs);
    await writeDatabase(db);

    return { collected: newJobs.length, jobs: newJobs, total: db.jobs.length };
  } finally {
    await browser.close();
  }
}

module.exports = {
  runScraper
};
