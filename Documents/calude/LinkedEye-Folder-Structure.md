# LinkedEye Notebook Voice Agent — Complete Folder Structure
## NotebookLM-Style AI Voice Agent for IT Operations
## Version 5.0 | February 2026

```
linkedeye-voice-agent/
│
├── 📁 docker/                              # Docker images for all services
│   │
│   ├── 📁 indicf5-tts/                     # 🥇 Primary TTS (Tamil voice)
│   │   ├── Dockerfile                      # CUDA 12.1 + PyTorch + IndicF5
│   │   ├── requirements.txt                # torch, transformers, fastapi, uvicorn
│   │   ├── server.py                       # FastAPI TTS server with persona support
│   │   ├── 📁 prompts/                     # Reference voice audio samples
│   │   │   ├── TAM_F_HAPPY_00001.wav       # Tamil female voice prompt
│   │   │   ├── TAM_M_NEUTRAL_00001.wav     # Tamil male voice prompt
│   │   │   ├── HIN_F_HAPPY_00001.wav       # Hindi female voice prompt
│   │   │   ├── HIN_M_NEUTRAL_00001.wav     # Hindi male voice prompt
│   │   │   ├── TEL_F_HAPPY_00001.wav       # Telugu female voice prompt
│   │   │   ├── KAN_F_HAPPY_00001.wav       # Kannada female voice prompt
│   │   │   ├── MAL_F_HAPPY_00001.wav       # Malayalam female voice prompt
│   │   │   ├── ENG_F_HAPPY_00001.wav       # English female voice prompt
│   │   │   ├── ENG_M_NEUTRAL_00001.wav     # English male voice prompt
│   │   │   ├── BEN_F_HAPPY_00001.wav       # Bengali female voice prompt
│   │   │   ├── GUJ_F_HAPPY_00001.wav       # Gujarati female voice prompt
│   │   │   ├── MAR_F_HAPPY_00001.wav       # Marathi female voice prompt
│   │   │   ├── PUN_F_HAPPY_00001.wav       # Punjabi female voice prompt
│   │   │   └── ORI_F_HAPPY_00001.wav       # Odia female voice prompt
│   │   └── 📁 custom-personas/             # User-uploaded voice clones
│   │       ├── rajkumar-voice.wav           # Rajkumar's cloned voice (30s)
│   │       ├── priya-voice.wav              # Priya persona
│   │       └── personas.json                # Persona registry metadata
│   │
│   ├── 📁 whisper-stt/                     # Speech-to-Text
│   │   ├── Dockerfile                      # CUDA + faster-whisper
│   │   ├── server.py                       # FastAPI STT server
│   │   └── requirements.txt                # faster-whisper, fastapi
│   │
│   ├── 📁 piper-tts/                       # TTS Fallback (CPU)
│   │   ├── Dockerfile                      # Lightweight CPU-only TTS
│   │   └── config.json                     # Voice model config
│   │
│   ├── 📁 api-server/                      # Voice Pipeline Orchestrator
│   │   ├── Dockerfile                      # Node.js 20 LTS
│   │   ├── package.json
│   │   ├── package-lock.json
│   │   ├── .env.example                    # Template (NEVER commit .env)
│   │   ├── 📁 src/
│   │   │   ├── index.js                    # Express app entry point
│   │   │   ├── config.js                   # Environment config loader
│   │   │   ├── 📁 routes/
│   │   │   │   ├── voice-chat.js           # POST /v1/voice/chat (main pipeline)
│   │   │   │   ├── text-chat.js            # POST /v1/text/chat (text-only)
│   │   │   │   ├── personas.js             # CRUD /v1/voice/personas
│   │   │   │   ├── health.js               # GET /health (all service checks)
│   │   │   │   ├── webhooks-vapi.js        # POST /webhook/vapi/:product
│   │   │   │   ├── webhooks-livekit.js     # POST /webhook/livekit
│   │   │   │   ├── webhooks-twilio.js      # POST /webhook/twilio/incoming
│   │   │   │   ├── incidents.js            # GET/POST /internal/incidents
│   │   │   │   ├── diagnostics.js          # POST /internal/diagnostic
│   │   │   │   ├── knowledge.js            # POST /internal/knowledge/ingest
│   │   │   │   └── analytics.js            # GET /internal/analytics
│   │   │   ├── 📁 services/
│   │   │   │   ├── stt-service.js          # Whisper STT client
│   │   │   │   ├── tts-service.js          # IndicF5 + Piper fallback client
│   │   │   │   ├── llm-service.js          # Flowise + Ollama + Claude router
│   │   │   │   ├── rag-service.js          # pgvector knowledge search
│   │   │   │   ├── vapi-service.js         # Vapi.ai API client
│   │   │   │   ├── twilio-service.js       # Twilio SMS/Call client
│   │   │   │   ├── livekit-service.js      # LiveKit room management
│   │   │   │   ├── persona-service.js      # Voice persona CRUD
│   │   │   │   ├── incident-service.js     # Incident CRUD + search
│   │   │   │   └── notification-service.js # SMS/Email/Slack notifications
│   │   │   ├── 📁 middleware/
│   │   │   │   ├── auth.js                 # API key validation
│   │   │   │   ├── rate-limiter.js         # Per-product rate limiting
│   │   │   │   ├── request-logger.js       # Request/response logging
│   │   │   │   ├── error-handler.js        # Global error handler
│   │   │   │   └── webhook-verify.js       # Vapi/Twilio signature verify
│   │   │   ├── 📁 utils/
│   │   │   │   ├── language-detect.js      # Tamil/English/Hindi detection
│   │   │   │   ├── model-router.js         # Haiku vs Sonnet smart routing
│   │   │   │   ├── audio-utils.js          # Base64, WAV conversion, PCM
│   │   │   │   ├── metrics.js              # Prometheus metrics helpers
│   │   │   │   └── constants.js            # Product IDs, model names
│   │   │   └── 📁 db/
│   │   │       ├── postgres.js             # PostgreSQL connection pool
│   │   │       ├── redis.js                # Redis client
│   │   │       └── 📁 migrations/
│   │   │           ├── 001_init_schema.sql
│   │   │           ├── 002_pgvector.sql
│   │   │           ├── 003_incidents.sql
│   │   │           ├── 004_knowledge.sql
│   │   │           ├── 005_call_logs.sql
│   │   │           ├── 006_personas.sql
│   │   │           └── 007_tenants.sql
│   │   └── 📁 tests/
│   │       ├── voice-chat.test.js
│   │       ├── rag-service.test.js
│   │       ├── tts-service.test.js
│   │       └── model-router.test.js
│   │
│   ├── 📁 ingestion-worker/                # Document Ingestion Pipeline
│   │   ├── Dockerfile                      # Python 3.10
│   │   ├── requirements.txt                # langchain, pgvector, ollama
│   │   ├── ingest.py                       # Main ingestion service
│   │   ├── 📁 loaders/
│   │   │   ├── pdf_loader.py               # PDF → chunks
│   │   │   ├── docx_loader.py              # DOCX → chunks
│   │   │   ├── csv_loader.py               # CSV → chunks
│   │   │   ├── web_loader.py               # Website scraper → chunks
│   │   │   ├── confluence_loader.py        # Confluence wiki → chunks
│   │   │   └── incident_loader.py          # PostgreSQL incidents → embeddings
│   │   ├── 📁 embeddings/
│   │   │   ├── ollama_embeddings.py        # Ollama nomic-embed-text
│   │   │   └── openai_embeddings.py        # OpenAI fallback
│   │   └── 📁 schedulers/
│   │       ├── daily_reindex.py            # Cron: re-index all docs
│   │       ├── incident_sync.py            # Real-time: new incidents → vectors
│   │       └── cmdb_sync.py                # Every 6h: CMDB → vectors
│   │
│   └── 📁 livekit-agent/                   # LiveKit Voice Agent Worker
│       ├── Dockerfile                      # Python 3.10 + livekit-agents
│       ├── requirements.txt                # livekit, aiohttp
│       ├── agent.py                        # Main voice agent (STT→LLM→TTS loop)
│       ├── config.py                       # Agent configuration
│       └── 📁 handlers/
│           ├── call_handler.py             # Handle incoming call events
│           ├── transfer_handler.py         # Human agent transfer
│           └── recording_handler.py        # Call recording management
│
├── 📁 k8s/                                 # Kubernetes Manifests
│   │
│   ├── 📁 base/                            # Base manifests (all environments)
│   │   ├── namespace.yaml                  # voice-ai-production namespace
│   │   ├── 📁 secrets/
│   │   │   ├── anthropic-api.yaml          # Anthropic Claude API key
│   │   │   ├── vapi-credentials.yaml       # Vapi.ai API key + webhook secret
│   │   │   ├── flowise-api-keys.yaml       # All 9 Flowise product keys
│   │   │   ├── flowise-credentials.yaml    # Flowise admin login
│   │   │   ├── twilio-credentials.yaml     # Twilio SID + Auth Token
│   │   │   ├── razorpay-credentials.yaml   # Razorpay Key + Secret
│   │   │   ├── database-credentials.yaml   # PostgreSQL + Redis passwords
│   │   │   └── huggingface-token.yaml      # HF model download token
│   │   ├── 📁 configmaps/
│   │   │   ├── api-server-config.yaml      # Service URLs, model names
│   │   │   ├── flowise-config.yaml         # Flowise environment
│   │   │   ├── livekit-config.yaml         # LiveKit server config
│   │   │   ├── ollama-config.yaml          # Ollama models to pull
│   │   │   ├── nginx-config.yaml           # Ingress routing rules
│   │   │   └── grafana-dashboards.yaml     # Monitoring dashboard JSON
│   │   └── 📁 storage/
│   │       ├── indicf5-models-pvc.yaml     # 20Gi — TTS model cache
│   │       ├── whisper-models-pvc.yaml     # 10Gi — STT model cache
│   │       ├── ollama-models-pvc.yaml      # 30Gi — LLM model storage
│   │       ├── postgres-data-pvc.yaml      # 50Gi — Database
│   │       ├── knowledge-docs-pvc.yaml     # 20Gi — Uploaded documents
│   │       └── call-recordings-pvc.yaml    # 100Gi — Call recordings
│   │
│   ├── 📁 gpu-workloads/                   # GPU Pod Deployments
│   │   ├── indicf5-tts-deployment.yaml     # 2 replicas, 1 GPU each, port 8002
│   │   ├── indicf5-tts-service.yaml        # ClusterIP: indicf5-tts-svc:8002
│   │   ├── indicf5-tts-hpa.yaml            # Auto-scale 1→3 on CPU >60%
│   │   ├── whisper-stt-deployment.yaml     # 2 replicas, 1 GPU each, port 8000
│   │   ├── whisper-stt-service.yaml        # ClusterIP: whisper-stt-svc:8000
│   │   ├── whisper-stt-hpa.yaml            # Auto-scale 1→4 on CPU >60%
│   │   └── nvidia-gpu-timeslicing.yaml     # GPU time-slicing config
│   │
│   ├── 📁 cpu-workloads/                   # CPU Pod Deployments
│   │   ├── api-server-deployment.yaml      # 3 replicas, port 4000
│   │   ├── api-server-service.yaml         # ClusterIP: api-server-svc:4000
│   │   ├── api-server-hpa.yaml             # Auto-scale 2→10 on CPU >70%
│   │   ├── flowise-deployment.yaml         # 2 replicas, port 3000
│   │   ├── flowise-service.yaml            # ClusterIP: flowise-svc:3000
│   │   ├── piper-tts-deployment.yaml       # 2 replicas, port 5000 (CPU fallback)
│   │   ├── piper-tts-service.yaml          # ClusterIP: piper-tts-svc:5000
│   │   ├── ollama-deployment.yaml          # 1 replica, port 11434
│   │   ├── ollama-service.yaml             # ClusterIP: ollama-svc:11434
│   │   ├── livekit-server-deployment.yaml  # 2 replicas, ports 7880-7882
│   │   ├── livekit-server-service.yaml     # LoadBalancer (needs external IP)
│   │   ├── livekit-agent-deployment.yaml   # 3 replicas (voice agent workers)
│   │   ├── n8n-deployment.yaml             # 1 replica, port 5678
│   │   ├── n8n-service.yaml                # ClusterIP: n8n-svc:5678
│   │   ├── ingestion-worker-deployment.yaml # 1 replica (background job)
│   │   └── ingestion-worker-cronjob.yaml   # Daily re-index job
│   │
│   ├── 📁 stateful/                        # StatefulSet Deployments
│   │   ├── postgres-statefulset.yaml       # 1 replica + pgvector extension
│   │   ├── postgres-service.yaml           # Headless: postgres-svc:5432
│   │   ├── postgres-init-configmap.yaml    # Init SQL: pgvector, schemas
│   │   ├── redis-statefulset.yaml          # 1 replica, port 6379
│   │   └── redis-service.yaml              # Headless: redis-svc:6379
│   │
│   ├── 📁 networking/                      # Ingress & Network Policies
│   │   ├── nginx-ingress.yaml              # TLS routes for all services
│   │   ├── cert-manager-issuer.yaml        # Let's Encrypt auto TLS
│   │   ├── network-policy-default.yaml     # Deny all by default
│   │   ├── network-policy-gpu.yaml         # Allow GPU pods ↔ API server
│   │   ├── network-policy-flowise.yaml     # Allow Flowise ↔ Claude API
│   │   └── network-policy-external.yaml    # Allow Vapi/Twilio webhooks
│   │
│   ├── 📁 monitoring/                      # Observability Stack
│   │   ├── prometheus-deployment.yaml
│   │   ├── prometheus-config.yaml          # Scrape configs for all services
│   │   ├── grafana-deployment.yaml
│   │   ├── 📁 grafana-dashboards/
│   │   │   ├── voice-pipeline-overview.json    # Total calls, latency, errors
│   │   │   ├── indicf5-tts-performance.json    # TTS latency, chars/sec
│   │   │   ├── whisper-stt-performance.json    # STT latency, languages
│   │   │   ├── claude-api-costs.json           # Tokens, cost/hour, models
│   │   │   ├── gpu-utilization.json            # VRAM, SM%, temperature
│   │   │   ├── pod-health.json                 # Restarts, OOM, pending
│   │   │   ├── per-product-usage.json          # Calls per product breakdown
│   │   │   └── rag-knowledge-metrics.json      # Embedding count, search latency
│   │   ├── 📁 alerting/
│   │   │   ├── alertmanager-config.yaml
│   │   │   ├── alert-rules-voice.yaml      # TTS >3s, STT >5s, error >5%
│   │   │   ├── alert-rules-gpu.yaml        # Temp >85°C, VRAM >90%
│   │   │   ├── alert-rules-api.yaml        # Claude 429, pod restarts
│   │   │   └── alert-rules-cost.yaml       # Daily spend >$50
│   │   └── loki-deployment.yaml            # Log aggregation (optional)
│   │
│   ├── 📁 ci-cd/                           # GitOps Deployment
│   │   ├── argocd-application.yaml         # ArgoCD app definition
│   │   ├── argocd-project.yaml             # ArgoCD project
│   │   └── 📁 github-actions/
│   │       ├── build-push-images.yaml      # Build Docker → push registry
│   │       ├── deploy-k8s.yaml             # Apply manifests via ArgoCD
│   │       └── run-tests.yaml              # API + integration tests
│   │
│   └── 📁 backup/                          # Backup & Disaster Recovery
│       ├── postgres-backup-cronjob.yaml    # Daily pg_dump to S3/local
│       ├── knowledge-backup-cronjob.yaml   # Weekly doc backup
│       ├── recording-backup-cronjob.yaml   # Daily call recording archive
│       └── velero-schedule.yaml            # Full cluster backup (Velero)
│
├── 📁 flowise/                             # Flowise Chatflow Configurations
│   │
│   ├── 📁 chatflows/                       # Exported chatflow JSONs
│   │   ├── 01-basic-tamil-chat.json        # Foundation: Claude + Memory
│   │   ├── 02-voice-pipeline.json          # STT + Claude + TTS wrapper
│   │   ├── 03-voicelead-ai.json            # Real estate lead qualification
│   │   ├── 04-clinicvoice-ai.json          # Healthcare appointment booking
│   │   ├── 05-rag-tamil-qa.json            # Document Q&A with pgvector
│   │   ├── 06-smart-model-router.json      # Haiku/Sonnet cost optimization
│   │   ├── 07-multi-tool-agent.json        # Property search + booking agent
│   │   ├── 08-whatsapp-voice.json          # WhatsApp voice bot
│   │   ├── 09-ivr-replacement.json         # Phone IVR automation
│   │   ├── 10-analytics-dashboard.json     # Voice AI usage analytics
│   │   ├── 11-linkedeye-voice-agent.json   # IT Ops voice agent (v5.0)
│   │   ├── 12-eduvoice-ai.json             # Education voice agent
│   │   └── 13-hr-assist.json               # HR chatbot
│   │
│   ├── 📁 system-prompts/                  # Production system prompts
│   │   ├── basic-tamil-chat.md
│   │   ├── voicelead-ai.md
│   │   ├── clinicvoice-ai.md
│   │   ├── linkedeye-it-ops.md
│   │   ├── eduvoice-ai.md
│   │   ├── hr-assist.md
│   │   ├── whatsapp-bot.md
│   │   ├── ivr-replacement.md
│   │   ├── analytics-bot.md
│   │   ├── smart-router-classifier.md
│   │   ├── rag-tamil-qa.md
│   │   └── multi-agent-property.md
│   │
│   └── 📁 custom-tools/                    # Flowise Custom Tool definitions
│       ├── create_ticket.json              # Create IT incident (n8n webhook)
│       ├── escalate_to.json                # Escalate to team (n8n webhook)
│       ├── run_diagnostic.json             # Run health check (API call)
│       ├── check_incident_status.json      # Search incidents (API call)
│       ├── search_properties.json          # Property search (API call)
│       ├── schedule_visit.json             # Book property visit (API call)
│       ├── save_lead.json                  # Save lead to CRM (API call)
│       ├── send_appointment_sms.json       # SMS confirmation (Twilio)
│       ├── book_appointment.json           # Clinic appointment (API call)
│       ├── check_doctor_availability.json  # Doctor schedule (API call)
│       ├── enroll_student.json             # Student enrollment (API call)
│       ├── check_fee_structure.json        # Fee details (API call)
│       └── trigger_n8n_workflow.json       # Generic n8n trigger
│
├── 📁 n8n/                                 # n8n Workflow Automations
│   │
│   ├── 📁 workflows/
│   │   ├── lead-qualified.json             # Lead → CRM + SMS + Email
│   │   ├── appointment-booked.json         # Appointment → SMS + Calendar
│   │   ├── incident-created.json           # Ticket → Slack + PagerDuty
│   │   ├── escalation-triggered.json       # Escalate → Notify on-call
│   │   ├── daily-ops-summary.json          # Cron → Generate + Email report
│   │   ├── call-completed.json             # Post-call → Save transcript + lead
│   │   ├── whatsapp-incoming.json          # WhatsApp → Flowise → Reply
│   │   ├── student-enrolled.json           # Enrollment → SMS + CRM
│   │   └── payment-received.json           # Razorpay webhook → Update DB
│   │
│   └── 📁 credentials/
│       └── credentials.example.json        # Template (NEVER commit real creds)
│
├── 📁 dashboard/                           # LinkedEye React Dashboard
│   │
│   ├── package.json
│   ├── next.config.js                      # Next.js config
│   ├── tailwind.config.js
│   ├── 📁 src/
│   │   ├── 📁 app/
│   │   │   ├── layout.tsx                  # Root layout
│   │   │   ├── page.tsx                    # Dashboard home
│   │   │   ├── 📁 incidents/
│   │   │   │   ├── page.tsx                # Incident list
│   │   │   │   └── [id]/page.tsx           # Incident detail
│   │   │   ├── 📁 knowledge/
│   │   │   │   ├── page.tsx                # Knowledge base manager
│   │   │   │   └── upload/page.tsx         # Document upload
│   │   │   ├── 📁 voice/
│   │   │   │   ├── page.tsx                # Voice mode settings
│   │   │   │   └── personas/page.tsx       # Voice persona manager
│   │   │   ├── 📁 analytics/
│   │   │   │   └── page.tsx                # Call analytics
│   │   │   ├── 📁 settings/
│   │   │   │   ├── page.tsx                # General settings
│   │   │   │   ├── api-keys/page.tsx       # API key management
│   │   │   │   └── tenants/page.tsx        # Multi-tenant config
│   │   │   └── 📁 api/
│   │   │       ├── voice/start/route.ts    # Create LiveKit room
│   │   │       ├── voice/end/route.ts      # End voice session
│   │   │       └── knowledge/route.ts      # Knowledge API proxy
│   │   ├── 📁 components/
│   │   │   ├── 📁 voice/
│   │   │   │   ├── VoiceMode.tsx           # Voice mode panel (LiveKit)
│   │   │   │   ├── VoiceButton.tsx         # Floating mic button
│   │   │   │   ├── VoiceTranscript.tsx     # Live transcript display
│   │   │   │   ├── PersonaSelector.tsx     # Voice persona dropdown
│   │   │   │   └── CallControls.tsx        # Mute, end, transfer buttons
│   │   │   ├── 📁 incidents/
│   │   │   │   ├── IncidentTable.tsx
│   │   │   │   ├── IncidentCard.tsx
│   │   │   │   ├── IncidentDetail.tsx
│   │   │   │   └── CreateIncidentForm.tsx
│   │   │   ├── 📁 knowledge/
│   │   │   │   ├── DocumentUpload.tsx
│   │   │   │   ├── KnowledgeSearch.tsx
│   │   │   │   └── SourceList.tsx
│   │   │   ├── 📁 analytics/
│   │   │   │   ├── CallVolumeChart.tsx
│   │   │   │   ├── LanguageDistribution.tsx
│   │   │   │   ├── CostTracker.tsx
│   │   │   │   └── LatencyMetrics.tsx
│   │   │   ├── 📁 layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Header.tsx
│   │   │   │   ├── Footer.tsx
│   │   │   │   └── Breadcrumb.tsx
│   │   │   └── 📁 common/
│   │   │       ├── DataTable.tsx
│   │   │       ├── StatusBadge.tsx
│   │   │       ├── LoadingSpinner.tsx
│   │   │       └── ErrorBoundary.tsx
│   │   ├── 📁 hooks/
│   │   │   ├── useVoiceMode.ts             # LiveKit voice mode hook
│   │   │   ├── useIncidents.ts             # Incident CRUD hook
│   │   │   ├── useKnowledge.ts             # Knowledge search hook
│   │   │   └── useAnalytics.ts             # Analytics data hook
│   │   ├── 📁 lib/
│   │   │   ├── api-client.ts               # Axios/fetch wrapper
│   │   │   ├── livekit-client.ts           # LiveKit SDK wrapper
│   │   │   ├── auth.ts                     # Auth helpers
│   │   │   └── constants.ts                # Product IDs, URLs
│   │   └── 📁 types/
│   │       ├── incident.ts
│   │       ├── persona.ts
│   │       ├── knowledge.ts
│   │       ├── call-log.ts
│   │       └── tenant.ts
│   │
│   └── 📁 public/
│       ├── favicon.ico
│       ├── linkedeye-logo.svg
│       └── 📁 sounds/
│           ├── call-start.mp3
│           ├── call-end.mp3
│           └── notification.mp3
│
├── 📁 knowledge-base/                      # RAG Document Storage
│   │
│   ├── 📁 runbooks/                        # IT Operations Runbooks
│   │   ├── database-restart.pdf
│   │   ├── payment-gateway-recovery.pdf
│   │   ├── vpn-troubleshooting.pdf
│   │   ├── kubernetes-pod-crash.pdf
│   │   ├── ssl-certificate-renewal.pdf
│   │   └── disaster-recovery-plan.pdf
│   │
│   ├── 📁 sops/                            # Standard Operating Procedures
│   │   ├── incident-management-sop.pdf
│   │   ├── change-management-sop.pdf
│   │   ├── on-call-rotation.pdf
│   │   └── escalation-matrix.pdf
│   │
│   ├── 📁 product-docs/                    # Product-specific docs for RAG
│   │   ├── 📁 voicelead/
│   │   │   ├── property-catalog-coimbatore.pdf
│   │   │   └── pricing-guide.pdf
│   │   ├── 📁 clinic/
│   │   │   ├── doctor-directory.pdf
│   │   │   ├── service-catalog.pdf
│   │   │   └── patient-faq.pdf
│   │   ├── 📁 education/
│   │   │   ├── course-catalog.pdf
│   │   │   ├── fee-structure.pdf
│   │   │   ├── syllabus-documents/
│   │   │   └── scholarship-policy.pdf
│   │   └── 📁 hr/
│   │       ├── employee-handbook.pdf
│   │       ├── leave-policy.pdf
│   │       └── holiday-calendar.pdf
│   │
│   └── 📁 templates/                       # Document templates
│       ├── incident-report-template.docx
│       ├── rca-template.docx
│       └── change-request-template.docx
│
├── 📁 scripts/                             # Utility Scripts
│   │
│   ├── 📁 setup/
│   │   ├── 01-install-k8s.sh              # K8s cluster setup (kubeadm/K3s)
│   │   ├── 02-install-gpu-operator.sh     # NVIDIA GPU Operator
│   │   ├── 03-label-nodes.sh              # Label GPU/CPU nodes
│   │   ├── 04-create-secrets.sh           # Generate + apply all secrets
│   │   ├── 05-deploy-database.sh          # PostgreSQL + Redis + pgvector
│   │   ├── 06-deploy-ollama.sh            # Ollama + pull models
│   │   ├── 07-deploy-flowise.sh           # Flowise AI
│   │   ├── 08-build-indicf5.sh            # Build + push IndicF5 Docker
│   │   ├── 09-deploy-voice-stack.sh       # IndicF5 + Whisper + Piper
│   │   ├── 10-deploy-api-server.sh        # API Server
│   │   ├── 11-deploy-livekit.sh           # LiveKit Server + Agent
│   │   ├── 12-deploy-n8n.sh              # n8n automation
│   │   ├── 13-deploy-monitoring.sh        # Prometheus + Grafana
│   │   ├── 14-deploy-ingress.sh           # Nginx + TLS
│   │   ├── 15-import-chatflows.sh         # Import Flowise chatflows
│   │   ├── 16-ingest-knowledge.sh         # Load initial knowledge docs
│   │   ├── 17-register-personas.sh        # Upload voice persona samples
│   │   ├── 18-configure-vapi.sh           # Setup Vapi assistants
│   │   └── 99-full-deploy.sh              # Run all steps 01→18
│   │
│   ├── 📁 operations/
│   │   ├── backup-database.sh             # Manual DB backup
│   │   ├── restore-database.sh            # Restore from backup
│   │   ├── rotate-api-keys.sh             # Rotate all API keys
│   │   ├── scale-gpu-pods.sh              # Scale TTS/STT pods
│   │   ├── check-gpu-health.sh            # nvidia-smi on all GPU nodes
│   │   ├── test-voice-pipeline.sh         # End-to-end voice test
│   │   ├── test-tts-all-languages.sh      # Test all 11 IndicF5 languages
│   │   └── export-chatflows.sh            # Export Flowise chatflows to JSON
│   │
│   └── 📁 data/
│       ├── seed-demo-incidents.sql         # Demo incident data
│       ├── seed-demo-knowledge.sql         # Demo knowledge embeddings
│       └── seed-demo-personas.json         # Demo voice personas
│
├── 📁 docs/                                # Documentation
│   │
│   ├── 📁 architecture/
│   │   ├── v2.0-claude-edition.docx        # Claude AI integration
│   │   ├── v3.0-k8s-deployment.docx        # K8s cluster setup
│   │   ├── v1.0-flowise-build-guide.docx   # 10 Flowise chatflows
│   │   ├── v4.0-self-hosted-voice.docx     # IndicF5 TTS deployment
│   │   ├── v5.0-notebook-voice-agent.docx  # LinkedEye voice agent
│   │   └── v6.0-complete-saas-guide.docx   # All products + Vapi + Ollama
│   │
│   ├── 📁 api/
│   │   ├── voice-chat-api.md               # POST /v1/voice/chat
│   │   ├── persona-api.md                  # Voice persona CRUD
│   │   ├── knowledge-api.md                # Knowledge ingestion API
│   │   ├── incident-api.md                 # Incident CRUD API
│   │   ├── flowise-api-reference.md        # Flowise prediction API
│   │   ├── vapi-webhook-reference.md       # Vapi webhook payloads
│   │   └── twilio-webhook-reference.md     # Twilio webhook payloads
│   │
│   ├── 📁 runbooks/
│   │   ├── deploy-new-product.md           # How to add a new product
│   │   ├── add-new-language.md             # How to add a new language
│   │   ├── create-voice-persona.md         # How to clone a voice
│   │   ├── troubleshooting.md              # Common issues + fixes
│   │   ├── disaster-recovery.md            # Full recovery procedure
│   │   └── performance-tuning.md           # GPU, model, and cache tuning
│   │
│   └── README.md                           # Project overview + quickstart
│
├── 📁 tests/                               # Integration & E2E Tests
│   ├── 📁 integration/
│   │   ├── test-stt-pipeline.js            # Audio → Whisper → text
│   │   ├── test-tts-pipeline.js            # Text → IndicF5 → audio
│   │   ├── test-rag-search.js              # Query → pgvector → results
│   │   ├── test-flowise-chatflow.js        # Text → Flowise → response
│   │   └── test-voice-full-pipeline.js     # Audio → STT → AI → TTS → audio
│   ├── 📁 e2e/
│   │   ├── test-voicelead-call.js          # Simulate real estate call
│   │   ├── test-clinic-call.js             # Simulate clinic appointment
│   │   ├── test-linkedeye-call.js          # Simulate IT incident call
│   │   └── test-eduvoice-call.js           # Simulate education enquiry
│   └── 📁 load/
│       ├── k6-voice-pipeline.js            # k6 load test: voice pipeline
│       └── k6-flowise-chatflow.js          # k6 load test: Flowise API
│
├── .gitignore                              # Never commit secrets!
├── .env.example                            # Template environment variables
├── docker-compose.dev.yaml                 # Local development stack
├── docker-compose.yaml                     # Production Docker Compose (non-K8s)
├── Makefile                                # Quick commands
└── README.md                               # Project root README
```

