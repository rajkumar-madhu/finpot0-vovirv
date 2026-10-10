# LinkedEye Voice Agent SaaS - Complete Product Vision

## Executive Summary

**LinkedEye Voice Agent** is an enterprise-grade, AI-powered omnichannel communication platform that enables businesses to deploy intelligent voice agents across phone, web, email, and messaging channels - all from a single unified platform.

---

## Product Differentiators

### 1. True Omnichannel Experience
- **Phone Calls** (SIP/PSTN) - Inbound/outbound AI voice calls
- **Web Voice** - Embeddable voice widget for websites
- **Email** - AI-powered email responses with ticket management
- **SMS/WhatsApp** - Text-based AI conversations
- **Chat Widget** - Real-time web chat

### 2. No-Code Agent Builder
- Visual flow builder for conversation design
- Drag-and-drop intent configuration
- Pre-built templates for common use cases
- A/B testing for conversation flows

### 3. Enterprise-Ready
- Multi-tenant architecture with data isolation
- SOC 2 / GDPR / HIPAA compliance ready
- On-premise deployment option
- Custom voice cloning for brand consistency

---

## Complete Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CUSTOMER TOUCHPOINTS                                   │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────────────────────┤
│   Phone     │  Web Voice  │   Email     │   SMS       │   Chat Widget           │
│  (SIP/PSTN) │  (WebRTC)   │ (IMAP/SMTP) │ (Twilio)    │   (WebSocket)           │
└──────┬──────┴──────┬──────┴──────┬──────┴──────┬──────┴──────────┬──────────────┘
       │             │             │             │                  │
       └─────────────┴─────────────┴─────────────┴──────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │        API GATEWAY            │
                    │    (Load Balancing, Auth,     │
                    │     Rate Limiting, Routing)   │
                    └───────────────┬───────────────┘
                                    │
       ┌────────────────────────────┼────────────────────────────┐
       │                            │                            │
┌──────┴──────┐            ┌────────┴────────┐          ┌────────┴────────┐
│   CHANNEL   │            │   CONVERSATION  │          │    KNOWLEDGE    │
│   SERVICES  │            │     ENGINE      │          │     LAYER       │
├─────────────┤            ├─────────────────┤          ├─────────────────┤
│ • Phone Svc │            │ • Orchestrator  │          │ • RAG Service   │
│ • WebVoice  │◄──────────►│ • Dialog Mgmt   │◄────────►│ • Vector DB     │
│ • Email Svc │            │ • Context Mgmt  │          │ • Doc Ingestion │
│ • SMS Svc   │            │ • LLM Gateway   │          │ • Web Scraping  │
│ • Chat Svc  │            │ • Intent Router │          │ • API Connectors│
└─────────────┘            └─────────────────┘          └─────────────────┘
       │                            │                            │
       │                   ┌────────┴────────┐                   │
       │                   │   AI SERVICES   │                   │
       │                   ├─────────────────┤                   │
       │                   │ • STT (Whisper) │                   │
       │                   │ • TTS (IndicF5) │                   │
       │                   │ • NLU/Intent    │                   │
       │                   │ • Sentiment     │                   │
       │                   │ • Translation   │                   │
       │                   │ • Voice Clone   │                   │
       │                   └─────────────────┘                   │
       │                            │                            │
       └────────────────────────────┼────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │      BUSINESS LAYER           │
                    ├───────────────────────────────┤
                    │ • Ticket Management           │
                    │ • CRM Integration             │
                    │ • Appointment Booking         │
                    │ • Payment Processing          │
                    │ • Workflow Automation         │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │      PLATFORM SERVICES        │
                    ├───────────────────────────────┤
                    │ • Auth & Multi-tenancy        │
                    │ • Usage Metering & Billing    │
                    │ • Analytics & Reporting       │
                    │ • Audit Logging               │
                    │ • Webhook Management          │
                    └───────────────────────────────┘
