const scenarios = {
  fraud: "Kartamdan notanish 850 ming so'm yechilibdi, men bu to'lovni qilmaganman.",
  credit: "Menga 50 million so'm kredit kerak, lekin foizi juda qimmat bo'lsa kerak.",
  complaint: "Ilovada pul o'tkazma ishlamayapti, uch marta urinib ko'rdim, baribir xato chiqyapti."
};

const fallbackByIntent = {
  complaint: {
    suggestion: "Muammoni ticket qiling, statusni in_progress qiling va SLA ayting.",
    script: [
      "Tushunarli, murojaatingizni ro'yxatga olaman.",
      "Xavfsizlik uchun shaxsingizni tasdiqlab olaylik.",
      "Mas'ul bo'limga yuborib, status bo'yicha xabar beramiz."
    ],
    warnings: ["OTP, PIN, CVV so'ramang.", "Tekshiruvsiz bank aybini tan olmang."]
  },
  credit_request: {
    suggestion: "Foiz e'tirozini tan oling, skoringga bog'liq ekanini ayting.",
    script: [
      "Foiz bo'yicha xavotiringizni tushunaman.",
      "Aniq tasdiq skoring va hujjatlar tekshiruviga bog'liq.",
      "Muddatni o'zgartirib oylik to'lovni solishtirib ko'ramiz."
    ],
    warnings: ["100% tasdiqlanadi demang.", "Kafolatlangan foyda yoki o'zgarmas foiz va'da qilmang."]
  },
  general_question: {
    suggestion: "Ehtiyojni aniqlashtiring va mos bo'limga yo'naltiring.",
    script: ["Qaysi xizmat bo'yicha yordam kerakligini aniqlashtirib olay."],
    warnings: ["Maxfiy ma'lumotni identifikatsiyasiz aytmang."]
  }
};

const $ = (id) => document.getElementById(id);
let apiBaseUrl = "http://localhost:8080";
let mode = "copilot";

window.bankOverlay.getConfig().then((config) => {
  apiBaseUrl = config.apiBaseUrl || apiBaseUrl;
  checkApi();
});

window.bankOverlay.onAssist(() => {
  void runAssist();
});

window.bankOverlay.onMode((nextMode) => {
  setMode(nextMode === "agent" ? "agent" : "copilot");
});

window.bankOverlay.onClickThrough((enabled) => {
  $("apiStatus").textContent = enabled ? "Click-through" : "Interactive";
});

$("hideBtn").addEventListener("click", () => window.bankOverlay.hide());
$("assistBtn").addEventListener("click", () => void runAssist());
$("ticketBtn").addEventListener("click", () => {
  $("crmLine").textContent = "CRM: ticket yaratildi, status in_progress, fraud/support bo'limiga yuborildi.";
});
$("summaryBtn").addEventListener("click", () => {
  $("crmLine").textContent = "CRM summary: mijoz muammo bildirdi, keyingi qadam belgilandi, operator tasdiqlashi kerak.";
});

document.querySelectorAll("[data-scenario]").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.getAttribute("data-scenario");
    $("liveInput").value = scenarios[key] || scenarios.fraud;
    void runAssist();
  });
});

async function checkApi() {
  try {
    const response = await fetch(`${apiBaseUrl}/health`);
    $("apiStatus").textContent = response.ok ? "API online" : "API offline";
  } catch {
    $("apiStatus").textContent = "API offline";
  }
}

async function runAssist() {
  const message = $("liveInput").value.trim();
  if (!message) return;

  $("primarySuggestion").textContent = "Tahlil qilinyapti...";
  $("reasonLine").textContent = "Transcript + CRM kontekst parallel tekshirilmoqda.";

  try {
    const response = await fetch(`${apiBaseUrl}/api/analyze-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    if (!response.ok) throw new Error("API error");
    const analysis = await response.json();
    renderAnalysis(analysis);
  } catch {
    renderFallback(message);
  }
}

function renderAnalysis(analysis) {
  $("intentValue").textContent = labelIntent(analysis.intent);
  $("riskValue").textContent = labelRisk(analysis.risk_level);
  $("complianceValue").textContent = `${analysis.compliance?.score ?? 0}%`;
  $("primarySuggestion").textContent =
    mode === "agent"
      ? buildAgentLine(analysis)
      : analysis.suggested_response || analysis.next_best_action;
  $("reasonLine").textContent =
    mode === "agent"
      ? "AI Call Agent mijoz bilan o'zi gaplashadi va CRM actionlarni orqa fonda bajaradi."
      : analysis.next_best_action || "CRM kontekstga qarab javob berish kerak.";
  renderList("scriptList", analysis.agent_script || [analysis.suggested_response]);
  renderList("warningList", analysis.do_not_say || ["OTP, PIN, CVV so'ramang."]);
}

function renderFallback(message) {
  const intent = message.toLowerCase().includes("kredit")
    ? "credit_request"
    : message.toLowerCase().includes("xato") || message.toLowerCase().includes("yechilib")
      ? "complaint"
      : "general_question";
  const data = fallbackByIntent[intent];
  $("intentValue").textContent = labelIntent(intent);
  $("riskValue").textContent = intent === "complaint" ? "Yuqori" : "O'rta";
  $("complianceValue").textContent = intent === "complaint" ? "74%" : "68%";
  $("primarySuggestion").textContent = data.suggestion;
  $("reasonLine").textContent =
    mode === "agent"
      ? "AI Call Agent rejimi: javob ovoz orqali beriladi, ticket/summary orqa fonda."
      : "API offline bo'lgani uchun local fallback ishladi.";
  renderList("scriptList", data.script);
  renderList("warningList", data.warnings);
}

function setMode(nextMode) {
  mode = nextMode;
  document.querySelector(".overlay-shell").dataset.mode = mode;
  $("modeLabel").textContent = mode === "agent" ? "AI Call Agent" : "Copilot";
  $("reasonLine").textContent =
    mode === "agent"
      ? "Agent mijoz bilan gaplashadi; overlay faqat holat va riskni ko'rsatadi."
      : "Operator gaplashadi; overlay shivir sifatida keyingi gapni beradi.";
}

function buildAgentLine(analysis) {
  if (analysis.intent === "complaint") {
    return "Murojaatni qabul qildim, ticket ochaman va mas'ul bo'limga yuboraman.";
  }
  if (analysis.intent === "credit_request") {
    return "Kredit bo'yicha shartlarni skoringdan keyin aniq aytaman, hozir ma'lumotlarni tekshiraman.";
  }
  return analysis.suggested_response || "Sizga yordam berish uchun ma'lumotlarni tekshiryapman.";
}

function renderList(id, items) {
  const list = $(id);
  list.innerHTML = "";
  items.filter(Boolean).slice(0, 4).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });
}

function labelIntent(intent) {
  const labels = {
    credit_request: "Kredit",
    card_opening: "Karta",
    deposit: "Omonat",
    leasing: "Lizing",
    complaint: "Shikoyat",
    general_question: "Umumiy"
  };
  return labels[intent] || intent || "-";
}

function labelRisk(risk) {
  return { low: "Past", medium: "O'rta", high: "Yuqori" }[risk] || "-";
}
