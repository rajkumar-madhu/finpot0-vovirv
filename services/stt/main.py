"""
Voice SaaS — STT (Speech-to-Text) Service
Faster Whisper based transcription with multi-tenant support
"""

import io
import time
import tempfile
from contextlib import asynccontextmanager

import numpy as np
import structlog
from fastapi import FastAPI, UploadFile, File, Header, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response

from config import settings

logger = structlog.get_logger()

# ── Metrics ──────────────────────────────────────────────────────────────
TRANSCRIBE_REQUESTS = Counter(
    "stt_transcribe_requests_total",
    "Total transcription requests",
    ["status", "language"],
)
TRANSCRIBE_DURATION = Histogram(
    "stt_transcribe_duration_seconds",
    "Transcription processing time",
    buckets=[0.5, 1, 2, 5, 10, 20, 30, 60],
)
AUDIO_DURATION_PROCESSED = Counter(
    "stt_audio_seconds_processed_total",
    "Total audio seconds processed",
)
MODEL_LOADED = Gauge("stt_model_loaded", "Whether the Whisper model is loaded")

# ── Global model handle ──────────────────────────────────────────────────
whisper_model = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model on startup, cleanup on shutdown."""
    global whisper_model
    logger.info(
        "loading_whisper_model",
        model=settings.whisper_model,
        device=settings.whisper_device,
        compute_type=settings.whisper_compute_type,
    )
    try:
        from faster_whisper import WhisperModel

        whisper_model = WhisperModel(
            settings.whisper_model,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute_type,
        )
        MODEL_LOADED.set(1)
        logger.info("whisper_model_loaded")
    except Exception as e:
        logger.error("whisper_model_load_failed", error=str(e))
        MODEL_LOADED.set(0)

    yield

    whisper_model = None
    MODEL_LOADED.set(0)
    logger.info("stt_service_shutdown")


app = FastAPI(
    title="Voice SaaS — STT Service",
    version="1.0.0",
    lifespan=lifespan,
)


# ── Response Models ──────────────────────────────────────────────────────
class Segment(BaseModel):
    start: float
    end: float
    text: str
    confidence: float


class TranscribeResponse(BaseModel):
    text: str
    language: str
    language_probability: float
    duration: float
    segments: list[Segment]
    processing_time: float


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_name: str
    device: str
    version: str = "1.0.0"


# ── Endpoints ────────────────────────────────────────────────────────────
@app.get("/health", response_model=HealthResponse)
async def health():
    loaded = whisper_model is not None
    return HealthResponse(
        status="healthy" if loaded else "degraded",
        model_loaded=loaded,
        model_name=settings.whisper_model,
        device=settings.whisper_device,
    )


@app.get("/metrics")
async def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(
    file: UploadFile = File(..., description="Audio file (wav, mp3, ogg, webm, flac)"),
    language: str | None = Query(None, description="ISO 639-1 language code (auto-detect if omitted)"),
    x_tenant_id: str | None = Header(None, alias="X-Tenant-ID"),
    x_request_id: str | None = Header(None, alias="X-Request-ID"),
):
    if whisper_model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    log = logger.bind(
        tenant_id=x_tenant_id,
        request_id=x_request_id,
        filename=file.filename,
        content_type=file.content_type,
    )

    # Validate file type
    allowed_types = {
        "audio/wav", "audio/wave", "audio/x-wav",
        "audio/mpeg", "audio/mp3",
        "audio/ogg", "audio/webm",
        "audio/flac", "audio/x-flac",
        "application/octet-stream",  # fallback for unknown types
    }
    if file.content_type and file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Unsupported audio type: {file.content_type}")

    # Read audio data
    audio_bytes = await file.read()
    if len(audio_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty audio file")

    if len(audio_bytes) > 50 * 1024 * 1024:  # 50MB limit
        raise HTTPException(status_code=413, detail="Audio file too large (max 50MB)")

    log.info("transcribe_start", audio_size=len(audio_bytes))

    start_time = time.time()

    try:
        # Write to temp file (faster-whisper needs file path or numpy array)
        with tempfile.NamedTemporaryFile(suffix=".audio", delete=True) as tmp:
            tmp.write(audio_bytes)
            tmp.flush()

            transcribe_kwargs = {
                "beam_size": 5,
                "vad_filter": True,
                "vad_parameters": {"min_silence_duration_ms": 500},
            }
            if language:
                transcribe_kwargs["language"] = language

            segments_gen, info = whisper_model.transcribe(tmp.name, **transcribe_kwargs)

            segments = []
            full_text_parts = []
            for seg in segments_gen:
                segments.append(Segment(
                    start=round(seg.start, 3),
                    end=round(seg.end, 3),
                    text=seg.text.strip(),
                    confidence=round(seg.avg_log_prob, 4),
                ))
                full_text_parts.append(seg.text.strip())

        processing_time = round(time.time() - start_time, 3)
        full_text = " ".join(full_text_parts)
        detected_lang = info.language or "unknown"
        audio_duration = round(info.duration, 3)

        # Update metrics
        TRANSCRIBE_REQUESTS.labels(status="success", language=detected_lang).inc()
        TRANSCRIBE_DURATION.observe(processing_time)
        AUDIO_DURATION_PROCESSED.inc(audio_duration)

        log.info(
            "transcribe_complete",
            language=detected_lang,
            audio_duration=audio_duration,
            processing_time=processing_time,
            segments_count=len(segments),
        )

        return TranscribeResponse(
            text=full_text,
            language=detected_lang,
            language_probability=round(info.language_probability or 0.0, 4),
            duration=audio_duration,
            segments=segments,
            processing_time=processing_time,
        )

    except Exception as e:
        processing_time = round(time.time() - start_time, 3)
        TRANSCRIBE_REQUESTS.labels(status="error", language="unknown").inc()
        log.error("transcribe_failed", error=str(e), processing_time=processing_time)
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.environment == "development",
        log_level=settings.log_level.lower(),
    )
