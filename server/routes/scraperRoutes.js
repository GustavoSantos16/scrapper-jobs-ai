/**
 * Rotas do scraper LinkedIn.
 */
const express = require('express');
const scraperService = require('../services/scraperService');

const router = express.Router();

/**
 * POST /api/scraper/run
 * Body: { searchUrl?: string }
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

/**
 * GET /api/scraper/run-stream?searchUrl=...
 * SSE – emite eventos de progresso em tempo real.
 */
router.get('/run-stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const searchUrl = req.query.searchUrl || undefined;
    const result = await scraperService.runScraper(searchUrl, send);
    send({ type: 'done', collected: result.collected, total: result.total });
  } catch (err) {
    send({ type: 'error', error: err.message });
  }
  res.end();
});

module.exports = router;
