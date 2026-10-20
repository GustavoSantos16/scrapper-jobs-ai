import { BRAZIL_ELIGIBLE_GEO, type ContractType, type GeoTag, type RemoteType, type Seniority } from '@ajh/shared';
import { stripDiacritics } from './text.ts';

/** Lowercase, diacritic-free text for rule matching. */
export function fold(s: string | null | undefined): string {
  return stripDiacritics(s ?? '').toLowerCase();
}

// ---------------------------------------------------------------- remote type

export function detectRemoteType(...texts: (string | null | undefined)[]): RemoteType {
  const t = fold(texts.filter(Boolean).join(' \n '));
  if (!t) return 'unknown';
  const hybrid = /\b(hybrid|hibrido|hibrida|semi[- ]presencial)\b/.test(t);
  const remote =
    /\b(remote|remoto|remota|home[ -]?office|work from home|wfh|anywhere|teletrabalho|trabalho remoto|distributed team|fully distributed)\b/.test(
      t,
    );
  const onsite = /\b(on[- ]?site|presencial|in[- ]office|in the office|office[- ]based)\b/.test(t);
  if (hybrid) return 'hybrid';
  if (remote && !/\b(not|no|non)[- ]remote\b/.test(t)) return 'remote';
  if (onsite) return 'onsite';
  return 'unknown';
}

/** Maps structured workplace values used by ATSs ("remote", "on-site", "Hybrid", "homeoffice"). */
export function remoteTypeFromStructured(value: string | null | undefined): RemoteType {
  const v = fold(value).replace(/[\s_-]/g, '');
  if (!v) return 'unknown';
  if (/^(remote|remoto|homeoffice|fullyremote|anywhere)$/.test(v)) return 'remote';
  if (/^(hybrid|hibrido)$/.test(v)) return 'hybrid';
  if (/^(onsite|inoffice|office|presencial)$/.test(v)) return 'onsite';
  return detectRemoteType(value);
}

// ---------------------------------------------------------------- seniority

const SENIORITY_RULES: [RegExp, Seniority][] = [
  [/\b(intern|internship|estagio|estagiari[oa]|trainee|apprentice)\b/, 'intern'],
  [/\bprincipal\b/, 'principal'],
  [/\bstaff\b/, 'staff'],
  [/\b(tech lead|team lead|lead|lider|lider tecnico|head of|engineering manager)\b/, 'lead'],
  [/\b(senior|sr|snr|especialista)\b/, 'senior'],
  [/\b(pleno|mid[- ]?level|mid|intermediate)\b/, 'mid'],
  [/\b(junior|jr|entry[- ]level|graduate)\b/, 'junior'],
];

/** Roman level suffixes ("Engineer II") only count in titles. */
const TITLE_LEVELS: [RegExp, Seniority][] = [
  [/\b(iii|iv|v)\s*$/, 'senior'],
  [/\bii\s*$/, 'mid'],
  [/\bi\s*$/, 'junior'],
];

/** Detects seniority from the title first, then from structured level hints (never descriptions). */
export function detectSeniority(title: string | null | undefined, ...hints: (string | null | undefined)[]): Seniority {
  const t = fold(title);
  for (const [re, level] of SENIORITY_RULES) if (re.test(t)) return level;
  const bare = t.replace(/\(.*?\)|[-–|,].*$/g, ' ').trim();
  for (const [re, level] of TITLE_LEVELS) if (re.test(bare)) return level;
  for (const hint of hints) {
    const h = fold(hint);
    for (const [re, level] of SENIORITY_RULES) if (re.test(h)) return level;
  }
  return 'unknown';
}

// ---------------------------------------------------------------- contract types

const CONTRACT_RULES: [RegExp, ContractType][] = [
  [/\bclt\b|carteira assinada|regime clt|efetivo/, 'clt'],
  [/\bpj\b|pessoa juridica|\bcnpj\b/, 'pj'],
  [/\b(contractor|contract|independent contractor|1099|b2b|consultant|contrato)\b/, 'contractor'],
  [/\b(full[- ]?time|tempo integral|permanent|unbefristet|vollzeit|fulltime|efetiva)\b/, 'full_time'],
  [/\b(part[- ]?time|meio periodo|teilzeit)\b/, 'part_time'],
  [/\b(freelance|freelancer|freela)\b/, 'freelance'],
  [/\b(internship|intern|estagio|praktikum)\b/, 'internship'],
  [/\b(temporary|temp|temporario|fixed[- ]term|befristet)\b/, 'temporary'],
];

