from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx
from pydantic import ValidationError

from backend.config import Settings
from backend.schemas import (
    AnalysisResponse,
    AnalyzeCallRequest,
    CallSummaryResponse,
    ComplianceEvidence,
    ComplianceResult,
)


logger = logging.getLogger(__name__)


class LLMError(RuntimeError):
    pass


class LLMAnalyzer:
    def __init__(self, settings: Settings):
        self.settings = settings

    @property
    def enabled(self) -> bool:
        return self.settings.use_openai

    async def analyze_message(self, message: str) -> AnalysisResponse:
        payload = await self._openai_structured_response(
            schema_name="analysis_response",
            schema=ANALYSIS_SCHEMA,
            system_prompt=ANALYSIS_SYSTEM_PROMPT,
            user_prompt=f"Mijoz xabari:\n{message}",
        )
        try:
            return _normalize_analysis(AnalysisResponse.model_validate(payload))
        except ValidationError as exc:
            raise LLMError(f"OpenAI analysis schema validation failed: {exc}") from exc

    async def analyze_call(self, payload: AnalyzeCallRequest) -> CallSummaryResponse:
        transcript = "\n".join(f"{line.speaker}: {line.text}" for line in payload.transcript)
        response_payload = await self._openai_structured_response(
            schema_name="call_summary_response",
            schema=CALL_SUMMARY_SCHEMA,
            system_prompt=CALL_SUMMARY_SYSTEM_PROMPT,
            user_prompt=f"Call transcript:\n{transcript}",
        )
        try:
            summary = CallSummaryResponse.model_validate(response_payload)
            return _normalize_call_summary(summary)
        except ValidationError as exc:
            raise LLMError(f"OpenAI summary schema validation failed: {exc}") from exc

    async def _openai_structured_response(
        self,
        *,
        schema_name: str,
        schema: dict[str, Any],
        system_prompt: str,
        user_prompt: str,
    ) -> dict[str, Any]:
        url = f"{self.settings.openai_base_url.rstrip('/')}/responses"
        headers = {
            "Authorization": f"Bearer {self.settings.openai_api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": self.settings.openai_model,
            "input": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": schema_name,
                    "strict": True,
                    "schema": schema,
                }
            },
        }

        async with httpx.AsyncClient(timeout=self.settings.openai_timeout_seconds) as client:
            response = await client.post(url, headers=headers, json=body)

        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = response.text[:700]
            raise LLMError(f"OpenAI request failed: {response.status_code} {detail}") from exc

        output_text = _extract_output_text(response.json())
        try:
            return json.loads(output_text)
        except json.JSONDecodeError as exc:
            logger.warning("OpenAI raw output was not JSON: %s", output_text)
            raise LLMError("OpenAI structured output was not valid JSON.") from exc


def _extract_output_text(payload: dict[str, Any]) -> str:
    direct_text = payload.get("output_text")
    if isinstance(direct_text, str) and direct_text.strip():
        return direct_text

    output_items = payload.get("output")
    if not isinstance(output_items, list):
        raise LLMError("OpenAI response did not contain output text.")

    text_parts: list[str] = []
    for output_item in output_items:
        if not isinstance(output_item, dict):
            continue
        for content_item in output_item.get("content", []):
            if not isinstance(content_item, dict):
                continue
            text = content_item.get("text")
            if isinstance(text, str):
                text_parts.append(text)

    if not text_parts:
        raise LLMError("OpenAI response output text was empty.")
    return "".join(text_parts)


def _normalize_analysis(response: AnalysisResponse) -> AnalysisResponse:
    script = [_sanitize_safe_language(line) for line in response.agent_script if line.strip()]
    if not script:
        script = [_sanitize_safe_language(response.suggested_response)]

    return response.model_copy(
        update={
            "analysis_mode": "openai",
            "opportunity": _sanitize_safe_language(response.opportunity),
            "handoff_recommendation": _sanitize_safe_language(response.handoff_recommendation),
            "suggested_response": _sanitize_safe_language(response.suggested_response),
            "agent_script": script,
            "closing_line": _sanitize_safe_language(response.closing_line),
            "next_best_action": _sanitize_safe_language(response.next_best_action),
            "crm_tags": [_slugify_tag(tag) for tag in response.crm_tags if tag.strip()],
            "compliance": _normalize_compliance(response.compliance),
            "compliance_evidence": [_normalize_evidence(item) for item in response.compliance_evidence],
        }
    )


def _normalize_compliance(compliance: ComplianceResult) -> ComplianceResult:
    score = max(0, min(100, compliance.score))
    status = "green" if score >= 80 else "yellow" if score >= 60 else "red"
    missing_items = list(compliance.missing_items)
    if score < 60 and not missing_items:
        missing_items.append("Majburiy disclosure bandlari yetarli ko'rsatilmagan")
    return compliance.model_copy(
        update={
            "score": score,
            "status": status,
            "missing_items": missing_items,
            "suggested_phrases": [_sanitize_safe_language(phrase) for phrase in compliance.suggested_phrases],
        }
    )


