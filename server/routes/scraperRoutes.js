/**
 * Rotas do scraper LinkedIn.
 * O scraper roda em background via scraperState — desconexões de SSE não o interrompem.
 */
const express = require('express');
const scraperService = require('../services/scraperService');
const scraperState = require('../services/scraperState');

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
 * GET /api/scraper/status
 * Retorna se o scraper está rodando e o último evento emitido.
 */
router.get('/status', (_req, res) => {
  res.json(scraperState.getStatus());
});

function setupSSE(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  return (data) => {
    if (!res.writableEnded) {
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (_) {}
    }
  };
}

function subscribeAndClose(req, res, send) {
  const unsubscribe = scraperState.subscribe((data) => {
    send(data);
    if (data.type === 'done' || data.type === 'error') {
      setTimeout(() => {
        try { res.end(); } catch (_) {}
      }, 100);
    }
  });

  req.on('close', unsubscribe);
}

/**
 * GET /api/scraper/events
 * SSE — reconecta ao stream de progresso. Replay de eventos passados + stream de novos.
 */
router.get('/events', (req, res) => {
  const send = setupSSE(res);

  for (const evt of scraperState.getEvents()) {
    send(evt);
  }

  if (!scraperState.getStatus().running) {
    res.end();
    return;
  }

  subscribeAndClose(req, res, send);
});

/**
 * GET /api/scraper/run-stream?searchUrl=...
 * SSE – inicia o scraper em background (se não estiver rodando) e emite eventos de progresso.
 */
router.get('/run-stream', (req, res) => {
  const send = setupSSE(res);
  const searchUrl = req.query.searchUrl || undefined;

  scraperState.start(searchUrl);

  for (const evt of scraperState.getEvents()) {
    send(evt);
  }

  if (!scraperState.getStatus().running) {
    res.end();
    return;
  }

  subscribeAndClose(req, res, send);
});

module.exports = router;