```

---

## Service Portfolio

### Current Services (Implemented)
| Service | Port | Status | Description |
|---------|------|--------|-------------|
| API Gateway | 4000 | ✅ | Entry point, routing, auth |
| Auth Service | 4001 | ✅ | Multi-tenant auth, API keys |
| Orchestrator | 4002 | ✅ | Voice pipeline coordination |
| Email Service | 4003 | ✅ | IMAP/SMTP + Ticketing |
| STT Service | 8001 | ✅ | Whisper-based transcription |
| TTS Service | 8002 | ✅ | IndicF5 + Piper synthesis |
| RAG Service | 8003 | ✅ | Knowledge retrieval |

### New Services (To Build)
| Service | Port | Priority | Description |
|---------|------|----------|-------------|
| **Web Voice** | 4004 | HIGH | WebRTC-based browser voice |
| **Phone Service** | 4005 | HIGH | SIP/Twilio phone integration |
| **Analytics** | 4006 | MEDIUM | Call analytics, dashboards |
| **Billing** | 4007 | MEDIUM | Usage metering, Stripe |
| **Agent Builder** | 4008 | MEDIUM | No-code flow designer |
| **SMS Service** | 4009 | LOW | Twilio SMS integration |
| **Chat Service** | 4010 | LOW | Real-time chat widget |
| **Webhook Service** | 4011 | LOW | Event delivery system |

---

## Web Voice Service (Port 4004) - Detailed Design

### Overview
Browser-based voice interaction using WebRTC for real-time audio streaming.

### Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                      BROWSER CLIENT                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Web Voice Widget (React)                │    │
│  │  • Microphone capture (MediaRecorder API)           │    │
│  │  • Audio playback (Web Audio API)                   │    │
│  │  • WebSocket connection management                  │    │
│  │  • Visual feedback (waveform, speaking indicator)   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                    WebSocket │ (wss://)
                              │
┌─────────────────────────────────────────────────────────────┐
│                    WEB VOICE SERVICE (4004)                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  WebSocket Server (Socket.IO / ws)                   │    │
│  │  • Session management                               │    │
│  │  • Audio stream handling                            │    │
│  │  • Real-time bidirectional communication            │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Conversation Manager                                │    │
│  │  • Turn-taking detection (VAD)                      │    │
│  │  • Context window management                        │    │
│  │  • Response queuing                                 │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
         ┌────┴────┐    ┌─────┴─────┐   ┌─────┴─────┐
         │   STT   │    │Orchestrator│   │    TTS    │
         │ (8001)  │    │  (4002)    │   │  (8002)   │
         └─────────┘    └───────────┘   └───────────┘
```

### Widget Features
1. **Embeddable Script** - One-line integration
2. **Customizable UI** - Brand colors, position, avatar
3. **Multi-language** - Auto language detection
4. **Accessibility** - Screen reader support
5. **Mobile Responsive** - Touch-friendly interface
6. **Offline Mode** - Graceful degradation

### WebSocket Events
```typescript
// Client → Server
'audio:start'      // Begin voice session
'audio:chunk'      // Send audio data (16kHz PCM)
'audio:end'        // User stopped speaking
'text:input'       // Optional text fallback
'session:end'      // End conversation

// Server → Client
'audio:response'   // TTS audio chunk
'text:transcript'  // Real-time transcription
'text:response'    // AI text response
'state:thinking'   // AI is processing
'state:speaking'   // AI is responding
'session:timeout'  // Session expired
'error'            // Error occurred
```

