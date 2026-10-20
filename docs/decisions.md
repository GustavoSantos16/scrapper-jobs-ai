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

## Fontes
- **Conectores consultam por termos do perfil, não o feed inteiro** (Himalayas, Remotive, Jobicy, Gupy) — os feeds completos têm dezenas de milhares de vagas fora do perfil; buscar por termo respeita os limites e mantém o acervo útil.
- **Arbeitnow: só `remote: true`** — ~92% do feed é presencial na Alemanha; o perfil exige remoto. É um recorte de escopo da captura, não um descarte por pontuação.
- **Remotive com intervalo mínimo de 12 h** — o aviso legal pede no máximo 4 chamadas/dia; 4 consultas a cada 12 h ficam em 8 requisições/dia, porque cada chamada devolve no máximo 10 vagas.
- **HN Jobs (Firebase) adicionado como fonte** — API oficial que cobre vagas de empresas YC, já que o Work at a Startup não tem feed.
- **Workday não implementado** — endpoint interno não documentado e datas apenas relativas ("Posted Yesterday"), o que conflita com a regra de datas honestas.
- **Gupy via `__NEXT_DATA__` da página de busca** — não há API pública; `robots.txt` permite; validação Zod falha alto se a estrutura mudar.
- **Fixtures são respostas reais reduzidas** — gravadas em 2026-10-20 a partir das chamadas de validação; testes de conectores rodam sem rede.

## Modelo, normalização e dedup
- **Vaga consolidada (`jobs`) + ocorrências por fonte (`job_listings`)** — `alternateSources[]` vem das listings; o status "possivelmente encerrada" é por listing e a vaga só fica encerrada quando todas ficam.
- **Dados pessoais em `job_tracking` + `job_state_history`** — separados do que é capturado; reprocessar vagas nunca toca em notas/estados.
- **Lógica de normalização, score e dedup como funções puras em `@ajh/job-sources`** — testável sem banco; o pipeline só orquestra.
- **Score: cada componente vale peso × f, com f ∈ [-1, 1]; ausência = 0,5 (neutro)** — atende "ausência não penaliza, incompatibilidade explícita penaliza"; pesos são normalizados para 100.
- **Elegibilidade geográfica: campos estruturados vs. texto livre** — um campo de local "USA" é restrição; no texto livre só frases explícitas ("US only", "must be located in…") contam, para não confundir menção de cidade com restrição.
- **Vaga remota em português recebe a tag `brazil`** — o idioma é um sinal forte de público brasileiro; a regra fica isolada e testada.
- **Dedup: camadas fuzzy (hash de identidade e similaridade) nunca unem duas listings da mesma fonte** — IDs distintos numa mesma fonte são vagas distintas (ex.: mesma vaga para vários times).
- **Similaridade = 0,4 × Jaccard de trigramas do título + 0,6 × Jaccard de shingles (3 palavras) da descrição; auto-merge ≥ 0,88, revisão manual ≥ 0,65; sem descrição nunca há auto-merge** — títulos parecidos sozinhos nunca unem vagas.
- **Datas sem fuso são lidas como UTC; datas antes de 2000 ou mais de 2 dias no futuro viram `null`** — evita datas inventadas; nunca usamos a data de captura como publicação.
