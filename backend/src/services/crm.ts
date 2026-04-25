import { randomUUID } from "node:crypto";
import { demoCustomers } from "../data/demoData.js";
import { analyzeCall, analyzeMessage } from "./analyzer.js";
import { pushStatusToBitrix, pushTicketToBitrix } from "./bitrix.js";
import type { CallSession, CaseStatus, CustomerProfile, Lead, Speaker, Ticket } from "../types.js";

const customers = new Map<string, CustomerProfile>(demoCustomers.map((customer) => [customer.id, customer]));
const sessions = new Map<string, CallSession>();

export function listCustomers(): CustomerProfile[] {
  return [...customers.values()];
}

export function getCustomer(customerId: string): CustomerProfile | undefined {
  return customers.get(customerId);
}

export function findCustomerByPhone(phone?: string): CustomerProfile {
  if (!phone) {
    return demoCustomers[0];
  }
  const digits = phone.replace(/\D/g, "");
  return demoCustomers.find((customer) => customer.phone_masked.replace(/\D|X/g, "").endsWith(digits.slice(-4))) ?? demoCustomers[0];
}

export function createCallSession(input: {
  providerCallSid?: string;
  customerId: string;
  mode: "copilot" | "ai_call_agent";
  channel: "web_demo" | "twilio" | "pbx";
}): CallSession {
  const session: CallSession = {
    id: `call_${randomUUID().slice(0, 8)}`,
    provider_call_sid: input.providerCallSid,
    customer_id: input.customerId,
    mode: input.mode,
    channel: input.channel,
    started_at: new Date().toISOString(),
    status: "new",
    intent: "general_question",
    sentiment: "neutral",
    outcome: "Suhbat boshlandi",
    quality_score: 80,
    transcript: [],
    tickets: [],
    leads: [],
    notes: []
  };
  sessions.set(session.id, session);
  return session;
}

export function getCallSession(callId: string): CallSession | undefined {
  return sessions.get(callId);
}

export function listCallSessions(): CallSession[] {
  return [...sessions.values()].sort((a, b) => b.started_at.localeCompare(a.started_at));
}

export function appendTranscript(callId: string, speaker: Speaker, text: string, confidence?: number): CallSession | undefined {
  const session = sessions.get(callId);
  if (!session || !text.trim()) {
    return session;
  }

  session.transcript.push({ speaker, text: text.trim(), at: new Date().toISOString(), confidence });
  const customerText = session.transcript.filter((line) => line.speaker === "customer").map((line) => line.text).join(" ");
  if (customerText) {
    const analysis = analyzeMessage(customerText);
    session.intent = analysis.intent;
    session.sentiment = analysis.sentiment;
    session.quality_score = analysis.compliance.score;
    session.status = analysis.intent === "complaint" && session.status === "new" ? "in_progress" : session.status;
  }
  return session;
}

export function updateCaseStatus(callId: string, status: CaseStatus, note?: string): CallSession {
  const session = requireSession(callId);
  session.status = status;
  if (note) {
    session.notes.push(`${new Date().toISOString()}: ${note}`);
  }
  void pushStatusToBitrix(session, note);
  return session;
}

export function createTicket(input: {
  callId: string;
  type?: Ticket["type"];
  department?: Ticket["department"];
  priority?: Ticket["priority"];
  summary: string;
}): Ticket {
  const session = requireSession(input.callId);
  const ticket: Ticket = {
    id: `ticket_${randomUUID().slice(0, 8)}`,
    type: input.type ?? "complaint",
    department: input.department ?? "support",
    priority: input.priority ?? "medium",
    status: "in_progress",
    summary: input.summary,
    sla_due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  };
  session.tickets.push(ticket);
  session.status = "in_progress";
  session.notes.push(`Ticket yaratildi: ${ticket.id}`);
  void pushTicketToBitrix(ticket, session);
  return ticket;
}

export function createLead(input: {
  callId: string;
  productType?: Lead["product_type"];
  score?: number;
  nextAction: string;
}): Lead {
  const session = requireSession(input.callId);
  const lead: Lead = {
    id: `lead_${randomUUID().slice(0, 8)}`,
    product_type: input.productType ?? "credit_card",
    score: input.score ?? 72,
    next_action: input.nextAction,
    status: "new"
  };
  session.leads.push(lead);
  session.notes.push(`Lead yaratildi: ${lead.id}`);
  return lead;
}

export function saveCallSummary(callId: string): { session: CallSession; summary: string; crm_note: string } {
  const session = requireSession(callId);
  const transcript = session.transcript
    .filter((line) => line.speaker !== "system")
    .map((line) => ({ speaker: line.speaker as "customer" | "agent", text: line.text }));
  const summary = analyzeCall(transcript.length ? transcript : [{ speaker: "customer", text: "Suhbat yakunlandi" }]);
  session.outcome = summary.summary;
  session.quality_score = summary.compliance.score;
  session.ended_at = new Date().toISOString();
  session.notes.push(summary.crm_note);
  return { session, summary: summary.summary, crm_note: summary.crm_note };
}

export async function executeCrmTool(name: string, args: Record<string, unknown>, fallbackCallId: string): Promise<unknown> {
  if (name === "get_customer_profile") {
    const customerId = typeof args.customerId === "string" ? args.customerId : undefined;
    const phone = typeof args.phone === "string" ? args.phone : undefined;
    return customerId ? getCustomer(customerId) ?? findCustomerByPhone(phone) : findCustomerByPhone(phone);
  }
  if (name === "set_case_status") {
    return updateCaseStatus(readCallId(args, fallbackCallId), readStatus(args), readString(args.note));
  }
  if (name === "create_ticket") {
    return createTicket({
      callId: readCallId(args, fallbackCallId),
      type: readString(args.type) as Ticket["type"] | undefined,
      department: readString(args.department) as Ticket["department"] | undefined,
      priority: readString(args.priority) as Ticket["priority"] | undefined,
      summary: readString(args.summary) ?? "AI agent tomonidan ticket ochildi"
    });
  }
  if (name === "create_lead") {
    return createLead({
      callId: readCallId(args, fallbackCallId),
      productType: readString(args.productType) as Lead["product_type"] | undefined,
      score: typeof args.score === "number" ? args.score : undefined,
      nextAction: readString(args.nextAction) ?? "Operator follow-up qilsin"
    });
  }
  if (name === "save_call_summary") {
    return saveCallSummary(readCallId(args, fallbackCallId));
  }
  return { ok: false, error: `Noma'lum CRM tool: ${name}` };
}

function requireSession(callId: string): CallSession {
  const session = sessions.get(callId);
  if (!session) {
    throw new Error(`Call session topilmadi: ${callId}`);
  }
  return session;
}

function readCallId(args: Record<string, unknown>, fallback: string): string {
  return typeof args.callId === "string" && args.callId ? args.callId : fallback;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStatus(args: Record<string, unknown>): CaseStatus {
  const value = readString(args.status);
  const allowed: CaseStatus[] = ["new", "in_progress", "pending_customer", "resolved", "not_bank_issue", "escalated"];
  return value && allowed.includes(value as CaseStatus) ? (value as CaseStatus) : "in_progress";
}
