/**
 * Rotas de histórico (envios de e-mail e ações salvas no database.json).
 */
const express = require('express');
const { readDatabase } = require('../services/storageService');

const router = express.Router();

/**
 * GET /api/history
 * Retorna o histórico salvo (ex.: e-mails enviados).
 */
router.get('/', async (_req, res) => {
  try {
    const db = await readDatabase();
    const history = db.history || [];
    res.json(history);
  } catch (err) {
    console.error('Erro ao obter histórico:', err);
    res.status(500).json({ error: 'Erro ao obter histórico.' });
  }
});

module.exports = router;
