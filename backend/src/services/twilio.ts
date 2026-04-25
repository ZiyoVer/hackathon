import twilio from "twilio";
import { config, hasTwilioCredentials } from "../config.js";

export async function createOutboundCall(input: { to: string; webhookUrl: string }): Promise<{
  mode: "real" | "demo";
  callSid?: string;
  message: string;
}> {
  if (!hasTwilioCredentials()) {
    return {
      mode: "demo",
      message: "Twilio keylar qo'yilmagan. Demo rejimida outbound call simulyatsiya qilindi."
    };
  }

  const client = twilio(config.twilioAccountSid, config.twilioAuthToken);
  const call = await client.calls.create({
    to: input.to,
    from: config.twilioFromNumber,
    url: input.webhookUrl,
    method: "POST"
  });

  return {
    mode: "real",
    callSid: call.sid,
    message: "Twilio outbound call boshlandi."
  };
}

export function buildTwilioTwiML(streamUrl: string, customerId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(streamUrl)}">
      <Parameter name="customerId" value="${escapeXml(customerId)}" />
    </Stream>
  </Connect>
</Response>`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
