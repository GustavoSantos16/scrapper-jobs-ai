const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const resumeRoutes = require('./routes/resumeRoutes');
const scraperRoutes = require('./routes/scraperRoutes');
const jobRoutes = require('./routes/jobRoutes');
const historyRoutes = require('./routes/historyRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Endpoint de migração: lê database.json e retorna para o cliente importar no localStorage
const DB_PATH = path.join(__dirname, 'storage', 'database.json');
app.get('/api/migrate', (_req, res) => {
  try {
    if (!fs.existsSync(DB_PATH)) return res.json(null);
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    res.json(data);
  } catch (_) {
    res.json(null);
  }
});

// Rotas de API
app.use('/api/resume', resumeRoutes);
app.use('/api/scraper', scraperRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/history', historyRoutes);

// Servir frontend estático
const clientDir = path.join(__dirname, '..', 'client');
app.use(express.static(clientDir, { etag: false, maxAge: 0 }));

app.get('/', (_req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

app.get('/dashboard', (_req, res) => {
  res.sendFile(path.join(clientDir, 'dashboard.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
