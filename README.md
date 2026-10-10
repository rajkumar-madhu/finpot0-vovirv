# LinkedEye Voice Agent SaaS

[![CI](https://github.com/rajkumar-madhu/finpot0-vovirv/actions/workflows/ci.yml/badge.svg)](https://github.com/rajkumar-madhu/finpot0-vovirv/actions/workflows/ci.yml)

A multi-tenant AI Voice Agent platform. The voice pipeline is:

```
Audio In ─▶ STT (Whisper GPU) ─▶ RAG (pgvector) + Memory (Redis) ─▶ LLM (Claude via Flowise) ─▶ TTS (IndicF5 GPU / Piper) ─▶ Audio Out
```

## Services

| Service | Port | Status | Language | Location |
|---------|------|--------|----------|----------|
| API Gateway (routing, proxy, Twilio) | 4000 | Implemented | Node.js/TS | `services/api-gateway/` |
| Auth (JWT, API keys, tenants, webhooks) | 4001 | Implemented | Node.js/TS | `services/auth/` |
| Orchestrator (voice pipeline, chat, ingestion) | 4002 | Implemented | Node.js/TS | `services/orchestrator/` |
| Email (IMAP/SMTP) | 4003 | Partial | — | `services/email/` |
| Webvoice (browser WebSocket UI) | 4004 | Implemented | Python/FastAPI | `services/webvoice/` |
| STT (Faster Whisper transcription) | 8001 | Implemented | Python/FastAPI | `services/stt/` |
| TTS (IndicF5 + Piper fallback) | 8002 | Implemented | Python/FastAPI | `services/tts/` |
| RAG (pgvector search + indexing) | 8003 | Implemented | Python/FastAPI | `services/rag/` |
| Ingestion Worker (BullMQ jobs) | — | Implemented | Node.js/TS | `services/ingestion-worker/` |
| Flowise (LLM orchestration) | 3000 | External | — | — |
| PostgreSQL + pgvector | 5432 | — | — | — |
| Redis | 6379 | — | — | — |
| Prometheus / Grafana | 9090 / 3001 | — | — | `monitoring/` |

## Tech Stack

- **Node.js services**: Node 20 LTS, TypeScript (ES2022/NodeNext), Express, Zod, pino, prom-client
- **Python ML services**: Python 3.10+, FastAPI, Pydantic v2 + pydantic-settings, structlog, prometheus_client
- **Data**: PostgreSQL 16 + pgvector, Redis 7
- **Voice**: Faster Whisper Large v3 (STT), IndicF5 + Piper fallback (TTS), Claude via Flowise (LLM)
- **Async jobs**: BullMQ + ioredis (ingestion-worker)
- **Infra**: Kubernetes (prod) / Docker Compose (dev), Prometheus + Grafana, Kustomize overlays

## Quick Start

```bash
# Copy environment templates and fill in values
cp services/auth/.env.example services/auth/.env
cp services/orchestrator/.env.example services/orchestrator/.env
# ...repeat for each service you run

# Start the whole stack
docker compose up -d

# Or start just the data layer
docker compose up -d postgres redis

# Follow logs
docker compose logs -f auth
```

## Development

### Node.js services

Run from `services/auth/`, `services/api-gateway/`, `services/orchestrator/`, or `services/ingestion-worker/`:

```bash
npm install           # Install dependencies
npm run dev           # Dev with hot reload (tsx watch)
npm run build         # TypeScript compile (tsc -> dist/)
npm run start         # Run compiled output
npm test              # Vitest
npm run test:coverage # Coverage report (v8)
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
```

### Python ML services

Run from `services/stt/`, `services/tts/`, `services/rag/`, or `services/webvoice/`:

```bash
pip install -r requirements.txt

uvicorn main:app --reload --host 0.0.0.0 --port 8001   # STT
uvicorn main:app --reload --host 0.0.0.0 --port 8002   # TTS
uvicorn main:app --reload --host 0.0.0.0 --port 8003   # RAG
uvicorn main:app --reload --host 0.0.0.0 --port 4004   # Webvoice
```

### Kubernetes (Kustomize)

```bash
kubectl apply -k k8s/base       # Base manifests
kubectl apply -k k8s/staging    # Staging overlay
kubectl apply -k k8s/prod       # Prod overlay
kubectl get pods -n voice-saas
```

## Architecture Notes

- **Multi-tenancy is mandatory**: every DB table has `tenant_id` (indexed), every query filters by `tenant_id`, and upstream calls include an `X-Tenant-ID` header.
- **Every service exposes** `GET /health` (liveness/readiness) and `GET /metrics` (Prometheus scrape).
- **Structured JSON logging only** — pino (Node) or structlog (Python).
- **Auth** supports outgoing webhooks with HMAC-SHA256 signing (`whsec_` secrets). JWT logout uses a Redis blacklist checked on every request.
- **API Gateway** has a circuit breaker in `proxyService.ts` (5 failures → OPEN, 30s recovery, 3 successes → close) and Twilio webhook auth.
- **Orchestrator** fans out to STT/RAG/LLM/TTS. It calls Flowise at `POST {FLOWISE_URL}/api/v1/prediction/{FLOWISE_API_KEY}` where `FLOWISE_API_KEY` is the chatflow ID.
- **Ingestion Worker** is a BullMQ worker (uses `ioredis`) with no HTTP server.

### Repository Layout

```
.
├── services/            # Microservices (Node.js + Python)
├── k8s/                 # Kustomize base + staging/prod overlays
├── monitoring/          # Prometheus config + Grafana dashboards
├── Documents/           # Architecture, product vision, blueprints
├── scripts/             # Helper scripts
├── docker-compose.yml   # Local dev stack
├── Dockerfile           # Monolithic all-in-one image (supervisord)
└── CLAUDE.md            # Detailed engineering reference
```

## Configuration

Copy `.env.example` to `.env` in each service directory. Key variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` / `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | Auth token config |
| `ANTHROPIC_API_KEY` | Claude API key (used by Flowise) |
| `STT_URL` / `TTS_URL` / `RAG_URL` / `AUTH_URL` | Service endpoints used by orchestrator |
| `FLOWISE_URL` / `FLOWISE_API_KEY` | Flowise base URL and chatflow ID |

> **Never commit real `.env` files or secrets.** `k8s/**/secrets.yaml` contains placeholders only; use SealedSecrets, External Secrets Operator, or Vault in production.

## GPU Configuration

Uncomment the GPU sections in `docker-compose.yml` and set:

```bash
STT_WHISPER_DEVICE=cuda  STT_WHISPER_COMPUTE_TYPE=float16
TTS_INDICF5_DEVICE=cuda  TTS_INDICF5_ENABLED=true
```

## Documentation

- `CLAUDE.md` — Detailed engineering reference and conventions
- `linkedeye-voice-agent/CLAUDE.md` — Full architecture diagram and requirements
- `Documents/VoiceAgent-SaaS-Product-Vision.md` — Product roadmap (omnichannel)
- `Documents/LinkedEye-Folder-Structure.md` — Target directory structure
