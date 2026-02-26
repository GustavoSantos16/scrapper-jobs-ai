const express = require('express');
const matchService = require('../services/matchService');
const proposalService = require('../services/proposalService');
const { readDatabase } = require('../services/storageService');

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const db = await readDatabase();
    const jobs = db.jobs || [];
    res.json(jobs);
  } catch (err) {
    console.error('Erro ao listar vagas:', err);
    res.status(500).json({ error: 'Erro ao listar vagas.' });
  }
});

router.post('/match', async (_req, res) => {
  try {
    const result = await matchService.runMatch();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Erro no match:', err);
    res.status(400).json({ error: err.message || 'Erro ao executar match.' });
  }
});

router.get('/match-stream', async (req, res) => {
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
    const result = await matchService.runMatch(send);
    send({ type: 'done', processed: result.processed, results: result.results });
  } catch (err) {
    send({ type: 'error', error: err.message });
  }
  res.end();
});

router.post('/proposals', async (req, res) => {
  try {
    const jobIds = req.body && req.body.jobIds ? req.body.jobIds : [];
    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({ error: 'Envie jobIds (array).' });
    }
    const results = await proposalService.generateForJobs(jobIds);
    res.json({ success: true, results });
  } catch (err) {
    console.error('Erro ao gerar propostas:', err);
    res.status(500).json({ error: err.message || 'Erro ao gerar propostas.' });
  }
});

router.get('/proposals-stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const idsParam = req.query.ids || '';
  const jobIds = idsParam.split(',').filter(Boolean);

  if (jobIds.length === 0) {
    send({ type: 'error', error: 'Nenhum id informado.' });
    res.end();
    return;
  }

  try {
    const db = await readDatabase();
    const jobs = db.jobs || [];
    const enrichedSend = (data) => {
      if (data.type === 'generating') {
        const job = jobs.find((j) => j.id === data.jobId);
        if (job) {
          data.title = job.title;
          data.company = job.company;
        }
      }
      send(data);
    };
    const results = await proposalService.generateForJobs(jobIds, enrichedSend);
    send({ type: 'done', results });
  } catch (err) {
    send({ type: 'error', error: err.message });
  }
  res.end();
});

router.post('/:id/proposal', async (req, res) => {
  try {
    const result = await proposalService.generateForJob(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Erro ao gerar proposta:', err);
    res.status(400).json({ error: err.message || 'Erro ao gerar proposta.' });
  }
});

module.exports = router;
