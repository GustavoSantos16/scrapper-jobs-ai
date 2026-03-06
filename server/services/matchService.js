/**
 * Classificação local de compatibilidade vaga x currículo (sem IA externa).
 * Usa heurísticas de palavras-chave técnicas, senioridade e contexto.
 */
const { readDatabase, writeDatabase } = require('./storageService');

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
  'atualizacao','familiaridade','experiencia','vaga','vagas','curriculo'
]);

const TECH_GROUPS = [
  { name: 'react', terms: ['react', 'reactjs'] },
  { name: 'angular', terms: ['angular', 'angularjs'] },
  { name: 'vue', terms: ['vue', 'vuejs', 'nuxt'] },
  { name: 'javascript', terms: ['javascript', 'js', 'ecmascript'] },
  { name: 'typescript', terms: ['typescript', 'ts'] },
  { name: 'node', terms: ['node', 'nodejs', 'express', 'nestjs'] },
  { name: 'python', terms: ['python', 'fastapi', 'django', 'flask'] },
  { name: 'java', terms: ['java', 'spring', 'springboot'] },
  { name: 'csharp', terms: ['c#', 'csharp', '.net', 'dotnet', 'asp.net'] },
  { name: 'php', terms: ['php', 'laravel', 'symfony'] },
  { name: 'sql', terms: ['sql', 'postgres', 'postgresql', 'mysql', 'mssql'] },
  { name: 'nosql', terms: ['mongodb', 'redis', 'dynamodb', 'firebase'] },
  { name: 'cloud', terms: ['aws', 'azure', 'gcp', 'cloud'] },
  { name: 'docker', terms: ['docker', 'kubernetes', 'k8s'] },
  { name: 'mobile', terms: ['ionic', 'react native', 'android', 'ios'] },
  { name: 'testing', terms: ['jest', 'cypress', 'testing', 'testes', 'unit test'] }
];

const SENIORITY_ORDER = ['intern', 'junior', 'mid', 'senior', 'lead'];
const SENIORITY_PATTERNS = [
  { key: 'intern', patterns: ['intern', 'estagio', 'estagiario', 'trainee'] },
  { key: 'junior', patterns: ['junior', 'jr'] },
  { key: 'mid', patterns: ['pleno', 'mid', 'mid-level', 'middle'] },
  { key: 'senior', patterns: ['senior', 'sr', 'sênior'] },
  { key: 'lead', patterns: ['lead', 'staff', 'principal', 'specialist', 'especialista'] }
];

function stripHtml(text) {
  return (text || '').replace(/<[^>]*>/g, ' ');
}

function normalizeText(text) {
  return stripHtml(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\w\s.#+\-]/g, ' ');
}

/**
 * Normaliza texto: lowercase, remove diacríticos e pontuação.
 * @param {string} text
 * @returns {string[]}
 */
function extractWords(text) {
  if (!text || typeof text !== 'string') return [];
  return normalizeText(text)
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

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
 * Retorna grupos tecnológicos encontrados no texto.
 * @param {string} text
 * @returns {Set<string>}
 */
function detectTechGroups(text) {
  const normalized = normalizeText(text);
  const found = new Set();
  for (const group of TECH_GROUPS) {
    if (group.terms.some((t) => normalized.includes(t))) {
      found.add(group.name);
    }
  }
  return found;
}

function detectSeniority(text) {
  const normalized = normalizeText(text);
  let highest = null;
  for (const entry of SENIORITY_PATTERNS) {
    const matched = entry.patterns.some((p) => normalized.includes(p));
    if (!matched) continue;
    if (!highest || SENIORITY_ORDER.indexOf(entry.key) > SENIORITY_ORDER.indexOf(highest)) {
      highest = entry.key;
    }
  }
  return highest;
}

function seniorityScore(jobLevel, resumeLevel) {
  if (!jobLevel || !resumeLevel) return { points: 5, note: 'senioridade sem indicação explícita' };
  const jobIndex = SENIORITY_ORDER.indexOf(jobLevel);
  const resumeIndex = SENIORITY_ORDER.indexOf(resumeLevel);
  const delta = resumeIndex - jobIndex;
  if (delta === 0) return { points: 15, note: `senioridade alinhada (${jobLevel})` };
  if (delta === 1) return { points: 12, note: `perfil ligeiramente acima (${resumeLevel} vs ${jobLevel})` };
  if (delta > 1) return { points: 8, note: `perfil acima do esperado (${resumeLevel})` };
  if (delta === -1) return { points: 8, note: `perfil um nível abaixo (${resumeLevel} vs ${jobLevel})` };
  return { points: 2, note: `senioridade distante (${resumeLevel} vs ${jobLevel})` };
}

function toPercent(value, max) {
  if (!max) return 0;
  return Math.round((value / max) * 100);
}

function scoreJobMatch(job, resumeText) {
  const title = job.title || '';
  const description = job.description || '';
  const company = job.company || '';
  const jobText = `${title} ${company} ${description}`;

  const resumeKeywords = new Set(extractWords(resumeText));
  const titleKeywords = new Set(extractWords(title));
  const jobKeywords = new Set(extractWords(jobText));

  let titleHits = 0;
  for (const t of titleKeywords) {
    if (resumeKeywords.has(t)) titleHits++;
  }
  const titleCoverage = titleKeywords.size ? titleHits / titleKeywords.size : 0;
  const titlePoints = Math.round(titleCoverage * 20);

  const resumeTech = detectTechGroups(resumeText);
  const jobTech = detectTechGroups(jobText);
  const sharedTech = [...jobTech].filter((t) => resumeTech.has(t));
  const techCoverage = jobTech.size ? sharedTech.length / jobTech.size : 0;
  const techPoints = Math.round((jobTech.size ? techCoverage : 0.35) * 45);

  const sim = keywordSimilarity(resumeText, jobText);
  const keywordPoints = Math.round(sim * 20);

  const jobLevel = detectSeniority(jobText);
  const resumeLevel = detectSeniority(resumeText);
  const seniority = seniorityScore(jobLevel, resumeLevel);

  let penalty = 0;
  if (jobTech.size >= 3 && techCoverage < 0.35) {
    penalty += 8;
  }
  if (titleKeywords.size >= 2 && titleCoverage < 0.3) {
    penalty += 5;
  }
  if (sim < 0.08) {
    penalty += 7;
  }

  const raw = titlePoints + techPoints + keywordPoints + seniority.points - penalty;
  const score = Math.max(0, Math.min(100, raw));

  const reasons = [];
  reasons.push(`Cobertura de título: ${toPercent(titleCoverage, 1)}%`);
  reasons.push(`Skills técnicas em comum: ${sharedTech.length}/${jobTech.size || 0}`);
  reasons.push(`Similaridade textual: ${toPercent(sim, 1)}%`);
  reasons.push(`Senioridade: ${seniority.note}`);
  if (penalty > 0) reasons.push(`Penalidade aplicada: -${penalty}`);

  return {
    score,
    justificativa: reasons.join(' | ')
  };
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
 * Analisa todas as vagas ainda sem score com motor local de palavras-chave.
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
    emit({ type: 'analyzing', index: i, total, jobId: job.id, title: job.title, company: job.company });
    const { score, justificativa } = scoreJobMatch(job, resumeText);
    job.score = score;
    job.justificativa = justificativa;
    job.status = getStatus(score);
    const r = { id: job.id, score, status: job.status, justificativa };
    results.push(r);
    emit({ type: 'result', index: i, total, ...r });
  }

  await writeDatabase(db);
  return { processed: toProcess.length, results };
}

module.exports = {
  keywordSimilarity,
  getStatus,
  runMatch
};
