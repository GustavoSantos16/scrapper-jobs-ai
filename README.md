# AI Job Hunter

Agregador **pessoal e local** de vagas de tecnologia. Captura vagas reais de fontes gratuitas
(APIs públicas, feeds e ATS de empresas), consolida tudo num SQLite com busca, pontuação de
aderência ao seu perfil e deduplicação entre fontes. Você acompanha favoritos, notas e
candidaturas, mas **se candidata sempre manualmente** pelo link original.

- Roda só no seu Mac (`127.0.0.1`). Não há login, SMTP, OAuth nem envio automático de nada.
- Não precisa de nenhuma API de IA paga.
- Nada de dados fictícios: o acervo só contém o que foi capturado de verdade.

## Pré-requisitos (macOS)

1. **Xcode Command Line Tools** (compila o `better-sqlite3`):
   ```bash
   xcode-select --install   # se ainda não tiver
   ```
2. **Node.js 24 LTS** (versão fixada em `.nvmrc`). Com [nvm](https://github.com/nvm-sh/nvm):
   ```bash
   nvm install    # lê .nvmrc (24.22.0)
   nvm use
   ```
3. **pnpm 10**:
   ```bash
   npm install -g pnpm@10   # ou: corepack enable
   ```

## Instalação

```bash
git clone <este repositório> ai-job-hunter && cd ai-job-hunter
nvm use
pnpm install
cp .env.example .env          # opcional: só é necessário para chaves da Camada C
pnpm migrate                  # cria data/jobhunter.db (a API também migra ao iniciar)
```

### `.env`

| Variável | Padrão | Para quê |
|---|---|---|
| `API_PORT` | `4317` | Porta da API local |
| `LOG_LEVEL` | `info` | `debug` mostra cada requisição às fontes |
| `DATABASE_PATH` | `data/jobhunter.db` | Caminho do SQLite |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | vazio | Ativa a fonte Adzuna ([cadastro gratuito](https://developer.adzuna.com/signup)) |
| `JOOBLE_API_KEY` | vazio | Ativa a fonte Jooble ([pedir chave](https://jooble.org/api/about)) |

Sem as chaves, Adzuna e Jooble aparecem como **"requer credencial"**. Segredos ficam só no `.env`
(fora do git) e nunca aparecem nos logs.

## Rodar

**Desenvolvimento** (API com reload + Vite):
```bash
pnpm dev
```
Abra <http://127.0.0.1:5173>.

**Produção** (build otimizado, a API serve a UI):
```bash
pnpm build
pnpm start
```
Abra <http://127.0.0.1:4317>.

### Primeiro uso

1. Clique em **Capturar agora** (canto superior direito) e acompanhe o progresso por fonte.
2. Veja o **Dashboard**, **Vagas de hoje** e **Todas as vagas** (busca, filtros e buscas rápidas).
3. Ajuste cargos, tecnologias, preferências e pesos em **Perfil e preferências**: a pontuação de
   todas as vagas é recalculada.
4. Em **Configurações**, ligue o agendador (30 min, 1 h, 3 h, 6 h ou diário).

Também dá para capturar pelo terminal: `pnpm capture` (todas as fontes) ou
`pnpm capture remoteok jobicy` (fontes específicas).

> ⚠️ **O agendador só funciona enquanto a API estiver rodando.** Com o Mac desligado, dormindo
> ou a API parada, nada é capturado. Se uma execução venceu enquanto a API estava parada, ela
> roda **uma vez**, cerca de 1 minuto depois de a API subir de novo.

Cada fonte também respeita o próprio **intervalo mínimo** (ex.: Remotive 12 h, Himalayas 6 h),
mesmo em capturas manuais. Na tela **Fontes** você vê quando a próxima captura de cada uma será
permitida. Detalhes em [`docs/sources.md`](docs/sources.md).

## Fontes

- **Funcionam automaticamente:** Remotive, Arbeitnow, Jobicy, Remote OK, Himalayas, We Work
  Remotely (RSS), Hacker News "Who is hiring?", Hacker News Jobs (YC), Greenhouse, Lever e Ashby
  (por empresa).
- **Com chave gratuita:** Adzuna e Jooble.
- **Link manual:** LinkedIn, Glassdoor, Indeed, Wellfound, Google Jobs, YC Work at a Startup e
  Workday. Aparecem em **Fontes** com o motivo e links de busca prontos para o seu perfil.

### Adicionar empresas (Greenhouse, Lever, Ashby)

Pela tela **Fontes → Empresas monitoradas**: informe nome, ATS e slug. O board é validado com
uma requisição real antes de ser salvo. O slug é o trecho da URL pública do board:

| ATS | URL pública | Slug |
|---|---|---|
| Greenhouse | `https://boards.greenhouse.io/vtex` ou `job-boards.greenhouse.io/vtex` | `vtex` |
| Lever | `https://jobs.lever.co/ciandt` | `ciandt` |
| Ashby | `https://jobs.ashbyhq.com/supabase` | `supabase` |

Você também pode editar `config/companies.json` diretamente (com a API parada ou recarregando a página depois).

## Testes e qualidade

```bash
pnpm test        # Vitest: unitários e integração (sem rede, usam fixtures gravadas)
pnpm typecheck
pnpm lint
pnpm e2e         # Playwright (na 1ª vez: pnpm --filter @ajh/web exec playwright install chromium)
pnpm check       # lint + typecheck + testes + build
```

## Manutenção

| Comando | O que faz |
|---|---|
| `pnpm migrate` | Aplica migrações pendentes (também é automático ao iniciar a API) |
| `pnpm reprocess` | Re-normaliza as vagas guardadas com as regras atuais, **sem acessar as fontes** (também em Configurações → Manutenção) |
| `pnpm capture [fonte...]` | Captura pelo terminal |

**Backup:** copie `data/jobhunter.db` com a API parada (ou use `sqlite3 data/jobhunter.db ".backup backup.db"`).
**Recomeçar do zero:** pare a API e apague `data/jobhunter.db*`. Isso apaga também favoritos e notas.

## Solução de problemas

| Sintoma | Causa provável / solução |
|---|---|
| `pnpm install` falha compilando `better-sqlite3` | Instale o Xcode CLT (`xcode-select --install`) e confirme o Node 24 (`node -v`). |
| `ERR_PNPM_... engine` ou erros estranhos de sintaxe | Versão errada do Node: rode `nvm use`. |
| A UI mostra "A API local não está respondendo" | A API não está rodando. Use `pnpm dev` ou `pnpm start`. |
| `EADDRINUSE: 4317` | Outra instância já está rodando: `lsof -i :4317` e encerre-a, ou mude `API_PORT`. |
| Captura "Nada a executar" | Todas as fontes estão dentro do intervalo mínimo; veja a coluna de motivo em **Histórico de capturas**. |
| Uma fonte aparece "Com falha" | A mensagem do erro está em **Fontes**. Fontes de terceiros mudam: veja `docs/sources.md`. |
| "Já existe uma captura em andamento" depois de um crash | O lock expira sozinho em até 2 minutos; ao reiniciar, a API marca execuções interrompidas como falhas. |
| Datas parecem deslocadas | Ajuste o fuso em **Configurações → Exibição** (padrão `America/Sao_Paulo`). |

## Documentação

- [`docs/sources.md`](docs/sources.md): validação de cada fonte (endpoint, limites, termos, veredito).
- [`docs/architecture.md`](docs/architecture.md): arquitetura, modelo de dados, pipeline e dedup.
- [`docs/decisions.md`](docs/decisions.md): decisões técnicas e justificativas.
- [`CLAUDE.md`](CLAUDE.md): guia para agentes de código.
