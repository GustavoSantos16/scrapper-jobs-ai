/**
 * Geração de proposta personalizada via Ollama (máx. 150 palavras).
 */
const ollamaService = require('./ollamaService');
const { readDatabase, writeDatabase } = require('./storageService');

/**
 * Gera proposta para uma vaga e salva no job em database.json.
 * @param {string} jobId
 * @returns {Promise<{ proposal: string }>}
 */
async function generateForJob(jobId) {
  const db = await readDatabase();
  const resumeText = (db.resume && db.resume.text) || '';
  if (!resumeText.trim()) {
    throw new Error('Nenhum currículo cadastrado.');
  }
  const job = (db.jobs || []).find((j) => j.id === jobId);
  if (!job) {
    throw new Error('Vaga não encontrada.');
  }
  const proposal = await ollamaService.generateProposal(
    job.title,
    job.company,
    job.description,
    resumeText
  );
  job.proposal = proposal;
  await writeDatabase(db);
  return { proposal };
}

/**
 * Gera propostas para várias vagas (em sequência para não sobrecarregar o Ollama).
 * @param {string[]} jobIds
 * @param {function} [onProgress] - callback(event) chamado a cada vaga
 * @returns {Promise<Array<{ jobId: string, proposal: string }>>}
 */
async function generateForJobs(jobIds, onProgress) {
  const results = [];
  const emit = (data) => { if (typeof onProgress === 'function') onProgress(data); };
  const total = jobIds.length;

  for (let i = 0; i < jobIds.length; i++) {
    const id = jobIds[i];
    emit({ type: 'generating', index: i, total, jobId: id });
    try {
      const { proposal } = await generateForJob(id);
      results.push({ jobId: id, proposal });
      emit({ type: 'result', index: i, total, jobId: id, proposal });
    } catch (err) {
      results.push({ jobId: id, error: err.message });
      emit({ type: 'result', index: i, total, jobId: id, error: err.message });
    }
  }
  return results;
}

module.exports = {
  generateForJob,
  generateForJobs
};
