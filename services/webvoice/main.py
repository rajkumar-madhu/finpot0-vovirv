"""
Voice SaaS — Web Voice Client
Browser-based voice chat with WebSocket audio streaming
Routes audio through the orchestrator for full STT→RAG→LLM→TTS pipeline
"""

import io
import time
import json
import uuid
import base64
from contextlib import asynccontextmanager

import httpx
import structlog
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, Response
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

from config import settings

logger = structlog.get_logger()

WS_CONNECTIONS = Counter("webvoice_ws_connections_total", "Total WebSocket connections")
WS_MESSAGES = Counter("webvoice_ws_messages_total", "Total WebSocket messages", ["direction"])
VOICE_SESSIONS = Counter("webvoice_sessions_total", "Total voice sessions", ["status"])
ROUND_TRIP_DURATION = Histogram(
    "webvoice_round_trip_seconds",
    "Full voice round trip via orchestrator",
    buckets=[1, 2, 5, 10, 20, 30],
)

http_client: httpx.AsyncClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global http_client
    http_client = httpx.AsyncClient(timeout=60.0)
    logger.info("webvoice_service_started", port=settings.port)
    yield
    await http_client.aclose()
    logger.info("webvoice_service_shutdown")


app = FastAPI(title="Voice SaaS — Web Voice Client", version="2.0.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/health")
async def health():
    return {"status": "healthy", "version": "2.0.0"}


@app.get("/metrics")
async def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/", response_class=HTMLResponse)
async def index():
    with open("static/index.html") as f:
        return HTMLResponse(content=f.read())


@app.websocket("/ws/voice")
async def voice_websocket(ws: WebSocket):
    await ws.accept()
    session_id = str(uuid.uuid4())[:8]
    WS_CONNECTIONS.inc()
    log = logger.bind(session_id=session_id)
    log.info("ws_connected")

    try:
        while True:
            audio_data = await ws.receive_bytes()
            WS_MESSAGES.labels(direction="in").inc()
            start_time = time.time()

            log.info("audio_received", size=len(audio_data))

            await ws.send_json({"type": "status", "message": "Processing..."})

            try:
                audio_base64 = base64.b64encode(audio_data).decode("utf-8")
                mime_type = "audio/webm"

                payload = {
                    "audioBase64": audio_base64,
                    "mimeType": mime_type,
                    "useRag": True,
                    "model": "haiku",
                }

                resp = await http_client.post(
                    f"{settings.orchestrator_url}/v1/voice/chat",
                    json=payload,
                    headers={
                        "X-Tenant-ID": "web-client",
                        "X-Request-ID": session_id,
                        "Content-Type": "application/json",
                    },
                )
                resp.raise_for_status()
                result = resp.json()

            except Exception as e:
                log.error("orchestrator_failed", error=str(e))
                await ws.send_json({"type": "error", "message": "Voice processing failed"})
                VOICE_SESSIONS.labels(status="orchestrator_error").inc()
                continue

            round_trip = round(time.time() - start_time, 3)
            ROUND_TRIP_DURATION.observe(round_trip)
            VOICE_SESSIONS.labels(status="success").inc()

            await ws.send_json({
                "type": "transcript",
                "text": result.get("transcript", ""),
                "language": result.get("language", ""),
            })

            await ws.send_json({
                "type": "reply",
                "text": result.get("replyText", ""),
                "round_trip": round_trip,
                "stages": result.get("stages", {}),
            })

            reply_audio = result.get("replyAudioBase64", "")
            if reply_audio:
                audio_bytes = base64.b64decode(reply_audio)
                await ws.send_bytes(audio_bytes)
                WS_MESSAGES.labels(direction="out").inc()

            log.info(
                "round_trip_complete",
                transcript=result.get("transcript", ""),
                round_trip=round_trip,
                stages=result.get("stages", {}),
            )

    except WebSocketDisconnect:
        log.info("ws_disconnected")
    except Exception as e:
        log.error("ws_error", error=str(e))
    finally:
        WS_CONNECTIONS.dec()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.environment == "development",
        log_level=settings.log_level.lower(),
    )
