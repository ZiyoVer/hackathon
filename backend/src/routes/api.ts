import type { Router } from "express";
import express from "express";
import multer from "multer";
import { config } from "../config.js";
import { analyzeCall, analyzeMessage, listDemoScenarios } from "../services/analyzer.js";
import {
  appendTranscript,
  createCallSession,
  createLead,
  createTicket,
  getCallSession,
  getCustomer,
  listCallSessions,
  listCustomers,
  saveCallSummary,
  updateCaseStatus
} from "../services/crm.js";
import { createOutboundCall } from "../services/twilio.js";
import type { AnalysisResponse, CallSession, CaseStatus, SpeakerLine } from "../types.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export function createApiRouter(): Router {
  const router = express.Router();

  router.get("/demo-scenarios", (_req, res) => {
    res.json(listDemoScenarios());
  });

  router.get("/integrations/status", (_req, res) => {
    const publicUrlReady = Boolean(config.publicBaseUrl && config.publicWsBaseUrl);
    const geminiReady = Boolean(config.geminiApiKey);
    const twilioReady = Boolean(config.twilioAccountSid && config.twilioAuthToken && config.twilioFromNumber);
    const bitrixReady = Boolean(process.env.BITRIX24_WEBHOOK_URL);
    res.json({
      ready_for_web_demo: true,
      ready_for_phone_demo: geminiReady && twilioReady && publicUrlReady,
      integrations: {
        gemini_live: {
          configured: geminiReady,
          env: "GEMINI_API_KEY",
          note: geminiReady ? "Gemini Live server-side ishlatishga tayyor." : "Google AI Studio API key kerak."
        },
        twilio_voice: {
          configured: twilioReady,
          env: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER", "VOICE_WEBHOOK_SECRET", "VOICE_STREAM_SECRET"],
          note: twilioReady ? "Inbound/outbound telefon demo uchun credential bor." : "Twilio Voice account va raqam kerak."
        },
        public_tunnel: {
          configured: publicUrlReady,
          env: ["PUBLIC_BASE_URL", "PUBLIC_WS_BASE_URL"],
          note: publicUrlReady ? "Twilio webhook/WSS URL tayyor." : "ngrok, Cloudflare Tunnel yoki Railway public URL kerak."
        },
        bitrix24: {
          configured: bitrixReady,
          env: "BITRIX24_WEBHOOK_URL",
          note: bitrixReady ? "CRM sync optional adapter yoqilgan." : "CRM sync hozir demo in-memory rejimida."
        }
      },
      missing_for_phone_demo: [
        !geminiReady ? "GEMINI_API_KEY" : "",
        !twilioReady ? "TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER" : "",
        !publicUrlReady ? "PUBLIC_BASE_URL/PUBLIC_WS_BASE_URL" : ""
      ].filter(Boolean)
    });
  });

  router.post("/analyze-message", (req, res) => {
    const message = readString(req.body?.message);
    if (!message) {
      res.status(400).json({ detail: "message majburiy" });
      return;
    }
    res.json(analyzeMessage(message));
  });

  router.post("/analyze-call", (req, res) => {
    const transcript = Array.isArray(req.body?.transcript) ? (req.body.transcript as SpeakerLine[]) : [];
    if (transcript.length === 0) {
      res.status(400).json({ detail: "transcript majburiy" });
      return;
    }
    res.json(analyzeCall(transcript));
  });

  router.post("/audio/transcribe", upload.single("file"), (req, res) => {
    const filename = req.file?.originalname ?? "audio.webm";
    res.json({
      transcript: `Demo STT: ${filename} fayli qabul qilindi. Real STT uchun Google Speech-to-Text yoki Gemini Live ulanadi.`,
      provider: "demo",
      confidence: 0.72,
      storage_url: null
    });
  });

  router.post("/audio/synthesize", (req, res) => {
    const text = readString(req.body?.text);
    if (!text) {
      res.status(400).json({ detail: "text majburiy" });
      return;
    }
    res.json({
      provider: config.geminiApiKey ? "gemini-live" : "demo",
      audio_url: null,
      message: config.geminiApiKey
        ? "Real telefon rejimida TTS Gemini Live audio output orqali beriladi."
        : "Demo TTS: GEMINI_API_KEY qo'yilgandan keyin real audio ishlaydi."
    });
  });

  router.get("/crm/customers", (_req, res) => {
    res.json(listCustomers());
  });

  router.get("/crm/customers/:customerId", (req, res) => {
    const customer = getCustomer(req.params.customerId);
    if (!customer) {
      res.status(404).json({ detail: "Mijoz topilmadi" });
      return;
    }
    res.json(customer);
  });

  router.get("/crm/calls", (_req, res) => {
    res.json(listCallSessions());
  });

  router.post("/crm/calls", (req, res) => {
    const customerId = readString(req.body?.customerId) ?? config.defaultCustomerId;
    const session = createCallSession({
      customerId,
      mode: req.body?.mode === "ai_call_agent" ? "ai_call_agent" : "copilot",
      channel: "web_demo"
    });
    res.status(201).json(session);
  });

  router.get("/crm/calls/:callId", (req, res) => {
    const session = getCallSession(req.params.callId);
    if (!session) {
      res.status(404).json({ detail: "Call session topilmadi" });
      return;
    }
    res.json(session);
  });

  router.post("/crm/calls/:callId/transcript", (req, res) => {
    const speaker = req.body?.speaker === "agent" || req.body?.speaker === "system" ? req.body.speaker : "customer";
    const text = readString(req.body?.text);
    if (!text) {
      res.status(400).json({ detail: "text majburiy" });
      return;
    }
    const session = appendTranscript(req.params.callId, speaker, text, 0.9);
    if (!session) {
      res.status(404).json({ detail: "Call session topilmadi" });
      return;
    }
    res.json(session);
  });

  router.patch("/crm/calls/:callId/status", (req, res) => {
    try {
      const session = updateCaseStatus(req.params.callId, readStatus(req.body?.status), readString(req.body?.note));
      res.json(session);
    } catch (error) {
      res.status(404).json({ detail: error instanceof Error ? error.message : "Call session topilmadi" });
    }
  });

  router.post("/crm/calls/:callId/tickets", (req, res) => {
    try {
      const ticket = createTicket({
        callId: req.params.callId,
        type: req.body?.type,
        department: req.body?.department,
        priority: req.body?.priority,
        summary: readString(req.body?.summary) ?? "Mijoz murojaati"
      });
      res.status(201).json(ticket);
    } catch (error) {
      res.status(404).json({ detail: error instanceof Error ? error.message : "Ticket yaratilmadi" });
    }
  });

  router.post("/crm/calls/:callId/leads", (req, res) => {
    try {
      const lead = createLead({
        callId: req.params.callId,
        productType: req.body?.productType,
        score: typeof req.body?.score === "number" ? req.body.score : undefined,
        nextAction: readString(req.body?.nextAction) ?? "Follow-up qo'ng'iroq"
      });
      res.status(201).json(lead);
    } catch (error) {
      res.status(404).json({ detail: error instanceof Error ? error.message : "Lead yaratilmadi" });
    }
  });

  router.post("/crm/calls/:callId/summary", (req, res) => {
    try {
      res.json(saveCallSummary(req.params.callId));
    } catch (error) {
      res.status(404).json({ detail: error instanceof Error ? error.message : "Summary saqlanmadi" });
    }
  });

  router.post("/agent/outbound-call", async (req, res, next) => {
    try {
      const to = readString(req.body?.to);
      if (!to) {
        res.status(400).json({ detail: "to telefon raqami majburiy. Masalan: +998901112233" });
        return;
      }
      const webhookUrl = `${getHttpBase(req)}/api/voice/twilio?customerId=${encodeURIComponent(
        readString(req.body?.customerId) ?? config.defaultCustomerId
      )}`;
      const result = await createOutboundCall({ to, webhookUrl });
      res.json({ ...result, webhookUrl });
    } catch (error) {
      next(error);
    }
  });

  router.post("/sessions", (req, res) => {
    const session = createCallSession({
      customerId: config.defaultCustomerId,
      mode: "copilot",
      channel: "web_demo"
    });
    appendTranscript(
      session.id,
      "system",
      `Operator: ${readString(req.body?.operator_id) ?? "op1"}, mijoz: ${readString(req.body?.customer_label) ?? "Demo mijoz"}`
    );
    res.status(201).json({ id: session.id });
  });

  router.post("/sessions/:sessionId/messages", (req, res) => {
    const speaker = req.body?.speaker === "agent" ? "agent" : "customer";
    const text = readString(req.body?.text);
    if (!text) {
      res.status(400).json({ detail: "text majburiy" });
      return;
    }
    const session = appendTranscript(req.params.sessionId, speaker, text, 0.9);
    if (!session) {
      res.status(404).json({ detail: "Sessiya topilmadi" });
      return;
    }
    res.json({ ok: true });
  });

  router.post("/manager/login", (req, res) => {
    if (readString(req.body?.password) !== config.managerPassword) {
      res.status(401).json({ detail: "Manager paroli noto'g'ri" });
      return;
    }
    res.json({ token: config.managerToken });
  });

  router.get("/manager/sessions", requireManager, (_req, res) => {
    res.json(listCallSessions().map(toManagerCard));
  });

  router.get("/manager/sessions/:sessionId", requireManager, (req, res) => {
    const sessionId = String(req.params.sessionId);
    const session = getCallSession(sessionId);
    if (!session) {
      res.status(404).json({ detail: "Sessiya topilmadi" });
      return;
    }
    res.json(toManagerDetail(session));
  });

  router.post("/manager/sessions/:sessionId/close", requireManager, (req, res) => {
    try {
      const session = updateCaseStatus(String(req.params.sessionId), "resolved", "Manager sessiyani yopdi");
      res.json(toManagerDetail(session));
    } catch (error) {
      res.status(404).json({ detail: error instanceof Error ? error.message : "Sessiya topilmadi" });
    }
  });

  return router;
}

