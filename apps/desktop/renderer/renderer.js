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
let recognition = null;
let isListening = false;
let backendAutoStarted = false;
let analysisTimer = null;
let analysisRequestId = 0;

window.bankOverlay.getConfig().then((config) => {
  apiBaseUrl = config.apiBaseUrl || apiBaseUrl;
  backendAutoStarted = Boolean(config.backendAutoStarted);
  if (backendAutoStarted) {
    $("apiStatus").textContent = "API starting";
  }
  checkApi();
  setInterval(checkApi, 3000);
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
$("listenBtn").addEventListener("click", () => toggleListening());
$("copilotModeBtn").addEventListener("click", () => setMode("copilot"));
$("agentModeBtn").addEventListener("click", () => setMode("agent"));
$("liveInput").addEventListener("input", () => queueRealtimeAssist());

document.querySelectorAll("[data-scenario]").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.getAttribute("data-scenario");
    $("liveInput").value = scenarios[key] || scenarios.fraud;
    queueRealtimeAssist(80);
  });
});

async function checkApi() {
  try {
    const response = await fetch(`${apiBaseUrl}/health`);
    $("apiStatus").textContent = response.ok ? "API online" : backendAutoStarted ? "API starting" : "API offline";
  } catch {
    $("apiStatus").textContent = backendAutoStarted ? "API starting" : "API offline";
  }
}

function queueRealtimeAssist(delay = 650) {
  window.clearTimeout(analysisTimer);
  analysisTimer = window.setTimeout(() => {
    void runAssist({ realtime: true });
  }, delay);
}

