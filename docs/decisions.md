# Decisões técnicas

Cada linha: decisão — justificativa.

## Fundação
- **Node 24 LTS (Krypton), fixado em `.nvmrc`** — Node 20 instalado no Mac já saiu de suporte; 24 é o LTS ativo.
- **TypeScript 6.0 (não 7)** — `typescript-eslint` 8.x ainda exige `typescript <6.1`; TS 7 quebraria o lint.
- **Kysely (não Drizzle)** — query builder tipado que não impõe um DSL de schema; casa com migrações em SQL puro.
- **Migrações em `.sql` numeradas + runner próprio (~40 linhas)** — FTS5 e triggers são mais claros em SQL; cada migração roda numa transação e é registrada em `schema_migrations`.
- **CSS Modules (não Tailwind)** — zero dependências extras e estilos co-localizados com componentes.
- **Pacotes de workspace exportam `src/*.ts` direto** — sem etapa de build intermediária; Vite/Vitest/tsx consomem TS e o esbuild empacota a API para produção.
- **Bundle da API com esbuild, deps de terceiros externas** — `better-sqlite3` é nativo e não pode ser empacotado; por isso as deps de runtime dos pacotes também ficam listadas em `apps/api/package.json` (o pnpm é estrito).
- **API só em `127.0.0.1:4317`** — app pessoal; não deve ficar exposto na rede local.
- **`.env` carregado via `--env-file-if-exists` do Node** — dispensa a dependência `dotenv`.
- **Um único `vitest.config.ts` na raiz** — um comando roda todas as suítes de todos os pacotes.