### Directory Structure
```
services/webvoice/
├── src/
│   ├── index.ts                 # Express + Socket.IO server
│   ├── config.ts                # Configuration
│   ├── websocket/
│   │   ├── socketHandler.ts     # WebSocket event handling
│   │   ├── sessionManager.ts    # Session state management
│   │   └── audioProcessor.ts    # Audio stream processing
│   ├── services/
│   │   ├── vadService.ts        # Voice Activity Detection
│   │   ├── conversationService.ts # Dialog management
│   │   └── streamingService.ts  # Real-time audio streaming
│   ├── middleware/
│   │   ├── auth.ts              # Widget authentication
│   │   └── rateLimiter.ts       # Connection limits
│   └── routes/
│       ├── health.ts            # Health checks
│       └── widget.ts            # Widget configuration API
├── widget/                      # Client-side widget
│   ├── src/
│   │   ├── VoiceWidget.tsx      # React component
│   │   ├── useVoiceSession.ts   # WebSocket hook
│   │   ├── AudioCapture.ts      # Microphone handling
│   │   └── AudioPlayback.ts     # Speaker output
│   ├── package.json
│   └── rollup.config.js         # Bundle config
├── package.json
├── Dockerfile
└── .env.example
```

---

## Phone Service (Port 4005) - Detailed Design

### Supported Providers
- **Twilio** - Primary (easiest integration)
- **Vonage** - Alternative
- **Plivo** - Cost-effective option
- **Custom SIP** - On-premise PBX

### Features
1. **Inbound Calls** - AI answers customer calls
2. **Outbound Calls** - AI initiates calls (reminders, surveys)
3. **Call Transfer** - Handoff to human agents
4. **Call Recording** - Compliance & training
5. **DTMF Support** - Keypad input handling
6. **Conference Calls** - Multi-party with AI
7. **Callback Scheduling** - When agents unavailable

### Call Flow
```
Incoming Call → Twilio Webhook → Phone Service → Orchestrator → AI Response
                     │                               │
                     │                               ▼
                     │                          STT + LLM + TTS
                     │                               │
                     ◄───────── Audio Stream ────────┘
```

---

## Analytics Service (Port 4006)

### Dashboards
1. **Call Volume** - Calls per hour/day/week
2. **Resolution Rate** - % resolved by AI vs human
3. **Average Handle Time** - Call duration metrics
4. **Customer Satisfaction** - Post-call surveys
5. **Intent Distribution** - What customers ask about
6. **Sentiment Trends** - Emotional analysis over time

### Data Pipeline
```
Events → Kafka/Redis Streams → Analytics Worker → ClickHouse → Grafana
```

---

## Billing Service (Port 4007)

### Pricing Model
| Feature | Free | Pro | Enterprise |
|---------|------|-----|------------|
| Voice Minutes | 100/mo | 5,000/mo | Unlimited |
| Web Voice Sessions | 500/mo | 10,000/mo | Unlimited |
| Email Tickets | 50/mo | 1,000/mo | Unlimited |
| Knowledge Docs | 10 | 100 | Unlimited |
| Custom Voice | ❌ | ✅ | ✅ |
| SLA | ❌ | 99.5% | 99.99% |
| Support | Community | Email | Dedicated |

### Metering Events
```typescript
type UsageEvent = {
  tenant_id: string;
  event_type: 'voice_minute' | 'webvoice_session' | 'stt_second' | 'tts_character' | 'llm_token';
  quantity: number;
  metadata: Record<string, any>;
  timestamp: Date;
};
```

---

## Agent Builder Service (Port 4008)

### No-Code Flow Designer
```
┌─────────────────────────────────────────────────────────────┐
│                    AGENT BUILDER UI                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  [Greeting] ─────► [Intent Detection] ───► [Route]  │    │
│  │       │                    │                   │     │    │
│  │       ▼                    ▼                   ▼     │    │
│  │  "Welcome to..."     ┌─────────────┐     [FAQ]      │    │
│  │                      │ • Billing   │     [Support]   │    │
│  │                      │ • Support   │     [Sales]     │    │
│  │                      │ • Sales     │     [Handoff]   │    │
│  │                      │ • Other     │                 │    │
│  │                      └─────────────┘                 │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  [Node Palette]  [Properties]  [Test]  [Deploy]  [Analytics]│
└─────────────────────────────────────────────────────────────┘
```