export function getHttpBase(req: express.Request): string {
  if (config.publicBaseUrl) {
    return config.publicBaseUrl.replace(/\/$/, "");
  }
  const protoHeader = req.get("x-forwarded-proto");
  const proto = protoHeader?.includes("https") ? "https" : req.protocol;
  return `${proto}://${req.get("host")}`;
}

export function getWsBase(req: express.Request): string {
  if (config.publicWsBaseUrl) {
    return config.publicWsBaseUrl.replace(/\/$/, "");
  }
  const httpBase = getHttpBase(req);
  return httpBase.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStatus(value: unknown): CaseStatus {
  const allowed: CaseStatus[] = ["new", "in_progress", "pending_customer", "resolved", "not_bank_issue", "escalated"];
  return typeof value === "string" && allowed.includes(value as CaseStatus) ? (value as CaseStatus) : "in_progress";
}

function requireManager(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (req.get("X-Manager-Token") !== config.managerToken) {
    res.status(401).json({ detail: "Manager token kerak" });
    return;
  }
  next();
}

function toManagerCard(session: CallSession) {
  const analysis = lastAnalysis(session);
  const customer = getCustomer(session.customer_id);
  const lastText = [...session.transcript].reverse().find((line) => line.speaker !== "system")?.text ?? "Hali transcript yo'q";
  return {
    id: session.id,
    operator: { id: "op1", name: session.mode === "ai_call_agent" ? "AI Call Agent" : "Operator Demo", initial: session.mode === "ai_call_agent" ? "AI" : "OP" },
    customer_label: customer?.full_name ?? "Demo mijoz",
    status: session.status,
    last_text: lastText,
    last_summary: session.outcome,
    risk_level: analysis.risk_level,
    sentiment: analysis.sentiment,
    priority: analysis.priority,
    intent: analysis.intent,
    updated_at: session.ended_at ?? session.transcript.at(-1)?.at ?? session.started_at,
    message_count: session.transcript.length
  };
}

function toManagerDetail(session: CallSession) {
  return {
    ...toManagerCard(session),
    transcript: session.transcript
      .filter((line) => line.speaker !== "system")
      .map((line) => ({ speaker: line.speaker as "customer" | "agent", text: line.text })),
    last_analysis: lastAnalysis(session)
  };
}

function lastAnalysis(session: CallSession): AnalysisResponse {
  const customerText = session.transcript
    .filter((line) => line.speaker === "customer")
    .map((line) => line.text)
    .join(" ");
  return analyzeMessage(customerText || session.outcome || "Umumiy savol");
}
