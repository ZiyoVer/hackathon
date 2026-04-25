import WebSocket from "ws";
import { config } from "../config.js";
import { executeCrmTool, getCustomer } from "./crm.js";
import { mulawToPcm16, pcm16ToMulaw, resamplePcm16 } from "./audio.js";
import type { CustomerProfile } from "../types.js";

type GeminiServerMessage = {
  setupComplete?: Record<string, never>;
  serverContent?: {
    interrupted?: boolean;
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    modelTurn?: {
      parts?: Array<{
        text?: string;
        inlineData?: { data?: string; mimeType?: string };
        inline_data?: { data?: string; mime_type?: string };
      }>;
    };
  };
  toolCall?: {
    functionCalls?: Array<{
      id?: string;
      name?: string;
      args?: Record<string, unknown>;
    }>;
  };
};

export class GeminiLiveBridge {
  private gemini?: WebSocket;
  private ready = false;
  private readonly customer: CustomerProfile | undefined;

  constructor(
    private readonly twilioSocket: WebSocket,
    private readonly streamSid: string,
    private readonly callId: string,
    customerId: string
  ) {
    this.customer = getCustomer(customerId);
  }

  connect(): boolean {
    if (!config.geminiApiKey) {
      return false;
    }

    const endpoint =
      "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
    const url = `${endpoint}?key=${encodeURIComponent(config.geminiApiKey)}`;
    this.gemini = new WebSocket(url, {
      headers: {
        "x-goog-api-key": config.geminiApiKey
      }
    });

    this.gemini.on("open", () => {
      this.gemini?.send(JSON.stringify({ setup: this.buildSetup() }));
    });
    this.gemini.on("message", (raw) => void this.handleGeminiMessage(raw.toString()));
    this.gemini.on("error", (error) => {
      this.sendTwilioLog(`Gemini Live xatosi: ${error.message}`);
    });
    this.gemini.on("close", () => {
      this.ready = false;
    });

    return true;
  }

  sendTwilioMedia(payload: string): void {
    if (!this.ready || this.gemini?.readyState !== WebSocket.OPEN) {
      return;
    }

    const mulaw = Buffer.from(payload, "base64");
    const pcm8 = mulawToPcm16(mulaw);
    const pcm16 = resamplePcm16(pcm8, 8000, 16000);
    this.gemini.send(
      JSON.stringify({
        realtimeInput: {
          audio: {
            data: pcm16.toString("base64"),
            mimeType: "audio/pcm;rate=16000"
          }
        }
      })
    );
  }

  close(): void {
    if (this.gemini?.readyState === WebSocket.OPEN) {
      this.gemini.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      this.gemini.close();
    }
  }

