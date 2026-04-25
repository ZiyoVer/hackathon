export type Intent =
  | "credit_request"
  | "card_opening"
  | "deposit"
  | "leasing"
  | "complaint"
  | "general_question";

export type Sentiment = "positive" | "neutral" | "negative";

export type Objection =
  | "interest_rate_expensive"
  | "need_to_think"
  | "competitor_better"
  | "not_trust"
  | "call_later"
  | "none";

export type ComplianceStatus = "green" | "yellow" | "red";

export interface SpeakerLine {
  speaker: "customer" | "agent";
  text: string;
}

export interface ComplianceResult {
  score: number;
  status: ComplianceStatus;
  missing_items: string[];
  suggested_phrases: string[];
}

export interface ComplianceEvidence {
  id: string;
  severity: "info" | "warning" | "critical";
  status: "passed" | "missing" | "risky";
  speaker: "customer" | "agent" | "system";
  line_index: number | null;
  finding: string;
  safer_phrase: string;
  score_impact: number;
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
  analysis_mode: "rules" | "openai" | "gemini" | "demo";
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

export interface AudioTranscriptionResponse {
  transcript: string;
  provider: string;
  confidence: number;
  storage_url: string | null;
}

export interface TtsResponse {
  provider: string;
  audio_url: string | null;
  message: string;
}

export interface OutboundCallResponse {
  mode: "real" | "demo";
  callSid?: string;
  message: string;
  webhookUrl: string;
}
