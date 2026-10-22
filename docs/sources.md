# Fontes de vagas: validação e vereditos

Validação feita em **2026-10-20** com requisições reais (`curl`, User-Agent
`AIJobHunter/0.1 (personal, non-commercial job aggregator)`), leitura do `robots.txt` e da
documentação oficial. Revalide se algo quebrar: estes são endpoints de terceiros.

**Vereditos possíveis:** API oficial · feed público · página pública · ATS por empresa ·
requer credencial · link manual · indisponível.

> Regra geral de atribuição: toda vaga mostra a fonte com nome e link para a URL original
> (botão **Abrir vaga original**). A candidatura sempre acontece no site de origem.

## Resumo

| Fonte | Veredito | Conector | Intervalo mínimo | Requisições/execução |
|---|---|---|---|---|
| Remotive | API oficial | ✅ `remotive` | 12 h | até 4 |
| Arbeitnow | API oficial | ✅ `arbeitnow` | 1 h | até 3 páginas |
| Jobicy | API oficial | ✅ `jobicy` | 1 h | até 3 |
| Remote OK | API oficial | ✅ `remoteok` | 1 h | 1 |
| Himalayas | API oficial | ✅ `himalayas` | 6 h | até 6 |
| We Work Remotely | Feed público (RSS) | ✅ `weworkremotely` | 1 h | 3 |
| HN "Who is hiring" | API oficial (Algolia) | ✅ `hn-whoishiring` | 6 h | 2 |
| HN Jobs (vagas YC) | API oficial (Firebase) | ✅ `hn-jobs` | 3 h | até 61 |
| Greenhouse | ATS por empresa | ✅ `greenhouse` | 1 h | 1 por empresa |
| Lever | ATS por empresa | ✅ `lever` | 1 h | 1 por empresa |
| Ashby | ATS por empresa | ✅ `ashby` | 1 h | 1 por empresa |
| Gupy | Página pública | ❌ removida | — | — |
| Workday | ATS por empresa (não documentado) | ❌ baixa prioridade | — | — |
| Adzuna | Requer credencial | ✅ `adzuna` (opcional) | 6 h | até 3 |
| Jooble | Requer credencial | ✅ `jooble` (opcional) | 6 h | até 3 |
| LinkedIn | Link manual | — | — | — |
| Glassdoor | Link manual | — | — | — |
| Indeed | Link manual | — | — | — |
| Wellfound | Link manual | — | — | — |
| Google Jobs | Link manual | — | — | — |
| YC Work at a Startup | Link manual | — | — | — |

O intervalo mínimo é aplicado pelo pipeline: se o agendador rodar a cada 30 min, uma fonte
de 6 h é pulada (motivo registrado em `run_sources.skip_reason`) até seu intervalo vencer.

---

## Primeira captura real (2026-10-20)

| Fonte | Vagas capturadas | Unidas a vagas de outra fonte |
|---|---|---|
| Greenhouse (8 empresas) | 668 | 8 |
| HN Who is hiring | 236 | 0 |
| Lever (3 empresas) | 231 | 4 |
| Ashby (6 empresas) | 166 | 3 |
| Jobicy | 159 | 0 |
| Himalayas | 108 | 0 |
| Remote OK | 99 | 1 |
| We Work Remotely | 86 | 5 |
| Arbeitnow (só remotas) | 62 | 0 |
| Gupy | 32 | 1 |
| HN Jobs (YC) | 31 | 0 |
| Remotive | 10 | 2 |
| **Total** | **1 888 listings → 1 864 vagas consolidadas** | 24 |

Adzuna e Jooble foram puladas com o motivo `missing_credentials`. A linha da Gupy é histórica:
o conector foi removido (ver abaixo).

## Camada A

### Remotive: API oficial
- **Endpoint:** `GET https://remotive.com/api/remote-jobs` (`category`, `search`, `limit`).
- **Formato:** JSON `{ "job-count", "jobs": [{ id, url, title, company_name, category, tags[], job_type, publication_date, candidate_required_location, salary, description(HTML) }] }`.
- **Autenticação:** nenhuma.
- **Limites observados:** cada chamada devolveu **no máximo 10 vagas**, mesmo com `limit=50`
  (a API pública foi limitada). O aviso legal diz que os dados têm **atraso de 24 h** e
  recomenda **no máximo 4 chamadas por dia**; excesso é bloqueado.
- **Termos:** link de volta para a URL da Remotive **e** citar a Remotive como fonte; não
  republicar em outros sites/agregadores; não usar para captar cadastros.
- **Implementação:** 4 consultas (`category=software-dev`, `search=react`, `search=angular`,
  `search=frontend`) com intervalo mínimo de 12 h, o que dá no máximo 8 requisições por dia.
  `publication_date` vem sem fuso; tratado como UTC.

