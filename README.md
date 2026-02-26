# Job AI Automation

Aplicativo web local em Node.js + Express para automação assistida de análise de vagas do LinkedIn e envio de propostas personalizadas. Usa IA local (Ollama + Mistral 7B), sem APIs pagas.

## Requisitos

- Node.js 18+ (recomendado)
- [Ollama](https://ollama.ai) instalado e rodando em `http://localhost:11434`
- Modelo Mistral: `ollama pull mistral:7b-instruct-q4_0`
- Para envio de e-mail: SMTP (ex.: Gmail com senha de app)

## Instalação

```bash
npm install
```

## Uso

1. Inicie o Ollama e o modelo:
   ```bash
   ollama serve
   ollama run mistral:7b-instruct-q4_0
   ```

2. Inicie o servidor:
   ```bash
   npm start
   ```

3. Acesse no navegador: `http://localhost:3000`

4. **Fluxo:**
   - **Início:** envie seu currículo (PDF ou DOCX) e clique em "Iniciar busca de vagas". O navegador abrirá visível; faça login no LinkedIn e deixe na página de vagas. O sistema coleta até 20 vagas.
   - **Dashboard:** analise vagas (match com currículo via IA), gere propostas e enfileire envios de e-mail.

## Variáveis de ambiente (opcional)

- `PORT` – porta do servidor (padrão 3000)
- `OLLAMA_URL` – URL do Ollama (padrão `http://localhost:11434`)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` – envio de e-mail
- `EMAIL_FROM` – endereço remetente (padrão: SMTP_USER)

## Estrutura

- `server/` – backend (Express, rotas, serviços)
- `server/storage/database.json` – persistência local (vagas, currículo, histórico)
- `client/` – frontend (HTML, CSS, JS)

## Limitações

- Não é SaaS; sem autenticação de usuário.
- Scraper depende do layout do LinkedIn; seletores podem precisar de ajuste.
- Limite de 15 e-mails por dia; fila com delay de 3–5 min entre envios.
