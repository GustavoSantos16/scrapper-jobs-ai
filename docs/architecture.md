# Arquitetura

## Visão geral

```
            navegador (127.0.0.1)
                    │  só fala com a API local
                    ▼
┌──────────────────────────── apps/api (Fastify) ─────────────────────────────┐
│ rotas /api/*  ·  Scheduler  ·  CaptureRunner (pipeline)  ·  serve apps/web  │
└───────┬───────────────────────────┬──────────────────────────────┬─────────┘
        │                           │                              │
 packages/database          packages/job-sources             packages/shared
 SQLite (WAL, FTS5)         conectores, HttpClient seguro,   schemas Zod, tipos,
 migrações SQL, repos       normalização, score, dedup       perfil padrão
```

| Pacote | Responsabilidade |
|---|---|
| `packages/shared` | Schemas Zod (`NormalizedJob`, `Profile`, `JobsQuery`), enums e tipos de resposta da API. |
| `packages/database` | Conexão better-sqlite3 (WAL, FKs), migrações versionadas (`migrations/*.sql`), repositórios. Queries montadas com Kysely e executadas de forma **síncrona** (`Q.all/get/run/tx`). |
| `packages/job-sources` | Contrato `Connector`, os conectores, `HttpClient` (SSRF, cache, retry, robots), normalizadores, score e dedup. Tudo puro e testável com fixtures. |
| `apps/api` | Fastify + `fastify-type-provider-zod`; runner da captura, agendador, rotas, CLI (`capture`, `reprocess`); em produção serve o build do web com CSP. |
| `apps/web` | React 19 + Vite + React Router + TanStack Query + Recharts, CSS Modules. |

## Contrato do conector

```ts
interface Connector<Raw> {
  id; name; kind; homepageUrl; docsUrl; attribution; description;
  rateLimit: { minIntervalMinutes; maxRequestsPerRun; minDelayMs };
  allowedHosts;        // o HttpClient só fala com estes hosts
  requiredEnv?;        // Camada C: sem as chaves a fonte é pulada
  respectRobots?;      // feeds e páginas públicas
  usesCompanies?;      // Greenhouse/Lever/Ashby leem config/companies.json
  fetchJobs(ctx): AsyncIterable<Raw>;
  normalize(raw, { now }): NormalizedJob | null;
}
```

`normalize` delega para `buildJob()`: o conector passa o que a fonte informa explicitamente, e o
resto (modalidade, elegibilidade, senioridade, contrato, tecnologias, idioma, URL canônica, ID
do ATS) é inferido por regras testadas. Datas desconhecidas ficam `null`.

## Pipeline de captura (`apps/api/src/pipeline/runner.ts`)

1. Adquire o **lock persistente** `locks.capture` (TTL de 2 min, renovado a cada 30 s). Outra
   execução, no mesmo processo ou em outro, recebe 409. Um lock expirado (processo que caiu) é
   assumido; na inicialização, runs órfãos são marcados como falhos.
2. Planeja as fontes, registrando em `run_sources` o motivo de cada fonte pulada: desativada,
   sem credencial, sem empresas ou dentro do intervalo mínimo.
3. Executa as fontes com **concorrência limitada** (padrão 3), cada uma com timeout próprio e
   cancelável. Por fonte, cria um `HttpClient` com:
   - https apenas; host na allowlist; DNS validado **na conexão** (bloqueia IPs privados, de
     loopback e link-local, protegendo contra DNS rebinding); redirects revalidados a cada salto;
   - limite de tamanho da resposta, timeout, espaçamento entre requisições e orçamento de requisições por execução;
   - retry com backoff (máx. 3 tentativas; respeita `Retry-After`);
   - cache condicional (`ETag`/`If-Modified-Since`) em `http_cache`;
   - `robots.txt` para feeds e páginas públicas; segredos redigidos de erros e logs.
4. Para cada registro: `normalize`, validação Zod, depois `ingestJob` numa transação: dedup,
   upsert e score. Resultados parciais ficam gravados mesmo se a fonte falhar depois.
5. Após o sucesso de uma fonte que trouxe vagas: `markUnseen` (listings não vistas ganham
   `missed_runs + 1`; com N execuções viram `possibly_closed`).
