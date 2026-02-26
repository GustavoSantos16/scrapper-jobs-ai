/**
 * Serviço de currículo: extração de texto de PDF e DOCX.
 * Usa pdf-parse e mammoth (sem APIs pagas).
 */
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { readDatabase, writeDatabase } = require('./storageService');

/**
 * Extrai texto de um buffer de PDF.
 * @param {Buffer} buffer
 * @returns {Promise<string>}
 */
async function extractFromPdf(buffer) {
  const data = await pdfParse(buffer);
  return data.text || '';
}

/**
 * Extrai texto de um buffer de DOCX.
 * @param {Buffer} buffer
 * @returns {Promise<string>}
 */
async function extractFromDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

/**
 * Salva o texto do currículo no database.json.
 * @param {string} text
 */
async function saveResume(text) {
  const db = await readDatabase();
  db.resume = {
    text: text.trim(),
    updatedAt: new Date().toISOString()
  };
  await writeDatabase(db);
  return db.resume;
}

/**
 * Processa arquivo de currículo (PDF ou DOCX) e persiste o texto.
 * @param {Buffer} buffer
 * @param {string} mimetype - 'application/pdf' ou 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
 * @returns {Promise<{ text: string, updatedAt: string }>}
 */
async function processResume(buffer, mimetype) {
  let text = '';
  if (mimetype === 'application/pdf') {
    text = await extractFromPdf(buffer);
  } else if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimetype === 'application/msword'
  ) {
    text = await extractFromDocx(buffer);
  } else {
    throw new Error('Formato não suportado. Use PDF ou DOCX.');
  }
  if (!text || !text.trim()) {
    throw new Error('Nenhum texto extraído do arquivo.');
  }
  return saveResume(text);
}

/**
 * Retorna o currículo salvo (se existir).
 */
async function getResume() {
  const db = await readDatabase();
  return db.resume;
}

module.exports = {
  processResume,
  getResume,
  extractFromPdf,
  extractFromDocx
};