export function detectContractTypes(...texts: (string | null | undefined)[]): ContractType[] {
  const t = fold(texts.filter(Boolean).join(' \n '));
  const found = new Set<ContractType>();
  for (const [re, type] of CONTRACT_RULES) if (re.test(t)) found.add(type);
  // "unbefristet" contains "befristet": permanent wins
  if (found.has('temporary') && /unbefristet/.test(t) && !/\bbefristet\b/.test(t.replace(/unbefristet/g, ''))) {
    found.delete('temporary');
  }
  return [...found];
}

// ---------------------------------------------------------------- technologies

/** Canonical display name → pattern over folded text. Order matters for overlaps. */
export const TECH_PATTERNS: [string, RegExp][] = [
  ['React Native', /\breact[- ]?native\b/],
  ['React', /\breact(\.?js)?\b(?![- ]?native)/],
  ['Angular', /\bangular(js|\.js)?\b/],
  ['Vue', /\bvue(\.?js)?\b/],
  ['Svelte', /\bsvelte(kit)?\b/],
  ['Next.js', /\bnext\.?js\b/],
  ['Nuxt', /\bnuxt(\.?js)?\b/],
  ['Ionic', /\bionic\b/],
  ['Expo', /\bexpo\b/],
  ['Flutter', /\bflutter\b/],
  ['TypeScript', /\btypescript\b|\bts\b(?=[,/ ]+(js|javascript|react|node))/],
  ['JavaScript', /\bjavascript\b|\bes6\b|\becmascript\b/],
  ['Node.js', /\bnode(\.?js)?\b(?!\s*(red|s\b))/],
  ['HTML', /\bhtml5?\b/],
  ['CSS', /\bcss3?\b/],
  ['Sass', /\b(sass|scss)\b/],
  ['Tailwind', /\btailwind(css)?\b/],
  ['Redux', /\bredux\b/],
  ['GraphQL', /\bgraphql\b/],
  ['REST', /\brest(ful)?\b(?=[ -]?(api|apis|services|endpoints|ful))|\brestful\b/],
  ['Firebase', /\bfirebase\b/],
  ['PostgreSQL', /\bpostgres(ql)?\b/],
  ['MySQL', /\bmysql\b/],
  ['MongoDB', /\bmongo(db)?\b/],
  ['Python', /\bpython\b/],
  ['Java', /\bjava\b(?!\s*script)/],
  ['Kotlin', /\bkotlin\b/],
  ['Swift', /\bswift(ui)?\b/],
  ['Go', /\bgolang\b|\bgo\b(?=[ ,/]+(developer|engineer|lang|microservices))/],
  ['Ruby', /\bruby\b/],
  ['Rails', /\b(ruby on )?rails\b/],
  ['PHP', /\bphp\b/],
  ['Laravel', /\blaravel\b/],
  ['C#', /(^|[^a-z])c#(?![a-z])/],
  ['.NET', /(^|\s)\.net\b|\bdotnet\b/],
  ['Rust', /\brust\b(?!ic)/],
  ['AWS', /\baws\b|amazon web services/],
  ['GCP', /\bgcp\b|google cloud/],
  ['Azure', /\bazure\b/],
  ['Docker', /\bdocker\b/],
  ['Kubernetes', /\bkubernetes\b|\bk8s\b/],
  ['Jest', /\bjest\b/],
  ['Cypress', /\bcypress\b/],
  ['Playwright', /\bplaywright\b/],
  ['Storybook', /\bstorybook\b/],
  ['Vite', /\bvite\b/],
  ['Webpack', /\bwebpack\b/],
];

const TECH_BY_NAME = new Map(TECH_PATTERNS.map(([name, re]) => [fold(name), re]));

/** Regex for a profile term: the dictionary pattern when known, else a word-boundary match. */
export function termPattern(term: string): RegExp {
  const known = TECH_BY_NAME.get(fold(term));
  if (known) return known;
  const escaped = fold(term)
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/[\s-]+/g, '[\\s-]?');
  return new RegExp(`(^|[^a-z0-9])${escaped}(?![a-z0-9])`);
}

export function textHasTerm(foldedText: string, term: string): boolean {
  return termPattern(term).test(foldedText);
}

const TAG_ALIASES: Record<string, string> = {
  go: 'Go', golang: 'Go', node: 'Node.js', nodejs: 'Node.js', js: 'JavaScript', ts: 'TypeScript',
  reactjs: 'React', 'react.js': 'React', vuejs: 'Vue', 'c sharp': 'C#', dotnet: '.NET', postgres: 'PostgreSQL',
  k8s: 'Kubernetes', rest: 'REST', 'rest api': 'REST', restful: 'REST', html5: 'HTML', css3: 'CSS',
};

