import { demoScenarios, productReferences } from "../data/demoData.js";
import type {
  AnalysisResponse,
  CallSummaryResponse,
  ComplianceEvidence,
  ComplianceResult,
  DemoScenario,
  Intent,
  Objection,
  SpeakerLine
} from "../types.js";

const knowledgeRefs: Record<Intent, string[]> = {
  credit_request: ["Kredit disclosure", "Skoring siyosati", "Kredit karta + sug'urta scripti"],
  card_opening: ["Karta xavfsizligi", "Fraud tekshiruv", "Digital xizmatlar"],
  deposit: ["Omonat shartlari", "Mobil ilova orqali ochish"],
  leasing: ["Lizing pre-check", "Boshlang'ich to'lov", "Hujjatlar ro'yxati"],
  complaint: ["Shikoyat qabul qilish", "SLA va departament routing", "Murojaat raqami"],
  general_question: ["Umumiy bank xizmatlari", "Filial va aloqa markazi"]
};

export function listDemoScenarios(): DemoScenario[] {
  return demoScenarios;
}

export function analyzeMessage(message: string): AnalysisResponse {
  const text = normalize(message);
  const intent = detectIntent(text);
  const objection = detectObjection(text);
  const sentiment = detectSentiment(text, objection);
  const compliance = buildCompliance(intent, objection, "");
  const evidence = buildEvidence(intent, objection, "", [{ speaker: "customer", text: message }]);
  const risk = compliance.status === "red" || sentiment === "negative" ? "high" : objection === "none" ? "low" : "medium";
  const priority = risk === "high" ? "urgent" : objection === "none" ? "normal" : "attention";

  return {
    analysis_mode: "rules",
    matched_signals: matchedSignals(text, intent, objection),
    intent,
    sentiment,
    objection,
    customer_summary: customerSummary(intent, objection, message),
    customer_needs: customerNeeds(intent, objection),
    risk_level: risk,
    priority,
    lead_temperature: intent === "complaint" ? "cold" : objection === "none" ? "hot" : "warm",
    opportunity: opportunity(intent, objection),
    handoff_recommendation: handoff(intent),
    suggested_response: suggestedResponse(intent, objection),
    agent_script: agentScript(intent, objection),
    follow_up_questions: followUpQuestions(intent),
    do_not_say: doNotSay(intent),
    closing_line: closingLine(intent),
    crm_tags: crmTags(intent, objection),
    next_best_action: nextBestAction(intent, objection),
    confidence: confidence(intent, objection),
    compliance,
    compliance_evidence: evidence,
    product_references: [...productReferences[intent]],
    escalation_packet: {
      should_escalate: intent === "complaint" || compliance.status === "red",
      urgency: priority,
      owner: intent === "complaint" ? "Support supervisor" : "Compliance nazoratchi",
      reason: intent === "complaint" ? "Mijoz shikoyat bildirdi" : "Compliance riski bor",
      handoff_note: `${intent} bo'yicha ${priority} ustuvorlikda ko'rib chiqish kerak.`,
      transcript_excerpt: message.slice(0, 360)
    },
    knowledge_refs: knowledgeRefs[intent]
  };
}

export function analyzeCall(transcript: SpeakerLine[]): CallSummaryResponse {
  const customerText = transcript.filter((line) => line.speaker === "customer").map((line) => line.text).join(" ");
  const agentText = transcript.filter((line) => line.speaker === "agent").map((line) => line.text).join(" ");
  const analysis = analyzeMessage(customerText || transcript.at(-1)?.text || "");
  const compliance = buildCompliance(analysis.intent, analysis.objection, agentText);

  return {
    summary: summary(analysis.intent, analysis.objection, customerText),
    crm_note: crmNote(analysis.intent, analysis.objection, compliance),
    recommended_next_step: analysis.next_best_action,
    compliance,
    compliance_evidence: buildEvidence(analysis.intent, analysis.objection, agentText, transcript)
  };
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replaceAll("o‘", "o'")
    .replaceAll("g‘", "g'")
    .replaceAll("`", "'");
}

function includesAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

