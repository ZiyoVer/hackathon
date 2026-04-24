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


class ComplianceEvidence(BaseModel):
    id: str
    severity: Literal["info", "warning", "critical"]
    status: Literal["passed", "missing", "risky"]
    speaker: Literal["customer", "agent", "system"]
    line_index: int | None
    finding: str
    safer_phrase: str
    score_impact: int


class ProductReference(BaseModel):
    id: str
    title: str
    category: str
    why_it_matters: str
    script_anchor: str
    verified: bool


class EscalationPacket(BaseModel):
    should_escalate: bool
    urgency: Literal["normal", "attention", "urgent"]
    owner: str
    reason: str
    handoff_note: str
    transcript_excerpt: str


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
    analysis_mode: Literal["rules", "openai"] = "rules"
    matched_signals: list[str] = Field(default_factory=list)
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
    compliance_evidence: list[ComplianceEvidence] = Field(default_factory=list)
    product_references: list[ProductReference] = Field(default_factory=list)
    escalation_packet: EscalationPacket | None = None
    knowledge_refs: list[str]


class CallSummaryResponse(BaseModel):
    summary: str
    crm_note: str
    recommended_next_step: str
    compliance: ComplianceResult
    compliance_evidence: list[ComplianceEvidence] = Field(default_factory=list)


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
