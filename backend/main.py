from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

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
    SpeakerLine,
    TtsRequest,
    TtsResponse,
)
from backend.services import analyze_call, analyze_message, list_demo_scenarios
from backend.store import store


settings = get_settings()
app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_origin,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-Manager-Token",
        "Accept",
        "Origin",
        "X-Requested-With",
    ],
    expose_headers=["*"],
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


class CreateSessionRequest(BaseModel):
    operator_id: str = "op1"
    customer_label: str = "Mijoz"


class SessionMessageRequest(BaseModel):
    speaker: str = "customer"  # customer | agent
    text: str


class OperatorOut(BaseModel):
    id: str
    name: str
    initial: str


class SessionCardOut(BaseModel):
    id: str
    operator: OperatorOut
    customer_label: str
    status: str
    last_text: str
    last_summary: str
    risk_level: str
    sentiment: str
    priority: str
    intent: str
    updated_at: str
    message_count: int


class SessionDetailOut(SessionCardOut):
    transcript: list[SpeakerLine]
    last_analysis: AnalysisResponse | None


def _to_card(s) -> SessionCardOut:
    a = s.last_analysis
    last_text = s.transcript[-1].text if s.transcript else ""
    return SessionCardOut(
        id=s.id,
        operator=OperatorOut(id=s.operator.id, name=s.operator.name, initial=s.operator.initial),
        customer_label=s.customer_label,
        status=s.status,
        last_text=last_text[:140],
        last_summary=a.customer_summary if a else "",
        risk_level=a.risk_level if a else "low",
        sentiment=a.sentiment if a else "neutral",
        priority=a.priority if a else "normal",
        intent=a.intent if a else "general_question",
        updated_at=s.updated_at.isoformat(),
        message_count=len(s.transcript),
    )


def _to_detail(s) -> SessionDetailOut:
    return SessionDetailOut(
        **_to_card(s).model_dump(),
        transcript=s.transcript,
        last_analysis=s.last_analysis,
    )


async def _run_message_analysis(text: str) -> AnalysisResponse:
    if llm_analyzer.enabled:
        try:
            return await llm_analyzer.analyze_message(text)
        except Exception:
            if not settings.ai_fallback_to_rules:
                raise
    return analyze_message(text)


async def require_manager(x_manager_token: str | None = Header(default=None)) -> None:
    if not x_manager_token or x_manager_token != settings.manager_password:
        raise HTTPException(status_code=401, detail="Manager parolini kiriting")


class ManagerLoginRequest(BaseModel):
    password: str


@app.post("/api/manager/login")
async def manager_login(payload: ManagerLoginRequest) -> dict[str, str]:
    if payload.password != settings.manager_password:
        raise HTTPException(status_code=401, detail="Parol noto'g'ri")
    return {"token": settings.manager_password}


@app.get("/api/operators", response_model=list[OperatorOut])
async def operators_list() -> list[OperatorOut]:
    return [OperatorOut(id=op.id, name=op.name, initial=op.initial) for op in store.operators()]


@app.post("/api/sessions", response_model=SessionDetailOut)
async def create_session(payload: CreateSessionRequest) -> SessionDetailOut:
    session = await store.create_session(payload.operator_id, payload.customer_label)
    return _to_detail(session)


@app.post("/api/sessions/{session_id}/messages", response_model=SessionDetailOut)
async def add_session_message(session_id: str, payload: SessionMessageRequest) -> SessionDetailOut:
    session = await store.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session topilmadi")

    speaker = "agent" if payload.speaker == "agent" else "customer"
    line = SpeakerLine(speaker=speaker, text=payload.text)
    analysis = await _run_message_analysis(payload.text)
    updated = await store.append_message(session_id, line, analysis)
    return _to_detail(updated)


@app.get("/api/manager/sessions", response_model=list[SessionCardOut])
async def manager_sessions(_: None = Depends(require_manager)) -> list[SessionCardOut]:
    sessions = await store.list_sessions()
    return [_to_card(s) for s in sessions]


@app.get("/api/manager/sessions/{session_id}", response_model=SessionDetailOut)
async def manager_session_detail(
    session_id: str, _: None = Depends(require_manager)
) -> SessionDetailOut:
    session = await store.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session topilmadi")
    return _to_detail(session)


@app.post("/api/manager/sessions/{session_id}/close", response_model=SessionDetailOut)
async def manager_close_session(
    session_id: str, _: None = Depends(require_manager)
) -> SessionDetailOut:
    session = await store.close_session(session_id)
    if not session:
        raise HTTPException(404, "Session topilmadi")
    return _to_detail(session)


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