function detectIntent(text: string): Intent {
  if (includesAny(text, ["shikoyat", "muammo", "bloklandi", "yechilib ketdi", "ishlamayapti", "norozi"])) {
    return "complaint";
  }
  if (includesAny(text, ["kredit", "qarz", "foiz", "oylik to'lov", "stavka", "mln", "million"])) {
    return "credit_request";
  }
  if (includesAny(text, ["karta", "plastik", "humo", "uzcard", "visa", "mastercard"])) {
    return "card_opening";
  }
  if (includesAny(text, ["omonat", "depozit", "jamg'arma"])) {
    return "deposit";
  }
  if (includesAny(text, ["lizing", "avtomobil", "texnika"])) {
    return "leasing";
  }
  return "general_question";
}

function detectObjection(text: string): Objection {
  if (includesAny(text, ["qimmat", "foizi qimmat", "stavka yuqori", "foiz baland"])) {
    return "interest_rate_expensive";
  }
  if (includesAny(text, ["o'ylab", "keyin qaror", "maslahatlashib"])) {
    return "need_to_think";
  }
  if (includesAny(text, ["boshqa bank", "raqobatchi", "u bankda yaxshi"])) {
    return "competitor_better";
  }
  if (includesAny(text, ["ishonmayman", "ishonch yo'q", "xavotirdaman"])) {
    return "not_trust";
  }
  if (includesAny(text, ["keyinroq", "ertaga", "qayta qo'ng'iroq"])) {
    return "call_later";
  }
  return "none";
}

function detectSentiment(text: string, objection: Objection): "positive" | "neutral" | "negative" {
  if (objection !== "none" || includesAny(text, ["shikoyat", "norozi", "ishlamayapti", "xato"])) {
    return "negative";
  }
  if (includesAny(text, ["kerak", "olmoqchi", "qiziqyapman", "ochmoqchi"])) {
    return "positive";
  }
  return "neutral";
}

function buildCompliance(intent: Intent, objection: Objection, agentText: string): ComplianceResult {
  const missing: string[] = [];
  const phrases: string[] = [];
  const normalizedAgent = normalize(agentText);

  if (intent === "credit_request") {
    missing.push("Daromad manbai", "Mablag' maqsadi", "Skoring roziligi");
    phrases.push("Tasdiq skoring natijasiga bog'liq ekanini ayting.");
  }
  if (intent === "complaint") {
    missing.push("Shaxsni tasdiqlash", "Murojaat raqamini berish", "SLA muddatini aytish");
    phrases.push("Murojaatingiz ro'yxatga olindi, status bo'yicha xabar beramiz.");
  }
  if (objection === "interest_rate_expensive") {
    phrases.push("Foizni va umumiy to'lovni aniq hisob-kitob bilan tushuntiring.");
  }
  if (includesAny(normalizedAgent, ["100 foiz", "aniq tasdiqlanadi", "kafolat", "garantiya"])) {
    return {
      score: 48,
      status: "red",
      missing_items: ["Noto'g'ri va'da guardraili buzildi", ...missing],
      suggested_phrases: ["Bunday va'da bermang: tasdiq bank skoringi va hujjatlarga bog'liq.", ...phrases]
    };
  }

  const score = Math.max(62, 96 - missing.length * 9);
  return {
    score,
    status: score >= 85 ? "green" : "yellow",
    missing_items: missing,
    suggested_phrases: phrases
  };
}

function buildEvidence(intent: Intent, objection: Objection, agentText: string, transcript: SpeakerLine[]): ComplianceEvidence[] {
  const evidence: ComplianceEvidence[] = [];
  if (intent === "credit_request") {
    evidence.push({
      id: "income-source",
      severity: "warning",
      status: "missing",
      speaker: "system",
      line_index: null,
      finding: "Kredit suhbati uchun daromad manbai so'ralishi kerak.",
      safer_phrase: "Daromad manbangiz va oylik tushumingiz oralig'ini ayta olasizmi?",
      score_impact: -9
    });
  }
  if (objection !== "none") {
    evidence.push({
      id: "objection",
      severity: "info",
      status: "passed",
      speaker: "customer",
      line_index: transcript.findIndex((line) => line.speaker === "customer"),
      finding: "Mijoz e'tirozi aniqlandi.",
      safer_phrase: "E'tirozni tan olib, tasdiqlangan script bilan javob bering.",
      score_impact: 0
    });
  }
  if (includesAny(normalize(agentText), ["100 foiz", "aniq tasdiqlanadi", "kafolat"])) {
    evidence.push({
      id: "mis-selling",
      severity: "critical",
      status: "risky",
      speaker: "agent",
      line_index: transcript.findIndex((line) => line.speaker === "agent" && includesAny(normalize(line.text), ["100 foiz", "aniq tasdiqlanadi", "kafolat"])),
      finding: "Operator noto'g'ri va'da berdi.",
      safer_phrase: "Tasdiq skoring natijasiga va hujjatlar tekshiruviga bog'liq.",
      score_impact: -35
    });
  }
  return evidence;
}

