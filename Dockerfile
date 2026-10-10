# Multi-stage Dockerfile for LinkedEye Voice Agent SaaS Platform
# Builds all services (Node.js + Python) into a single image

# ==============================================================================
# Stage 1: Node.js Builder - Build all TypeScript services
# ==============================================================================
FROM node:20-alpine AS node-builder

WORKDIR /build

# Build auth service
COPY services/auth/package*.json ./auth/
RUN cd auth && npm ci
COPY services/auth/ ./auth/
RUN cd auth && npm run build

# Build api-gateway service
COPY services/api-gateway/package*.json ./api-gateway/
RUN cd api-gateway && npm ci
COPY services/api-gateway/ ./api-gateway/
RUN cd api-gateway && npm run build

# Build orchestrator service
COPY services/orchestrator/package*.json ./orchestrator/
RUN cd orchestrator && npm ci
COPY services/orchestrator/ ./orchestrator/
RUN cd orchestrator && npm run build

# Build email service
COPY services/email/package*.json ./email/
RUN cd email && npm ci
COPY services/email/ ./email/
RUN cd email && npm run build

# Build webvoice service
COPY services/webvoice/package*.json ./webvoice/
RUN cd webvoice && npm ci
COPY services/webvoice/ ./webvoice/
RUN cd webvoice && npm run build

# ==============================================================================
# Stage 2: Node.js Production Dependencies
# ==============================================================================
FROM node:20-alpine AS node-deps

WORKDIR /deps

# Install production dependencies for each service
COPY services/auth/package*.json ./auth/
RUN cd auth && npm ci --only=production

COPY services/api-gateway/package*.json ./api-gateway/
RUN cd api-gateway && npm ci --only=production

COPY services/orchestrator/package*.json ./orchestrator/
RUN cd orchestrator && npm ci --only=production

COPY services/email/package*.json ./email/
RUN cd email && npm ci --only=production

COPY services/webvoice/package*.json ./webvoice/
RUN cd webvoice && npm ci --only=production

# ==============================================================================
# Stage 3: Final Production Image
# ==============================================================================
FROM ubuntu:22.04 AS production

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    gnupg \
    ca-certificates \
    supervisor \
    python3.10 \
    python3-pip \
    python3.10-venv \
    python3.10-dev \
    ffmpeg \
    libsndfile1 \
    pkg-config \
    libavformat-dev \
    libavcodec-dev \
    libavdevice-dev \
    libavutil-dev \
    libswscale-dev \
    libswresample-dev \
    libavfilter-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN useradd -m -u 1000 -s /bin/bash appuser

# Create directories
RUN mkdir -p /app/services /var/log/supervisor /var/run/supervisor \
    && chown -R appuser:appuser /app /var/log/supervisor /var/run/supervisor

WORKDIR /app

# ==============================================================================
# Copy Node.js services
# ==============================================================================
# Auth service
COPY --from=node-builder /build/auth/dist /app/services/auth/dist
COPY --from=node-deps /deps/auth/node_modules /app/services/auth/node_modules
COPY services/auth/package.json /app/services/auth/

# API Gateway service
COPY --from=node-builder /build/api-gateway/dist /app/services/api-gateway/dist
COPY --from=node-deps /deps/api-gateway/node_modules /app/services/api-gateway/node_modules
COPY services/api-gateway/package.json /app/services/api-gateway/

# Orchestrator service
COPY --from=node-builder /build/orchestrator/dist /app/services/orchestrator/dist
COPY --from=node-deps /deps/orchestrator/node_modules /app/services/orchestrator/node_modules
COPY services/orchestrator/package.json /app/services/orchestrator/

# Email service
COPY --from=node-builder /build/email/dist /app/services/email/dist
COPY --from=node-deps /deps/email/node_modules /app/services/email/node_modules
COPY services/email/package.json /app/services/email/

# Webvoice service
COPY --from=node-builder /build/webvoice/dist /app/services/webvoice/dist
COPY --from=node-deps /deps/webvoice/node_modules /app/services/webvoice/node_modules
COPY services/webvoice/package.json /app/services/webvoice/

# ==============================================================================
# Copy Python services and install dependencies
# ==============================================================================
COPY services/stt /app/services/stt
COPY services/tts /app/services/tts
COPY services/rag /app/services/rag

RUN pip3 install --no-cache-dir \
    -r /app/services/stt/requirements.txt \
    -r /app/services/tts/requirements.txt \
    -r /app/services/rag/requirements.txt

# ==============================================================================
# Copy supervisord configuration
# ==============================================================================
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Set ownership
RUN chown -R appuser:appuser /app

# ==============================================================================
# Environment Variables
# ==============================================================================
ENV NODE_ENV=production \
    # Node.js service ports
    AUTH_PORT=4001 \
    API_GATEWAY_PORT=4000 \
    ORCHESTRATOR_PORT=4002 \
    EMAIL_PORT=4003 \
    WEBVOICE_PORT=4004 \
    # Python service ports
    STT_PORT=8001 \
    TTS_PORT=8002 \
    RAG_PORT=8003 \
    # Python settings
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # Default to CPU (set to cuda for GPU)
    STT_WHISPER_DEVICE=cpu \
    TTS_INDICF5_DEVICE=cpu

# Expose all service ports
EXPOSE 4000 4001 4002 4003 4004 8001 8002 8003

# Health check (API Gateway as primary)
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:4000/health || exit 1

# Start supervisord
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