def _normalize_call_summary(summary: CallSummaryResponse) -> CallSummaryResponse:
    return summary.model_copy(
        update={
            "compliance": _normalize_compliance(summary.compliance),
            "compliance_evidence": [_normalize_evidence(item) for item in summary.compliance_evidence],
        }
    )


def _normalize_evidence(evidence: ComplianceEvidence) -> ComplianceEvidence:
    return evidence.model_copy(update={"safer_phrase": _sanitize_safe_language(evidence.safer_phrase)})


def _sanitize_safe_language(text: str) -> str:
    replacements = {
        "raqobatbardosh shartlarni taqdim etamiz": "shartlarni aniq hisob-kitob qilib solishtirishga yordam beramiz",
        "raqobatbardosh shartlar": "aniq hisob-kitob qilingan shartlar",
        "eng qulay shartlarni taqdim etamiz": "mavjud shartlarni aniq tushuntirib beramiz",
        "eng qulay shartlar": "mavjud shartlar",
        "eng past": "aniq hisoblangan",
        "juda past": "aniq hisoblangan",
        "boshqa banklardan yaxshiroq": "mavjud shartlarni solishtirishga yordam beradigan",
        "tabriklayman": "tushunarli",
        "kredit berishimiz mumkin": "kredit arizasini ko'rib chiqishimiz mumkin",
        "berishimiz mumkin": "ko'rib chiqishimiz mumkin",
    }
    sanitized = text
    for unsafe, safe in replacements.items():
        sanitized = sanitized.replace(unsafe, safe).replace(unsafe.capitalize(), safe.capitalize())
    return sanitized


def _slugify_tag(tag: str) -> str:
    transliterated = (
        tag.lower()
        .replace("o‘", "o")
        .replace("g‘", "g")
        .replace("'", "")
        .replace("`", "")
        .replace("‘", "")
        .replace("’", "")
    )
    slug = re.sub(r"[^a-z0-9]+", "_", transliterated).strip("_")
    return slug or "general"


ANALYSIS_SYSTEM_PROMPT = """
Siz SQB bank call-markaz agenti uchun AI copilot tahlilchisiz.
Bu chat-bot emas: mijozga bevosita yozishmang, agent uchun tahlil, tayyor script,
keyingi savollar va compliance tavsiyalarini bering. Faqat o'zbek tilida yozing.
agent_script ichidagi har bir element agent mijozga aynan o'qib beradigan tayyor gap bo'lsin.
"Mijozni salomlashish", "shartlarni tushuntirish" kabi instruktsiya yozmang; tayyor jumla yozing.
suggested_response bitta asosiy tayyor javob bo'lsin, reklama yoki ortiqcha va'da bermang.
Aniq foiz stavkasi berilmagan bo'lsa stavka aytmang va "raqobatbardosh" deb va'da bermang.
Kreditda "aniq hisob-kitob qilib ko'rsatamiz" va "umumiy to'lov bilan tanishing" mazmunini ishlating.
priority agent qanchalik tez harakat qilishi kerakligini bildiradi: normal, attention yoki urgent.
lead_temperature mijozning sotuvga yaqinligini bildiradi: cold, warm yoki hot.
handoff_recommendation qisqa amaliy tavsiya bo'lsin: agent davom etsinmi, senior agentmi yoki supervisormi.
do_not_say xavfli va'dalar, noto'g'ri solishtirishlar va compliance buzadigan iboralar ro'yxati bo'lsin.
closing_line agent suhbat oxirida aytadigan bitta tayyor jumla bo'lsin.
crm_tags kichik snake_case taglar bo'lsin.
compliance.score va compliance.status mos bo'lsin: 80-100 green, 60-79 yellow, 0-59 red.
Bank compliance bo'yicha ehtiyotkor bo'ling: kreditda foiz stavkasi, umumiy to'lov,
muddat va shaxsiy ma'lumotlar roziligi eslatilishi kerak. JSON schema'dan chetga chiqmang.
analysis_mode doim "openai" bo'lsin. matched_signals ichida aniqlangan keyword, intent,
objection va risk signallarini qisqa snake_case yoki prefixli tag sifatida bering.
compliance_evidence har bir muhim compliance topilmasi uchun timeline elementi bo'lsin.
product_references mijoz niyatiga mos mahsulot, disclosure yoki jarayon manbalarini bersin.
complaint, not_trust, competitor_better, high risk yoki qizil compliance bo'lsa escalation_packet to'ldirilsin;
aks holda escalation_packet null bo'lsin.
""".strip()

CALL_SUMMARY_SYSTEM_PROMPT = """
Siz bank call-markaz suhbatini CRM uchun qisqa xulosaga aylantirasiz.
Faqat o'zbek tilida yozing. Mijoz maqsadi, e'tirozi, keyingi qadam va compliance
kamchiliklarini aniq ajrating. compliance_evidence timeline elementlarini ham qaytaring.
JSON schema'dan chetga chiqmang.
""".strip()