  private buildSetup(): Record<string, unknown> {
    const modelName = config.geminiLiveModel.startsWith("models/")
      ? config.geminiLiveModel
      : `models/${config.geminiLiveModel}`;

    return {
      model: modelName,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: config.geminiVoice
            }
          }
        }
      },
      systemInstruction: {
        parts: [{ text: this.systemPrompt() }]
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          silenceDurationMs: 650
        },
        activityHandling: "START_OF_ACTIVITY_INTERRUPTS"
      },
      tools: [
        {
          functionDeclarations: [
            {
              name: "get_customer_profile",
              description: "CRMdan mijoz profili, mahsulotlari va next-best-offer signallarini olish.",
              parameters: {
                type: "OBJECT",
                properties: {
                  customerId: { type: "STRING" },
                  phone: { type: "STRING" }
                }
              }
            },
            {
              name: "set_case_status",
              description: "CRM call yoki murojaat statusini yangilash.",
              parameters: {
                type: "OBJECT",
                properties: {
                  callId: { type: "STRING" },
                  status: {
                    type: "STRING",
                    enum: ["new", "in_progress", "pending_customer", "resolved", "not_bank_issue", "escalated"]
                  },
                  note: { type: "STRING" }
                },
                required: ["status"]
              }
            },
            {
              name: "create_ticket",
              description: "Mijoz muammosi yoki shikoyati uchun CRM ticket ochish.",
              parameters: {
                type: "OBJECT",
                properties: {
                  callId: { type: "STRING" },
                  type: { type: "STRING", enum: ["complaint", "service_request", "fraud_alert", "technical_issue"] },
                  department: { type: "STRING", enum: ["cards", "credit", "digital", "compliance", "branch", "support"] },
                  priority: { type: "STRING", enum: ["low", "medium", "high"] },
                  summary: { type: "STRING" }
                },
                required: ["summary"]
              }
            },
            {
              name: "create_lead",
              description: "Cross-sell yoki follow-up imkoniyati uchun lead yaratish.",
              parameters: {
                type: "OBJECT",
                properties: {
                  callId: { type: "STRING" },
                  productType: {
                    type: "STRING",
                    enum: ["credit_card", "insurance", "deposit", "loan_refinance", "overdraft"]
                  },
                  score: { type: "NUMBER" },
                  nextAction: { type: "STRING" }
                },
                required: ["nextAction"]
              }
            },
            {
              name: "save_call_summary",
              description: "Suhbat yakunida CRM note, outcome va quality score saqlash.",
              parameters: {
                type: "OBJECT",
                properties: {
                  callId: { type: "STRING" }
                }
              }
            }
          ]
        }
      ]
    };
  }

  private systemPrompt(): string {
    const customerLine = this.customer
      ? `Mijoz: ${this.customer.full_name}, segment: ${this.customer.segment}, risk: ${this.customer.risk_level}, KYC: ${this.customer.kyc_status}, mahsulotlar: ${this.customer.products.map((item) => item.title).join(", ")}.`
      : "Mijoz profili hozircha noma'lum.";

    return [
      "Sen bank call-center AI agentisan. O'zbek tilida tabiiy, qisqa va muloyim gapir.",
      "Qoidalar: kredit yoki mahsulot bo'yicha 100% tasdiq, kafolatlangan foyda yoki noto'g'ri foiz va'da qilma.",
      "Mijoz muammosi bo'lsa CRM tool orqali ticket och, statusni in_progress yoki resolved qil.",
      "Agar bank muammosi bo'lmasa ham, foydali yo'l-yo'riq ber va statusni not_bank_issue qil.",
      "Riskli yoki noaniq holatda operatorga ulashni taklif qil.",
      `Call ID: ${this.callId}.`,
      customerLine
    ].join("\n");
  }

  private async handleGeminiMessage(raw: string): Promise<void> {
    let message: GeminiServerMessage;
    try {
      message = JSON.parse(raw) as GeminiServerMessage;
    } catch {
      return;
    }

    if (message.setupComplete) {
      this.ready = true;
      this.sendTwilioLog("Gemini Live tayyor");
      return;
    }

    const serverContent = message.serverContent;
    if (serverContent?.interrupted) {
      this.sendTwilioClear();
    }
    if (serverContent?.outputTranscription?.text) {
      this.sendTwilioLog(`AI: ${serverContent.outputTranscription.text}`);
    }
    const parts = serverContent?.modelTurn?.parts ?? [];
    for (const part of parts) {
      const inlineData = part.inlineData ?? part.inline_data;
      const data = inlineData?.data;
      if (data) {
        this.sendAudioToTwilio(data);
      }
    }

    const calls = message.toolCall?.functionCalls ?? [];
    if (calls.length > 0) {
      const responses = await Promise.all(
        calls.map(async (call) => {
          const name = call.name ?? "unknown";
          const response = await executeCrmTool(name, call.args ?? {}, this.callId);
          return {
            id: call.id,
            name,
            response: { result: response }
          };
        })
      );
      this.gemini?.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
    }
  }

  private sendAudioToTwilio(base64Pcm24: string): void {
    if (this.twilioSocket.readyState !== WebSocket.OPEN || !this.streamSid) {
      return;
    }

    const pcm24 = Buffer.from(base64Pcm24, "base64");
    const pcm8 = resamplePcm16(pcm24, 24000, 8000);
    const mulaw = pcm16ToMulaw(pcm8);
    this.twilioSocket.send(
      JSON.stringify({
        event: "media",
        streamSid: this.streamSid,
        media: {
          payload: mulaw.toString("base64")
        }
      })
    );
    this.twilioSocket.send(
      JSON.stringify({
        event: "mark",
        streamSid: this.streamSid,
        mark: { name: `gemini-${Date.now()}` }
      })
    );
  }

  private sendTwilioClear(): void {
    if (this.twilioSocket.readyState === WebSocket.OPEN && this.streamSid) {
      this.twilioSocket.send(JSON.stringify({ event: "clear", streamSid: this.streamSid }));
    }
  }

  private sendTwilioLog(message: string): void {
    console.info(`[twilio:${this.callId}] ${message}`);
  }
}