## Quick Command Reference (Makefile)

```makefile
# Makefile
.PHONY: dev deploy test

dev:                    ## Start local dev environment
	docker compose -f docker-compose.dev.yaml up -d

deploy:                 ## Deploy to K8s (full)
	bash scripts/setup/99-full-deploy.sh

deploy-voice:           ## Deploy voice stack only
	bash scripts/setup/09-deploy-voice-stack.sh

build-indicf5:          ## Build IndicF5 Docker image
	bash scripts/setup/08-build-indicf5.sh

test:                   ## Run all tests
	cd docker/api-server && npm test
	cd tests && npm run integration
	cd tests && npm run e2e

test-voice:             ## Test voice pipeline end-to-end
	bash scripts/operations/test-voice-pipeline.sh

test-tts:               ## Test all TTS languages
	bash scripts/operations/test-tts-all-languages.sh

backup:                 ## Backup database + knowledge
	bash scripts/operations/backup-database.sh

rotate-keys:            ## Rotate all API keys
	bash scripts/operations/rotate-api-keys.sh

gpu-check:              ## Check GPU health across cluster
	bash scripts/operations/check-gpu-health.sh

logs-tts:               ## Stream IndicF5 TTS logs
	kubectl logs -n voice-ai-production -l component=indicf5-tts -f

logs-stt:               ## Stream Whisper STT logs
	kubectl logs -n voice-ai-production -l component=whisper-stt -f

logs-api:               ## Stream API Server logs
	kubectl logs -n voice-ai-production -l component=api-server -f

scale-tts:              ## Scale TTS to 3 replicas
	kubectl scale deployment indicf5-tts -n voice-ai-production --replicas=3

status:                 ## Show all pod status
	kubectl get pods -n voice-ai-production -o wide
```

## File Count Summary

| Directory | Files | Purpose |
|-----------|-------|---------|
| docker/ | ~45 | Docker images for all services |
| k8s/ | ~55 | Kubernetes manifests |
| flowise/ | ~38 | Chatflows + prompts + tools |
| n8n/ | ~10 | Workflow automations |
| dashboard/ | ~50 | React/Next.js frontend |
| knowledge-base/ | ~25 | RAG documents |
| scripts/ | ~30 | Setup + operations scripts |
| docs/ | ~20 | Architecture + API docs |
| tests/ | ~12 | Integration + E2E + load tests |
| **TOTAL** | **~285 files** | **Complete production system** |
