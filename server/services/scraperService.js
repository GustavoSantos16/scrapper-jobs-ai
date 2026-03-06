/**
 * Scraper de vagas do LinkedIn com Puppeteer.
 * - headless: true (navegador invisível)
 * - Reuso de sessão (cache/cookies) com userDataDir
 * - Scroll progressivo com delay aleatório 2–4s
 * - Coleta até esgotar resultados visíveis
 * - Emite eventos de progresso via callback (SSE)
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { readDatabase, writeDatabase, normalizeJobLink } = require('./storageService');

const SCROLL_DELAY_MIN = 1500;
const SCROLL_DELAY_MAX = 3000;
const MAX_JOBS = 1000;
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

async function checkLoginStatus(page) {
  try {
    const url = page.url();

    const notLoggedInUrlPatterns = ['/login', '/signup', '/authwall', '/checkpoint'];
    if (notLoggedInUrlPatterns.some((p) => url.includes(p))) {
      return 'not_logged_in';
    }

    const loggedInUrlPatterns = ['/feed', '/mynetwork', '/messaging', '/notifications'];
    const onAuthenticatedPage = loggedInUrlPatterns.some((p) => url.includes(p));

    const domStatus = await page.evaluate(() => {
      const loggedInSelectors = [
        'img.global-nav__me-photo',
        '.global-nav__me',
        'div.global-nav__me-content',
        'nav.global-nav',
        '#global-nav',
        'img.feed-identity-module__member-photo',
        '.scaffold-layout__sidebar',
        'header.msg-overlay-bubble-header',
        '[data-control-name="identity_welcome_message"]',
        'img.presence-entity__image',
        '.search-global-typeahead'
      ];
      for (const sel of loggedInSelectors) {
        if (document.querySelector(sel)) return 'logged_in';
      }

      const notLoggedInSelectors = [
        'form.login__form',
        '#login-form',
        'form[action*="login-submit"]',
        'form[action*="uas/login"]',
        'a.nav__button-primary[href*="login"]',
        '.nav__button-secondary[href*="signup"]',
        'button[data-modal="login-modal"]'
      ];
      for (const sel of notLoggedInSelectors) {
        if (document.querySelector(sel)) return 'not_logged_in';
      }

      return 'unknown';
    });

    if (domStatus === 'logged_in') return 'logged_in';
    if (domStatus === 'not_logged_in') return 'not_logged_in';

    if (onAuthenticatedPage) return 'logged_in';

    return 'unknown';
  } catch (_) {
    return 'navigating';
  }
}

async function ensureLoggedIn(page, timeoutMs = LOGIN_WAIT_TIMEOUT_MS) {
  const startedAt = Date.now();

  const initialStatus = await checkLoginStatus(page);
  if (initialStatus === 'logged_in') {
    console.log('[Scraper] Sessão ativa detectada. Continuando...');
    return true;
  }

  console.log('[Scraper] Login necessário. Faça login no navegador que foi aberto...');

  while (Date.now() - startedAt < timeoutMs) {
    const status = await checkLoginStatus(page);
    if (status === 'logged_in') {
      console.log('[Scraper] Login detectado com sucesso!');
      await new Promise((r) => setTimeout(r, 3000));
      return true;
    }

    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    const remaining = Math.round((timeoutMs - (Date.now() - startedAt)) / 1000);
    if (elapsed % 10 === 0) {
      console.log(`[Scraper] Aguardando login... status="${status}" url="${page.url()}" (${remaining}s restantes)`);
    }

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

    const ALLOWED_TAGS = new Set([
      'P','BR','UL','OL','LI','STRONG','EM','B','I',
      'H1','H2','H3','H4','H5','H6','SPAN','A','DIV'
    ]);

    function sanitize(node) {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === Node.TEXT_NODE) continue;
        if (child.nodeType !== Node.ELEMENT_NODE) { child.remove(); continue; }

        if (!ALLOWED_TAGS.has(child.tagName)) {
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          child.remove();
        } else {
          for (const attr of [...child.attributes]) {
            if (child.tagName === 'A' && attr.name === 'href') continue;
            child.removeAttribute(attr.name);
          }
          sanitize(child);
        }
      }
    }

    sanitize(clone);
    return clone.innerHTML.trim();
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

  const newCards = cardsData.filter((c) => {
    const normalizedLink = normalizeJobLink(c.link);
    if (!normalizedLink) return false;
    if (seenLinks.has(normalizedLink)) return false;
    c.link = normalizedLink;
    return true;
  });
  console.log(`[Scraper] Cards encontrados: ${cardsData.length} | Novos: ${newCards.length}`);

  for (const item of newCards) {
    const { jobId, title, company, link } = item;

    let description = '';
    try {
      const cardEl = jobId
        ? await page.$(`li[data-occludable-job-id="${jobId}"], div[data-job-id="${jobId}"]`)
        : null;
      if (cardEl) {
        await page.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), cardEl);
        await new Promise((r) => setTimeout(r, 500));

        await cardEl.click();

        await page.waitForFunction(
          () => {
            const el = document.querySelector('#job-details, div[class*="jobs-description-content__text"]');
            if (!el) return false;
            const text = (el.innerText || '').trim();
            return text.length > 50;
          },
          { timeout: 5000 }
        ).catch(() => {});

        await new Promise((r) => setTimeout(r, 500));
        description = await readDescriptionFromPanel(page);
      }
    } catch (_) {}

    if (description && description.length < 30) {
      description = '';
    }

    const id = jobId || `job-${Date.now()}-${jobs.length}`;
    jobs.push({
      id,
      title: title.trim(),
      company: (company || '').trim(),
      description: (description || '').slice(0, 8000),
      link: normalizeJobLink(link),
      scrapedAt: new Date().toISOString(),
      score: null,
      justificativa: null,
      status: null,
      applied: false,
      appliedAt: null
    });
    seenLinks.add(normalizeJobLink(link));
    added++;
  }

  return added;
}

const LINKEDIN_PAGE_SIZE = 25;

function buildPageUrl(baseUrl, startOffset) {
  const u = new URL(baseUrl);
  u.searchParams.set('start', String(startOffset));
  return u.toString();
}

/**
 * Inicia o scraping em modo headless.
 * @param {string} [searchUrl] - URL da página de vagas do LinkedIn (opcional)
 * @param {function} [onProgress] - callback(data) para emitir eventos de progresso (SSE)
 * @returns {Promise<{ collected: number, jobs: Array }>}
 */
