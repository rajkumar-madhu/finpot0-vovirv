# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LinkedEye Voice Agent is a production-grade, multi-tenant AI Voice Agent SaaS platform. The system processes voice calls through a pipeline: STT (Faster Whisper GPU) → LLM reasoning (Claude via Flowise) → TTS (IndicF5 GPU + Piper fallback), with RAG over tenant knowledge bases.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Voice SaaS Platform                          │
├─────────────────────────────────────────────────────────────────────┤
│  Ingress (nginx + TLS)                                              │
│    ↓                                                                │
│  API Gateway (Node.js/Express) ─── Auth Service (JWT/API Keys)     │
│    ↓                                                                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Voice Pipeline                                                │  │
│  │  Audio In → STT (Whisper GPU) → text                         │  │
│  │              ↓                                                │  │
│  │  RAG (pgvector) + Memory (Redis)                             │  │
│  │              ↓                                                │  │
│  │  Flowise (Claude API) → response                             │  │
│  │              ↓                                                │  │
│  │  TTS (IndicF5 GPU / Piper fallback) → Audio Out              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  Data Layer: PostgreSQL + pgvector │ Redis 7                       │
│  Workers: BullMQ (document ingestion, async jobs)                  │
└─────────────────────────────────────────────────────────────────────┘
```

## Non-Negotiable Tech Stack

**Backend Services:**
- Node.js 20 LTS + TypeScript + Express (APIs, orchestrators)
- Python 3.10+ + FastAPI (ML services: STT, TTS)
- Zod (Node) / Pydantic (Python) for validation
- pino (Node) / structlog (Python) for structured JSON logging

**Data:**
- PostgreSQL 16 + pgvector (primary + vectors)
- Redis 7 (caching, rate limiting, session)

**Voice Pipeline:**
- STT: Faster Whisper Large v3 (GPU)
- TTS: AI4Bharat IndicF5 (GPU primary) + Piper (CPU fallback)
- LLM: Claude API via Flowise (Haiku for speed, Sonnet for complexity)

**Infrastructure:**
- Kubernetes (production) / Docker Compose (dev)
- Prometheus + Grafana (monitoring)
- GitHub Actions + ArgoCD (CI/CD)

## Critical Requirements

### Multi-Tenancy (Mandatory)
- Every request includes `tenant_id` (from API key or JWT)
- Every database table has `tenant_id` column with index
- All queries MUST filter by `tenant_id`

### Every Service Must Have
- `GET /health` - liveness/readiness endpoint
- `GET /metrics` - Prometheus metrics endpoint
- Structured JSON logging (never console.log)
- K8s resource requests/limits
- Liveness + readiness probes

### Security
- Never hardcode secrets; use environment variables
- Store API keys hashed (bcrypt/argon2)
- Validate webhook signatures (Twilio/LiveKit/Vapi)
- Audio stays self-hosted; only text to Claude API

## Project Structure (Target)

```
/
├── services/
│   ├── api-gateway/        # Node.js - routing, auth, rate limiting
│   ├── auth/               # Node.js - JWT, API keys, tenants
│   ├── stt/                # Python FastAPI - Faster Whisper
│   ├── tts/                # Python FastAPI - IndicF5 + Piper
│   ├── rag/                # Python FastAPI - pgvector search
│   ├── orchestrator/       # Node.js - voice pipeline coordination
│   └── ingestion-worker/   # Node.js - BullMQ document processing
├── flowise/
│   └── chatflows/          # Flowise JSON exports
├── k8s/
│   ├── base/               # Base manifests
│   ├── staging/            # Staging overlays
│   └── prod/               # Production overlays
├── docker/
│   └── docker-compose.yml  # Local development
├── scripts/                # Build, deploy, seed scripts
└── docs/                   # Architecture, API docs
```

## Common Commands

### Development Setup
```bash
# Start all services locally
docker compose up -d

# Run specific service in dev mode
cd services/auth && npm run dev
cd services/stt && uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

### Testing
```bash
# Node.js services (vitest)
npm test
npm run test:watch
npm run test:coverage

# Python services (pytest)
pytest
pytest -v --cov=app
```

### Building
```bash
# Node.js
npm run build
docker build -t voice-saas/auth:latest ./services/auth

# Python
docker build -t voice-saas/stt:latest ./services/stt
```

### Kubernetes
```bash
# Apply to cluster
kubectl apply -k k8s/staging
kubectl apply -k k8s/prod

# Check status
kubectl get pods -n voice-saas
kubectl logs -f deployment/auth -n voice-saas
```

## Kubernetes Namespaces

- `voice-saas` - Application services
- `data` - PostgreSQL, Redis
- `monitoring` - Prometheus, Grafana
- `ingress` - nginx ingress controller

## Environment Variables Pattern

All services use `.env.example` as template. Required vars:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - JWT signing secret
- `ANTHROPIC_API_KEY` - Claude API key (for Flowise)

## Voice SaaS Architect Agent

Use the `voice-saas-architect` agent (Task tool) when:
- Implementing any microservice
- Creating K8s manifests or Dockerfiles
- Building Flowise chatflows
- Designing database schemas with tenant isolation
- Setting up monitoring or CI/CD
- Adding SaaS features (billing, quotas, metering)
