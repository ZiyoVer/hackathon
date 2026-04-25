import dotenv from "dotenv";

dotenv.config();

function numberFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  appName: process.env.APP_NAME ?? "Bank AI Call Center",
  port: numberFromEnv("PORT", 8080),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "",
  publicWsBaseUrl: process.env.PUBLIC_WS_BASE_URL ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiLiveModel: process.env.GEMINI_LIVE_MODEL ?? "gemini-3.1-flash-live-preview",
  geminiVoice: process.env.GEMINI_VOICE ?? "Puck",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  twilioApiKeySid: process.env.TWILIO_API_KEY_SID ?? "",
  twilioApiKeySecret: process.env.TWILIO_API_KEY_SECRET ?? "",
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER ?? "",
  managerPassword: process.env.MANAGER_PASSWORD ?? "admin123",
  managerToken: process.env.MANAGER_TOKEN ?? "demo-manager-token",
  defaultCustomerId: process.env.DEFAULT_CUSTOMER_ID ?? "cust_001"
};

export function hasTwilioCredentials(): boolean {
  return Boolean(config.twilioAccountSid && config.twilioAuthToken && config.twilioFromNumber);
}
