# Darwin API — Projeto de Integração Nuvemshop

## Objetivo

Capturar, armazenar e consultar **todas as interações da Nuvemshop** que passam pela plataforma Darwin AI, usando webhooks em tempo real + banco de dados local.

---

## Credenciais e IDs já conhecidos

```
API_KEY=darwin_b2de65c0d53c4f3ee4ac654d63d47f3d8e8bb6b7919a24ec0b91c80ce93631fa
BASE_URL=https://api.getdarwin.ai
CHANNEL_ID=13386          # Canal Nuvemshop
PIPELINE_OUTBOUND=7494    # Pipeline Outbound
PIPELINE_LEADS=6804       # Pipeline Qualificação de Leads Nuvemshop
PORT=3000
```

Coloque tudo em um arquivo `.env` na raiz do projeto. Nunca commite o `.env`.

---

## Estrutura de pastas

```
darwin-nuvemshop/
├── .env                    # variáveis de ambiente (não commitar)
├── CLAUDE.md               # este arquivo
├── package.json
├── src/
│   ├── server.js           # servidor Express principal
│   ├── db.js               # conexão e criação do banco SQLite
│   ├── routes/
│   │   ├── webhook.js      # recebe eventos da Darwin
│   │   └── query.js        # endpoints para consultar os dados
│   └── services/
│       └── darwin.js       # funções para chamar a Darwin API
├── db/
│   └── darwin.sqlite       # banco de dados (criado automaticamente)
└── scripts/
    ├── setup-webhook.js    # registra o webhook na Darwin (rodar 1x)
    ├── inspect.js          # consulta canais, pipelines, smart fields
    └── query-sessions.js   # consulta sessões salvas no banco
```

---

## Banco de dados (SQLite)

Três tabelas criadas automaticamente em `src/db.js`:

- **sessions** — uma linha por conversa (upsert por `conversation_id`)
- **smart_fields** — campos extraídos pela IA (vinculados por `conversation_id`)
- **events** — log bruto de todos os eventos recebidos

---

## Endpoints

### Webhook
- `POST /webhook` — recebe eventos da Darwin, salva em events e faz upsert em sessions

### Consulta
- `GET /sessions` — lista paginada (?page=1&limit=20)
- `GET /sessions/stats` — totais por status, forwards, média por dia
- `GET /sessions/:conversationId` — detalhe + smart fields + events
- `GET /events` — log de eventos (?type=session.analyzed)
- `GET /smart-fields` — smart fields (?field=nome)
- `GET /health` — health check

---

## Scripts

```bash
npm run inspect          # consultar canais, templates, smart fields
npm run setup-webhook    # registrar webhook (precisa de URL pública)
npm run dev              # subir servidor com nodemon
npm run start            # subir servidor em produção
npm run query            # consultar sessões no banco local
```

---

## Ordem de execução

```
1. npm install
2. Criar o .env com as variáveis acima
3. npm run inspect          → ver smart fields e templates reais
4. npx ngrok http 3000      → obter URL pública
5. npm run setup-webhook <URL_NGROK>/webhook
6. npm run dev              → subir o servidor
7. npm run query            → consultar sessões salvas
```

---

## Observação importante sobre dados históricos

A Darwin API **não possui endpoint de histórico**. Apenas eventos a partir do momento em que o webhook for registrado serão capturados. Para obter dados anteriores, entrar em contato com `it@getdarwin.ai`.
