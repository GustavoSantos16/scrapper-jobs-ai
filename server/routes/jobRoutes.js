/**
 * Rotas de vagas: listar, rodar match, gerar proposta.
 */
const express = require('express');
const matchService = require('../services/matchService');
const proposalService = require('../services/proposalService');
const { readDatabase } = require('../services/storageService');

const router = express.Router();

/**
 * GET /api/jobs
 * Lista todas as vagas salvas no database.json.
 */
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

/**
 * POST /api/jobs/match
 * Executa o match (filtro por keyword + classificação Ollama) em vagas ainda sem score.
 */
router.post('/match', async (_req, res) => {
  try {
    const result = await matchService.runMatch();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Erro no match:', err);
    res.status(400).json({ error: err.message || 'Erro ao executar match.' });
  }
});

/**
 * POST /api/jobs/:id/proposal
 * Gera proposta personalizada para a vaga.
 */
router.post('/:id/proposal', async (req, res) => {
  try {
    const result = await proposalService.generateForJob(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Erro ao gerar proposta:', err);
    res.status(400).json({ error: err.message || 'Erro ao gerar proposta.' });
  }
});

/**
 * POST /api/jobs/proposals
 * Body: { jobIds: string[] }
 * Gera propostas para várias vagas.
 */
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

module.exports = router;
