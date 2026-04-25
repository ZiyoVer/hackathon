import { config } from "../config.js";
import type { CallSession, Ticket } from "../types.js";

export async function pushTicketToBitrix(ticket: Ticket, session: CallSession): Promise<void> {
  if (!configBitrixWebhook()) {
    return;
  }

  await callBitrix("crm.lead.add", {
    fields: {
      TITLE: `AI Call Center: ${ticket.summary}`,
      SOURCE_ID: "CALL",
      COMMENTS: [
        `Call ID: ${session.id}`,
        `Status: ${ticket.status}`,
        `Departament: ${ticket.department}`,
        `Priority: ${ticket.priority}`,
        `SLA: ${ticket.sla_due_at}`
      ].join("\n")
    }
  });
}

export async function pushStatusToBitrix(session: CallSession, note?: string): Promise<void> {
  if (!configBitrixWebhook()) {
    return;
  }

  await callBitrix("tasks.task.add", {
    fields: {
      TITLE: `Call status: ${session.status}`,
      DESCRIPTION: [`Call ID: ${session.id}`, `Outcome: ${session.outcome}`, note ? `Note: ${note}` : ""]
        .filter(Boolean)
        .join("\n")
    }
  });
}

async function callBitrix(method: string, body: Record<string, unknown>): Promise<void> {
  const webhook = configBitrixWebhook();
  if (!webhook) {
    return;
  }

  const base = webhook.replace(/\/$/, "");
  const url = `${base}/${method}.json`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.warn(`Bitrix24 sync xatosi: ${response.status} ${text}`);
  }
}

function configBitrixWebhook(): string {
  return process.env.BITRIX24_WEBHOOK_URL ?? "";
}
