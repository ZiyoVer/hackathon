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

export interface AnalysisResponse {
  intent: Intent;
  sentiment: Sentiment;
  objection: Objection;
  customer_summary: string;
  customer_needs: string[];
  risk_level: "low" | "medium" | "high";
  opportunity: string;
  suggested_response: string;
  agent_script: string[];
  follow_up_questions: string[];
  next_best_action: string;
  confidence: number;
  compliance: ComplianceResult;
  knowledge_refs: string[];
}

export interface CallSummaryResponse {
  summary: string;
  crm_note: string;
  recommended_next_step: string;
  compliance: ComplianceResult;
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
