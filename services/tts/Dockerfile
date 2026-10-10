FROM python:3.10-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gcc build-essential && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir --user torch --index-url https://download.pytorch.org/whl/cpu || true && \
    pip install --no-cache-dir --user -r requirements.txt || \
    pip install --no-cache-dir --user fastapi uvicorn pydantic pydantic-settings structlog prometheus-client httpx numpy

FROM python:3.10-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libsndfile1 && rm -rf /var/lib/apt/lists/* && \
    addgroup --system --gid 1001 app && adduser --system --uid 1001 app
COPY --from=builder /root/.local /usr/local
COPY . .
RUN mkdir -p /app/models /app/prompts && chown -R app:app /app
USER app
EXPOSE 8002
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python3 -c "import httpx; httpx.get('http://localhost:8002/health').raise_for_status()"
ENV TTS_ENVIRONMENT=production
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002"]
