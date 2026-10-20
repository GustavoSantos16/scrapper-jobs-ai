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

## Pipeline e persistência
- **Queries tipadas com Kysely, executadas de forma síncrona no better-sqlite3 (`Q.all/get/run/tx`)** — cada vaga é gravada numa transação síncrona e atômica, sem interleaving entre fontes concorrentes.
- **Retry no nível da requisição HTTP (máx. 3 tentativas; backoff 1 s → 2 s, respeita `Retry-After` até 60 s)** — reexecutar a fonte inteira gastaria a cota de requisições à toa.
- **O intervalo mínimo da fonte vale também para captura manual** — os limites são da fonte, não do gatilho; a UI mostra quando a próxima captura será permitida.
- **Payload bruto guardado em `job_listings.raw` + `pnpm reprocess`** — correções de normalização são reaplicadas offline, sem gastar requisições nas fontes; reprocessar não conta como "vaga vista".
- **Execução sem vagas nunca envelhece listings** — zero resultados indica falha de formato ou fora do ar, não "todas as vagas encerraram".
- **Local estruturado com restrição prevalece sobre texto regional genérico** — vagas por país (ex.: "Truelogic | Mexico") trazem boilerplate "remote from Latin America"; só uma menção explícita ao Brasil amplia a elegibilidade.
- **robots.txt checado em runtime só para feeds e páginas públicas** — APIs oficiais são oferecidas para uso programático; o robots.txt rege crawlers de páginas.

## Conectores (fase 6)
- **ATS por empresa: um board quebrado gera aviso; a fonte só falha se todos falharem** — um slug errado em `companies.json` não deve derrubar as demais empresas.
- **O orçamento de requisições conta requisições lógicas; retries não contam** — os retries já são limitados a 3; senão uma fonte com orçamento 1 (Remote OK) nunca teria retry.
- **Gupy recebe a tag `brazil` e `country = BR`** — o portal só lista vagas de empresas brasileiras; com o filtro remoto, a vaga é para quem está no Brasil.
- **Jooble: `publishedAt = null`** — a API só expõe `updated` (última alteração), que não é a data de publicação.
- **Adzuna: salários com `salary_is_predicted = 1` são ignorados** — são estimativas da Adzuna, não salários publicados.
- **Fixtures de Adzuna e Jooble montadas a partir da documentação** — sem chave não há como gravar uma resposta real; o campo `__note` de cada arquivo diz isso.
- **A fila de revisão exige similaridade de título ≥ 0,5** — na primeira captura real, cargos diferentes da mesma empresa (boilerplate institucional idêntico) poluíam a fila.
- **`pnpm reprocess` reconstrói a fila de revisão pendente** — a manutenção nunca faz merge automático; revisões já resolvidas são preservadas.

## Interface (fase 7)
- **Filtros, ordenação e página vivem na URL** — buscas são compartilháveis, sobrevivem a reload e viram "filtros salvos" sem estado extra.
- **"Hoje" é calculado no fuso de exibição e convertido para UTC** — o banco guarda só UTC; a fronteira do dia depende do fuso configurado.
- **Vagas de Hoje usam `publishedAt`; vagas sem data aparecem numa seção separada** — a data de captura nunca substitui a publicação.
- **Links de atribuição sem `nofollow`/`noreferrer`** — Remote OK (e outras) exigem link de volta "dofollow" que gere tráfego; links dentro da descrição continuam com `nofollow`.
- **Cores dos gráficos lidas dos tokens CSS em runtime** — Recharts precisa de cores concretas; assim o tema escuro funciona.
- **Merge manual preserva o registro da decisão (migração 0003)** — a revisão guarda um snapshot do título/empresa absorvidos, já que a vaga absorvida é removida.

## Acompanhamento pessoal (fase 8)
- **Histórico registra uma linha por campo que realmente mudou** — operações sem efeito não poluem o histórico; o texto das notas não é copiado para o histórico (só o fato de ter sido editado).
- **Marcar "Candidatura enviada" preenche a data da candidatura uma vez** — só se você não informou outra.
- **Ignoradas ficam ocultas por padrão, nunca apagadas** — o filtro "Ignoradas" permite vê-las.
- **Exportação usa os mesmos filtros da busca, até 10.000 vagas; CSV com BOM (Excel) e células iniciadas por `= + - @` prefixadas com `'`** — evita injeção de fórmulas em planilhas.
- **Filtros salvos guardam os parâmetros da URL** — a mesma representação da busca, sem formato paralelo.
