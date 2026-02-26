/**
 * Rotas do scraper LinkedIn.
 */
const express = require('express');
const scraperService = require('../services/scraperService');

const router = express.Router();

/**
 * POST /api/scraper/run
 * Body: { searchUrl?: string } - URL da página de vagas do LinkedIn (opcional).
 * Inicia o Puppeteer em modo visível; o usuário faz login manualmente.
 * Coleta até 20 vagas e salva em database.json.
 */
router.post('/run', async (req, res) => {
  try {
    const searchUrl = req.body && req.body.searchUrl ? req.body.searchUrl : undefined;
    const result = await scraperService.runScraper(searchUrl);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Erro no scraper:', err);
    res.status(500).json({ error: err.message || 'Erro ao executar scraper.' });
  }
});

module.exports = router;
