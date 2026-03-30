const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

async function extractFromPdf(buffer) {
  const data = await pdfParse(buffer);
  return data.text || '';
}

async function extractFromDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

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
  return {
    text: text.trim(),
    updatedAt: new Date().toISOString()
  };
}

module.exports = {
  processResume,
  extractFromPdf,
  extractFromDocx
};
