const express = require('express');
const multer = require('multer');
const resumeService = require('../services/resumeService');

const router = express.Router();

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

module.exports = router;
