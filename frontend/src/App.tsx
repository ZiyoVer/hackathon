import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Bot,
  FileAudio,
  FileText,
  Mic,
  PhoneCall,
  PlayCircle,
  Send,
  ShieldCheck,
  Sparkles,
  UploadCloud
} from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { apiGet, apiPost, apiUpload } from "./lib/api";
import type {
  AnalysisResponse,
  AudioTranscriptionResponse,
  CallSummaryResponse,
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
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative"
};

const objectionLabels: Record<Objection, string> = {
  interest_rate_expensive: "Foiz qimmat",
  need_to_think: "O'ylab ko'radi",
  competitor_better: "Raqobatchi",
  not_trust: "Ishonchsizlik",
  call_later: "Keyinroq",
  none: "Yo'q"
};

function App() {
  const [message, setMessage] = useState(FALLBACK_MESSAGE);
  const [transcript, setTranscript] = useState<SpeakerLine[]>(DEFAULT_TRANSCRIPT);
  const [scenarios, setScenarios] = useState<DemoScenario[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string>("");
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [summary, setSummary] = useState<CallSummaryResponse | null>(null);
  const [audioResult, setAudioResult] = useState<AudioTranscriptionResponse | null>(null);
  const [ttsResult, setTtsResult] = useState<TtsResponse | null>(null);
  const [error, setError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);

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

  const dashboardMetrics = useMemo(() => {
    const complianceScore = summary?.compliance.score ?? analysis?.compliance.score ?? 0;
    return [
      { label: "Compliance", value: complianceScore ? `${complianceScore}%` : "0%", icon: ShieldCheck },
      { label: "Confidence", value: analysis ? `${Math.round(analysis.confidence * 100)}%` : "0%", icon: Sparkles },
      { label: "E'tiroz", value: analysis ? objectionLabels[analysis.objection] : "Yo'q", icon: AlertTriangle },
      { label: "Call quality", value: complianceScore >= 80 ? "A" : complianceScore >= 60 ? "B" : "C", icon: BarChart3 }
    ];
  }, [analysis, summary]);

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
        voice: "uz-standard"
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

  const compliance = summary?.compliance ?? analysis?.compliance ?? null;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SQB Call Center</p>
          <h1>Agent Copilot</h1>
        </div>
        <div className="status-pill">
          <span className="live-dot" />
          Demo mode
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      <section className="metrics-row">
        {dashboardMetrics.map((metric) => (
          <div className="metric" key={metric.label}>
            <metric.icon size={19} />
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </section>

      <section className="workspace-grid">
        <aside className="side-panel">
          <div className="panel-heading">
            <PhoneCall size={20} />
            <h2>Demo scenariolar</h2>
          </div>
          <div className="scenario-list">
            {scenarios.map((scenario) => (
              <button
                className={scenario.id === activeScenarioId ? "scenario-button active" : "scenario-button"}
                key={scenario.id}
                onClick={() => selectScenario(scenario)}
                type="button"
              >
                <strong>{scenario.title}</strong>
                <span>{scenario.description}</span>
              </button>
            ))}
          </div>

          <label className="upload-zone">
            <UploadCloud size={24} />
            <span>{isUploading ? "Audio yuklanmoqda..." : "Audio yuklash"}</span>
            <input accept="audio/*" disabled={isUploading} onChange={uploadAudio} type="file" />
          </label>

          {audioResult && (
            <div className="audio-result">
              <FileAudio size={18} />
              <div>
                <strong>STT: {audioResult.provider}</strong>
                <span>{Math.round(audioResult.confidence * 100)}% confidence</span>
              </div>
            </div>
          )}
        </aside>

        <section className="main-panel">
          <div className="panel-heading">
            <Mic size={20} />
            <h2>Live transcript</h2>
          </div>

          <div className="transcript-feed">
            {transcript.map((line, index) => (
              <div className={`bubble ${line.speaker}`} key={`${line.speaker}-${index}`}>
                <span>{line.speaker === "customer" ? "Mijoz" : "Agent"}</span>
                <p>{line.text}</p>
              </div>
            ))}
          </div>

          <div className="composer">
            <textarea
              aria-label="Mijoz matni"
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Mijoz gapini kiriting..."
              value={message}
            />
            <div className="composer-actions">
              <button className="secondary-button" disabled={isSummarizing} onClick={analyzeTranscript} type="button">
                <FileText size={17} />
                {isSummarizing ? "Summary..." : "Call summary"}
              </button>
              <button className="primary-button" disabled={isAnalyzing} onClick={() => void analyzeText()} type="button">
                <Send size={17} />
                {isAnalyzing ? "Tahlil..." : "Analyze"}
              </button>
            </div>
          </div>

          {summary && (
            <div className="summary-band">
              <h3>Post-call summary</h3>
              <p>{summary.summary}</p>
              <div>
                <span>CRM note</span>
                <strong>{summary.crm_note}</strong>
              </div>
              <div>
                <span>Next step</span>
                <strong>{summary.recommended_next_step}</strong>
              </div>
            </div>
          )}
        </section>

        <aside className="insight-panel">
          <div className="panel-heading">
            <Bot size={20} />
            <h2>AI tavsiya</h2>
          </div>

          {analysis ? (
            <>
              <div className="badge-grid">
                <Badge label="Intent" tone="blue" value={intentLabels[analysis.intent]} />
                <Badge label="Sentiment" tone={analysis.sentiment} value={sentimentLabels[analysis.sentiment]} />
                <Badge label="Objection" tone="amber" value={objectionLabels[analysis.objection]} />
              </div>

              <div className="suggestion-box">
                <span>Suggested response</span>
                <p>{analysis.suggested_response}</p>
                <button className="icon-button" disabled={isSynthesizing} onClick={synthesizeSuggestion} type="button">
                  <PlayCircle size={17} />
                  {isSynthesizing ? "TTS..." : "TTS"}
                </button>
                {ttsResult && (
                  <div className="tts-output">
                    <span>{ttsResult.message}</span>
                    {ttsResult.audio_url && <audio controls src={ttsResult.audio_url} />}
                  </div>
                )}
              </div>

              <div className="next-action">
                <span>Next best action</span>
                <strong>{analysis.next_best_action}</strong>
              </div>

              <div className="knowledge-list">
                {analysis.knowledge_refs.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <Sparkles size={28} />
              <p>Demo scenariodan birini tanlang yoki mijoz matnini tahlil qiling.</p>
            </div>
          )}

          {compliance && <CompliancePanel compliance={compliance} />}
        </aside>
      </section>
    </main>
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

function CompliancePanel({ compliance }: { compliance: ComplianceResult }) {
  return (
    <section className="compliance-panel">
      <div className="compliance-head">
        <div>
          <span>Compliance</span>
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
          {compliance.suggested_phrases.map((phrase) => (
            <p key={phrase}>{phrase}</p>
          ))}
        </div>
      )}
    </section>
  );
}

function StatusDot({ status }: { status: ComplianceStatus }) {
  return <span className={`status-dot ${status}`} />;
}

function getErrorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : "Noma'lum xatolik yuz berdi.";
}

export default App;