/** Exact source tag → canonical tech ("go" → Go, "reactjs" → React), or null. */
export function techFromTag(tag: string | null | undefined): string | null {
  const t = fold(tag).trim();
  if (!t) return null;
  const alias = TAG_ALIASES[t];
  if (alias) return alias;
  return TECH_PATTERNS.find(([name]) => fold(name) === t)?.[0] ?? null;
}

export function detectTechnologies(...texts: (string | null | undefined)[]): string[] {
  const t = fold(texts.filter(Boolean).join(' \n '));
  if (!t) return [];
  return TECH_PATTERNS.filter(([, re]) => re.test(t)).map(([name]) => name);
}

// ---------------------------------------------------------------- language

const STOPWORDS: Record<string, string[]> = {
  en: ['the', 'and', 'with', 'you', 'our', 'for', 'will', 'are', 'experience', 'team', 'we'],
  pt: ['de', 'e', 'com', 'para', 'voce', 'nossa', 'nosso', 'experiencia', 'vaga', 'que', 'uma', 'em'],
  es: ['de', 'y', 'con', 'para', 'nuestro', 'experiencia', 'equipo', 'que', 'una', 'en', 'el', 'los'],
  de: ['und', 'mit', 'fur', 'wir', 'sie', 'der', 'die', 'das', 'eine', 'ist', 'zu'],
};

/** Very small stopword-frequency language guess: en | pt | es | de | null. */
export function detectLanguage(text: string | null | undefined): string | null {
  const words = fold(text).slice(0, 4000).match(/[a-z]+/g);
  if (!words || words.length < 8) return null;
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  let best: string | null = null;
  let bestScore = 0;
  for (const [lang, list] of Object.entries(STOPWORDS)) {
    const score = list.reduce((sum, w) => sum + (counts.get(w) ?? 0), 0) / words.length;
    if (score > bestScore) {
      bestScore = score;
      best = lang;
    }
  }
  // pt and es share many stopwords; Portuguese-only markers decide
  if (best === 'es' && /\b(voce|nao|vaga|sao|tambem|experiencia em)\b/.test(fold(text))) best = 'pt';
  return bestScore >= 0.03 ? best : null;
}

// ---------------------------------------------------------------- country

const COUNTRY_NAMES: [RegExp, string][] = [
  [/\b(brazil|brasil|sao paulo|rio de janeiro|belo horizonte|curitiba|florianopolis|porto alegre|recife|campinas|brasilia|salvador|fortaleza|goiania|minas gerais|santa catarina|parana|pernambuco|rio grande do sul)\b/, 'BR'],
  [/\b(united states|usa|u\.s\.a?\.?|us|new york|california|san francisco|seattle|austin|texas|boston|chicago)\b/, 'US'],
  [/\b(canada|toronto|vancouver|montreal)\b/, 'CA'],
  [/\b(united kingdom|uk|england|london|scotland)\b/, 'GB'],
  [/\b(germany|deutschland|berlin|munich|munchen|hamburg|frankfurt|koln|cologne|stuttgart|dusseldorf)\b/, 'DE'],
  [/\b(portugal|lisbon|lisboa|porto)\b/, 'PT'],
  [/\b(spain|espana|madrid|barcelona)\b/, 'ES'],
  [/\b(mexico|ciudad de mexico|guadalajara|monterrey)\b/, 'MX'],
  [/\b(argentina|buenos aires)\b/, 'AR'],
  [/\b(colombia|bogota|medellin)\b/, 'CO'],
  [/\b(chile|santiago)\b/, 'CL'],
  [/\b(uruguay|montevideo)\b/, 'UY'],
  [/\b(peru|lima)\b/, 'PE'],
  [/\b(netherlands|amsterdam)\b/, 'NL'],
  [/\b(france|paris)\b/, 'FR'],
  [/\b(ireland|dublin)\b/, 'IE'],
  [/\b(poland|warsaw|krakow)\b/, 'PL'],
  [/\b(india|bangalore|bengaluru|hyderabad|pune)\b/, 'IN'],
  [/\b(philippines|manila)\b/, 'PH'],
  [/\b(australia|sydney|melbourne)\b/, 'AU'],
  [/\b(israel|tel aviv)\b/, 'IL'],
  [/\b(singapore)\b/, 'SG'],
];

/** Returns the ISO-3166 alpha-2 code when a location names exactly one known country. */
export function detectCountry(location: string | null | undefined): string | null {
  const t = fold(location);
  if (!t) return null;
  if (/^[a-z]{2}$/.test(t.trim())) {
    const code = t.trim().toUpperCase();
    return code === 'UK' ? 'GB' : code;
  }
  const hits = new Set<string>();
  for (const [re, code] of COUNTRY_NAMES) if (re.test(t)) hits.add(code);
  return hits.size === 1 ? [...hits][0]! : null;
}

// ---------------------------------------------------------------- geo eligibility

