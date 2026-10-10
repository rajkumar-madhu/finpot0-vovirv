"""
Voice SaaS — TTS (Text-to-Speech) Service
IndicF5 (GPU primary) + Piper (CPU fallback) with multi-tenant support
"""

import io
import time
import wave
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
import structlog
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, Field
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST

from config import settings

logger = structlog.get_logger()

SYNTH_REQUESTS = Counter(
    "tts_synthesize_requests_total",
    "Total synthesis requests",
    ["status", "engine"],
)
SYNTH_DURATION = Histogram(
    "tts_synthesize_duration_seconds",
    "Synthesis processing time",
    buckets=[0.1, 0.25, 0.5, 1, 2, 5, 10, 15],
)
CHARS_PROCESSED = Counter(
    "tts_characters_processed_total",
    "Total characters synthesized",
)
MODEL_LOADED = Gauge("tts_model_loaded", "Whether TTS engine is loaded", ["engine"])

indicf5_engine = None
piper_voice = None
use_fallback_tone = False


def generate_tone_wav(text: str, sample_rate: int = 22050) -> bytes:
    duration = min(0.5 + len(text) * 0.02, 3.0)
    t = np.linspace(0, duration, int(sample_rate * duration), dtype=np.float32)
    audio = (np.sin(2 * np.pi * 440 * t) * 0.3 * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(audio.tobytes())
    return buf.getvalue()


def load_indicf5():
    global indicf5_engine
    try:
        logger.info("loading_indicf5",
            model=settings.indicf5_model,
            device=settings.indicf5_device,
        )
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        device = settings.indicf5_device
        if device == "cuda" and not torch.cuda.is_available():
            logger.warn("cuda_not_available_falling_back_to_cpu")
            device = "cpu"

        tokenizer = AutoTokenizer.from_pretrained(settings.indicf5_model, trust_remote_code=True)
        model = AutoModelForCausalLM.from_pretrained(
            settings.indicf5_model,
            torch_dtype=torch.float16 if device == "cuda" else torch.float32,
            device_map=device,
            trust_remote_code=True,
        )
        indicf5_engine = {"model": model, "tokenizer": tokenizer, "device": device}
        MODEL_LOADED.labels(engine="indicf5").set(1)
        logger.info("indicf5_loaded", device=device)
        return True
    except Exception as e:
        logger.warn("indicf5_load_failed", error=str(e))
        MODEL_LOADED.labels(engine="indicf5").set(0)
        return False


def load_piper():
    global piper_voice
    try:
        from piper import PiperVoice
        model_path = f"{settings.piper_data_dir}/{settings.piper_model}.onnx"
        config_path = f"{settings.piper_data_dir}/{settings.piper_model}.onnx.json"

        if os.path.exists(model_path):
            piper_voice = PiperVoice.load(model_path, config_path=config_path)
        else:
            from piper.download import ensure_voice_exists, find_voice, get_voices
            data_dir = [settings.piper_data_dir]
            voices = get_voices(settings.piper_data_dir, update_voices=True)
            ensure_voice_exists(settings.piper_model, data_dir, data_dir[0], voices)
            model_path, config_path = find_voice(settings.piper_model, data_dir)
            piper_voice = PiperVoice.load(str(model_path), config_path=str(config_path))

        MODEL_LOADED.labels(engine="piper").set(1)
        logger.info("piper_loaded", model=settings.piper_model)
        return True
    except Exception as e:
        logger.warn("piper_load_failed", error=str(e))
        MODEL_LOADED.labels(engine="piper").set(0)
        return False


# Defensive fallback: accept ISO 639-1 two-letter codes from callers other than the orchestrator
_ISO2_TO_3: dict[str, str] = {
    "en": "ENG", "ta": "TAM", "hi": "HIN", "te": "TEL",
    "kn": "KAN", "ml": "MAL", "bn": "BEN", "gu": "GUJ",
    "mr": "MAR", "pa": "PUN", "or": "ORI",
}


def get_prompt_wav(language: str) -> str | None:
    """Return path to the first matching prompt WAV for the given language.

    Files are named {LANG}_{GENDER}_{EMOTION}_{ID}.wav (e.g. TAM_F_HAPPY_00001.wav).
    Accepts both three-letter IndicF5 codes ("tam") and two-letter ISO codes ("ta").
    """
    prompts_dir = Path(settings.indicf5_prompts_dir)
    if not prompts_dir.exists():
        return None

    lang = (language or "eng").lower().split("-")[0]  # strip region suffix

    # Normalise to uppercase 3-letter code
    if len(lang) == 2:
        lang_upper = _ISO2_TO_3.get(lang, lang.upper())
    else:
        lang_upper = lang.upper()[:3]

    # Pattern matches {LANG}_*.wav at the start of the filename
    # e.g. TAM_F_HAPPY_00001.wav, ENG_M_NEUTRAL_00001.wav
    matches = list(prompts_dir.glob(f"{lang_upper}_*.wav"))
    return str(matches[0]) if matches else None


def synthesize_indicf5(text: str, language: str = "eng") -> bytes:
    model = indicf5_engine["model"]
    tokenizer = indicf5_engine["tokenizer"]
    device = indicf5_engine["device"]

    prompt_path = get_prompt_wav(language)
    if prompt_path:
        import soundfile as sf
        prompt_audio, prompt_sr = sf.read(prompt_path)
    else:
        prompt_audio, prompt_sr = None, None

    inputs = tokenizer(text, return_tensors="pt").to(device)

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=settings.indicf5_max_audio_length * 50,
            do_sample=True,
            temperature=0.7,
        )

    audio_array = outputs[0].cpu().numpy()
    buf = io.BytesIO()
    import soundfile as sf
    sf.write(buf, audio_array, 24000, format="WAV")
    return buf.getvalue()


