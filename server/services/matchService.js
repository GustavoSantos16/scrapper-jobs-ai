/**
 * Filtro por palavras-chave (Jaccard + skills) e classificação via Ollama.
 * Pré-filtro leve para não sobrecarregar a IA; o Ollama faz a análise fina.
 */
const ollamaService = require('./ollamaService');
const { readDatabase, writeDatabase } = require('./storageService');

const KEYWORD_THRESHOLD = 0.05;

const STOP_WORDS = new Set([
  // EN
  'the','and','for','are','but','not','you','all','can','had','her','was','one','our','out',
  'has','have','from','been','they','with','this','that','will','each','make','like','long',
  'look','many','some','than','them','then','what','when','who','how','its','may','use','way',
  'about','after','also','back','could','into','just','more','most','much','must','only',
  'other','over','such','take','very','want','which','would','your','able','work','working',
  'experience','including','across','every','based','being','part','role','team','join',
  'company','opportunity','looking','build','help','well','should','their','where','while',
  'new','any','both','need','provide','required','strong','years','position','apply',
  'committed','equal','without','regard','offer','etc','https','office','pro',
  // PT – comuns e biográficos
  'para','com','uma','que','por','dos','das','nos','nas','seu','sua','mais','como','entre',
  'sobre','pelo','pela','esta','esse','essa','isso','tem','ser','ter','foram','seus','suas',
  'ainda','pode','deve','cada','mesmo','desde','qual','quais','outro','outra','outros',
  'outras','muito','muita','todos','todas','sempre','tambem','apenas','quando','onde',
  'sou','meu','minha','tenho','estou','pronto','bem','porem','foco','atual','busca',
  'profissional','dedicado','comprometido','comunicativo','ativo','crescer',
  'profissionalmente','habilidades','atuacao','variadas','areas','prestacao',
  'endereco','contato','portfolio','telefone','email','educacao','fluente',
  'cursos','idiomas','perfil','objetivos','contribuir','equipe','aprimoramento',
  'atualizacao','familiaridade','experiencia',
]);

/**
 * Normaliza texto: lowercase, remove diacríticos e pontuação.
 * @param {string} text
 * @returns {string[]}
 */
function extractWords(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Similaridade centrada no currículo: que fração das palavras-chave do currículo
 * aparecem na vaga? Ignora stop words para focar em termos técnicos e relevantes.
 * @param {string} resumeText
 * @param {string} jobText
 * @returns {number} 0–1
 */
function keywordSimilarity(resumeText, jobText) {
  const resumeWords = new Set(extractWords(resumeText));
  const jobWords = new Set(extractWords(jobText));
  if (resumeWords.size === 0 || jobWords.size === 0) return 0;

  let intersection = 0;
  for (const w of resumeWords) {
    if (jobWords.has(w)) intersection++;
  }

  return intersection / resumeWords.size;
}

/**
 * Classifica uma vaga: >=70 aprovado, 50–69 talvez, <50 descartado.
 * @param {number} score
 * @returns {string}
 */
function getStatus(score) {
  if (score >= 70) return 'aprovado';
  if (score >= 50) return 'talvez';
  return 'descartado';
}

/**
 * Analisa todas as vagas ainda sem score: filtro por keyword e, se passar, classifica com Ollama.
 * Atualiza database.json com score, justificativa e status.
 * @param {function} [onProgress] - callback(event) chamado a cada vaga processada
 * @returns {Promise<{ processed: number, results: Array }>}
 */
async function runMatch(onProgress) {
  const db = await readDatabase();
  const resumeText = (db.resume && db.resume.text) || '';
  if (!resumeText.trim()) {
    throw new Error('Nenhum currículo cadastrado. Faça upload do currículo primeiro.');
  }

  const jobs = db.jobs || [];
  const toProcess = jobs.filter((j) => j.score == null);
  const results = [];
  const total = toProcess.length;

  const emit = (data) => { if (typeof onProgress === 'function') onProgress(data); };

  for (let i = 0; i < toProcess.length; i++) {
    const job = toProcess[i];
    const jobText = [job.title, job.company, job.description].filter(Boolean).join(' ');
    const sim = keywordSimilarity(resumeText, jobText);

    emit({ type: 'analyzing', index: i, total, jobId: job.id, title: job.title, company: job.company });

    if (sim < KEYWORD_THRESHOLD) {
      job.score = 0;
      job.justificativa = `Pré-filtro: similaridade de ${(sim * 100).toFixed(1)}% abaixo do mínimo (${(KEYWORD_THRESHOLD * 100).toFixed(0)}%).`;
      job.status = 'descartado';
      const r = { id: job.id, score: 0, status: 'descartado', justificativa: job.justificativa };
      results.push(r);
      emit({ type: 'result', index: i, total, ...r });
      continue;
    }

    try {
      emit({ type: 'ollama', index: i, total, jobId: job.id, title: job.title, company: job.company });
      const { score, justificativa } = await ollamaService.classifyMatch(
        job.title,
        job.description,
        resumeText
      );
      job.score = score;
      job.justificativa = justificativa;
      job.status = getStatus(score);
      const r = { id: job.id, score, status: job.status, justificativa };
      results.push(r);
      emit({ type: 'result', index: i, total, ...r });
    } catch (err) {
      console.error(`[Match] Erro Ollama para "${job.title}":`, err.message);
      job.score = null;
      job.justificativa = err.message || 'Erro na classificação.';
      job.status = 'erro';
      const r = { id: job.id, score: null, status: 'erro', justificativa: job.justificativa };
      results.push(r);
      emit({ type: 'result', index: i, total, ...r });
    }
  }

  await writeDatabase(db);
  return { processed: toProcess.length, results };
}

module.exports = {
  keywordSimilarity,
  getStatus,
  runMatch
};
