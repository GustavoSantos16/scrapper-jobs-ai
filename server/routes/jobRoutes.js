const express = require('express');
const matchService = require('../services/matchService');
const { readDatabase, writeDatabase } = require('../services/storageService');

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

router.delete('/:id', async (req, res) => {
  try {
    const db = await readDatabase();
    const idx = (db.jobs || []).findIndex((j) => j.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Vaga não encontrada.' });
    }
    db.jobs.splice(idx, 1);
    await writeDatabase(db);
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir vaga:', err);
    res.status(500).json({ error: err.message || 'Erro ao excluir vaga.' });
  }
});

router.post('/:id/applied', async (req, res) => {
  try {
    const db = await readDatabase();
    const jobs = db.jobs || [];
    const job = jobs.find((j) => j.id === req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Vaga não encontrada.' });
    }
    const shouldApply = req.body && typeof req.body.applied === 'boolean' ? req.body.applied : true;
    job.applied = shouldApply;
    job.appliedAt = shouldApply ? new Date().toISOString() : null;

    await writeDatabase(db);
    res.json({ success: true, job });
  } catch (err) {
    console.error('Erro ao atualizar candidatura da vaga:', err);
    res.status(500).json({ error: err.message || 'Erro ao atualizar candidatura da vaga.' });
  }
});

module.exports = router;
