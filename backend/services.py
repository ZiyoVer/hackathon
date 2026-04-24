from __future__ import annotations

from typing import Literal

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
        customer_summary=_customer_summary(intent, objection, message),
        customer_needs=_customer_needs(intent, objection),
        risk_level=_risk_level(sentiment, objection),
        priority=_priority(sentiment, objection),
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