def synthesize_piper(text: str, speed: float, speaker_id: int | None) -> bytes:
    audio_buffer = io.BytesIO()
    with wave.open(audio_buffer, "wb") as wav_file:
        piper_voice.synthesize(
            text,
            wav_file,
            speaker_id=speaker_id or settings.default_speaker_id,
            length_scale=1.0 / speed,
        )
    audio_buffer.seek(0)
    return audio_buffer.read()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global use_fallback_tone
    indicf5_ok = False
    piper_ok = False

    if settings.indicf5_enabled:
        indicf5_ok = load_indicf5()

    if not indicf5_ok:
        piper_ok = load_piper()

    if not indicf5_ok and not piper_ok:
        use_fallback_tone = True
        MODEL_LOADED.labels(engine="tone").set(1)
        logger.warn("no_tts_engine_available_using_tone_fallback")

    yield

    global indicf5_engine, piper_voice
    indicf5_engine = None
    piper_voice = None
    MODEL_LOADED.labels(engine="indicf5").set(0)
    MODEL_LOADED.labels(engine="piper").set(0)
    logger.info("tts_service_shutdown")


app = FastAPI(
    title="Voice SaaS — TTS Service",
    version="2.0.0",
    lifespan=lifespan,
)


class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    speaker_id: int | None = None
    speed: float = Field(1.0, ge=0.25, le=4.0)
    language: str = Field("eng", description="ISO 639-1 or 3-letter language code")


class HealthResponse(BaseModel):
    status: str
    engine: str
    indicf5_loaded: bool
    piper_loaded: bool
    model_name: str
    version: str = "2.0.0"


@app.get("/health", response_model=HealthResponse)
async def health():
    engine = "indicf5" if indicf5_engine is not None else "piper" if piper_voice is not None else "tone"
    loaded = indicf5_engine is not None or piper_voice is not None or use_fallback_tone
    return HealthResponse(
        status="healthy" if loaded else "degraded",
        engine=engine,
        indicf5_loaded=indicf5_engine is not None,
        piper_loaded=piper_voice is not None,
        model_name=settings.indicf5_model if indicf5_engine else settings.piper_model if piper_voice else "tone-fallback",
    )


@app.get("/metrics")
async def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/synthesize")
async def synthesize(
    request: SynthesizeRequest,
    x_tenant_id: str | None = Header(None, alias="X-Tenant-ID"),
    x_request_id: str | None = Header(None, alias="X-Request-ID"),
):
    if indicf5_engine is None and piper_voice is None and not use_fallback_tone:
        raise HTTPException(status_code=503, detail="TTS engine not loaded")

    log = logger.bind(
        tenant_id=x_tenant_id,
        request_id=x_request_id,
        text_length=len(request.text),
        language=request.language,
    )

    log.info("synthesize_start")
    start_time = time.time()

    try:
        if use_fallback_tone:
            audio_bytes = generate_tone_wav(request.text)
            engine_used = "tone"
        elif indicf5_engine is not None:
            audio_bytes = synthesize_indicf5(request.text, request.language)
            engine_used = "indicf5"
        else:
            audio_bytes = synthesize_piper(request.text, request.speed, request.speaker_id)
            engine_used = "piper"

        processing_time = round(time.time() - start_time, 3)

        SYNTH_REQUESTS.labels(status="success", engine=engine_used).inc()
        SYNTH_DURATION.observe(processing_time)
        CHARS_PROCESSED.inc(len(request.text))

        log.info(
            "synthesize_complete",
            processing_time=processing_time,
            audio_size=len(audio_bytes),
            engine=engine_used,
        )

        return StreamingResponse(
            io.BytesIO(audio_bytes),
            media_type="audio/wav",
            headers={
                "X-Processing-Time": str(processing_time),
                "X-Audio-Size": str(len(audio_bytes)),
                "X-TTS-Engine": engine_used,
                "Content-Disposition": "attachment; filename=speech.wav",
            },
        )

    except Exception as e:
        processing_time = round(time.time() - start_time, 3)
        SYNTH_REQUESTS.labels(status="error", engine="unknown").inc()
        log.error("synthesize_failed", error=str(e), processing_time=processing_time)
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {str(e)}")


@app.get("/voices")
async def list_voices():
    voices = []
    if indicf5_engine is not None:
        voices.append({
            "id": "indicf5",
            "name": "IndicF5 (GPU)",
            "engine": "indicf5",
            "languages": ["eng", "hin", "tam", "tel", "kan", "mal", "ben", "guj", "mar", "pun", "ori"],
            "active": True,
        })
    if piper_voice is not None:
        voices.append({
            "id": settings.piper_model,
            "name": settings.piper_model,
            "engine": "piper",
            "active": True,
        })
    if use_fallback_tone or (not voices):
        voices.append({
            "id": "tone",
            "name": "Tone Fallback",
            "engine": "tone",
            "active": True,
        })
    return {"voices": voices}


@app.get("/voices/prompts")
async def list_prompts():
    prompts_dir = Path(settings.indicf5_prompts_dir)
    if not prompts_dir.exists():
        return {"prompts": []}
    prompts = []
    for f in sorted(prompts_dir.glob("*.wav")):
        parts = f.stem.split("_")
        prompts.append({
            "file": f.name,
            "language": parts[0] if len(parts) > 0 else "unknown",
            "gender": parts[1] if len(parts) > 1 else "unknown",
        })
    return {"prompts": prompts}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.environment == "development",
        log_level=settings.log_level.lower(),
    )
