import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import WebSocket, { WebSocketServer } from "ws";
import { config } from "./config.js";
import { createApiRouter } from "./routes/api.js";
import { createVoiceRouter } from "./routes/voice.js";
import { createCallSession, appendTranscript, saveCallSummary } from "./services/crm.js";
import { GeminiLiveBridge } from "./services/geminiLive.js";

const app = express();
app.set("trust proxy", true);
app.use(cors({ origin: [config.frontendOrigin, "http://localhost:5173", "http://127.0.0.1:5173"], credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: config.appName,
    gemini_live: Boolean(config.geminiApiKey),
    twilio: Boolean(config.twilioAccountSid && config.twilioAuthToken && config.twilioFromNumber)
  });
});

app.use("/api", createApiRouter());
app.use("/api/voice", createVoiceRouter());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDist = path.resolve(__dirname, "../../frontend/dist");
app.use(express.static(frontendDist));
app.get("*", (_req, res, next) => {
  const indexFile = path.join(frontendDist, "index.html");
  res.sendFile(indexFile, (error) => {
    if (error) {
      next();
    }
  });
});

const server = http.createServer(app);
const twilioWss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (url.pathname !== "/api/voice/twilio/stream") {
    socket.destroy();
    return;
  }
  twilioWss.handleUpgrade(request, socket, head, (ws) => {
    twilioWss.emit("connection", ws, request, url);
  });
});

twilioWss.on("connection", (socket: WebSocket, _request: http.IncomingMessage, url: URL) => {
  let streamSid = "";
  let bridge: GeminiLiveBridge | undefined;
  const customerId = url.searchParams.get("customerId") || config.defaultCustomerId;
  const session = createCallSession({
    customerId,
    mode: "ai_call_agent",
    channel: "twilio"
  });

  socket.on("message", (raw) => {
    const payload = safeJson(raw.toString());
    if (!payload) {
      return;
    }

    if (payload.event === "start") {
      streamSid = payload.start?.streamSid ?? "";
      session.provider_call_sid = payload.start?.callSid;
      appendTranscript(session.id, "system", `Twilio stream boshlandi: ${streamSid}`);
      bridge = new GeminiLiveBridge(socket, streamSid, session.id, customerId);
      const connected = bridge.connect();
      if (!connected) {
        appendTranscript(session.id, "system", "GEMINI_API_KEY yo'q, real audio agent demo rejimida ishlamaydi.");
      }
      return;
    }

    if (payload.event === "media") {
      const mediaPayload = payload.media?.payload;
      if (typeof mediaPayload === "string") {
        bridge?.sendTwilioMedia(mediaPayload);
      }
      return;
    }

    if (payload.event === "stop") {
      appendTranscript(session.id, "system", "Twilio stream tugadi");
      bridge?.close();
      try {
        saveCallSummary(session.id);
      } catch (error) {
        console.warn(error);
      }
    }
  });

  socket.on("close", () => {
    bridge?.close();
  });
});

server.listen(config.port, () => {
  console.info(`${config.appName} API http://localhost:${config.port} da ishlayapti`);
});

function safeJson(raw: string): Record<string, any> | null {
  try {
    return JSON.parse(raw) as Record<string, any>;
  } catch {
    return null;
  }
}
