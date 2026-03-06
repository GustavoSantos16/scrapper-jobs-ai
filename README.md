# Job AI Automation

Aplicativo web local em Node.js + Express para automação assistida de análise de compatibilidade entre currículo e vagas do LinkedIn com score local por palavras-chave.

## Requisitos

- Node.js 18+ (recomendado)
## Instalação

```bash
npm install
```

## Uso

1. Inicie o servidor:
   ```bash
   npm start
   ```

2. Acesse no navegador: `http://localhost:3000`

3. **Fluxo:**
   - **Início:** envie seu currículo (PDF ou DOCX), informe a URL de busca do LinkedIn e clique em "Iniciar busca de vagas".
   - O scraper usa sessão persistente (cache/cookies). Se já estiver logado no LinkedIn, reaproveita login; se não estiver, aguarda login manual.
   - A coleta tenta extrair o máximo de vagas visíveis possível da busca (não limitada a 20).
   - **Dashboard:** execute a análise de compatibilidade (score local em JS), marque quais vagas você já se candidatou e acompanhe em lista separada.

## Variáveis de ambiente (opcional)

- `PORT` – porta do servidor (padrão 3000)

## Estrutura

- `server/` – backend (Express, rotas, serviços)
- `server/storage/database.json` – persistência local (vagas, currículo, histórico)
- `client/` – frontend (HTML, CSS, JS)

## Limitações

- Não é SaaS; sem autenticação de usuário.
- Scraper depende do layout do LinkedIn; seletores podem precisar de ajuste.
