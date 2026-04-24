from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from pydantic import ValidationError

from backend.config import Settings
from backend.schemas import AnalysisResponse, AnalyzeCallRequest, CallSummaryResponse


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
            return AnalysisResponse.model_validate(payload)
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
            return CallSummaryResponse.model_validate(response_payload)
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


ANALYSIS_SYSTEM_PROMPT = """
Siz SQB bank call-markaz agenti uchun AI copilot tahlilchisiz.
Faqat o'zbek tilida yozing. Javob agentga mijoz bilan ishlashda yordam berishi kerak.
Bank compliance bo'yicha ehtiyotkor bo'ling: kreditda foiz stavkasi, umumiy to'lov,
muddat va shaxsiy ma'lumotlar roziligi eslatilishi kerak. JSON schema'dan chetga chiqmang.
""".strip()

CALL_SUMMARY_SYSTEM_PROMPT = """
Siz bank call-markaz suhbatini CRM uchun qisqa xulosaga aylantirasiz.
Faqat o'zbek tilida yozing. Mijoz maqsadi, e'tirozi, keyingi qadam va compliance
kamchiliklarini aniq ajrating. JSON schema'dan chetga chiqmang.
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

ANALYSIS_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
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
        "suggested_response": {"type": "string"},
        "next_best_action": {"type": "string"},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "compliance": COMPLIANCE_SCHEMA,
        "knowledge_refs": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "intent",
        "sentiment",
        "objection",
        "suggested_response",
        "next_best_action",
        "confidence",
        "compliance",
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
    },
    "required": ["summary", "crm_note", "recommended_next_step", "compliance"],
}
