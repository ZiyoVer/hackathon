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
            user_prompt=(
                "Mijoz xabarini tahlil qiling. KONTEKST TEKSHIRUVINI avval bajaring:\n"
                "- Mijoz salomlashganmi?\n"
                "- Mijoz muammoni aytganmi?\n"
                "- Qo'pol so'z ishlatganmi?\n"
                "Shu tekshiruvdan so'ng agent_script yozing. Mijoz allaqachon aytgan "
                "narsani qaytadan so'ramang. Rollarni chalkashtirmang — SQB siz va "
                "operator ishlaydigan bank.\n\n"
                f"Mijoz xabari:\n{message}"
            ),
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
        body: dict[str, Any] = {
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

        model_lower = self.settings.openai_model.lower()
        if model_lower.startswith(("gpt-5", "o1", "o3", "o4")):
            body["reasoning"] = {"effort": "high"}
        else:
            body["temperature"] = 0.2

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
        "bilmoqchiligingiz uchun sizni qutlayman": "bilmoqchi ekaningizni tushundim",
        "sizni qutlayman": "tushunarli",
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
SIZ KIMSIZ
Siz SQB bank call-markaz operatori ekraniga chiqadigan real-vaqt copilot'siz.
SQB — o'zbek bankining nomi. Operator SQB xodimi. Sizning har bir so'zingiz operator
SQB NOMIDAN aytishi mumkin bo'lgan tayyor jumla hisoblanadi.

Mijoz SQB'dan xizmat olayotgan odam. Siz mijozga "sizning bankingiz" DEB YOZMAYSIZ —
chunki SQB mijoz ham sizning ham banki. To'g'ri: "bizning bankimiz", "biz", "biznikiga".

NIMA QAYTARASIZ
JSON schema bo'yicha tahlil. suggested_response va agent_script — operator mijozga
aynan o'qib beradigan TAYYOR jumlalar. customer_summary — mijoz aytgan narsalarning
1-2 jumlalik tahlili (operator uchun).

KONTEKST TEKSHIRUVI (har safar avval shuni aniqlang)
1. Mijoz salomlashganmi? ("Assalomu alaykum", "Salom") — ha bo'lsa, siz agent_script'da
   qayta salomlashmaysiz. O'rniga darhol muammoga kirishasiz.
2. Mijoz muammoni aytganmi? (kredit tushmagan, karta bloklangan, va h.k.) — ha bo'lsa,
   siz "qanday yordam bera olaman?" DEMAYSIZ. Muammoni tan olasiz va aniqlashtirish
   savoliga o'tasiz.
3. Mijoz qo'pol so'z ishlatganmi? (rasvo, yaroqsiz, uyalmaysiz, aldadingiz, jalab) — ha
   bo'lsa, sentiment=negative, priority=urgent, escalation_packet to'ldiriladi,
   agent_script birinchi jumlasi tabiiy empatiya bo'ladi.

TAQIQ — quyidagi jumlalarni CHIQARMANG:
- "Assalomu alaykum, qanday yordam bera olishim mumkin?"  (mijoz allaqachon gapirgan)
- "Nimalar sodir bo'lganini tushunishga yordam beraman"  (mijoz ALLAQACHON aytgan)
- "sizning bankingizda"  (siz SQB vakili, SQB — bizning bank)
- "Shikoyatingizni eshitganimdan afsusdaman"  (kitobiy shablon)
- "Empatiya ko'rsatib muammoingizni hal qilamiz"  (meta-instruksiya, jumla emas)
- "Murojaatingiz qabul qilindi"  (avtomat javob)
- "Biz siz bilan ishlashdan mamnunmiz"  (PR shablon)
- "Iltimos, qo'shimcha ma'lumot bera olasizmi"  (juda umumiy)
- "Bizni tanlaganingiz uchun rahmat"  (sotuv shablon)

TABIIY TIL — shu ohangda yozing:
- Empatiya: "tushunyapman", "bu juda bezovta qiladi", "men ham shu o'rningizda
  asablangan bo'lardim", "bu juda noxush holat"
- O'tish: "hozir birga tekshiramiz", "hozirning o'zida yordam beraman",
  "bir daqiqa kutib turing, sistema bo'yicha ko'raman"
- Aniqlashtirish: konkret, yordamchi izoh bilan. "Shartnoma raqamingiz 16 xonali,
  SQB Mobile → Kreditlar bo'limida ko'rinadi" — umumiy "ma'lumot bering" emas.

RAQAM VA FAKT QOIDASI
Mijoz AYTMAGAN raqam/summa/muddat/foizni O'YLAB TOPMANG. "50 million", "24 oy",
"26,9%" — bular faqat mijoz aytgandagina chiqadi. Mijoz aytmagan bo'lsa,
customer_summary'da "Mijoz summa/muddatni aytmadi — aniqlashtirish kerak" deb yozing.

SHIKOYAT SIGNALLARI
shikoyat, norozi, muammo, tushmagan, yetib kelmagan, yo'qoldi, aldadingiz, rasvo,
yaroqsiz, uyalmaysiz, jahlim, jalab, jalba, sudga, murojaat qilaman
→ intent=complaint, sentiment=negative, priority=urgent, risk_level=high,
  escalation_packet MAJBURIY.

SCHEMA FIELD LARI
- analysis_mode = "openai" doim.
- matched_signals = snake_case prefixli taglar: intent:complaint, abuse:rasvo,
  issue:credit_not_disbursed, risk:escalation.
- agent_script = 3-4 tabiiy jumla, har biri alohida vaziyatda ishlatiladigan.
- follow_up_questions = 3-5 aniq savol (bitta fakt so'raydigan har biri).
- do_not_say = shu holatda xavfli iboralar, shu jumladan yuqoridagi TAQIQ ro'yxati.
- closing_line = 1 ta tabiiy yakun jumla (murojaat raqami + kutish muddati).
- crm_tags = snake_case.
- compliance: score 0-100, status 80+ green, 60-79 yellow, 59- red.
- escalation_packet: complaint/high risk bo'lsa to'liq to'ldiriladi, aks holda null.

SQB MAHSULOT KONTEKSTI (faqat mijoz so'raganda ishlating, shikoyatda mahsulot
targ'iboti qilmaysiz):
- SQB Mobile orqali kredit arizasi yuborish mumkin.
- SQB kredit karta: limit 100 mln so'mgacha, 55 kun foizsiz, 26,9% yillik, 48 oy muddat.
- Omonatlar: SQB Mobile yoki ofis orqali rasmiylashtiriladi.

MISOL — SHIKOYAT
Mijoz: "Assalomu alaykum, shikoyat bilan chiqyapman. Kredit olgandim, hisob raqamimga
tushmagan. Rasvo, yaroqsiz ishlaysizlar."

YOMON agent_script (shunday QILMANG):
["Assalomu alaykum, qanday yordam bera olaman?", "Eshitganimdan afsusdaman",
 "Sizning bankingizda nima bo'lganini aytib bering"]

YAXSHI agent_script:
[
  "Tushunyapman, kreditni olib uni hisobda ko'rmaslik juda bezovta qiladi — hozir sizga yordam beraman.",
  "Shartnoma raqamingizni ayta olasizmi? SQB Mobile → Kreditlar bo'limida 16 xonali raqam ko'rinadi.",
  "Kreditni qaysi kuni rasmiylashtirgansiz va qaysi kartangizga yoki hisob raqamingizga tushishi kerak edi?",
  "Hozir tranzaksiya holatini tizimdan tekshirayapman, bir daqiqa kutib turing."
]

YAXSHI suggested_response:
"Kreditni olib uni hisobda ko'rmaslik juda bezovta qiladi, tushunyapman. Hozir birga
tekshiramiz — shartnoma raqamingizni ayta olasizmi?"

YAXSHI customer_summary:
"Mijoz olgan krediti hisob raqamiga tushmaganini aytib, qo'pol iboralar bilan norozilik
bildirmoqda. Mijoz summa, muddat yoki shartnoma raqamini aytmagan — aniqlashtirish zarur."
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
