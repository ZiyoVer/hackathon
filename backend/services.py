from __future__ import annotations

from backend.schemas import (
    AnalysisResponse,
    AnalyzeCallRequest,
    ComplianceResult,
    DemoScenario,
    Intent,
    Objection,
    Sentiment,
    SpeakerLine,
)


KNOWLEDGE_REFS: dict[Intent, list[str]] = {
    "credit_request": ["Kredit shartlari", "Foiz stavkasi disclosure", "Kredit kalkulyatori"],
    "card_opening": ["Karta turlari", "Mobil banking ulash", "Karta xavfsizligi"],
    "deposit": ["Omonat muddatlari", "Foiz hisoblash", "Muddatidan oldin yechish"],
    "leasing": ["Lizing arizasi", "Boshlang'ich to'lov", "Garov va hujjatlar"],
    "complaint": ["Shikoyat qabul qilish tartibi", "Murojaat raqami", "Eskalyatsiya"],
    "general_question": ["Umumiy bank xizmatlari", "Filial va aloqa markazi"],
}


DEMO_SCENARIOS = [
    DemoScenario(
        id="credit-objection",
        title="Kredit e'tirozi",
        description="Mijoz kreditga qiziqadi, lekin foiz qimmat deb xavotir bildiradi.",
        customer_message=(
            "Assalomu alaykum, menga 50 million so'm kredit kerak edi. "
            "24 oyga olmoqchiman, lekin foizi qimmat bo'lsa kerak."
        ),
        transcript=[
            SpeakerLine(speaker="customer", text="Assalomu alaykum, menga 50 million so'm kredit kerak edi."),
            SpeakerLine(speaker="agent", text="Qanday muddatga olmoqchisiz?"),
            SpeakerLine(speaker="customer", text="24 oyga. Lekin foizi qimmat bo'lsa kerak."),
        ],
    ),
    DemoScenario(
        id="card-opening",
        title="Karta ochish",
        description="Mijoz karta tanlashda yordam so'raydi.",
        customer_message="Men karta ochmoqchi edim. Qaysi karta menga mos keladi?",
        transcript=[
            SpeakerLine(speaker="customer", text="Men karta ochmoqchi edim."),
            SpeakerLine(speaker="agent", text="Kartadan asosan qayerda foydalanasiz?"),
            SpeakerLine(speaker="customer", text="Onlayn to'lov va oylik tushishi uchun kerak."),
        ],
    ),
    DemoScenario(
        id="compliance-risk",
        title="Compliance risk",
        description="Agent kredit shartlarini to'liq tushuntirmagan holat.",
        customer_message="Kreditni tezroq olsam bo'ladimi? Foizini keyin bilib olarman.",
        transcript=[
            SpeakerLine(speaker="customer", text="Kreditni tezroq olsam bo'ladimi?"),
            SpeakerLine(speaker="agent", text="Ha, ariza qoldirsangiz tez ko'rib chiqiladi."),
            SpeakerLine(speaker="customer", text="Foizini keyin bilib olarman."),
        ],
    ),
]


def analyze_message(message: str) -> AnalysisResponse:
    normalized = _normalize(message)
    intent = _detect_intent(normalized)
    objection = _detect_objection(normalized)
    sentiment = _detect_sentiment(normalized, objection)
    compliance = _build_compliance(intent, objection, agent_text="")

    return AnalysisResponse(
        intent=intent,
        sentiment=sentiment,
        objection=objection,
        suggested_response=_suggest_response(intent, objection),
        next_best_action=_next_best_action(intent, objection),
        confidence=_confidence(intent, objection),
        compliance=compliance,
        knowledge_refs=KNOWLEDGE_REFS[intent],
    )


def analyze_call(payload: AnalyzeCallRequest) -> CallSummaryResponse:
    customer_text = " ".join(line.text for line in payload.transcript if line.speaker == "customer")
    agent_text = " ".join(line.text for line in payload.transcript if line.speaker == "agent")
    message_analysis = analyze_message(customer_text or payload.transcript[-1].text)
    compliance = _build_compliance(message_analysis.intent, message_analysis.objection, agent_text)

    return CallSummaryResponse(
        summary=_summary(message_analysis.intent, message_analysis.objection, customer_text),
        crm_note=_crm_note(message_analysis.intent, message_analysis.objection),
        recommended_next_step=message_analysis.next_best_action,
        compliance=compliance,
    )