### Pre-built Templates
1. **Customer Support** - FAQ + Ticket creation
2. **Appointment Booking** - Calendar integration
3. **Order Status** - Track shipments
4. **Lead Qualification** - Sales screening
5. **Survey Collection** - Feedback gathering
6. **Payment Reminder** - Outbound collection

---

## Innovative Features

### 1. Voice Biometrics
- Speaker identification during calls
- Fraud detection for financial services
- VIP customer recognition

### 2. Real-time Translation
- Customer speaks Hindi → AI responds in Hindi
- Support agent sees English transcript
- Break language barriers

### 3. Sentiment-Aware Responses
```typescript
if (sentiment === 'frustrated') {
  tone = 'empathetic';
  escalationPriority = 'high';
  offerCallback = true;
}
```

### 4. Proactive Outreach
- AI calls customers for appointment reminders
- Follow-up on abandoned carts
- Payment due notifications
- Survey collection

### 5. Context Handoff
When transferring to human:
- Full conversation transcript
- Detected intent & sentiment
- Customer profile from CRM
- Suggested resolution

### 6. Knowledge Auto-Sync
- Crawl company website daily
- Ingest new documents automatically
- Alert on conflicting information
- Version knowledge bases

---

## Implementation Roadmap

### Phase 1: Core Voice (Weeks 1-4)
- [x] Auth Service
- [x] STT/TTS Services
- [x] Orchestrator
- [x] Email Service
- [ ] Web Voice Service ← **NEXT**
- [ ] Phone Service

### Phase 2: Intelligence (Weeks 5-8)
- [ ] Intent Classification
- [ ] Sentiment Analysis
- [ ] Entity Extraction
- [ ] Dialog Management
- [ ] Context Memory

### Phase 3: Business (Weeks 9-12)
- [ ] Analytics Dashboard
- [ ] Billing & Metering
- [ ] CRM Integrations
- [ ] Webhook System

### Phase 4: Scale (Weeks 13-16)
- [ ] Agent Builder UI
- [ ] Voice Cloning
- [ ] Multi-language
- [ ] Enterprise Features

---

## Technology Decisions

### Real-time Communication
- **WebSocket**: Socket.IO for browser ↔ server
- **WebRTC**: For peer-to-peer audio (future)
- **SIP**: Twilio/Vonage for phone calls

### Audio Processing
- **Format**: 16kHz PCM for STT, 24kHz for TTS
- **Codec**: Opus for web, PCMU for phone
- **VAD**: Silero VAD for turn detection

### LLM Strategy
- **Claude Haiku**: Fast responses (< 500ms)
- **Claude Sonnet**: Complex reasoning
- **Local Ollama**: Fallback / cost optimization

### Database
- **PostgreSQL**: Transactional data
- **Redis**: Sessions, caching, queues
- **ClickHouse**: Analytics (future)
- **pgvector**: RAG embeddings

---

## Success Metrics

| KPI | Target | Current |
|-----|--------|---------|
| Response Latency | < 800ms | - |
| AI Resolution Rate | > 70% | - |
| Customer Satisfaction | > 4.2/5 | - |
| Uptime | 99.9% | - |
| Concurrent Sessions | 10,000+ | - |

---

## Competitive Positioning

| Feature | LinkedEye | Competitor A | Competitor B |
|---------|-----------|--------------|--------------|
| Multi-channel | ✅ | Phone only | Chat only |
| Self-hosted | ✅ | ❌ | ❌ |
| Indian Languages | ✅ | Limited | ❌ |
| Custom Voice | ✅ | ❌ | ✅ |
| No-code Builder | ✅ | ✅ | ❌ |
| Pricing | $0.02/min | $0.05/min | $0.08/min |

---

## Next Steps

1. **Implement Web Voice Service** - Browser-based voice interaction
2. **Build Widget SDK** - Embeddable React component
3. **Add Phone Integration** - Twilio connector
4. **Create Analytics Dashboard** - Real-time metrics
5. **Launch Beta Program** - Early adopter feedback
