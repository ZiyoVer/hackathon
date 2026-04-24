from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.config import get_settings
from backend.integrations.aisha import AishaClient
from backend.integrations.llm import LLMAnalyzer
from backend.integrations.wasabi import WasabiStorage
from backend.schemas import (
    AnalysisResponse,
    AnalyzeCallRequest,
    AnalyzeMessageRequest,
    AudioTranscriptionResponse,
    CallSummaryResponse,
    DemoScenario,
    TtsRequest,
    TtsResponse,
)
from backend.services import analyze_call, analyze_message, list_demo_scenarios


settings = get_settings()
app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_origin,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

aisha_client = AishaClient(settings)
llm_analyzer = LLMAnalyzer(settings)
storage = WasabiStorage(settings)


@app.get("/health")
async def health() -> dict[str, str]:
    ai_provider = "openai" if llm_analyzer.enabled else "rules"
    return {"status": "ok", "service": settings.app_name, "ai_provider": ai_provider}


@app.get("/api/demo-scenarios", response_model=list[DemoScenario])
async def demo_scenarios() -> list[DemoScenario]:
    return list_demo_scenarios()


@app.post("/api/analyze-message", response_model=AnalysisResponse)
async def analyze_single_message(payload: AnalyzeMessageRequest) -> AnalysisResponse:
    if llm_analyzer.enabled:
        try:
            return await llm_analyzer.analyze_message(payload.message)
        except Exception as exc:
            if not settings.ai_fallback_to_rules:
                raise HTTPException(status_code=502, detail=f"AI tahlil xatosi: {exc}") from exc
    return analyze_message(payload.message)


@app.post("/api/analyze-call", response_model=CallSummaryResponse)
async def analyze_full_call(payload: AnalyzeCallRequest) -> CallSummaryResponse:
    if llm_analyzer.enabled:
        try:
            return await llm_analyzer.analyze_call(payload)
        except Exception as exc:
            if not settings.ai_fallback_to_rules:
                raise HTTPException(status_code=502, detail=f"AI summary xatosi: {exc}") from exc
    return analyze_call(payload)


@app.post("/api/audio/transcribe", response_model=AudioTranscriptionResponse)
async def transcribe_audio(file: UploadFile = File(...)) -> AudioTranscriptionResponse:
    try:
        audio = await file.read()
        if not audio:
            raise HTTPException(status_code=400, detail="Audio fayl bo'sh.")

        content_type = file.content_type or "application/octet-stream"
        filename = file.filename or "call-audio.webm"
        storage_key = f"audio/{uuid4()}-{filename}"
        storage_url = storage.upload_bytes(storage_key, audio, content_type)
        transcript, confidence, provider = await aisha_client.transcribe(audio, filename, content_type)

        return AudioTranscriptionResponse(
            transcript=transcript,
            provider=provider,
            confidence=confidence,
            storage_url=storage_url,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"STT xatosi: {exc}") from exc


@app.post("/api/audio/synthesize", response_model=TtsResponse)
async def synthesize_audio(payload: TtsRequest) -> TtsResponse:
    try:
        audio, remote_url, message = await aisha_client.synthesize(payload.text, payload.voice)
        if remote_url:
            return TtsResponse(provider="aisha", audio_url=remote_url, message=message)
        if audio:
            storage_url = storage.upload_bytes(f"tts/{uuid4()}.mp3", audio, "audio/mpeg")
            return TtsResponse(provider="aisha", audio_url=storage_url, message=message)
        return TtsResponse(provider="mock", audio_url=None, message=message)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"TTS xatosi: {exc}") from exc


DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"
ASSETS_DIR = DIST_DIR / "assets"

if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend(full_path: str) -> FileResponse:
    index_file = DIST_DIR / "index.html"
    requested_file = DIST_DIR / full_path

    if requested_file.is_file():
        return FileResponse(requested_file)
    if index_file.exists():
        return FileResponse(index_file)
    raise HTTPException(status_code=404, detail="Frontend build topilmadi.")