def list_demo_scenarios() -> list[DemoScenario]:
    return DEMO_SCENARIOS


def _normalize(text: str) -> str:
    return (
        text.lower()
        .replace("'", "'")
        .replace("`", "'")
        .replace("o‘", "o'")
        .replace("g‘", "g'")
    )


def _detect_intent(text: str) -> Intent:
    if _contains(text, ["shikoyat", "muammo", "norozi", "xato yechildi", "bloklandi"]):
        return "complaint"
    if _contains(text, ["kredit", "qarz", "foiz", "oylik to'lov", "50 million", "mln"]):
        return "credit_request"
    if _contains(text, ["karta", "plastik", "humo", "uzcard", "visa", "mastercard"]):
        return "card_opening"
    if _contains(text, ["omonat", "depozit", "jamg'arma"]):
        return "deposit"
    if _contains(text, ["lizing", "avtomobil", "texnika lizing"]):
        return "leasing"
    return "general_question"


def _detect_objection(text: str) -> Objection:
    if _contains(text, ["qimmat", "foizi qimmat", "stavka yuqori", "foiz ko'p"]):
        return "interest_rate_expensive"
    if _contains(text, ["o'ylab", "keyin qaror", "maslahatlashib"]):
        return "need_to_think"
    if _contains(text, ["boshqa bank", "raqobatchi", "u bankda yaxshi"]):
        return "competitor_better"
    if _contains(text, ["ishonmayman", "ishonch yo'q", "xavotirdaman"]):
        return "not_trust"
    if _contains(text, ["keyinroq", "ertaga", "qayta qo'ng'iroq", "call later"]):
        return "call_later"
    return "none"


def _detect_sentiment(text: str, objection: Objection) -> Sentiment:
    if objection != "none" or _contains(text, ["norozi", "qimmat", "muammo", "xavotir"]):
        return "negative" if _contains(text, ["norozi", "muammo", "ishonmayman"]) else "neutral"
    if _contains(text, ["rahmat", "yaxshi", "ma'qul", "zo'r"]):
        return "positive"
    return "neutral"


def _suggest_response(intent: Intent, objection: Objection) -> str:
    if intent == "credit_request" and objection == "interest_rate_expensive":
        return (
            "Foiz stavkasi kredit muddati, mijoz profili va kredit tarixiga qarab belgilanadi. "
            "Sizga oylik to'lov va umumiy qaytariladigan summani kalkulyator orqali hisoblab berishimiz mumkin."
        )
    if intent == "credit_request":
        return (
            "Kredit summasi, muddati va daromad manbangizga qarab mos variantni tanlaymiz. "
            "Avval taxminiy oylik to'lovni hisoblab ko'rsataman."
        )
    if intent == "card_opening":
        return (
            "Sizga foydalanish maqsadingizga qarab Humo, Uzcard yoki xalqaro karta variantlarini solishtirib beraman. "
            "Karta ochilgach mobil bankingni ham ulab qo'yish mumkin."
        )
    if intent == "deposit":
        return (
            "Omonat uchun muddat, to'ldirish imkoniyati va foiz hisoblanish tartibini solishtirib beraman. "
            "Qaysi muddat sizga qulayligini aniqlashtirsak, eng mos variantni tanlaymiz."
        )
    if intent == "leasing":
        return (
            "Lizing uchun obyekt qiymati, boshlang'ich to'lov va muddat bo'yicha ariza shartlarini tushuntirib beraman."
        )
    if intent == "complaint":
        return (
            "Murojaatingizni qabul qilaman va tekshiruv uchun ro'yxatdan o'tkazaman. "
            "Natijani kuzatish uchun murojaat raqamini taqdim etamiz."
        )
    return "Savolingizni aniqlashtirsangiz, sizga mos bank xizmatini topib beraman."


