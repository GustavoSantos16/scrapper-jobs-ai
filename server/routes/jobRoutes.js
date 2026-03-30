const express = require('express');
const matchService = require('../services/matchService');

const router = express.Router();

router.post('/match', async (req, res) => {
  try {
    const jobs = (req.body && Array.isArray(req.body.jobs)) ? req.body.jobs : [];
    const resumeText = (req.body && typeof req.body.resumeText === 'string') ? req.body.resumeText : '';
    const result = await matchService.runMatch(null, { jobs, resumeText });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Erro no match:', err);
    res.status(400).json({ error: err.message || 'Erro ao executar match.' });
  }
});

router.post('/match-stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();

  const send = (data) => {
    if (!res.writableEnded) {
      try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch (_) {}
    }
  };

  try {
    const jobs = (req.body && Array.isArray(req.body.jobs)) ? req.body.jobs : [];
    const resumeText = (req.body && typeof req.body.resumeText === 'string') ? req.body.resumeText : '';
    const result = await matchService.runMatch(send, { jobs, resumeText });
    send({ type: 'done', processed: result.processed, results: result.results });
  } catch (err) {
    send({ type: 'error', error: err.message });
  }
  res.end();
});

module.exports = router;
