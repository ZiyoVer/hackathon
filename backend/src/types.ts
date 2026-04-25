export type Speaker = "customer" | "agent" | "system";
export type Intent = "credit_request" | "card_opening" | "deposit" | "leasing" | "complaint" | "general_question";
export type Sentiment = "positive" | "neutral" | "negative";
export type Objection =
  | "interest_rate_expensive"
  | "need_to_think"
  | "competitor_better"
  | "not_trust"
  | "call_later"
  | "none";
export type CaseStatus = "new" | "in_progress" | "pending_customer" | "resolved" | "not_bank_issue" | "escalated";

export interface SpeakerLine {
  speaker: Exclude<Speaker, "system">;
  text: string;
}

export interface ComplianceEvidence {
  id: string;
  severity: "info" | "warning" | "critical";
  status: "passed" | "missing" | "risky";
  speaker: Speaker;
  line_index: number | null;
  finding: string;
  safer_phrase: string;
  score_impact: number;
}

export interface ComplianceResult {
  score: number;
  status: "green" | "yellow" | "red";
  missing_items: string[];
  suggested_phrases: string[];
}

export interface ProductReference {
  id: string;
  title: string;
  category: string;
  why_it_matters: string;
  script_anchor: string;
  verified: boolean;
}

export interface EscalationPacket {
  should_escalate: boolean;
  urgency: "normal" | "attention" | "urgent";
  owner: string;
  reason: string;
  handoff_note: string;
  transcript_excerpt: string;
}

export interface AnalysisResponse {
  analysis_mode: "rules" | "gemini" | "demo";
  matched_signals: string[];
  intent: Intent;
  sentiment: Sentiment;
  objection: Objection;
  customer_summary: string;
  customer_needs: string[];
  risk_level: "low" | "medium" | "high";
  priority: "normal" | "attention" | "urgent";
  lead_temperature: "cold" | "warm" | "hot";
  opportunity: string;
  handoff_recommendation: string;
  suggested_response: string;
  agent_script: string[];
  follow_up_questions: string[];
  do_not_say: string[];
  closing_line: string;
  crm_tags: string[];
  next_best_action: string;
  confidence: number;
  compliance: ComplianceResult;
  compliance_evidence: ComplianceEvidence[];
  product_references: ProductReference[];
  escalation_packet: EscalationPacket | null;
  knowledge_refs: string[];
}

export interface CallSummaryResponse {
  summary: string;
  crm_note: string;
  recommended_next_step: string;
  compliance: ComplianceResult;
  compliance_evidence: ComplianceEvidence[];
}

export interface DemoScenario {
  id: string;
  title: string;
  description: string;
  customer_message: string;
  transcript: SpeakerLine[];
}

export interface CustomerProduct {
  id: string;
  type: "credit" | "card" | "deposit" | "insurance" | "overdraft";
  title: string;
  status: "active" | "closed" | "eligible";
  balance_range: string;
}

export interface CustomerProfile {
  id: string;
  full_name: string;
  phone_masked: string;
  age: number;
  income_range: string;
  segment: "mass" | "salary" | "premium" | "sme";
  risk_level: "low" | "medium" | "high";
  is_pep: boolean;
  kyc_status: "complete" | "needs_update" | "missing";
  products: CustomerProduct[];
  last_interaction: string;
  next_best_products: string[];
}

export interface CallSession {
  id: string;
  provider_call_sid?: string;
  customer_id: string;
  mode: "copilot" | "ai_call_agent";
  channel: "web_demo" | "twilio" | "pbx";
  started_at: string;
  ended_at?: string;
  status: CaseStatus;
  intent: Intent;
  sentiment: Sentiment;
  outcome: string;
  quality_score: number;
  transcript: Array<{ speaker: Speaker; text: string; at: string; confidence?: number }>;
  tickets: Ticket[];
  leads: Lead[];
  notes: string[];
}

export interface Ticket {
  id: string;
  type: "complaint" | "service_request" | "fraud_alert" | "technical_issue";
  department: "cards" | "credit" | "digital" | "compliance" | "branch" | "support";
  priority: "low" | "medium" | "high";
  status: CaseStatus;
  summary: string;
  sla_due_at: string;
}

export interface Lead {
  id: string;
  product_type: "credit_card" | "insurance" | "deposit" | "loan_refinance" | "overdraft";
  score: number;
  next_action: string;
  status: "new" | "offered" | "accepted" | "rejected" | "follow_up";
}