async function runScraper(searchUrl, onProgress) {
  const emit = typeof onProgress === 'function' ? onProgress : () => {};

  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || getExecutablePath();
  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1280, height: 800 },
    userDataDir: PROFILE_DIR
  };
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  emit({ type: 'status', message: 'Iniciando navegador...' });
  let browser = await puppeteer.launch(launchOptions);

  try {
    let page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const url = isLinkedInJobsUrl(searchUrl)
      ? searchUrl
      : 'https://www.linkedin.com/jobs/search/?keywords=developer';

    emit({ type: 'status', message: 'Acessando LinkedIn...' });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

    emit({ type: 'status', message: 'Verificando sessão de login...' });
    let loggedIn = await checkLoginStatus(page);

    if (loggedIn !== 'logged_in') {
      console.log('[Scraper] Sem sessão ativa. Reabrindo navegador visível para login manual...');
      emit({ type: 'login', message: 'Login necessário. Abrindo navegador para login manual...' });
      await browser.close();

      launchOptions.headless = false;
      browser = await puppeteer.launch(launchOptions);
      page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

      const loginOk = await ensureLoggedIn(page);
      if (!loginOk) {
        throw new Error('Tempo esgotado aguardando login no LinkedIn. Tente novamente e conclua o login em até 4 minutos.');
      }

      emit({ type: 'status', message: 'Login realizado! Continuando coleta...' });
    } else {
      console.log('[Scraper] Sessão ativa detectada. Continuando em modo headless...');
    }

    const currentUrl = page.url();
    if (!currentUrl.includes('/jobs/search')) {
      console.log('[Scraper] Redirecionando para a URL de busca após login...');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    }

    emit({ type: 'status', message: 'Aguardando cards de vagas...' });
    await page.waitForSelector(
      'li[data-occludable-job-id], div[data-job-id], div.job-search-card',
      { timeout: 15000 }
    ).catch(() => {
      console.log('[Scraper] Aviso: cards de vagas não encontrados imediatamente, tentando continuar...');
    });
    await new Promise((r) => setTimeout(r, 2500));

    const jobs = [];
    const seenLinks = new Set();
    const MAX_PAGES = 10;
    let emptyPages = 0;
    const baseUrl = page.url();

    for (let pageIndex = 0; pageIndex < MAX_PAGES && jobs.length < MAX_JOBS; pageIndex++) {
      if (pageIndex > 0) {
        const startOffset = pageIndex * LINKEDIN_PAGE_SIZE;
        const nextUrl = buildPageUrl(baseUrl, startOffset);
        console.log(`[Scraper] Navegando para página ${pageIndex + 1} (start=${startOffset})...`);

        await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        await page.waitForSelector(
          'li[data-occludable-job-id], div[data-job-id], div.job-search-card',
          { timeout: 10000 }
        ).catch(() => {});

        await new Promise((r) => setTimeout(r, randomDelay(2000, 4000)));
      }

      emit({ type: 'page', page: pageIndex + 1, totalPages: MAX_PAGES, collected: jobs.length });

      await page.bringToFront().catch(() => {});
      const beforeCount = jobs.length;
      await collectVisibleJobs(page, jobs, seenLinks);
      const addedThisPage = jobs.length - beforeCount;

      console.log(`[Scraper] Página ${pageIndex + 1}: +${addedThisPage} vagas (total: ${jobs.length})`);
      emit({ type: 'progress', page: pageIndex + 1, added: addedThisPage, collected: jobs.length });

      if (addedThisPage === 0) {
        emptyPages++;
        if (emptyPages >= 2) break;
      } else {
        emptyPages = 0;
      }
    }

    emit({ type: 'status', message: 'Salvando vagas no banco de dados...' });
    const db = await readDatabase();
    const existingIds = new Set(
      (db.jobs || [])
        .map((j) => normalizeJobLink(j.link))
        .filter(Boolean)
    );
    const newJobs = jobs.filter((j) => {
      const normalizedLink = normalizeJobLink(j.link);
      if (!normalizedLink) return false;
      if (existingIds.has(normalizedLink)) return false;
      j.link = normalizedLink;
      existingIds.add(normalizedLink);
      return true;
    });
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