### Arbeitnow: API oficial
- **Endpoint:** `GET https://www.arbeitnow.com/api/job-board-api?page=N` (300 vagas/página).
- **Formato:** JSON `{ data: [{ slug, company_name, title, description, remote, url, tags[], job_types[], location, created_at(epoch s) }], links, meta }`.
- **Autenticação:** nenhuma. `robots.txt` libera tudo.
- **Limites:** "free public API, please do not abuse"; atualizada de hora em hora.
- **Termos:** pede link de volta para o site.
- **Implementação:** até 3 páginas por execução e só vagas com `remote: true`. A maioria do
  feed é presencial na Alemanha, fora do perfil remoto; o recorte está documentado em `decisions.md`.

### Jobicy: API oficial
- **Endpoint:** `GET https://jobicy.com/api/v2/remote-jobs?count=&geo=&industry=&tag=` (`count` até 100).
- **Formato:** JSON `{ jobs: [{ id, url, jobTitle, companyName, jobIndustry[], jobType[], jobGeo, jobLevel, jobExcerpt, jobDescription(HTML), pubDate, salaryMin?, salaryMax?, salaryCurrency?, salaryPeriod? }], nextCursor, hasMore }`.
- **Autenticação:** nenhuma.
- **Limites (docs em jobi.cy/apidocs):** polling "algumas vezes ao dia" e **nunca mais de 1 vez por hora**.
- **Termos:** creditar a Jobicy com link direto; botões de candidatura devem ir à URL original.
- **Implementação:** `industry=engineering`, `tag=react` e `tag=angular`, com `count=100`.

### Remote OK: API oficial
- **Endpoint:** `GET https://remoteok.com/api` (o primeiro elemento é o aviso legal).
- **Formato:** JSON array `[ { legal }, { id, slug, epoch, date, company, position, tags[], description, location, salary_min, salary_max, url, apply_url } ]` (~100 vagas).
- **Autenticação:** nenhuma. `robots.txt`: `Crawl-delay: 1`.
- **Termos:** **link de volta (dofollow) para a URL da Remote OK e citar "Remote OK" como fonte**;
  não usar o logo sem permissão. **Cumprido na UI:** o detalhe e a lista mostram "via Remote OK"
  com link para a vaga na Remote OK, e o logo não é usado.
- **Implementação:** 1 requisição; `salary_min/max = 0` significa "não informado" e é gravado como `null`.

### Himalayas: API oficial
- **Endpoints:** `GET https://himalayas.app/jobs/api` (feed completo, 20/página, cursor) e
  `GET https://himalayas.app/jobs/api/search?q=&worldwide=&page=` (busca filtrada).
- **Formato:** JSON `{ jobs: [{ guid, title, excerpt, companyName, companySlug, employmentType, minSalary, maxSalary, currency, salaryPeriod, seniority[], locationRestrictions[], timezoneRestrictions[], categories[], description(HTML), pubDate(epoch s), expiryDate, applicationLink }] }`.
- **Autenticação:** opcional (chave gratuita dá 60 req/min e 10 000/dia). Sem chave há uma
  cota pública compartilhada; excesso devolve 429. Dados atualizados **diariamente**.
- **Termos:** link de volta e citar Himalayas; não reenviar vagas a outros job boards/agregadores
  (este app é pessoal e não republica nada).
- **Implementação:** o feed completo tem ~129 mil vagas, então usamos a **busca**:
  `react`, `angular`, `frontend`, `react native`, `typescript`, `ionic`, 1 página cada,
  intervalo mínimo de 6 h. `applicationLink` traz `utm_source=api`, removido na URL canônica.

### We Work Remotely: feed público (RSS)
- **Endpoints:** `https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss`,
  `…/remote-full-stack-programming-jobs.rss`, `…/remote-back-end-programming-jobs.rss`.
- **Formato:** RSS 2.0 com extensões `<region>`, `<country>`, `<skills>`, `<type>`, `<pubDate>`, `<expires_at>`, `<guid>`, `<link>`.
  O título segue o padrão `Empresa: Cargo`.
- **Autenticação:** nenhuma; `<ttl>60</ttl>`. `robots.txt` só bloqueia áreas de conta.
- **Implementação:** 3 feeds, intervalo mínimo de 1 h (respeita o TTL).

### Hacker News "Who is hiring?": API oficial (Algolia)
- **Endpoints:** `GET https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring` (acha a thread do mês) e
  `GET https://hn.algolia.com/api/v1/search?tags=comment,story_<id>&hitsPerPage=1000`.
- **Formato:** JSON com `hits[{ objectID, comment_text(HTML), author, created_at, parent_id }]`.
- **Autenticação:** nenhuma. Limite documentado do Algolia HN: 10 000 req/h por IP.
- **Implementação:** só comentários de primeiro nível (`parent_id == story`). Parsing
  heurístico da 1ª linha `Empresa | Cargo | Local | REMOTE | …`. `publishedAt` é o `created_at`
  do comentário. Thread mensal, então o intervalo mínimo é de 6 h.

