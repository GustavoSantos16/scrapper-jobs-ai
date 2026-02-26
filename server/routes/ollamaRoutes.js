const express = require('express');
const ollamaService = require('../services/ollamaService');

const router = express.Router();

router.get('/status', async (_req, res) => {
  try {
    const status = await ollamaService.checkStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/start', async (_req, res) => {
  try {
    const result = await ollamaService.ensureRunning();
    if (result.error) {
      return res.status(500).json({ success: false, ...result });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