def _next_best_action(intent: Intent, objection: Objection) -> str:
    if intent == "credit_request" and objection == "interest_rate_expensive":
        return "Kredit kalkulyatsiyasini taklif qilish"
    if intent == "credit_request":
        return "Kredit summasi va muddatini aniqlashtirish"
    if intent == "card_opening":
        return "Karta maqsadini so'rash va mobil bankingni taklif qilish"
    if intent == "deposit":
        return "Omonat muddati va yechish shartlarini solishtirish"
    if intent == "leasing":
        return "Lizing obyekt qiymati va boshlang'ich to'lovni so'rash"
    if intent == "complaint":
        return "Murojaatni ro'yxatdan o'tkazish va eskalyatsiya qilish"
    return "Mijoz ehtiyojini aniqlashtirish"


def _build_compliance(intent: Intent, objection: Objection, agent_text: str) -> ComplianceResult:
    missing_items: list[str] = []
    suggested_phrases: list[str] = []
    normalized_agent = _normalize(agent_text)

    if intent == "credit_request":
        checks = [
            (
                "Foiz stavkasi va kredit muddati tushuntirilmadi",
                "Kredit foiz stavkasi, muddat va mijoz profiliga qarab belgilanadi.",
                ["foiz", "stavka"],
            ),
            (
                "Umumiy qaytariladigan summa aytilmadi",
                "Umumiy to'lov summasi va oylik to'lovni oldindan ko'rib chiqishingiz zarur.",
                ["umumiy", "oylik to'lov"],
            ),
            (
                "Shaxsiy ma'lumotlar roziligi eslatilmadi",
                "Arizani ko'rib chiqish uchun shaxsiy ma'lumotlaringizga rozilik kerak bo'ladi.",
                ["rozilik", "shaxsiy"],
            ),
        ]
        for missing, phrase, keywords in checks:
            if not agent_text or not any(keyword in normalized_agent for keyword in keywords):
                missing_items.append(missing)
                suggested_phrases.append(phrase)

    if objection != "none" and not agent_text:
        missing_items.append("E'tirozga javob berish skripti ishlatilmadi")
        suggested_phrases.append("Xavotiringizni tushunaman, avval shartlarni aniq hisoblab ko'raylik.")

    score = max(35, 100 - len(missing_items) * 8 - (8 if objection != "none" else 0))
    status = "green" if score >= 80 else "yellow" if score >= 60 else "red"
    return ComplianceResult(
        score=score,
        status=status,
        missing_items=missing_items,
        suggested_phrases=suggested_phrases,
    )


def _summary(intent: Intent, objection: Objection, customer_text: str) -> str:
    if intent == "credit_request":
        objection_text = " Foiz stavkasi bo'yicha e'tiroz bildirdi." if objection != "none" else ""
        return f"Mijoz kredit mahsulotiga qiziqdi va shartlarni aniqlashtirmoqchi.{objection_text}"
    if intent == "card_opening":
        return "Mijoz karta ochish bo'yicha maslahat so'radi va foydalanish maqsadini tushuntirdi."
    if intent == "complaint":
        return "Mijoz bank xizmati bo'yicha shikoyat yoki muammo bildirdi."
    if customer_text:
        return f"Mijoz bank xizmati bo'yicha savol berdi: {customer_text[:180]}"
    return "Qo'ng'iroq davomida mijoz ehtiyoji aniqlashtirildi."


def _crm_note(intent: Intent, objection: Objection) -> str:
    if intent == "credit_request":
        suffix = " Foiz stavkasi e'tirozi bor, kalkulyatsiya yuborish kerak." if objection != "none" else ""
        return f"Mijoz kredit bo'yicha maslahat oldi.{suffix}"
    if intent == "card_opening":
        return "Mijoz karta ochish bo'yicha variantlar bilan qiziqdi. Mobil banking cross-sell tavsiya qilindi."
    if intent == "complaint":
        return "Mijoz murojaati ro'yxatdan o'tkazilishi va supervisor nazoratiga berilishi kerak."
    return "Mijoz bilan umumiy maslahat o'tkazildi. Keyingi aloqa uchun ehtiyoj aniqlashtirilsin."


def _confidence(intent: Intent, objection: Objection) -> float:
    if intent != "general_question" and objection != "none":
        return 0.88
    if intent != "general_question":
        return 0.82
    return 0.62


def _contains(text: str, needles: list[str]) -> bool:
    return any(needle in text for needle in needles)