COMPLIANCE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "score": {"type": "integer", "minimum": 0, "maximum": 100},
        "status": {"type": "string", "enum": ["green", "yellow", "red"]},
        "missing_items": {"type": "array", "items": {"type": "string"}},
        "suggested_phrases": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["score", "status", "missing_items", "suggested_phrases"],
}

COMPLIANCE_EVIDENCE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "id": {"type": "string"},
        "severity": {"type": "string", "enum": ["info", "warning", "critical"]},
        "status": {"type": "string", "enum": ["passed", "missing", "risky"]},
        "speaker": {"type": "string", "enum": ["customer", "agent", "system"]},
        "line_index": {"anyOf": [{"type": "integer"}, {"type": "null"}]},
        "finding": {"type": "string"},
        "safer_phrase": {"type": "string"},
        "score_impact": {"type": "integer"},
    },
    "required": [
        "id",
        "severity",
        "status",
        "speaker",
        "line_index",
        "finding",
        "safer_phrase",
        "score_impact",
    ],
}

PRODUCT_REFERENCE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "id": {"type": "string"},
        "title": {"type": "string"},
        "category": {"type": "string"},
        "why_it_matters": {"type": "string"},
        "script_anchor": {"type": "string"},
        "verified": {"type": "boolean"},
    },
    "required": ["id", "title", "category", "why_it_matters", "script_anchor", "verified"],
}

ESCALATION_PACKET_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "should_escalate": {"type": "boolean"},
        "urgency": {"type": "string", "enum": ["normal", "attention", "urgent"]},
        "owner": {"type": "string"},
        "reason": {"type": "string"},
        "handoff_note": {"type": "string"},
        "transcript_excerpt": {"type": "string"},
    },
    "required": ["should_escalate", "urgency", "owner", "reason", "handoff_note", "transcript_excerpt"],
}

ANALYSIS_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "analysis_mode": {"type": "string", "enum": ["rules", "openai"]},
        "matched_signals": {"type": "array", "items": {"type": "string"}},
        "intent": {
            "type": "string",
            "enum": [
                "credit_request",
                "card_opening",
                "deposit",
                "leasing",
                "complaint",
                "general_question",
            ],
        },
        "sentiment": {"type": "string", "enum": ["positive", "neutral", "negative"]},
        "objection": {
            "type": "string",
            "enum": [
                "interest_rate_expensive",
                "need_to_think",
                "competitor_better",
                "not_trust",
                "call_later",
                "none",
            ],
        },
        "customer_summary": {"type": "string"},
        "customer_needs": {"type": "array", "items": {"type": "string"}},
        "risk_level": {"type": "string", "enum": ["low", "medium", "high"]},
        "priority": {"type": "string", "enum": ["normal", "attention", "urgent"]},
        "lead_temperature": {"type": "string", "enum": ["cold", "warm", "hot"]},
        "opportunity": {"type": "string"},
        "handoff_recommendation": {"type": "string"},
        "suggested_response": {"type": "string"},
        "agent_script": {"type": "array", "items": {"type": "string"}},
        "follow_up_questions": {"type": "array", "items": {"type": "string"}},
        "do_not_say": {"type": "array", "items": {"type": "string"}},
        "closing_line": {"type": "string"},
        "crm_tags": {"type": "array", "items": {"type": "string"}},
        "next_best_action": {"type": "string"},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "compliance": COMPLIANCE_SCHEMA,
        "compliance_evidence": {"type": "array", "items": COMPLIANCE_EVIDENCE_SCHEMA},
        "product_references": {"type": "array", "items": PRODUCT_REFERENCE_SCHEMA},
        "escalation_packet": {"anyOf": [ESCALATION_PACKET_SCHEMA, {"type": "null"}]},
        "knowledge_refs": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "analysis_mode",
        "matched_signals",
        "intent",
        "sentiment",
        "objection",
        "customer_summary",
        "customer_needs",
        "risk_level",
        "priority",
        "lead_temperature",
        "opportunity",
        "handoff_recommendation",
        "suggested_response",
        "agent_script",
        "follow_up_questions",
        "do_not_say",
        "closing_line",
        "crm_tags",
        "next_best_action",
        "confidence",
        "compliance",
        "compliance_evidence",
        "product_references",
        "escalation_packet",
        "knowledge_refs",
    ],
}

CALL_SUMMARY_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "summary": {"type": "string"},
        "crm_note": {"type": "string"},
        "recommended_next_step": {"type": "string"},
        "compliance": COMPLIANCE_SCHEMA,
        "compliance_evidence": {"type": "array", "items": COMPLIANCE_EVIDENCE_SCHEMA},
    },
    "required": ["summary", "crm_note", "recommended_next_step", "compliance", "compliance_evidence"],
}
