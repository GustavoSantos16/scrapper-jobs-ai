/**
 * Fila de envio de e-mails com Nodemailer.
 * Delay aleatório entre 3 e 5 minutos (180000–300000 ms).
 * Limite recomendado: 15 e-mails por dia.
 */
const nodemailer = require('nodemailer');
const { readDatabase, writeDatabase } = require('./storageService');

const DELAY_MIN_MS = 180000;  // 3 min
const DELAY_MAX_MS = 300000;  // 5 min
const MAX_EMAILS_PER_DAY = 15;

let queue = [];
let isProcessing = false;

function randomDelayMs(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Configura transporter a partir de variáveis de ambiente.
 * Ex: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM
 */
function getTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    throw new Error('Configure SMTP_USER e SMTP_PASS (ou SMTP_HOST/SMTP_PORT) para envio de e-mail.');
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

/**
 * Verifica e atualiza contador de e-mails do dia.
 */
async function updateDayCount() {
  const db = await readDatabase();
  const stats = db.emailStats || { currentDay: null, sentToday: 0 };
  const today = new Date().toDateString();
  if (stats.currentDay !== today) {
    stats.currentDay = today;
    stats.sentToday = 0;
    db.emailStats = stats;
    await writeDatabase(db);
  }
  return stats;
}

/**
 * Adiciona itens à fila: { jobId, to, subject, text }
 * @param {Array<{ jobId: string, to: string, subject: string, text: string }>} items
 */
function enqueue(items) {
  queue.push(...items);
  processQueue();
}

async function processQueue() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;
  const stats = await updateDayCount();
  if (stats.sentToday >= MAX_EMAILS_PER_DAY) {
    console.warn('Limite diário de e-mails atingido (15). Envios adiados.');
    isProcessing = false;
    return;
  }
  const item = queue.shift();
  if (!item) {
    isProcessing = false;
    return;
  }
  const delay = randomDelayMs(DELAY_MIN_MS, DELAY_MAX_MS);
  await new Promise((r) => setTimeout(r, delay));
  try {
    const transporter = getTransporter();
    const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
    await transporter.sendMail({
      from,
      to: item.to,
      subject: item.subject,
      text: item.text
    });
    const db = await readDatabase();
    const job = (db.jobs || []).find((j) => j.id === item.jobId);
    const sentAt = new Date().toISOString();
    if (job) {
      job.emailSent = true;
      job.emailSentAt = sentAt;
    }
    db.emailStats = db.emailStats || {};
    db.emailStats.sentToday = (db.emailStats.sentToday || 0) + 1;
    db.history = db.history || [];
    db.history.unshift({
      type: 'email_sent',
      jobId: item.jobId,
      title: job ? job.title : null,
      company: job ? job.company : null,
      to: item.to,
      sentAt
    });
    await writeDatabase(db);
  } catch (err) {
    console.error('Erro ao enviar e-mail:', err);
  }
  isProcessing = false;
  if (queue.length > 0) processQueue();
}

/**
 * Retorna estado da fila e estatísticas do dia.
 */
async function getQueueStatus() {
  const stats = await updateDayCount();
  return {
    queueLength: queue.length,
    sentToday: stats.sentToday,
    maxPerDay: MAX_EMAILS_PER_DAY
  };
}

module.exports = {
  enqueue,
  getQueueStatus,
  getTransporter,
  updateDayCount
};
