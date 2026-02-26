/**
 * Rotas de upload e leitura de currículo.
 */
const express = require('express');
const multer = require('multer');
const resumeService = require('../services/resumeService');

const router = express.Router();

// Multer: memória (sem salvar em disco). Limite 10MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Apenas PDF ou DOCX são permitidos.'), false);
    }
  }
});

/**
 * POST /api/resume/upload
 * Body: multipart/form-data com campo "resume" (arquivo PDF ou DOCX).
 */
router.post('/upload', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }
    const result = await resumeService.processResume(req.file.buffer, req.file.mimetype);
    res.json({ success: true, resume: result });
  } catch (err) {
    console.error('Erro no upload do currículo:', err);
    res.status(400).json({ error: err.message || 'Erro ao processar currículo.' });
  }
});

/**
 * GET /api/resume
 * Retorna o currículo atualmente salvo.
 */
router.get('/', async (_req, res) => {
  try {
    const resume = await resumeService.getResume();
    res.json(resume || { text: null, updatedAt: null });
  } catch (err) {
    console.error('Erro ao obter currículo:', err);
    res.status(500).json({ error: 'Erro ao obter currículo.' });
  }
});

module.exports = router;