function matchedSignals(text: string, intent: Intent, objection: Objection): string[] {
  const signals = [intent.replaceAll("_", " ")];
  if (objection !== "none") {
    signals.push(objection.replaceAll("_", " "));
  }
  if (includesAny(text, ["shikoyat", "muammo", "ishlamayapti"])) {
    signals.push("ticket kerak");
  }
  return signals;
}

function customerSummary(intent: Intent, objection: Objection, message: string): string {
  if (intent === "complaint") {
    return "Mijoz muammo yoki shikoyat bildirdi; ticket ochish va SLA bilan status berish kerak.";
  }
  if (intent === "credit_request" && objection === "interest_rate_expensive") {
    return "Mijoz kreditga qiziqyapti, asosiy e'tiroz foiz va umumiy to'lov atrofida.";
  }
  return `Mijoz ehtiyoji: ${message.slice(0, 140)}`;
}

function customerNeeds(intent: Intent, objection: Objection): string[] {
  const needs: Record<Intent, string[]> = {
    credit_request: ["Kredit shartlarini tushunish", "Oylik to'lovni solishtirish", "Skoring natijasini bilish"],
    card_opening: ["Karta tanlash", "Xavfsizlikni tushunish", "Digital xizmat ulash"],
    deposit: ["Foiz va muddatni solishtirish", "Masofadan ochish imkoniyati"],
    leasing: ["Boshlang'ich to'lov", "Hujjatlar va muddat"],
    complaint: ["Muammoni ro'yxatga olish", "Mas'ul bo'limga yo'naltirish", "Status kuzatish"],
    general_question: ["To'g'ri bo'limga yo'naltirish"]
  };
  return objection === "interest_rate_expensive" ? [...needs[intent], "Foiz e'tirozini yumshatish"] : needs[intent];
}

function opportunity(intent: Intent, objection: Objection): string {
  if (intent === "credit_request") {
    return "Salary segment va overdraft tarixi sabab kredit karta + sug'urta paketi uchun iliq lead.";
  }
  if (intent === "complaint") {
    return "Muammoni tez ticket qilib, mijoz ishonchini saqlash va churn riskini kamaytirish.";
  }
  if (objection !== "none") {
    return "E'tiroz hal qilinsa, follow-up orqali sotuvga qaytarish mumkin.";
  }
  return "Mijoz ehtiyojiga mos qo'shimcha xizmat taklif qilish mumkin.";
}

function handoff(intent: Intent): string {
  if (intent === "complaint") {
    return "Support supervisor yoki mas'ul departamentga ticket bilan yo'naltiring.";
  }
  if (intent === "credit_request") {
    return "Kredit pre-check va skoring roziligi uchun kredit mutaxassisiga yo'naltiring.";
  }
  return "Operator suhbatni davom ettirishi mumkin.";
}

function suggestedResponse(intent: Intent, objection: Objection): string {
  return agentScript(intent, objection)[0] ?? "Sizga mos yechimni aniqlashtirib beraman.";
}

function agentScript(intent: Intent, objection: Objection): string[] {
  if (intent === "complaint") {
    return [
      "Tushunarli, murojaatingizni ro'yxatga olaman va mas'ul bo'limga yuboraman.",
      "Xavfsizlik uchun shaxsingizni tasdiqlab olaylik, keyin ticket raqamini beraman.",
      "Holat progressda bo'ladi va SLA bo'yicha sizga javob qaytadi."
    ];
  }
  if (intent === "credit_request" && objection === "interest_rate_expensive") {
    return [
      "Foiz bo'yicha xavotiringizni tushunaman; aniq qaror skoring natijasiga bog'liq bo'ladi.",
      "Muddatni o'zgartirish orqali oylik to'lovni kamaytirish variantini hisoblab ko'rishimiz mumkin.",
      "Sizda salary tushum va overdraft tarixi borligi uchun kredit karta + sug'urta paketini ham ko'rib chiqish mumkin."
    ];
  }
  if (intent === "credit_request") {
    return [
      "Kredit bo'yicha avval daromad manbai, muddat va mablag' maqsadini aniqlashtiramiz.",
      "Tasdiq bank skoringi va hujjatlar tekshiruviga bog'liq bo'ladi."
    ];
  }
  return ["Qaysi xizmat bo'yicha yordam kerakligini aniqlashtirsam, sizni mos yechimga yo'naltiraman."];
}