6. Ao final: rescore de todo o acervo (a recência muda com o tempo), retenção opcional e
   gravação de `runs`.

Uma fonte que falha nunca interrompe as outras: cada uma roda no seu próprio try/catch.

## Modelo de dados (resumo)

| Tabela | Conteúdo |
|---|---|
| `jobs` | Vaga consolidada: campos descritivos da listing principal, `published_at` (nullable), `first_seen_at`, `last_seen_at`, `updated_at`, `status`, `score`, `score_breakdown`. |
| `job_listings` | Uma ocorrência por fonte: `source` + `source_job_id` (único), URLs, `ats_key`, `match_method`, `match_confidence`, `missed_runs`, `raw` (payload original para reprocessar). |
| `jobs_fts` | FTS5 (título, empresa, descrição, tecnologias, local), sincronizado por triggers, sem acentos. |
| `job_tracking`, `job_state_history` | Dados pessoais, separados do que é capturado, com histórico de cada mudança. |
| `dedup_reviews` | Pares duvidosos para revisão manual; guarda o registro da decisão. |
| `runs`, `run_sources` | Histórico de execuções por fonte. |
| `source_state` | Estado operacional e limites configurados por fonte. |
| `settings`, `saved_filters`, `http_cache`, `locks` | Configuração, filtros salvos, cache HTTP e lock. |

Todas as datas são strings ISO-8601 em UTC. O fuso só afeta a exibição e o que conta como "hoje".

## Deduplicação (`packages/job-sources/src/dedup.ts`)

Em camadas, parando na primeira com certeza:

1. **fonte + ID original**: atualiza a listing existente;
2. **URL canônica** igual (sem UTMs, fragmento, `www` e barra final): merge, confiança 1,0;
3. **mesmo ID de ATS** na URL ou num link da descrição (`greenhouse:123`, `lever:<uuid>`…): merge, 0,99;
4. **hash de empresa + título + local normalizados**, só entre fontes diferentes: merge, 0,95;
5. **similaridade** (0,4 × Jaccard de trigramas do título + 0,6 × Jaccard de shingles da
   descrição), só na mesma empresa e entre fontes diferentes:
   - ≥ 0,88, com descrição nos dois lados: merge;
   - ≥ 0,65 e título ≥ 0,5: vai para a **fila de revisão**.

Títulos parecidos sozinhos nunca unem vagas. A vaga principal mantém a listing original como
`primary`; as demais aparecem como fontes alternativas, com método e confiança.

## Pontuação (`packages/job-sources/src/scoring.ts`)

São nove componentes com pesos editáveis, normalizados para 100: cargo, tecnologias
prioritárias, tecnologias complementares, modalidade, elegibilidade geográfica, contrato,
senioridade, recência e salário. Cada um vale `peso × f`:

- `f = 1`: compatível;
- `f = 0,5`: informação ausente (neutro);
- `f < 0`: incompatibilidade explícita (ex.: "US only", presencial, estágio).

O `scoreBreakdown` guarda o motivo e os pontos de cada componente e aparece no detalhe da vaga.
A pontuação ordena e explica, mas **nunca esconde nem apaga** vagas.

## Agendador (`apps/api/src/scheduler.ts`)

Funciona dentro do processo da API, com o próximo disparo calculado a partir de uma âncora
persistida. Execuções não se sobrepõem (o slot é pulado e registrado). Após uma parada, roda
uma única execução de recuperação. O intervalo mínimo de cada fonte continua valendo dentro do runner.

## Segurança

- A API escuta só em `127.0.0.1`; toda chamada de rede acontece no backend.
- Proteção contra SSRF, limite de tamanho e allowlist de hosts por fonte, conforme descrito acima.
- HTML de descrição sanitizado no backend (`sanitize-html`, allowlist; links com
  `rel="noopener noreferrer nofollow"`).
- CSP restritiva e headers de segurança no build de produção.
- CSV exportado com proteção contra injeção de fórmulas.
- Nenhum código de candidatura automática: não existe SMTP, OAuth, envio de formulário ou mensagem.
