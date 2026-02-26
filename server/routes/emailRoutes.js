/**
 * Rotas de e-mail: enfileirar envios e consultar status da fila.
 */
const express = require('express');
const emailQueueService = require('../services/emailQueueService');
const { readDatabase } = require('../services/storageService');

const router = express.Router();

/**
 * GET /api/emails/status
 * Retorna tamanho da fila e quantos e-mails foram enviados hoje.
 */
router.get('/status', async (_req, res) => {
  try {
    const status = await emailQueueService.getQueueStatus();
    res.json(status);
  } catch (err) {
    console.error('Erro ao obter status da fila:', err);
    res.status(500).json({ error: 'Erro ao obter status.' });
  }
});

/**
 * POST /api/emails/send
 * Body: { items: Array<{ jobId: string, to: string, subject?: string }> }
 * Gera subject a partir do título da vaga se não informado; texto = proposal do job.
 * Adiciona à fila com delay 3–5 min entre cada um.
 */
router.post('/send', async (req, res) => {
  try {
    const items = req.body && req.body.items ? req.body.items : [];
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Envie items: [{ jobId, to, subject? }].' });
    }
    const db = await readDatabase();
    const jobs = db.jobs || [];
    const toEnqueue = [];
    for (const it of items) {
      const job = jobs.find((j) => j.id === it.jobId);
      if (!job) continue;
      if (job.emailSent) continue;
      if (!job.proposal) {
        toEnqueue.push({
          jobId: job.id,
          to: it.to,
          subject: it.subject || `Candidatura - ${job.title}`,
          text: job.proposal || `Olá,\n\nTenho interesse na vaga ${job.title} na ${job.company}.\n\nAtenciosamente.`
        });
      } else {
        toEnqueue.push({
          jobId: job.id,
          to: it.to,
          subject: it.subject || `Candidatura - ${job.title}`,
          text: job.proposal
        });
      }
    }
    emailQueueService.enqueue(toEnqueue);
    res.json({ success: true, queued: toEnqueue.length });
  } catch (err) {
    console.error('Erro ao enfileirar e-mails:', err);
    res.status(500).json({ error: err.message || 'Erro ao enfileirar envios.' });
  }
});

module.exports = router;
