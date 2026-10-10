# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

LinkedEye Voice Agent SaaS - a multi-tenant AI Voice Agent platform. The voice pipeline is: Audio In → STT (Whisper GPU) → RAG (pgvector) + Memory (Redis) → LLM (Claude via Flowise) → TTS (IndicF5 GPU / Piper fallback) → Audio Out.

## Implementation Status

| Service | Status | Location | Language |
|---------|--------|----------|----------|
| Auth (JWT, API keys, tenants, webhooks) | **Implemented** | `services/auth/src/` | Node.js/TS |
| API Gateway (routing, proxy, Twilio) | **Implemented** | `services/api-gateway/src/` | Node.js/TS |
| Orchestrator (voice pipeline, chat, ingestion) | **Implemented** | `services/orchestrator/src/` | Node.js/TS |
| Ingestion Worker (BullMQ document processing) | **Implemented** | `services/ingestion-worker/src/` | Node.js/TS |
| STT (Faster Whisper transcription) | **Implemented** | `services/stt/main.py` | Python/FastAPI |
| TTS (IndicF5 + Piper fallback) | **Implemented** | `services/tts/main.py` | Python/FastAPI |
| RAG (pgvector search + indexing) | **Implemented** | `services/rag/main.py` | Python/FastAPI |
| Webvoice (browser WebSocket UI) | **Implemented** | `services/webvoice/main.py` | Python/FastAPI |
| Email (IMAP/SMTP) | Partial (Dockerfile + .env only) | `services/email/` | — |
| Docker Compose, K8s manifests, Monitoring | Complete | `docker-compose.yml`, `k8s/`, `monitoring/` | — |

## Common Commands

```bash
# Docker Compose
docker compose up -d                    # Start all services
docker compose up -d postgres redis     # Start data layer only
docker compose logs -f auth             # Follow service logs

# Node.js services (run from services/auth/, services/api-gateway/, services/orchestrator/, or services/ingestion-worker/)
npm run dev           # Dev with hot reload (tsx watch)
npm run build         # TypeScript compile (tsc -> dist/)
npm run start         # Run compiled output
npm test              # Vitest (all tests)
npm run test:watch    # Vitest watch mode
npm run test:coverage # Coverage report (v8)
npm run lint          # ESLint (src --ext .ts)
npm run typecheck     # tsc --noEmit

# Run a single test file
npx vitest run src/__tests__/authService.test.ts

# Python ML services (run from services/stt/, services/tts/, services/rag/, or services/webvoice/)
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8001   # STT
uvicorn main:app --reload --host 0.0.0.0 --port 8002   # TTS
uvicorn main:app --reload --host 0.0.0.0 --port 8003   # RAG
uvicorn main:app --reload --host 0.0.0.0 --port 4004   # Webvoice

# Python tests
pytest
pytest -v --cov=.

# Kubernetes (Kustomize-based)
kubectl apply -k k8s/base               # Deploy base manifests
kubectl apply -k k8s/staging            # Deploy staging overlay
kubectl apply -k k8s/prod               # Deploy prod overlay
kubectl get pods -n voice-saas
kubectl logs -f deployment/auth -n voice-saas
```

## Architecture

### Implemented Service Structure
Node.js services (auth, api-gateway, orchestrator, ingestion-worker) follow this layout:
```
services/<name>/
├── src/
│   ├── index.ts          # Express app setup + middleware pipeline
│   ├── config.ts         # Env var config (Zod-validated)
│   ├── routes/           # Express routers
│   ├── services/         # Business logic
│   ├── middleware/        # auth, rateLimiter, errorHandler
│   ├── db/               # postgres.ts, redis.ts, migrations/
│   ├── utils/            # logger.ts (pino), metrics.ts (prom-client)
│   ├── types/            # index.ts — shared TypeScript types
│   └── __tests__/        # Vitest test files
├── Dockerfile            # Multi-stage Node 20 Alpine
├── package.json          # Scoped as @voice-saas/<name>
└── tsconfig.json         # ES2022 target, NodeNext modules, strict mode
```

**Auth service** routes: `/health`, `/metrics`, `/auth`, `/tenants`, `/users`, `/api-keys`, `/webhooks`. Supports outgoing webhooks with HMAC-SHA256 signing (`whsec_` prefix secrets stored in a `webhooks` table). JWT logout works via Redis blacklist — tokens are checked on every request, so logout is immediately effective.
**API Gateway** routes: `/health`, `/metrics`, `/voice`, `/twilio`. Circuit breaker in `proxyService.ts` (5 failures → OPEN, 30s recovery timeout, 3 successes → re-close). Twilio webhook auth in `twilioAuth.ts`. Accepts up to 50MB bodies.
**Orchestrator** routes: `/health`, `/metrics`, `/voice`, `/chat`, `/ingestion`. Fans out to STT/RAG/LLM/TTS services. Calls Flowise at `POST {FLOWISE_URL}/api/v1/prediction/{FLOWISE_API_KEY}` — `FLOWISE_API_KEY` is the chatflow ID, not an API key. Accepts up to 50MB bodies. Key env vars: `STT_URL`, `TTS_URL`, `RAG_URL`, `AUTH_URL`, `FLOWISE_URL`, `FLOWISE_API_KEY`.
**Ingestion Worker**: BullMQ worker (uses `ioredis`, not the `redis` package). No HTTP server — processes `document_ingestion` queue jobs via `ragIndexer.ts`.
**Webvoice**: Serves a static `index.html` from `static/` and a WebSocket endpoint at `ws://.../ws/{session_id}` for browser audio streaming. Proxies audio to the orchestrator over HTTP.

