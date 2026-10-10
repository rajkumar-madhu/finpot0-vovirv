FROM python:3.10-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gcc build-essential && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --user torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir --user -r requirements.txt

FROM python:3.10-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends && rm -rf /var/lib/apt/lists/* && \
    addgroup --system --gid 1001 app && adduser --system --uid 1001 app
COPY --from=builder /root/.local /usr/local
COPY . .
RUN chown -R app:app /app
USER app
EXPOSE 8003
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8003/health')" || exit 1
ENV RAG_ENVIRONMENT=production
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8003"]