async function runAssist(options = {}) {
  const message = $("liveInput").value.trim();
  if (!message) return;
  const requestId = ++analysisRequestId;

  if (!options.realtime) {
    $("primarySuggestion").textContent = "Tahlil qilinyapti...";
  }
  $("reasonLine").textContent =
    mode === "copilot"
      ? "Fon jarayonlari: transcript, CRM va knowledge base tekshirilmoqda."
      : "Transcript + CRM kontekst parallel tekshirilmoqda.";

  try {
    const response = await fetch(`${apiBaseUrl}/api/analyze-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    if (!response.ok) throw new Error("API error");
    const analysis = await response.json();
    if (requestId !== analysisRequestId) return;
    renderAnalysis(analysis);
  } catch {
    if (requestId !== analysisRequestId) return;
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
      : buildCopilotAnswer(analysis);
  $("reasonLine").textContent =
    mode === "agent"
      ? "AI Call Agent mijoz bilan o'zi gaplashadi va CRM actionlarni orqa fonda bajaradi."
      : "CRM, compliance va knowledge base fon rejimida tekshirildi.";
  renderList("scriptList", analysis.agent_script || [analysis.suggested_response]);
  renderList("warningList", analysis.do_not_say || ["OTP, PIN, CVV so'ramang."]);
  renderKnowledge(analysis);
  renderCrmAction(analysis);
  renderAgentState(analysis);
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
      : "Local fallback ishladi; operatorga faqat javob ko'rsatildi.";
  renderList("scriptList", data.script);
  renderList("warningList", data.warnings);
  renderList("knowledgeList", [
    intent === "complaint" ? "Shikoyat: ticket, SLA va mas'ul departament ko'rsatiladi." : "Kredit: skoring va disclosure qoidalari ishlaydi.",
    "Mock CRM: mijoz segmenti va risk darajasi tahlilga qo'shiladi."
  ]);
  renderAgentState({ intent, risk_level: intent === "complaint" ? "high" : "medium" });
}

function setMode(nextMode) {
  mode = nextMode;
  document.querySelector(".overlay-shell").dataset.mode = mode;
  $("modeLabel").textContent = mode === "agent" ? "AI Call Agent" : "Copilot";
  $("copilotModeBtn").classList.toggle("active", mode === "copilot");
  $("agentModeBtn").classList.toggle("active", mode === "agent");
  $("reasonLine").textContent =
    mode === "agent"
      ? "Agent mijoz bilan gaplashadi; overlay faqat holat va riskni ko'rsatadi."
      : "Operator gaplashadi; overlay faqat aytiladigan javobni beradi.";
  if (mode === "agent") {
    $("agentStatus").textContent = "AI agent faol";
    $("agentSubline").textContent = "Mijoz ovozi tinglanyapti";
    $("agentCrmState").textContent = "CRM actionlar va summary orqa fonda tayyorlanadi.";
  }
  queueRealtimeAssist(80);
}

function toggleListening() {
  if (isListening) {
    stopListening();
    return;
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    $("listenStatus").textContent = "Mic: not supported";
    $("reasonLine").textContent = "Bu Chromium build live speech recognition bermadi; hozir transcript maydoniga matn tushiring.";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "uz-UZ";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onstart = () => {
    isListening = true;
    $("listenStatus").textContent = "Mic: listening";
    $("listenBtn").textContent = "stop";
  };
  recognition.onerror = () => {
    stopListening();
    $("listenStatus").textContent = "Mic: error";
  };
  recognition.onend = () => {
    if (isListening) {
      recognition.start();
    }
  };
  recognition.onresult = (event) => {
    let finalText = "";
    let interimText = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const text = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += text;
      else interimText += text;
    }
    const value = `${$("liveInput").value}\n${finalText || interimText}`.trim();
    $("liveInput").value = value;
    if (finalText.trim()) {
      queueRealtimeAssist(80);
    }
  };
  recognition.start();
}

function stopListening() {
  isListening = false;
  $("listenStatus").textContent = "Mic: idle";
  $("listenBtn").textContent = "listen";
  if (recognition) {
    recognition.stop();
    recognition = null;
  }
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

function buildCopilotAnswer(analysis) {
  if (Array.isArray(analysis.agent_script) && analysis.agent_script.length > 0) {
    return analysis.agent_script[0];
  }
  return analysis.suggested_response || analysis.next_best_action || "Mijozga aniqlashtiruvchi savol bering.";
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

function renderKnowledge(analysis) {
  const references = analysis.product_references || [];
  const items = references.length
    ? references.map((item) => `${item.title}: ${item.script_anchor || item.why_it_matters}`)
    : analysis.knowledge_refs || ["Knowledge base mos yozuv topmadi."];
  renderList("knowledgeList", items);
}

function renderCrmAction(analysis) {
  if (analysis.intent === "complaint") {
    $("crmLine").textContent = "CRM: ticket tayyor, status in_progress, mas'ul bo'limga routing.";
    return;
  }
  if (analysis.intent === "credit_request") {
    $("crmLine").textContent = "CRM: lead warm, kredit karta + sug'urta follow-up tavsiya qilindi.";
    return;
  }
  $("crmLine").textContent = "CRM: summary va keyingi qadam avtomatik tayyorlanadi.";
}

function renderAgentState(analysis) {
  if (mode !== "agent") return;
  if (analysis.intent === "complaint") {
    $("agentStatus").textContent = "Shikoyat qabul qilinyapti";
    $("agentSubline").textContent = "Agent mijozni tinglayapti va ticket tayyorlayapti";
    $("agentCrmState").textContent = "CRM: in_progress, support routing, SLA eslatmasi.";
    return;
  }
  if (analysis.intent === "credit_request") {
    $("agentStatus").textContent = "Kredit suhbati ketmoqda";
    $("agentSubline").textContent = "Agent skoring va disclosure qoidalarini ushlab turibdi";
    $("agentCrmState").textContent = "CRM: lead warm, follow-up va next-best-offer.";
    return;
  }
  $("agentStatus").textContent = "AI agent gaplashyapti";
  $("agentSubline").textContent = "Mijoz niyati aniqlanmoqda";
  $("agentCrmState").textContent = `CRM: ${labelRisk(analysis.risk_level)} risk, summary fon rejimida.`;
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
