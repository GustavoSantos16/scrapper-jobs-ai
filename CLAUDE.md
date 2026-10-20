# CLAUDE.md

Guia para agentes de código neste repositório. Visão do produto: [README.md](README.md).
Arquitetura: [docs/architecture.md](docs/architecture.md). Fontes: [docs/sources.md](docs/sources.md).
Decisões: [docs/decisions.md](docs/decisions.md). Registre nele, em uma linha, cada nova decisão relevante.

## Comandos

```bash
nvm use                 # Node 24 (.nvmrc); pnpm 10
pnpm install
pnpm dev                # API (tsx watch, :4317) + web (Vite, :5173)
pnpm build && pnpm start  # produção: API serve apps/web/dist em :4317
pnpm test               # Vitest (todos os pacotes, sem rede)
pnpm vitest run packages/job-sources/test/dedup.test.ts   # um arquivo
pnpm typecheck
pnpm lint
pnpm e2e                # Playwright (servidor isolado, banco temporário, fixtures)
pnpm check              # lint + typecheck + test + build — rode antes de cada commit
pnpm capture [fonte...] # captura real pelo terminal (respeita intervalos mínimos)
pnpm reprocess          # re-normaliza vagas guardadas a partir de job_listings.raw, sem rede
pnpm migrate
```

## Estrutura

- `packages/shared`: schemas Zod e tipos compartilhados (API ↔ web).
- `packages/database`: migrações em `migrations/NNNN_nome.sql` (nunca edite uma já aplicada; crie
  outra) e repositórios síncronos (`Q`). Atualize `src/schema.ts` junto com cada migração.
- `packages/job-sources`: `connectors/*` (um arquivo por fonte), `normalize/*`, `scoring.ts`,
  `dedup.ts`, `http/*`. Fixtures em `test/fixtures` (respostas reais reduzidas).
- `apps/api`: `pipeline/` (runner, ingest, reprocess), `routes/`, `scheduler.ts`, `config/`.
- `apps/web`: `pages/`, `components/`, `api/` (hooks TanStack Query), CSS Modules + tokens em `styles/global.css`.

## Convenções

- TypeScript estrito; imports com extensão `.ts`/`.tsx`; `import type` para tipos.
- Pacotes exportam `src/*.ts` diretamente (sem build intermediário); a API é empacotada com esbuild.
  Toda dependência de runtime de um pacote também deve estar em `apps/api/package.json`.
- Datas: ISO-8601 UTC no banco; `parseDate()` para qualquer data de fonte.
- Testes de conector usam `fixtureTransport` + `fixtureContext` (`@ajh/job-sources/testing`); nunca a rede.
- Textos de UI em português; código e comentários em inglês.

## Como adicionar um conector

1. Valide a fonte com uma requisição real e documente em `docs/sources.md` (endpoint, limites, termos, veredito).
2. Grave uma resposta real reduzida em `packages/job-sources/test/fixtures/`.
3. Crie `connectors/<id>.ts`: valide o payload com Zod, use `buildJob()`, defina `allowedHosts`,
   um `rateLimit` conservador e a `attribution` exigida pela fonte.
4. Registre em `connectors/index.ts` e escreva o teste com fixture.

## Regras inegociáveis

1. **Nada de dados falsos.** Vagas fictícias só em testes/fixtures; o banco de uso só tem dados capturados.
2. **Nada de automação de candidatura.** Sem SMTP, OAuth, preenchimento de formulário ou mensagens.
3. **Sem contornar bloqueios.** Nada de burlar CAPTCHA, login, paywall, rate limit ou termos; respeite
   `robots.txt` e os limites documentados. Uma fonte bloqueada vira "link manual"/"indisponível".
4. **Status honesto.** "Funcionando" só quando a última execução capturou vagas de verdade.
5. **Datas honestas.** `publishedAt` desconhecido é `null`; a data de captura nunca é usada como publicação.
6. **Sem IA paga.** Nenhuma API de LLM é necessária.
7. Decisões técnicas relevantes vão para `docs/decisions.md`.