const EUROPE_COUNTRIES = /\b(europe|eu|emea|germany|france|spain|portugal|netherlands|ireland|poland|italy|sweden|denmark|norway|finland|austria|switzerland|belgium|czech|romania|greece|hungary|estonia|lithuania|latvia)\b/;

/**
 * Classifies a *structured* location value ("Worldwide", "USA", "LATAM", "Brazil", "Europe")
 * as published in a location/eligibility field. Unknown non-empty places count as a restriction.
 */
export function geoFromLocation(value: string | null | undefined): GeoTag[] {
  const t = fold(value).trim();
  if (!t) return [];
  const tags = new Set<GeoTag>();
  if (/\b(worldwide|anywhere|global|globally|world|international|todo o mundo|any country|all countries)\b/.test(t)) tags.add('worldwide');
  if (/\b(latam|latin america|south america|america latina|latinoamerica|central america)\b/.test(t)) tags.add('latam');
  if (/\b(americas|north and south america|north & south america)\b/.test(t)) tags.add('americas');
  if (detectCountry(t) === 'BR' || /\b(brazil|brasil)\b/.test(t)) tags.add('brazil');
  if (tags.size) return [...tags];

  if (t.replace(/remote|remoto|[,()\s/-]/g, '') === '') {
    return []; // just "Remote": no geographic info
  }
  const country = detectCountry(t);
  if (country === 'US' || /\b(usa|united states|u\.s\.|us only|us-only|north america)\b/.test(t)) tags.add('us_only');
  if (country === 'CA') tags.add('canada_only');
  if (country === 'GB') tags.add('uk_only');
  if (EUROPE_COUNTRIES.test(t)) tags.add('eu_only');
  if (!tags.size) tags.add('restricted_other');
  return [...tags];
}

/**
 * Detects explicit eligibility statements in free text (title/description). Only explicit
 * phrases count; a city mentioned in passing is not a restriction.
 */
export function geoFromText(text: string | null | undefined): GeoTag[] {
  const t = fold(text);
  if (!t) return [];
  const tags = new Set<GeoTag>();
  if (/\b(work from anywhere|anywhere in the world|remote[- ]worldwide|worldwide remote|fully remote,? worldwide|globally remote|remote \(?(worldwide|global|anywhere)\)?|from any country|hire (from )?anywhere)\b/.test(t)) tags.add('worldwide');
  const L = '(latam|latin america|south america|america latina)';
  const latamPhrases = [
    `\\b(open to|hiring|hire|candidates|talent|engineers|developers|professionals|people) (from |in |across |based in |located in )?(the )?${L}\\b`,
    `\\b(remote|anywhere|located|based|work) (in|from|across|within) (the )?${L}\\b`,
    `\\b${L}[- ](only|based|remote)\\b`,
    `\\bremote\\s*[-–—,:/(]?\\s*${L}\\b`,
    `\\(${L}\\)`,
  ];
  if (latamPhrases.some((p) => new RegExp(p).test(t))) tags.add('latam');
  if (/\b(remote[- ](brazil|brasil)|(brazil|brasil)[- ]remote|based in (brazil|brasil)|candidates in (brazil|brasil)|residir no brasil|residentes no brasil|todo o brasil)\b/.test(t)) tags.add('brazil');
  if (/\b(us[- ]only|usa[- ]only|u\.s\.[- ]only|united states only|(must|should) (be )?(located|based|reside|live) in the (us|u\.s\.|usa|united states)|(authorized|authorised|eligible|legally able) to work in the (us|u\.s\.|usa|united states)|us citizens? only|us[- ]based (candidates )?only|within the (us|united states) only)\b/.test(t)) tags.add('us_only');
  if (/\b(canada only|(must|should) (be )?(located|based|reside) in canada|eligible to work in canada)\b/.test(t)) tags.add('canada_only');
  if (/\b(uk only|(must|should) (be )?(located|based|reside) in the uk|right to work in the uk)\b/.test(t)) tags.add('uk_only');
  if (/\b(eu only|europe only|(must|should) (be )?(located|based|reside) in (the )?(eu|europe|european union)|eu[- ]based (candidates )?only|eu work permit|right to work in the eu)\b/.test(t)) tags.add('eu_only');
  return [...tags];
}

/**
 * Union of tags. When any tag makes a candidate in Brazil eligible, restriction tags are
 * dropped: "US, Canada, Brazil" is not a restriction for this user.
 */
export function mergeGeo(...lists: GeoTag[][]): GeoTag[] {
  const all = [...new Set(lists.flat())];
  const eligible = all.filter((g) => BRAZIL_ELIGIBLE_GEO.includes(g));
  return eligible.length ? eligible : all;
}
