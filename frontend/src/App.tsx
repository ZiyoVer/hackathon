import {
  AlertTriangle,
  BadgeCheck,
  ClipboardList,
  Copy,
  FileAudio,
  FileText,
  Mic,
  PlayCircle,
  Send,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { apiGet, apiPost, apiUpload } from "./lib/api";
import { ManagerView } from "./ManagerView";
import type {
  AnalysisResponse,
  AudioTranscriptionResponse,
  CallSummaryResponse,
  ComplianceEvidence,
  ComplianceResult,
  ComplianceStatus,
  DemoScenario,
  Intent,
  Objection,
  Sentiment,
  SpeakerLine,
  TtsResponse
} from "./types";

const FALLBACK_MESSAGE =
  "Assalomu alaykum, menga 50 million so'm kredit kerak edi. 24 oyga olmoqchiman, lekin foizi qimmat bo'lsa kerak.";

const DEFAULT_TRANSCRIPT: SpeakerLine[] = [
  { speaker: "customer", text: "Assalomu alaykum, menga 50 million so'm kredit kerak edi." },
  { speaker: "agent", text: "Qanday muddatga olmoqchisiz?" },
  { speaker: "customer", text: "24 oyga. Lekin foizi qimmat bo'lsa kerak." }
];

const intentLabels: Record<Intent, string> = {
  credit_request: "Kredit",
  card_opening: "Karta",
  deposit: "Omonat",
  leasing: "Lizing",
  complaint: "Shikoyat",
  general_question: "Umumiy"
};

const sentimentLabels: Record<Sentiment, string> = {
  positive: "Ijobiy",
  neutral: "Neytral",
  negative: "Salbiy"
};

const objectionLabels: Record<Objection, string> = {
  interest_rate_expensive: "Foiz qimmat",
  need_to_think: "O'ylab ko'radi",
  competitor_better: "Raqobatchi yaxshi",
  not_trust: "Ishonchsizlik",
  call_later: "Keyinroq",
  none: "Yo'q"
};

const riskLabels: Record<AnalysisResponse["risk_level"], string> = {
  low: "Past",
  medium: "O'rta",
  high: "Yuqori"
};

const priorityLabels: Record<AnalysisResponse["priority"], string> = {
  normal: "Normal",
  attention: "E'tibor",
  urgent: "Shoshilinch"
};

const temperatureLabels: Record<AnalysisResponse["lead_temperature"], string> = {
  cold: "Sovuq",
  warm: "Iliq",
  hot: "Issiq"
};

const sqbFocusByIntent: Record<Intent, string[]> = {
  credit_request: ["Kredit", "Kredit karta", "SQB Mobile"],
  card_opening: ["Bank kartalari", "Kredit karta", "SQB Mobile"],
  deposit: ["Omonatlar", "SQB Mobile", "Bank ofisi"],
  leasing: ["Biznes xizmatlari", "Kredit", "Filial maslahati"],
  complaint: ["Mijoz murojaati", "Xavfsizlik", "Aloqa markazi"],
  general_question: ["SQB Mobile", "Kartalar", "To'lovlar"]
};

type SupportTab = "script" | "compliance" | "crm" | "transcript";

function App() {
  const [message, setMessage] = useState(FALLBACK_MESSAGE);
  const [transcript, setTranscript] = useState<SpeakerLine[]>(DEFAULT_TRANSCRIPT);
  const [scenarios, setScenarios] = useState<DemoScenario[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string>("");
  const [activeSupportTab, setActiveSupportTab] = useState<SupportTab>("script");
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [summary, setSummary] = useState<CallSummaryResponse | null>(null);
  const [audioResult, setAudioResult] = useState<AudioTranscriptionResponse | null>(null);
  const [ttsResult, setTtsResult] = useState<TtsResponse | null>(null);
  const [error, setError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<"operator" | "manager">(() =>
    typeof window !== "undefined" && window.location.hash === "#manager" ? "manager" : "operator",
  );
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeOperator] = useState("op1");

  useEffect(() => {
    const onHash = () => {
      setMode(window.location.hash === "#manager" ? "manager" : "operator");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const ensureSession = async (): Promise<string | null> => {
    if (sessionId) return sessionId;
    try {
      const created = await apiPost<
        { operator_id: string; customer_label: string },
        { id: string }
      >("/api/sessions", {
        operator_id: activeOperator,
        customer_label: "Mijoz #" + Math.floor(Math.random() * 1000),
      });
      setSessionId(created.id);
      return created.id;
    } catch {
      return null;
    }
  };

  const pushToSession = async (text: string, speaker: "customer" | "agent" = "customer") => {
    const sid = await ensureSession();
    if (!sid) return;
    try {
      await apiPost(`/api/sessions/${sid}/messages`, { speaker, text });
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    apiGet<DemoScenario[]>("/api/demo-scenarios")
      .then((data) => {
        setScenarios(data);
        if (data.length > 0) {
          setActiveScenarioId(data[0].id);
        }
      })
      .catch((caught: unknown) => setError(getErrorMessage(caught)));
  }, []);

  const signalItems = useMemo(() => {
    const complianceScore = summary?.compliance.score ?? analysis?.compliance.score ?? 0;
    return [
      { label: "Mavzu", value: analysis ? intentLabels[analysis.intent] : "Aniqlanmagan" },
      { label: "Ustuvorlik", value: analysis ? priorityLabels[analysis.priority] : "Aniqlanmagan" },
      { label: "Qiziqish", value: analysis ? temperatureLabels[analysis.lead_temperature] : "Aniqlanmagan" },
      { label: "Nazorat", value: complianceScore ? `${complianceScore}%` : "0%" }
    ];
  }, [analysis, summary]);

  const scriptLines = analysis?.agent_script?.length ? analysis.agent_script : analysis ? [analysis.suggested_response] : [];
  const compliance = summary?.compliance ?? analysis?.compliance ?? null;
  const complianceEvidence = summary?.compliance_evidence?.length
    ? summary.compliance_evidence
    : analysis?.compliance_evidence ?? [];
  const primaryScriptLine = scriptLines[0] ?? "";

  const copyBrief = async () => {
    if (!analysis) {
      return;
    }

    const brief = [
      `Mijoz: ${analysis.customer_summary}`,
      `Mavzu: ${intentLabels[analysis.intent]}`,
      `Xavf: ${riskLabels[analysis.risk_level]}`,
      `Ustuvorlik: ${priorityLabels[analysis.priority]}`,
      `Keyingi qadam: ${analysis.next_best_action}`,
      `Yakuniy gap: ${analysis.closing_line}`,
      `Teglar: ${analysis.crm_tags.join(", ")}`,
      analysis.escalation_packet?.should_escalate ? `Supervisorga: ${analysis.escalation_packet.handoff_note}` : ""
    ].join("\n");

    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch (caught: unknown) {
      setError(getErrorMessage(caught));
    }
  };

  const analyzeText = async (value = message) => {
    if (!value.trim()) {
      setError("Tahlil qilish uchun mijoz matnini kiriting.");
      return;
    }

    setIsAnalyzing(true);
    setError("");
    setTtsResult(null);
    try {
      const result = await apiPost<{ message: string }, AnalysisResponse>("/api/analyze-message", {
        message: value
      });
      setAnalysis(result);
      void pushToSession(value, "customer");
    } catch (caught: unknown) {
      setError(getErrorMessage(caught));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyzeTranscript = async () => {
    setIsSummarizing(true);
    setError("");
    try {
      const result = await apiPost<{ transcript: SpeakerLine[] }, CallSummaryResponse>("/api/analyze-call", {
        transcript
      });
      setSummary(result);
    } catch (caught: unknown) {
      setError(getErrorMessage(caught));
    } finally {
      setIsSummarizing(false);
    }
  };

  const synthesizeSuggestion = async () => {
    if (!analysis?.suggested_response) {
      return;
    }

    setIsSynthesizing(true);
    setError("");
    try {
      const result = await apiPost<{ text: string; voice: string }, TtsResponse>("/api/audio/synthesize", {
        text: analysis.suggested_response,
        voice: "gulnoza"
      });
      setTtsResult(result);
    } catch (caught: unknown) {
      setError(getErrorMessage(caught));
    } finally {
      setIsSynthesizing(false);
    }
  };

  const selectScenario = (scenario: DemoScenario) => {
    setActiveScenarioId(scenario.id);
    setMessage(scenario.customer_message);
    setTranscript(scenario.transcript);
    setSummary(null);
    setAudioResult(null);
    setTtsResult(null);
    void analyzeText(scenario.customer_message);
  };

  const handleScenarioChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const scenario = scenarios.find((item) => item.id === event.target.value);
    if (scenario) {
      selectScenario(scenario);
    }
  };

  const uploadAudio = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsUploading(true);
    setError("");
    setAudioResult(null);
    try {
      const result = await apiUpload<AudioTranscriptionResponse>("/api/audio/transcribe", file);
      setAudioResult(result);
      setMessage(result.transcript);
      setTranscript((previous) => [...previous, { speaker: "customer", text: result.transcript }]);
      void analyzeText(result.transcript);
    } catch (caught: unknown) {
      setError(getErrorMessage(caught));
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  if (mode === "manager") {
    return <ManagerView />;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SQB Bank aloqa markazi</p>
          <h1>SQB mijoz tahlili</h1>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            className="mode-toggle"
            type="button"
            onClick={() => {
              window.location.hash = "manager";
            }}
          >
            Manager rejimi
          </button>
          <div className="status-pill">
            <span className="live-dot" />
            Jonli tahlil
          </div>
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      <section className="assist-grid">
        <section className="panel input-panel">
          <div className="panel-heading">
            <Mic size={20} />
            <h2>Mijoz gapi</h2>
          </div>

          <div className="input-toolbar">
            <label htmlFor="scenario-select">Demo holat</label>
            <select id="scenario-select" onChange={handleScenarioChange} value={activeScenarioId}>
              {scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.title}
                </option>
              ))}
            </select>
          </div>

          <textarea
            aria-label="Mijoz gaplari"
            className="signal-input"
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Mijoz gapini yoki transcriptdan asosiy qismini kiriting..."
            value={message}
          />

          <label className="voice-upload-card">
            <UploadCloud size={24} />
            <div>
              <strong>{isUploading ? "Ovoz yuklanmoqda..." : "Ovoz fayl yuklash"}</strong>
              <span>MP3, WAV, M4A yoki WEBM faylni matnga aylantirish</span>
            </div>
            <input accept="audio/*" disabled={isUploading} onChange={uploadAudio} type="file" />
          </label>

          <div className="action-row">
            <button className="secondary-button" disabled={isSummarizing} onClick={analyzeTranscript} type="button">
              <FileText size={17} />
              {isSummarizing ? "CRM..." : "CRM xulosa"}
            </button>
            <button className="primary-button" disabled={isAnalyzing} onClick={() => void analyzeText()} type="button">
              <Send size={17} />
              {isAnalyzing ? "Tahlil..." : "Mijozni tahlil qilish"}
            </button>
          </div>

          {audioResult && (
            <div className="audio-result">
              <FileAudio size={18} />
              <div>
                <strong>Ovozdan matn olindi</strong>
                <span>{Math.round(audioResult.confidence * 100)}% ishonch</span>
              </div>
            </div>
          )}
        </section>

        <section className="panel analysis-panel">
          {analysis ? (
            <>
              <div className="decision-hero">
                <span>Keyingi javob</span>
                <strong>{primaryScriptLine || analysis.suggested_response}</strong>
                <p>{analysis.next_best_action}</p>
              </div>

              <div className="signal-bar" aria-label="Mijoz signallari">
                {signalItems.map((item) => (
                  <div key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>

              <div className="analysis-summary">
                <div className="section-label">Mijoz holati</div>
                <p>{analysis.customer_summary}</p>
              </div>

              <div className="compact-tags">
                <Badge label="Kayfiyat" tone={analysis.sentiment} value={sentimentLabels[analysis.sentiment]} />
                <Badge label="E'tiroz" tone="amber" value={objectionLabels[analysis.objection]} />
                <Badge label="Xavf" tone={analysis.risk_level === "high" ? "negative" : "blue"} value={riskLabels[analysis.risk_level]} />
              </div>

              <div className="opportunity-box">
                <span>Imkoniyat</span>
                <p>{analysis.opportunity}</p>
              </div>

              <ListBlock icon={ClipboardList} title="Ehtiyojlar" items={analysis.customer_needs} />

              <BankFocus intent={analysis.intent} />
            </>
          ) : (
            <div className="empty-state">
              <ClipboardList size={30} />
              <p>Mijoz matnini kiriting yoki demo holat tanlang.</p>
            </div>
          )}
        </section>
      </section>

      <section className="panel support-panel">
        <div className="tab-list" role="tablist" aria-label="Qo'llab-quvvatlash ma'lumotlari">
          <TabButton active={activeSupportTab === "script"} label="Javob" onClick={() => setActiveSupportTab("script")} />
          <TabButton
            active={activeSupportTab === "compliance"}
            label="Nazorat"
            onClick={() => setActiveSupportTab("compliance")}
          />
          <TabButton active={activeSupportTab === "crm"} label="CRM" onClick={() => setActiveSupportTab("crm")} />
          <TabButton
            active={activeSupportTab === "transcript"}
            label="Muloqot"
            onClick={() => setActiveSupportTab("transcript")}
          />
        </div>

        <div className="tab-panel">
          {activeSupportTab === "script" && (
            <ScriptTab
              analysis={analysis}
              isSynthesizing={isSynthesizing}
              onSynthesize={synthesizeSuggestion}
              scriptLines={scriptLines}
              ttsResult={ttsResult}
            />
          )}
          {activeSupportTab === "compliance" &&
            (compliance ? (
              <CompliancePanel compliance={compliance} evidence={complianceEvidence} />
            ) : (
              <EmptyCompliance />
            ))}
          {activeSupportTab === "crm" && (
            <CrmTab analysis={analysis} copied={copied} copyBrief={copyBrief} summary={summary} />
          )}
          {activeSupportTab === "transcript" && <TranscriptTab transcript={transcript} />}
        </div>
      </section>
    </main>
  );
}

function BankFocus({ intent }: { intent: Intent }) {
  return (
    <div className="bank-focus">
      <div className="section-label">SQB yo'nalishi</div>
      <div className="tag-row">
        {sqbFocusByIntent[intent].map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button aria-selected={active} className={active ? "tab-button active" : "tab-button"} onClick={onClick} role="tab" type="button">
      {label}
    </button>
  );
}

function ScriptTab({
  analysis,
  isSynthesizing,
  onSynthesize,
  scriptLines,
  ttsResult
}: {
  analysis: AnalysisResponse | null;
  isSynthesizing: boolean;
  onSynthesize: () => Promise<void>;
  scriptLines: string[];
  ttsResult: TtsResponse | null;
}) {
  if (scriptLines.length === 0) {
    return (
      <div className="empty-state compact">
        <p>Tahlildan keyin operator aytadigan tayyor gaplar shu yerda chiqadi.</p>
      </div>
    );
  }

  return (
    <>
      <div className="script-list">
        {scriptLines.map((line, index) => (
          <div className={index === 0 ? "script-line primary" : "script-line"} key={`${line}-${index}`}>
            <span>{index + 1}</span>
            <p>{line}</p>
          </div>
        ))}
      </div>

      <button className="icon-button" disabled={isSynthesizing} onClick={() => void onSynthesize()} type="button">
        <PlayCircle size={17} />
        {isSynthesizing ? "Ovoz tayyorlanmoqda..." : "Javobni ovozga aylantirish"}
      </button>

      {ttsResult && (
        <div className="tts-output">
          <span>{ttsResult.message}</span>
          {ttsResult.audio_url && <audio controls src={ttsResult.audio_url} />}
        </div>
      )}

      <ListBlock icon={ClipboardList} title="Aniqlashtiruvchi savollar" items={analysis?.follow_up_questions ?? []} />

      {analysis?.closing_line && (
        <div className="closing-line">
          <span>Yakuniy gap</span>
          <strong>{analysis.closing_line}</strong>
        </div>
      )}

      <ListBlock icon={AlertTriangle} title="Aytmaslik kerak" items={analysis?.do_not_say ?? []} />
    </>
  );
}

function CrmTab({
  analysis,
  copied,
  copyBrief,
  summary
}: {
  analysis: AnalysisResponse | null;
  copied: boolean;
  copyBrief: () => Promise<void>;
  summary: CallSummaryResponse | null;
}) {
  if (!analysis && !summary) {
    return (
      <div className="empty-state compact">
        <p>CRM yozuv va qo'ng'iroq xulosasi tahlildan keyin chiqadi.</p>
      </div>
    );
  }

  return (
    <div className="crm-grid">
      {analysis && (
        <div className="battlecard">
          <div className="battlecard-head">
            <div>
              <span>CRM yozuv</span>
              <strong>{priorityLabels[analysis.priority]} holat</strong>
            </div>
            <button className="copy-button" onClick={() => void copyBrief()} type="button">
              <Copy size={15} />
              {copied ? "Nusxalandi" : "CRM matn"}
            </button>
          </div>

          <div className="battlecard-grid">
            <div>
              <span>Qiziqish</span>
              <strong>{temperatureLabels[analysis.lead_temperature]}</strong>
            </div>
            <div>
              <span>Keyingi yo'l</span>
              <strong>{analysis.handoff_recommendation}</strong>
            </div>
          </div>

          <div className="tag-row">
            {analysis.crm_tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </div>
      )}

      {analysis?.escalation_packet?.should_escalate && (
        <div className="escalation-card">
          <div className="section-label">Supervisorga uzatish</div>
          <strong>{analysis.escalation_packet.owner} | {priorityLabels[analysis.escalation_packet.urgency]}</strong>
          <p>{analysis.escalation_packet.reason}</p>
          <p>{analysis.escalation_packet.handoff_note}</p>
          {analysis.escalation_packet.transcript_excerpt && <small>{analysis.escalation_packet.transcript_excerpt}</small>}
        </div>
      )}

      {summary && (
        <div className="summary-card">
          <h2>CRM uchun xulosa</h2>
          <p>{summary.summary}</p>
          <div>
            <span>CRM qayd</span>
            <strong>{summary.crm_note}</strong>
          </div>
          <div>
            <span>Keyingi qadam</span>
            <strong>{summary.recommended_next_step}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

function TranscriptTab({ transcript }: { transcript: SpeakerLine[] }) {
  return (
    <div className="transcript-box in-tab">
      {transcript.map((line, index) => (
        <div className="transcript-line" key={`${line.speaker}-${index}`}>
          <span>{line.speaker === "customer" ? "Mijoz" : "Operator"}</span>
          <p>{line.text}</p>
        </div>
      ))}
    </div>
  );
}

function Badge({ label, value, tone }: { label: string; value: string; tone: Sentiment | "blue" | "amber" }) {
  return (
    <div className={`analysis-badge ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ListBlock({
  icon: Icon,
  title,
  items
}: {
  icon: LucideIcon;
  title: string;
  items: string[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="list-block">
      <div className="section-label with-icon">
        <Icon size={15} />
        {title}
      </div>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function CompliancePanel({
  compliance,
  evidence
}: {
  compliance: ComplianceResult;
  evidence: ComplianceEvidence[];
}) {
  return (
    <>
      <div className="panel-heading">
        <ShieldCheck size={20} />
        <h2>Bank talablari</h2>
      </div>

      <div className="compliance-head">
        <div>
          <span>Holat</span>
          <strong>{compliance.score}%</strong>
        </div>
        <StatusDot status={compliance.status} />
      </div>

      <div className="progress-track">
        <div className={`progress-fill ${compliance.status}`} style={{ width: `${compliance.score}%` }} />
      </div>

      <div className="check-list">
        {compliance.missing_items.length > 0 ? (
          compliance.missing_items.map((item) => (
            <div className="check-item" key={item}>
              <AlertTriangle size={16} />
              <span>{item}</span>
            </div>
          ))
        ) : (
          <div className="check-item ok">
            <BadgeCheck size={16} />
            <span>Majburiy bandlar yopilgan</span>
          </div>
        )}
      </div>

      {compliance.suggested_phrases.length > 0 && (
        <div className="phrase-list">
          <div className="section-label">Majburiy gaplar</div>
          {compliance.suggested_phrases.map((phrase) => (
            <p key={phrase}>{phrase}</p>
          ))}
        </div>
      )}

      {evidence.length > 0 && (
        <div className="evidence-list">
          <div className="section-label">Nazorat izohlari</div>
          {evidence.map((item) => (
            <div className={`evidence-item ${item.status}`} key={item.id}>
              <div>
                <strong>{item.finding}</strong>
                {item.score_impact > 0 && <span>Ballga ta'siri: -{item.score_impact}</span>}
              </div>
              {item.safer_phrase && <p>{item.safer_phrase}</p>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function EmptyCompliance() {
  return (
    <div className="empty-state compact">
      <ShieldCheck size={28} />
      <p>Bank talablari tahlildan keyin chiqadi.</p>
    </div>
  );
}

function StatusDot({ status }: { status: ComplianceStatus }) {
  return <span className={`status-dot ${status}`} />;
}

function getErrorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : "Noma'lum xatolik yuz berdi.";
}

export default App;