### Database Schema
`services/auth/src/db/migrations/001_init_schema.sql` defines: `tenants`, `users`, `api_keys`, `usage_events`, `audit_logs` — all UUID PKs, `tenant_id` FK with index, RLS-ready.
`services/rag/migrations/001_pgvector_schema.sql` defines: `knowledge_vectors` with `vector` column (pgvector extension).

### Deployment Modes
- **Docker Compose**: Separate containers per service (local dev)
- **Monolithic Dockerfile** (repo root): Bundles all services with supervisord in a single Ubuntu 22.04 container
- **Kubernetes**: Kustomize with base + staging/prod overlays, namespace `voice-saas`. Additional standalone manifests in `k8s/voice-*.yaml`.

## Service Ports

| Service | Port | Service | Port |
|---------|------|---------|------|
| API Gateway | 4000 | STT | 8001 |
| Auth | 4001 | TTS | 8002 |
| Orchestrator | 4002 | RAG | 8003 |
| Email | 4003 | Flowise | 3000 |
| Webvoice | 4004 | Grafana | 3001 |
| PostgreSQL | 5432 | Prometheus | 9090 |
| Redis | 6379 | Ollama | 11434 |

## Tech Stack (Non-Negotiable)

- **Node.js services**: Node 20 LTS, TypeScript (ES2022/NodeNext), Express, Zod validation, pino logging, prom-client metrics
- **Python ML services**: Python 3.10+, FastAPI, Pydantic v2 + pydantic-settings, structlog, prometheus_client
- **Data**: PostgreSQL 16 + pgvector, Redis 7
- **Voice**: Faster Whisper Large v3 (STT), IndicF5 + Piper fallback (TTS), Claude API via Flowise (LLM)
- **Async jobs**: BullMQ + ioredis (ingestion-worker)
- **Infra**: Kubernetes (prod) / Docker Compose (dev), Prometheus + Grafana, Kustomize overlays

## Key Conventions

- **Multi-tenancy is mandatory**: every DB table has `tenant_id` with index, every query filters by `tenant_id`, upstream calls include `X-Tenant-ID` header
- **Every service must expose**: `GET /health` (liveness/readiness) and `GET /metrics` (Prometheus scrape)
- **Structured JSON logging only** — use pino (Node) or structlog (Python), never console.log/print
- **Request context**: Express `Request` is extended with `.context` containing `tenant_id`, `user_id`, `api_key_id`, `scopes`, `request_id`
- **Error handling**: Custom `AppError` class hierarchy (ValidationError 400, AuthenticationError 401, RateLimitError 429) with centralized error middleware
- **Rate limiting**: Redis-based sliding window via express-rate-limit; limits vary by tenant plan (free/pro/enterprise): 60/300/1000 RPM
- **API keys**: Stored hashed (bcrypt, 12 rounds); format is `prefix.secret` where prefix is indexed for lookup

## Environment Variables Pattern

Copy `.env.example` to `.env` in each service directory. Key vars:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`
- `ANTHROPIC_API_KEY` — Claude API key (used by Flowise)

**Local dev note**: In `docker-compose.yml`, the PostgreSQL host port (5432) is commented out due to a host-port conflict. To connect to the DB directly from the host, either expose it temporarily or use `docker exec -it voice-saas-postgres psql -U postgres`. Model download caches (`whisper_cache`, `tts_cache`, `embedding_cache`) are Docker named volumes — they persist between restarts so models aren't re-downloaded.

## GPU Configuration

Uncomment GPU sections in `docker-compose.yml` and set:
```bash
STT_WHISPER_DEVICE=cuda  STT_WHISPER_COMPUTE_TYPE=float16
TTS_INDICF5_DEVICE=cuda  TTS_INDICF5_ENABLED=true
```

## K8s Namespaces

`voice-saas` (app), `data` (PostgreSQL/Redis), `monitoring` (Prometheus/Grafana), `ingress` (nginx)

K8s deployments use `prometheus.io/*` annotations for automatic scrape discovery. HPA is configured for auth, api-gateway, orchestrator, and webvoice.

## Key Documentation

- `linkedeye-voice-agent/CLAUDE.md` — Full architecture diagram and technical requirements
- `linkedeye-voice-agent/.claude/agents/voice-saas-architect.md` — Implementation agent with complete platform context
- `Documents/LinkedEye-Folder-Structure.md` — Target directory structure (~285 files)
- `Documents/VoiceAgent-SaaS-Product-Vision.md` — Product roadmap (omnichannel: phone, web voice, email, SMS, chat)
