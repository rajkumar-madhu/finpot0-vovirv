FROM python:3.10-slim

WORKDIR /app

# System deps for audio processing
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV STT_HOST=0.0.0.0
ENV STT_PORT=8001

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=15s --start-period=120s --retries=3 \
    CMD python3 -c "import httpx; httpx.get('http://localhost:8001/health').raise_for_status()"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
