from typing import Literal

from pydantic import BaseModel, Field


Intent = Literal[
    "credit_request",
    "card_opening",
    "deposit",
    "leasing",
    "complaint",
    "general_question",
]
Sentiment = Literal["positive", "neutral", "negative"]
Objection = Literal[
    "interest_rate_expensive",
    "need_to_think",
    "competitor_better",
    "not_trust",
    "call_later",
    "none",
]


class AnalyzeMessageRequest(BaseModel):
    message: str = Field(min_length=2, max_length=4000)


class SpeakerLine(BaseModel):
    speaker: Literal["customer", "agent"]
    text: str = Field(min_length=1, max_length=4000)


class AnalyzeCallRequest(BaseModel):
    transcript: list[SpeakerLine] = Field(min_length=1, max_length=80)


class ComplianceResult(BaseModel):
    score: int = Field(ge=0, le=100)
    status: Literal["green", "yellow", "red"]
    missing_items: list[str]
    suggested_phrases: list[str]


class AnalysisResponse(BaseModel):
    intent: Intent
    sentiment: Sentiment
    objection: Objection
    customer_summary: str = ""
    customer_needs: list[str] = Field(default_factory=list)
    risk_level: Literal["low", "medium", "high"] = "medium"
    priority: Literal["normal", "attention", "urgent"] = "normal"
    lead_temperature: Literal["cold", "warm", "hot"] = "warm"
    opportunity: str = ""
    handoff_recommendation: str = ""
    suggested_response: str
    agent_script: list[str] = Field(default_factory=list)
    follow_up_questions: list[str] = Field(default_factory=list)
    do_not_say: list[str] = Field(default_factory=list)
    closing_line: str = ""
    crm_tags: list[str] = Field(default_factory=list)
    next_best_action: str
    confidence: float = Field(ge=0, le=1)
    compliance: ComplianceResult
    knowledge_refs: list[str]


class CallSummaryResponse(BaseModel):
    summary: str
    crm_note: str
    recommended_next_step: str
    compliance: ComplianceResult


class DemoScenario(BaseModel):
    id: str
    title: str
    description: str
    customer_message: str
    transcript: list[SpeakerLine]


class AudioTranscriptionResponse(BaseModel):
    transcript: str
    provider: str
    confidence: float = Field(ge=0, le=1)
    storage_url: str | None = None


class TtsRequest(BaseModel):
    text: str = Field(min_length=2, max_length=2000)
    voice: Literal["gulnoza", "jaxongir", "uz-standard"] = "gulnoza"


class TtsResponse(BaseModel):
    provider: str
    audio_url: str | None = None
    message: str
