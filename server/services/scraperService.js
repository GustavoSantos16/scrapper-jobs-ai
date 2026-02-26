/**
 * Scraper de vagas do LinkedIn com Puppeteer.
 * - headless: false (navegador visível)
 * - Login manual pelo usuário
 * - Scroll progressivo com delay aleatório 3–8s
 * - Máximo 20 vagas por execução
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { readDatabase, writeDatabase } = require('./storageService');

const MAX_JOBS = 20;
const SCROLL_DELAY_MIN = 3000;
const SCROLL_DELAY_MAX = 8000;

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

/**
 * Inicia o scraping. Abre o LinkedIn Jobs, aguarda o usuário fazer login
 * e depois coleta até MAX_JOBS vagas da página de busca atual.
 * @param {string} [searchUrl] - URL da página de vagas do LinkedIn (opcional; se não informada, usa página padrão de vagas)
 * @returns {Promise<{ collected: number, jobs: Array }>}
 */
async function runScraper(searchUrl) {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || getExecutablePath();
  const launchOptions = {
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1280, height: 800 }
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

    const url =
      searchUrl && searchUrl.includes('linkedin.com')
        ? searchUrl
        : 'https://www.linkedin.com/jobs/search/?keywords=developer';
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Aguardar um pouco para o usuário fazer login se necessário
    await new Promise((r) => setTimeout(r, 5000));

    const jobs = [];
    let lastHeight = 0;
    let noChangeCount = 0;

    while (jobs.length < MAX_JOBS) {
      // Scroll para carregar mais vagas (comportamento humano)
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.6));
      await new Promise((r) => setTimeout(r, randomDelay(SCROLL_DELAY_MIN, SCROLL_DELAY_MAX)));

      const newHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newHeight === lastHeight) {
        noChangeCount++;
        if (noChangeCount >= 3) break;
      } else {
        noChangeCount = 0;
      }
      lastHeight = newHeight;

      // Seletores do LinkedIn (podem mudar; atualizados para base-card / base-search-card quando existirem)
      const listItems = await page.$$(
        'div.base-card.base-card--link.job-search-card, div.jobs-search-results-list__list-item, li.jobs-search-results__list-item, div[data-job-id]'
      );

      for (const el of listItems) {
        if (jobs.length >= MAX_JOBS) break;
        try {
          const jobId = await el.evaluate((n) => n.getAttribute('data-job-id') || n.getAttribute('data-occludable-job-id') || null);
          if (jobId && jobs.some((j) => j.id === jobId)) continue;

          const title = await el.$eval(
            'h3.base-search-card__title, a.job-card-list__title, span.job-card-list__title, a[data-tracking-control-name]',
            (n) => n.textContent.trim()
          ).catch(() => null);
          const company = await el.$eval(
            'h4.base-search-card__subtitle, h4.job-card-container__primary-description, span.job-card-container__primary-description',
            (n) => n.textContent.trim()
          ).catch(() => null);
          const link = await el.$eval(
            'a.base-card__full-link, a.job-card-list__title, a[href*="/jobs/view/"]',
            (n) => n.href || null
          ).catch(() => null);

          if (!title || !link) continue;

          // Clicar no card para carregar descrição no painel lateral (se existir)
          await el.click().catch(() => {});
          await new Promise((r) => setTimeout(r, 1500));

          let description = '';
          const descSel =
            'div.jobs-search__job-details--container, div.jobs-description-content__text, div.jobs-box__html-content, div.description__text';
          const descEl = await page.$(descSel);
          if (descEl) {
            description = await descEl.evaluate((n) => n.innerText || n.textContent || '').catch(() => '');
          }

          const id = jobId || `job-${Date.now()}-${jobs.length}`;
          if (!jobs.some((j) => j.link === link)) {
            jobs.push({
              id,
              title: title.trim(),
              company: (company || '').trim(),
              description: description.trim().slice(0, 5000),
              link: link.trim(),
              scrapedAt: new Date().toISOString(),
              score: null,
              justificativa: null,
              status: null,
              proposal: null,
              emailSent: false,
              emailSentAt: null
            });
          }
        } catch (_) {
          // Ignora erros de parsing de um card e continua
        }
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
