import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function webhookSecretAccepted(value: string | undefined): boolean {
  if (!config.voiceWebhookSecret) {
    return true;
  }
  return safeEqual(value ?? "", config.voiceWebhookSecret);
}

export function signStreamToken(customerId: string, issuedAtMs = Date.now()): { token: string; ts: string } {
  const ts = String(issuedAtMs);
  const token = createHmac("sha256", streamSecret()).update(`${customerId}:${ts}`).digest("hex");
  return { token, ts };
}

export function verifyStreamToken(customerId: string, token: string | null, ts: string | null): boolean {
  if (!config.voiceStreamSecret) {
    return true;
  }
  if (!token || !ts) {
    return false;
  }
  const issuedAt = Number(ts);
  if (!Number.isFinite(issuedAt)) {
    return false;
  }
  const ageMs = Date.now() - issuedAt;
  if (ageMs < 0 || ageMs > config.voiceStreamMaxAgeSeconds * 1000) {
    return false;
  }
  return safeEqual(token, signStreamToken(customerId, issuedAt).token);
}

export function allowVoiceStreamRequest(identity: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(identity);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(identity, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= config.voiceStreamRateLimitPerMinute;
}

function streamSecret(): string {
  return config.voiceStreamSecret || config.voiceWebhookSecret || "dev-voice-stream-secret";
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}