function followUpQuestions(intent: Intent): string[] {
  const questions: Record<Intent, string[]> = {
    credit_request: ["Daromad manbangiz qanday?", "Mablag'ni qaysi maqsadda ishlatmoqchisiz?", "Skoring tekshiruviga rozimisiz?"],
    card_opening: ["Kartadan asosiy foydalanish maqsadingiz nima?", "Hozir karta bloklanganmi yoki yangi karta kerakmi?"],
    deposit: ["Qancha muddatga joylashtirmoqchisiz?", "Pulni muddatidan oldin yechish ehtimoli bormi?"],
    leasing: ["Lizing obyekti qiymati qancha?", "Boshlang'ich to'lov tayyormi?"],
    complaint: ["Muammo qachon yuz berdi?", "Operatsiya summasi qancha?", "Murojaat bo'yicha qayta aloqa raqamingiz shu raqammi?"],
    general_question: ["Qaysi xizmat bo'yicha yordam kerak?"]
  };
  return questions[intent];
}

function doNotSay(intent: Intent): string[] {
  const base = ["100% tasdiqlanadi demang", "Kafolatlangan foyda yoki o'zgarmas foiz va'da qilmang"];
  return intent === "complaint" ? [...base, "Aybdorlikni tekshiruvsiz bank zimmasiga olmang"] : base;
}

function closingLine(intent: Intent): string {
  if (intent === "complaint") {
    return "Murojaatingiz qabul qilindi, status bo'yicha sizga xabar beramiz.";
  }
  if (intent === "credit_request") {
    return "Hisob-kitob va skoringdan keyin sizga mos variantni aniq aytamiz.";
  }
  return "Yana savolingiz bo'lsa, yordam beraman.";
}

function crmTags(intent: Intent, objection: Objection): string[] {
  return [intent, objection, intent === "complaint" ? "ticket" : "lead"].filter((tag) => tag !== "none");
}

function nextBestAction(intent: Intent, objection: Objection): string {
  if (intent === "complaint") {
    return "Ticket oching, statusni in_progress qiling va mas'ul departamentni belgilang.";
  }
  if (intent === "credit_request" && objection === "interest_rate_expensive") {
    return "Oylik to'lov variantlarini tushuntirib, kredit karta + sug'urta paketini yumshoq taklif qiling.";
  }
  if (intent === "credit_request") {
    return "KYC savollarini yakunlab, skoring roziligini oling.";
  }
  return "Ehtiyojni aniqlashtiring va mos xizmatga routing qiling.";
}

function confidence(intent: Intent, objection: Objection): number {
  return intent === "general_question" && objection === "none" ? 0.68 : objection === "none" ? 0.86 : 0.92;
}

function summary(intent: Intent, objection: Objection, text: string): string {
  if (intent === "complaint") {
    return "Mijoz bank xizmatida muammo bildirgan, ticket ochish va departamentga yo'naltirish kerak.";
  }
  if (intent === "credit_request") {
    return objection === "interest_rate_expensive"
      ? "Mijoz kreditga qiziqdi, foiz bo'yicha e'tiroz bildirdi, hisob-kitob va alternativ mahsulot taklifi kerak."
      : "Mijoz kredit bo'yicha maslahat so'radi, KYC va skoring bosqichi kerak.";
  }
  return text.slice(0, 180) || "Suhbat bo'yicha qisqa xulosa tayyorlandi.";
}

function crmNote(intent: Intent, objection: Objection, compliance: ComplianceResult): string {
  return [
    `Intent: ${intent}`,
    `E'tiroz: ${objection}`,
    `Compliance score: ${compliance.score}%`,
    `Status: ${intent === "complaint" ? "in_progress" : "pending_customer"}`
  ].join("\n");
}
