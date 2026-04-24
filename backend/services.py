from __future__ import annotations

from typing import Literal

from backend.schemas import (
    AnalysisResponse,
    AnalyzeCallRequest,
    CallSummaryResponse,
    ComplianceEvidence,
    ComplianceResult,
    DemoScenario,
    EscalationPacket,
    Intent,
    Objection,
    ProductReference,
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


PRODUCT_REFERENCES: dict[Intent, list[ProductReference]] = {
    "credit_request": [
        ProductReference(
            id="credit-calculator",
            title="Kredit kalkulyatori",
            category="credit",
            why_it_matters="Mijoz oylik to'lov va umumiy qaytariladigan summani oldindan ko'radi.",
            script_anchor="Avval taxminiy oylik to'lovni hisoblab ko'rsataman.",
            verified=True,
        ),
        ProductReference(
            id="credit-disclosure",
            title="Kredit shartlari disclosure",
            category="compliance",
            why_it_matters="Foiz, muddat va umumiy to'lovni shaffof aytish compliance riskini kamaytiradi.",
            script_anchor="Foiz stavkasi va umumiy qaytariladigan summa bilan oldindan tanishib chiqishingiz zarur.",
            verified=True,
        ),
    ],
    "card_opening": [
        ProductReference(
            id="card-types",
            title="Humo, Uzcard va xalqaro karta turlari",
            category="card",
            why_it_matters="Karta tanlovi mijozning oylik tushumi, onlayn to'lovi yoki xalqaro xaridiga bog'liq.",
            script_anchor="Kartadan asosan qayerda foydalanishingizni bilsam, sizga mos turini tanlab beraman.",
            verified=True,
        ),
        ProductReference(
            id="mobile-banking",
            title="Mobil banking ulash",
            category="digital",
            why_it_matters="Karta ochilgandan keyin to'lov va xavfsizlik boshqaruvi uchun kerak.",
            script_anchor="Karta ochilgach mobil bankingni ulab, onlayn to'lovlarni boshqarish mumkin.",
            verified=True,
        ),
    ],
    "deposit": [
        ProductReference(
            id="deposit-terms",
            title="Omonat muddatlari",
            category="deposit",
            why_it_matters="Muddat va yechish sharti foiz daromadiga bevosita ta'sir qiladi.",
            script_anchor="Omonat muddati va muddatidan oldin yechish shartlarini solishtirib beraman.",
            verified=True,
        )
    ],
    "leasing": [
        ProductReference(
            id="leasing-application",
            title="Lizing arizasi shartlari",
            category="leasing",
            why_it_matters="Boshlang'ich to'lov, obyekt qiymati va hujjatlar ariza qaroriga ta'sir qiladi.",
            script_anchor="Lizing obyekti qiymati va boshlang'ich to'lovni aniqlashtiramiz.",
            verified=True,
        )
    ],
    "complaint": [
        ProductReference(
            id="complaint-ticket",
            title="Murojaat raqami",
            category="service",
            why_it_matters="Mijoz shikoyat holatini kuzatishi va keyingi murojaatda raqamni aytishi mumkin.",
            script_anchor="Tekshiruv natijasini kuzatish uchun murojaat raqamini beramiz.",
            verified=True,
        )
    ],
    "general_question": [
        ProductReference(
            id="service-routing",
            title="Xizmat bo'yicha yo'naltirish",
            category="service",
            why_it_matters="Ehtiyoj aniqlangandan keyin mijoz mos mahsulot yoki mutaxassisga yo'naltiriladi.",
            script_anchor="Qaysi xizmat bo'yicha maslahat kerakligini aniqlashtirsak, mos yechimni taklif qilaman.",
            verified=False,
        )
    ],
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
    risk_level = _risk_level(sentiment, objection)
    priority = _priority(sentiment, objection)
    matched_signals = _matched_signals(normalized, intent, objection, sentiment)
    compliance_evidence = _build_compliance_evidence(intent, objection, "", None)

    return AnalysisResponse(
        analysis_mode="rules",
        matched_signals=matched_signals,
        intent=intent,
        sentiment=sentiment,
        objection=objection,
        customer_summary=_customer_summary(intent, objection, message),
        customer_needs=_customer_needs(intent, objection),
        risk_level=risk_level,
        priority=priority,
        lead_temperature=_lead_temperature(intent, objection),
        opportunity=_opportunity(intent, objection),
        handoff_recommendation=_handoff_recommendation(intent, objection),
        suggested_response=_suggest_response(intent, objection),
        agent_script=_agent_script(intent, objection),
        follow_up_questions=_follow_up_questions(intent, objection),
        do_not_say=_do_not_say(intent, objection),
        closing_line=_closing_line(intent, objection),
        crm_tags=_crm_tags(intent, objection),
        next_best_action=_next_best_action(intent, objection),
        confidence=_confidence(intent, objection),
        compliance=compliance,
        compliance_evidence=compliance_evidence,
        product_references=_product_references(intent),
        escalation_packet=_build_escalation_packet(
            intent=intent,
            objection=objection,
            risk_level=risk_level,
            compliance=compliance,
            transcript_excerpt=message[:400],
        ),
        knowledge_refs=KNOWLEDGE_REFS[intent],
    )


def analyze_call(payload: AnalyzeCallRequest) -> CallSummaryResponse:
    customer_text = " ".join(line.text for line in payload.transcript if line.speaker == "customer")
    agent_text = " ".join(line.text for line in payload.transcript if line.speaker == "agent")
    message_analysis = analyze_message(customer_text or payload.transcript[-1].text)
    compliance = _build_compliance(message_analysis.intent, message_analysis.objection, agent_text)
    compliance_evidence = _build_compliance_evidence(
        message_analysis.intent,
        message_analysis.objection,
        agent_text,
        payload.transcript,
    )

    return CallSummaryResponse(
        summary=_summary(message_analysis.intent, message_analysis.objection, customer_text),
        crm_note=_crm_note(message_analysis.intent, message_analysis.objection),
        recommended_next_step=message_analysis.next_best_action,
        compliance=compliance,
        compliance_evidence=compliance_evidence,
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


def _customer_summary(intent: Intent, objection: Objection, message: str) -> str:
    if intent == "credit_request":
        suffix = " Foiz stavkasi bo'yicha xavotiri bor." if objection != "none" else ""
        return f"Mijoz kredit olish niyatida va shartlarni solishtirmoqchi.{suffix}"
    if intent == "card_opening":
        return "Mijoz karta ochish va o'ziga mos karta turini tanlash bo'yicha maslahat so'ramoqda."
    if intent == "deposit":
        return "Mijoz omonat shartlari, foiz hisoblanishi va muddat bo'yicha qaror qilmoqchi."
    if intent == "leasing":
        return "Mijoz lizing shartlari, boshlang'ich to'lov va muddat bo'yicha ma'lumot izlamoqda."
    if intent == "complaint":
        return "Mijoz muammo yoki shikoyat bilan murojaat qilgan, eskalyatsiya ehtimoli bor."
    return f"Mijoz umumiy bank xizmati bo'yicha savol berdi: {message[:160]}"


def _customer_needs(intent: Intent, objection: Objection) -> list[str]:
    needs: dict[Intent, list[str]] = {
        "credit_request": ["Kredit summasi va muddatini aniqlash", "Oylik to'lovni oldindan bilish"],
        "card_opening": ["Mos karta turini tanlash", "Mobil banking va onlayn to'lov imkoniyatini tushunish"],
        "deposit": ["Omonat foizi va muddatini solishtirish", "Pulni muddatidan oldin yechish shartini bilish"],
        "leasing": ["Boshlang'ich to'lovni bilish", "Lizing muddati va hujjatlarini aniqlash"],
        "complaint": ["Muammoni tez hal qilish", "Murojaat holatini kuzatish"],
        "general_question": ["Ehtiyojni aniqlashtirish", "Mos bank xizmatini topish"],
    }
    result = list(needs[intent])
    if objection == "interest_rate_expensive":
        result.append("Foiz stavkasini boshqa banklar bilan solishtirish")
    elif objection == "competitor_better":
        result.append("Raqobatchi bank shartlariga nisbatan afzallikni ko'rish")
    elif objection == "not_trust":
        result.append("Bank shartlariga ishonch hosil qilish")
    return result


def _risk_level(sentiment: Sentiment, objection: Objection) -> Literal["low", "medium", "high"]:
    if sentiment == "negative" or objection in {"not_trust", "competitor_better"}:
        return "high"
    if objection != "none":
        return "medium"
    return "low"


def _priority(sentiment: Sentiment, objection: Objection) -> Literal["normal", "attention", "urgent"]:
    if sentiment == "negative" or objection in {"not_trust", "competitor_better"}:
        return "urgent"
    if objection != "none":
        return "attention"
    return "normal"


def _lead_temperature(intent: Intent, objection: Objection) -> Literal["cold", "warm", "hot"]:
    if intent in {"credit_request", "card_opening", "deposit", "leasing"} and objection == "none":
        return "hot"
    if intent in {"credit_request", "card_opening", "deposit", "leasing"}:
        return "warm"
    return "cold"


def _opportunity(intent: Intent, objection: Objection) -> str:
    if intent == "credit_request":
        return "Kredit kalkulyatori, sug'urta va karta orqali oylik to'lov yechimini taklif qilish mumkin."
    if intent == "card_opening":
        return "Karta bilan birga mobil banking, SMS xabarnoma va omonat mahsulotini taklif qilish mumkin."
    if intent == "deposit":
        return "Mijozga muddatli omonat va karta orqali foiz tushumini boshqarishni taklif qilish mumkin."
    if intent == "leasing":
        return "Lizing arizasi uchun hujjatlar ro'yxati va hisob-kitobni yuborish mumkin."
    if intent == "complaint":
        return "Muammoni tez hal qilish orqali mijoz ishonchini saqlab qolish mumkin."
    return "Ehtiyoj aniqlansa, mos mahsulotga yo'naltirish mumkin."


def _handoff_recommendation(intent: Intent, objection: Objection) -> str:
    if intent == "complaint" or objection == "not_trust":
        return "Supervisorga eskalyatsiya qilish tavsiya etiladi."
    if objection == "competitor_better":
        return "Senior agent yoki mahsulot eksperti bilan solishtirma taklif tayyorlash."
    if intent == "credit_request":
        return "Kredit kalkulyatori yoki kredit bo'limi bilan keyingi qadamni ochish."
    return "Agent o'zi davom ettirishi mumkin."


def _agent_script(intent: Intent, objection: Objection) -> list[str]:
    opener = "Tushunarli, sizga aniq va shaffof ma'lumot beraman."
    if intent == "credit_request":
        return [
            opener,
            "Kredit summasi, muddat va daromadingizga qarab oylik to'lovni hisoblab ko'rsatamiz.",
            "Foiz stavkasi va umumiy qaytariladigan summa bilan oldindan tanishib chiqishingiz zarur.",
            "Agar xohlasangiz, hozir taxminiy kalkulyatsiyani ko'rib chiqamiz.",
        ]
    if intent == "card_opening":
        return [
            opener,
            "Kartadan asosan qayerda foydalanishingizni bilsam, sizga mos turini tanlab beraman.",
            "Karta ochilgach mobil bankingni ulab, onlayn to'lovlarni boshqarish mumkin.",
        ]
    if intent == "complaint":
        return [
            "Murojaatingizni qabul qildim, holatni aniqlashtirib ro'yxatdan o'tkazamiz.",
            "Tekshiruv natijasini kuzatish uchun murojaat raqamini beramiz.",
            "Agar masala tezkor bo'lsa, supervisorga eskalyatsiya qilaman.",
        ]
    if objection != "none":
        return [opener, "Xavotiringizni tushunaman, shartlarni birma-bir solishtirib ko'raylik."]
    return [opener, "Savolingizni aniqlashtirsangiz, eng mos yechimni taklif qilaman."]


def _do_not_say(intent: Intent, objection: Objection) -> list[str]:
    result = [
        "Sizga kredit aniq chiqadi.",
        "Foiz stavkasi hamma uchun bir xil.",
    ]
    if intent == "credit_request":
        result.append("Umumiy to'lovni keyin bilasiz.")
    if objection in {"interest_rate_expensive", "competitor_better"}:
        result.append("Boshqa banklar yomonroq.")
    if objection == "not_trust":
        result.append("Ishonmasangiz o'zingiz bilasiz.")
    return result


def _closing_line(intent: Intent, objection: Objection) -> str:
    if intent == "credit_request":
        return "Sizga aniq qaror qilish uchun oylik to'lov va umumiy summani hisoblab ko'rsataman."
    if intent == "card_opening":
        return "Sizga mos karta turini tanlab, mobil bankingni ulash jarayonini ko'rsataman."
    if intent == "complaint":
        return "Murojaatingizni ro'yxatdan o'tkazib, natijani kuzatish uchun raqam beraman."
    return "Siz uchun eng mos variantni aniqlab, keyingi qadamni taklif qilaman."


def _crm_tags(intent: Intent, objection: Objection) -> list[str]:
    tags = [intent]
    if objection != "none":
        tags.append(objection)
    if intent == "credit_request":
        tags.extend(["loan_lead", "calculator_needed"])
    if intent == "complaint":
        tags.append("supervisor_watch")
    return tags


def _follow_up_questions(intent: Intent, objection: Objection) -> list[str]:
    questions: dict[Intent, list[str]] = {
        "credit_request": [
            "Qancha summa va necha oy muddatga kredit kerak?",
            "Oylik to'lov uchun qulay diapazoningiz qanday?",
            "Daromad manbangiz rasmiy tasdiqlanganmi?",
        ],
        "card_opening": [
            "Kartadan oylik tushishi, onlayn to'lov yoki xalqaro xarid uchun foydalanasizmi?",
            "Uzcard/Humo yoki xalqaro karta kerakmi?",
        ],
        "deposit": [
            "Omonatni qancha muddatga joylashtirmoqchisiz?",
            "Pulni muddatidan oldin yechish ehtimoli bormi?",
        ],
        "leasing": [
            "Lizing obyekti qiymati qancha?",
            "Boshlang'ich to'lov uchun qancha mablag' ajratgansiz?",
        ],
        "complaint": [
            "Muammo qachon yuz berdi?",
            "Telefon raqamingiz yoki murojaatga bog'liq hujjat raqami bormi?",
        ],
        "general_question": [
            "Qaysi xizmat bo'yicha maslahat kerak?",
            "Siz uchun eng muhim shart nima: narx, tezlik yoki qulaylik?",
        ],
    }
    result = list(questions[intent])
    if objection == "competitor_better":
        result.append("Boshqa bankda qaysi shart sizga ma'qul bo'ldi?")
    if objection == "interest_rate_expensive":
        result.append("Siz kutayotgan foiz yoki oylik to'lov diapazoni qanday?")
    return result


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


def _build_compliance_evidence(
    intent: Intent,
    objection: Objection,
    agent_text: str,
    transcript: list[SpeakerLine] | None,
) -> list[ComplianceEvidence]:
    normalized_agent = _normalize(agent_text)
    evidence: list[ComplianceEvidence] = []

    checks = _compliance_checks(intent)
    for index, check in enumerate(checks, start=1):
        missing = not agent_text or not any(keyword in normalized_agent for keyword in check["keywords"])
        evidence.append(
            ComplianceEvidence(
                id=f"{intent}-{index}",
                severity=check["severity"],
                status="missing" if missing else "passed",
                speaker="agent" if agent_text else "system",
                line_index=_find_line_index(transcript, "agent", check["keywords"]) if not missing else None,
                finding=check["missing"] if missing else check["passed"],
                safer_phrase=check["phrase"],
                score_impact=check["impact"] if missing else 0,
            )
        )

    if objection != "none":
        risky_line = _find_line_index(transcript, "customer", _objection_keywords(objection))
        evidence.append(
            ComplianceEvidence(
                id=f"objection-{objection}",
                severity="warning",
                status="risky",
                speaker="customer",
                line_index=risky_line,
                finding="Mijoz e'tirozi qayd etildi va agentdan ehtiyotkor, dalilga asoslangan javob talab qiladi.",
                safer_phrase="Xavotiringizni tushunaman, shartlarni aniq hisob-kitob bilan solishtirib ko'raylik.",
                score_impact=8,
            )
        )

    return evidence


def _compliance_checks(intent: Intent) -> list[dict[str, object]]:
    checks: dict[Intent, list[dict[str, object]]] = {
        "credit_request": [
            {
                "missing": "Foiz stavkasi va kredit muddati tushuntirilmadi",
                "passed": "Foiz stavkasi yoki kredit muddati agent javobida tilga olindi",
                "phrase": "Kredit foiz stavkasi, muddat va mijoz profiliga qarab belgilanadi.",
                "keywords": ["foiz", "stavka", "muddat"],
                "severity": "critical",
                "impact": 10,
            },
            {
                "missing": "Umumiy qaytariladigan summa aytilmadi",
                "passed": "Umumiy yoki oylik to'lov bo'yicha disclosure bor",
                "phrase": "Umumiy to'lov summasi va oylik to'lovni oldindan ko'rib chiqishingiz zarur.",
                "keywords": ["umumiy", "oylik to'lov", "qaytariladigan"],
                "severity": "critical",
                "impact": 10,
            },
            {
                "missing": "Shaxsiy ma'lumotlar roziligi eslatilmadi",
                "passed": "Shaxsiy ma'lumotlar roziligi agent javobida eslatildi",
                "phrase": "Arizani ko'rib chiqish uchun shaxsiy ma'lumotlaringizga rozilik kerak bo'ladi.",
                "keywords": ["rozilik", "shaxsiy"],
                "severity": "warning",
                "impact": 8,
            },
        ],
        "card_opening": [
            {
                "missing": "Karta turi yoki foydalanish maqsadi aniqlashtirilmadi",
                "passed": "Karta turi yoki foydalanish maqsadi aniqlashtirildi",
                "phrase": "Kartadan oylik, onlayn to'lov yoki xalqaro xarid uchun foydalanishingizni aniqlashtirsak.",
                "keywords": ["karta", "foydalan", "humo", "uzcard", "visa", "mastercard"],
                "severity": "info",
                "impact": 5,
            },
            {
                "missing": "Karta xavfsizligi yoki mobil banking eslatilmadi",
                "passed": "Mobil banking yoki karta xavfsizligi eslatildi",
                "phrase": "Karta ochilgach mobil banking va xavfsizlik sozlamalarini ulab beramiz.",
                "keywords": ["mobil", "xavfsiz", "sms", "pin"],
                "severity": "info",
                "impact": 5,
            },
        ],
        "deposit": [
            {
                "missing": "Omonat muddati va foiz hisoblanishi tushuntirilmadi",
                "passed": "Omonat muddati yoki foiz hisoblanishi tilga olindi",
                "phrase": "Omonat muddati, foiz hisoblanishi va to'ldirish imkoniyatini solishtirib beraman.",
                "keywords": ["muddat", "foiz", "omonat", "depozit"],
                "severity": "warning",
                "impact": 6,
            },
            {
                "missing": "Muddatidan oldin yechish sharti aytilmadi",
                "passed": "Muddatidan oldin yechish sharti eslatildi",
                "phrase": "Pulni muddatidan oldin yechsangiz, foiz daromadiga ta'sirini oldindan ko'rib chiqamiz.",
                "keywords": ["oldin yech", "muddatidan oldin", "yechish"],
                "severity": "warning",
                "impact": 6,
            },
        ],
        "leasing": [
            {
                "missing": "Boshlang'ich to'lov yoki obyekt qiymati aniqlashtirilmadi",
                "passed": "Boshlang'ich to'lov yoki obyekt qiymati aniqlashtirildi",
                "phrase": "Lizing obyekti qiymati, boshlang'ich to'lov va muddatni birga hisoblab chiqamiz.",
                "keywords": ["boshlang'ich", "obyekt", "qiymat", "lizing"],
                "severity": "warning",
                "impact": 6,
            },
            {
                "missing": "Lizing hujjatlari yoki garov talabi eslatilmadi",
                "passed": "Hujjatlar yoki garov talabi tilga olindi",
                "phrase": "Ariza uchun kerakli hujjatlar va garov talabi bo'lsa, oldindan tushuntirib beraman.",
                "keywords": ["hujjat", "garov"],
                "severity": "info",
                "impact": 5,
            },
        ],
        "complaint": [
            {
                "missing": "Shikoyat ro'yxatga olinishi yoki murojaat raqami aytilmadi",
                "passed": "Murojaat raqami yoki ro'yxatga olish jarayoni aytildi",
                "phrase": "Murojaatingizni ro'yxatdan o'tkazib, kuzatish uchun murojaat raqamini beramiz.",
                "keywords": ["murojaat", "raqam", "ro'yxat"],
                "severity": "critical",
                "impact": 10,
            },
            {
                "missing": "Zarur holatda supervisor eskalyatsiyasi aytilmadi",
                "passed": "Eskalyatsiya yoki supervisor nazorati eslatildi",
                "phrase": "Masala tezkor yoki takroriy bo'lsa, supervisor nazoratiga o'tkazaman.",
                "keywords": ["supervisor", "eskalyatsiya", "nazorat"],
                "severity": "warning",
                "impact": 8,
            },
        ],
        "general_question": [],
    }
    return checks[intent]


def _find_line_index(transcript: list[SpeakerLine] | None, speaker: Literal["customer", "agent"], keywords: object) -> int | None:
    if transcript is None or not isinstance(keywords, list):
        return None
    keyword_values = [keyword for keyword in keywords if isinstance(keyword, str)]
    for index, line in enumerate(transcript):
        if line.speaker == speaker and _contains(_normalize(line.text), keyword_values):
            return index
    return None


def _product_references(intent: Intent) -> list[ProductReference]:
    return list(PRODUCT_REFERENCES[intent])


def _build_escalation_packet(
    *,
    intent: Intent,
    objection: Objection,
    risk_level: Literal["low", "medium", "high"],
    compliance: ComplianceResult,
    transcript_excerpt: str,
) -> EscalationPacket | None:
    should_escalate = (
        intent == "complaint"
        or objection in {"not_trust", "competitor_better"}
        or risk_level == "high"
        or compliance.status == "red"
    )
    if not should_escalate:
        return None

    urgency: Literal["normal", "attention", "urgent"] = "urgent" if risk_level == "high" or compliance.status == "red" else "attention"
    owner = "Supervisor" if intent == "complaint" or compliance.status == "red" else "Senior agent"
    reason = _escalation_reason(intent, objection, risk_level, compliance)
    return EscalationPacket(
        should_escalate=True,
        urgency=urgency,
        owner=owner,
        reason=reason,
        handoff_note=f"{owner} mijozga javobdan oldin holatni ko'rib chiqsin: {reason}",
        transcript_excerpt=transcript_excerpt,
    )


def _escalation_reason(
    intent: Intent,
    objection: Objection,
    risk_level: Literal["low", "medium", "high"],
    compliance: ComplianceResult,
) -> str:
    if compliance.status == "red":
        return "Compliance holati qizil, majburiy disclosure yoki xavfsiz iboralar yetishmayapti."
    if intent == "complaint":
        return "Mijoz shikoyat yoki xizmat muammosi bilan murojaat qilgan."
    if objection == "not_trust":
        return "Mijoz ishonchsizlik bildirdi, ehtiyotkor va shaffof izoh kerak."
    if objection == "competitor_better":
        return "Mijoz raqobatchi taklifini yaxshiroq deb baholamoqda."
    if risk_level == "high":
        return "Risk darajasi yuqori deb baholandi."
    return "Qo'shimcha nazorat talab qilinadi."


def _matched_signals(text: str, intent: Intent, objection: Objection, sentiment: Sentiment) -> list[str]:
    signals = [f"intent:{intent}", f"sentiment:{sentiment}"]
    if objection != "none":
        signals.append(f"objection:{objection}")

    keyword_groups = {
        "keyword:kredit": ["kredit", "qarz", "foiz", "oylik to'lov"],
        "keyword:karta": ["karta", "plastik", "humo", "uzcard", "visa", "mastercard"],
        "keyword:omonat": ["omonat", "depozit", "jamg'arma"],
        "keyword:lizing": ["lizing", "avtomobil", "texnika"],
        "keyword:shikoyat": ["shikoyat", "muammo", "norozi", "bloklandi"],
        "keyword:raqobatchi": ["boshqa bank", "raqobatchi"],
        "keyword:ishonch": ["ishonmayman", "ishonch yo'q", "xavotir"],
    }
    for signal, keywords in keyword_groups.items():
        if _contains(text, keywords):
            signals.append(signal)
    return signals


def _objection_keywords(objection: Objection) -> list[str]:
    keywords: dict[Objection, list[str]] = {
        "interest_rate_expensive": ["qimmat", "foizi qimmat", "stavka yuqori", "foiz ko'p"],
        "need_to_think": ["o'ylab", "keyin qaror", "maslahatlashib"],
        "competitor_better": ["boshqa bank", "raqobatchi", "u bankda yaxshi"],
        "not_trust": ["ishonmayman", "ishonch yo'q", "xavotirdaman"],
        "call_later": ["keyinroq", "ertaga", "qayta qo'ng'iroq", "call later"],
        "none": [],
    }
    return keywords[objection]


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