### Hacker News Jobs (vagas de empresas YC): API oficial (Firebase)
- **Endpoints:** `GET https://hacker-news.firebaseio.com/v0/jobstories.json` (até 200 IDs) e `GET …/v0/item/<id>.json`.
- **Formato:** `{ id, by, time(epoch s), title: "Empresa (YC W24) Is Hiring …", url, text? }`.
- **Autenticação:** nenhuma; API oficial sem limite documentado.
- **Implementação:** só os 60 IDs mais recentes (1 + 60 requisições, concorrência 4).
  Cobre parte do ecossistema YC, já que o Work at a Startup não tem feed (veja a Camada D).

## Camada B: ATS por empresa

Lista de empresas em `config/companies.json` (`{ name, ats, slug }`), editável na tela
**Fontes**. Cada slug abaixo foi validado em 2026-10-20 (HTTP 200 com vagas).

### Greenhouse: Job Board API (oficial, pública)
- `GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true`
- Campos: `id, title, absolute_url, location.name, updated_at, first_published, language, content(HTML escapado), metadata[], offices[]`.
- `first_published` é usado como `publishedAt`. Sem autenticação; endpoint público documentado.

### Lever: Postings API (oficial, pública)
- `GET https://api.lever.co/v0/postings/{slug}?mode=json`
- Campos: `id, text, hostedUrl, createdAt(ms), categories{commitment, location, team, allLocations}, country, workplaceType, descriptionPlain, description, lists[], additional, salaryRange?`.
- `createdAt` (criação do posting) é usado como `publishedAt`. Slug inexistente devolve 404 `Document not found`.

### Ashby: Posting API (oficial, pública)
- `GET https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true`
- Campos: `id, title, location, secondaryLocations[], isRemote, workplaceType, employmentType, publishedAt, jobUrl, descriptionHtml, descriptionPlain, compensation{…}`.

### Gupy: removida
- O conector que lia o `__NEXT_DATA__` de `portal.gupy.io` foi removido: dependia da estrutura
  interna da página. Links `*.gupy.io` vindos de outras fontes continuam deduplicados pela chave
  ATS `gupy:<id>`.

### Workday: ATS por empresa (endpoint não documentado): não implementado
- Cada tenant expõe `POST https://{tenant}.wd{N}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs`
  (testado com NVIDIA: HTTP 200). O formato é interno, sem documentação pública. A lista
  traz só `postedOn: "Posted Yesterday"` (data relativa, imprecisa), e a descrição exige
  1 requisição por vaga.
- **Veredito:** baixa prioridade. Não implementado: a data relativa conflita com a regra de
  datas honestas e o endpoint não é estável/documentado.

## Camada C: requer credencial gratuita

### Adzuna
- `GET https://api.adzuna.com/v1/api/jobs/{country}/search/{page}?app_id=&app_key=&what=&results_per_page=50`
  (países incluem `br`, `us`, `gb`…). Sem chave a API devolve uma página de erro.
- **Como obter:** cadastro gratuito em <https://developer.adzuna.com/signup>; copie
  `app_id` e `app_key` para `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` no `.env`.
- **Plano gratuito:** a cota de chamadas aparece no painel do desenvolvedor após o cadastro
  (não foi possível confirmar o número sem uma chave). Usamos no máximo 3 chamadas por execução e intervalo de 6 h.
- Sem chave, a fonte aparece como **"requer credencial"**.

### Jooble
- `POST https://jooble.org/api/{API_KEY}` com JSON `{ keywords, location, page }`.
  Sem chave, o endpoint cai num desafio do Cloudflare ("Just a moment…"), que **não** é contornado.
- **Como obter:** formulário em <https://jooble.org/api/about>; a chave chega por e-mail.
  Coloque em `JOOBLE_API_KEY`.
- **Limites:** definidos por chave, sem número público. Usamos no máximo 3 chamadas por execução e intervalo de 6 h.

## Camada D: apenas link manual

Estas fontes não têm API pública para busca de vagas, ou os termos e o `robots.txt` proíbem
captura automatizada. A tela **Fontes** mostra o motivo e links de busca montados a partir
do perfil (cargo + remoto + Brasil).

| Fonte | Motivo |
|---|---|
| LinkedIn | `robots.txt` com `Disallow: /` para `*`; os termos proíbem scraping; sem API pública de vagas. |
| Glassdoor | API pública de parceiros descontinuada; termos proíbem scraping; páginas exigem login. |
| Indeed | Publisher Jobs API descontinuada para novos parceiros; termos proíbem scraping; anti-bot ativo. |
| Wellfound | Sem API pública; conteúdo atrás de login e proteção anti-bot. |
| Google Jobs | Não existe API pública de busca (Cloud Talent Solution indexa só vagas próprias). |
| YC Work at a Startup | Sem feed oficial; a página devolveu **HTTP 406** ao cliente automatizado. Parte das vagas YC chega via `hn-jobs`. |
