/**
 * Integração com Ollama local (http://localhost:11434).
 * Modelo: mistral:7b-instruct-q4_0
 */
const axios = require('axios');
const { exec, spawn } = require('child_process');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = 'mistral:7b-instruct-q4_0';

/**
 * Verifica se o Ollama está rodando e se o modelo está disponível.
 * @returns {Promise<{ running: boolean, modelReady: boolean, models: string[] }>}
 */
async function checkStatus() {
  let running = false;
  let modelReady = false;
  let models = [];
  try {
    const res = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
    running = true;
    models = (res.data.models || []).map((m) => m.name);
    modelReady = models.some((n) => n.startsWith(MODEL.split(':')[0]));
  } catch (_) {}
  return { running, modelReady, models };
}

/**
 * Inicia o ollama serve em background e, se necessário, faz pull do modelo.
 * @returns {Promise<{ started: boolean, pulled: boolean, error?: string }>}
 */
async function ensureRunning() {
  let status = await checkStatus();
  let started = false;
  let pulled = false;

  if (!status.running) {
    await new Promise((resolve) => {
      const child = spawn('ollama', ['serve'], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      setTimeout(resolve, 3000);
    });
    status = await checkStatus();
    if (!status.running) {
      return { started: false, pulled: false, error: 'Não foi possível iniciar o Ollama. Verifique se está instalado (https://ollama.ai).' };
    }
    started = true;
  }

  if (!status.modelReady) {
    await new Promise((resolve, reject) => {
      exec(`ollama pull ${MODEL}`, { timeout: 300000 }, (err) => {
        if (err) reject(new Error(`Erro ao baixar modelo: ${err.message}`));
        else resolve();
      });
    });
    pulled = true;
  }

  return { started, pulled };
}

/**
 * Chama a API generate do Ollama.
 * @param {string} prompt
 * @param {object} [options] - { stream: false }
 * @returns {Promise<string>} - Resposta completa do modelo
 */
async function generate(prompt, options = {}) {
  try {
    const response = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model: MODEL,
        prompt,
        stream: false,
        ...(options.ollama || {})
      },
      { timeout: 120000 }
    );
    return response.data.response || '';
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      throw new Error(`Ollama não está rodando em ${OLLAMA_URL}. Execute: ollama serve`);
    }
    if (err.response && err.response.status === 404) {
      throw new Error(`Modelo "${MODEL}" não encontrado. Execute: ollama pull ${MODEL}`);
    }
    throw new Error(`Erro ao chamar Ollama: ${err.message}`);
  }
}

/**
 * Classificação de compatibilidade vaga x currículo.
 * Retorno esperado: { score: number, justificativa: string }
 * @param {string} jobTitle
 * @param {string} jobDescription
 * @param {string} resumeText
 * @returns {Promise<{ score: number, justificativa: string }>}
 */
async function classifyMatch(jobTitle, jobDescription, resumeText) {
  const prompt = `Avalie a compatibilidade entre o currículo e a vaga. Responda APENAS com um JSON válido, sem markdown e sem texto extra:
{"score": number de 0 a 100, "justificativa": "string curta em português"}

Vaga: ${jobTitle}
Descrição: ${(jobDescription || '').slice(0, 2000)}

Currículo (resumo): ${(resumeText || '').slice(0, 1500)}

JSON:`;
  const raw = await generate(prompt);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { score: 50, justificativa: 'Análise indisponível.' };
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const score = Math.min(100, Math.max(0, Number(parsed.score) || 50));
    const justificativa = typeof parsed.justificativa === 'string' ? parsed.justificativa : 'Sem justificativa.';
    return { score, justificativa };
  } catch (_) {
    return { score: 50, justificativa: 'Resposta da IA inválida.' };
  }
}

/**
 * Gera proposta personalizada (máx. 140 palavras).
 * @param {string} jobTitle
 * @param {string} company
 * @param {string} jobDescription
 * @param {string} resumeText
 * @returns {Promise<string>}
 */
async function generateProposal(jobTitle, company, jobDescription, resumeText) {
  const prompt = `You are a senior career copywriter.

Write a concise and persuasive cover letter.

Rules:
- Maximum 140 words
- No greetings (do not write "Dear Hiring Manager")
- No generic phrases (avoid "I am excited to apply")
- Start directly with a strong professional positioning statement
- Focus on impact and business value
- Do not list technologies without context
- Use short, clear paragraphs
- Do not repeat the resume literally
- Output only the letter text, no labels or headings

Job Title: ${jobTitle}
Company: ${company}
Job Description:
${(jobDescription || '').slice(0, 1500)}

Resume Summary:
${(resumeText || '').slice(0, 1200)}`;

  const raw = await generate(prompt, {
    ollama: {
      options: {
        temperature: 0.7,
        top_p: 0.9,
        num_predict: 300,
        stop: ['\n\n\n', '---', 'Job Title:', 'Resume Summary:']
      }
    }
  });

  let text = raw.trim()
    .replace(/^(cover letter|carta|letter|subject|here is|here's)[:\s]*/i, '')
    .replace(/^["']+|["']+$/g, '')
    .replace(/\n{3,}/g, '\n\n');

  const words = text.split(/\s+/);
  if (words.length > 150) {
    const truncated = words.slice(0, 150).join(' ');
    const lastPeriod = truncated.lastIndexOf('.');
    text = lastPeriod > truncated.length * 0.6 ? truncated.slice(0, lastPeriod + 1) : truncated;
  }
  return text;
}

module.exports = {
  generate,
  classifyMatch,
  generateProposal,
  checkStatus,
  ensureRunning
};
