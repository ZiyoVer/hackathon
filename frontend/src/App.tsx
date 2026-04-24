import {
  AlertTriangle,
  BadgeCheck,
  ClipboardList,
  FileAudio,
  FileText,
  Gauge,
  ListChecks,
  Mic,
  PhoneCall,
  PlayCircle,
  Send,
  ShieldCheck,
  Target,
  UploadCloud,
  UserRound
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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

  const scoreCards = useMemo(() => {
    const complianceScore = summary?.compliance.score ?? analysis?.compliance.score ?? 0;
    return [
      { label: "Intent", value: analysis ? intentLabels[analysis.intent] : "Aniqlanmagan", icon: Target },
      { label: "Risk", value: analysis ? riskLabels[analysis.risk_level] : "Aniqlanmagan", icon: Gauge },
      { label: "Compliance", value: complianceScore ? `${complianceScore}%` : "0%", icon: ShieldCheck }
    ];
  }, [analysis, summary]);

  const scriptLines = analysis?.agent_script?.length ? analysis.agent_script : analysis ? [analysis.suggested_response] : [];
  const compliance = summary?.compliance ?? analysis?.compliance ?? null;

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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SQB Call Center</p>
          <h1>Agent Assist Console</h1>
        </div>
        <div className="status-pill">
          <span className="live-dot" />
          Real-time tahlil
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      <section className="scenario-strip">
        <div className="strip-title">
          <PhoneCall size={18} />
          <span>Demo holatlar</span>
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
      </section>

      <section className="score-row">
        {scoreCards.map((card) => (
          <div className="score-card" key={card.label}>
            <card.icon size={18} />
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </div>
        ))}
      </section>

      <section className="assist-grid">
        <section className="panel input-panel">
          <div className="panel-heading">
            <Mic size={20} />
            <h2>Mijoz signali</h2>
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
              <span>MP3, WAV, M4A yoki WEBM faylni STT orqali matnga aylantirish</span>
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
                <strong>STT: {audioResult.provider}</strong>
                <span>{Math.round(audioResult.confidence * 100)}% confidence</span>
              </div>
            </div>
          )}

          <div className="transcript-box">
            <div className="section-label">Suhbat matni</div>
            {transcript.map((line, index) => (
              <div className="transcript-line" key={`${line.speaker}-${index}`}>
                <span>{line.speaker === "customer" ? "Mijoz" : "Agent"}</span>
                <p>{line.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel analysis-panel">
          <div className="panel-heading">
            <UserRound size={20} />
            <h2>Mijoz tahlili</h2>
          </div>

          {analysis ? (
            <>
              <div className="badge-grid">
                <Badge label="Intent" tone="blue" value={intentLabels[analysis.intent]} />
                <Badge label="Sentiment" tone={analysis.sentiment} value={sentimentLabels[analysis.sentiment]} />
                <Badge label="E'tiroz" tone="amber" value={objectionLabels[analysis.objection]} />
              </div>

              <div className="analysis-summary">
                <div className="section-label">Mijoz holati</div>
                <p>{analysis.customer_summary}</p>
              </div>

              <ListBlock icon={ListChecks} title="Ehtiyojlar" items={analysis.customer_needs} />

              <div className="next-action">
                <span>Keyingi eng yaxshi qadam</span>
                <strong>{analysis.next_best_action}</strong>
              </div>

              <div className="opportunity-box">
                <span>Imkoniyat</span>
                <p>{analysis.opportunity}</p>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <ClipboardList size={30} />
              <p>Mijoz matnini kiriting yoki demo holat tanlang.</p>
            </div>
          )}
        </section>
      </section>

      <section className="support-grid">
        <section className="panel script-panel">
          <div className="panel-heading">
            <ClipboardList size={20} />
            <h2>Agent script</h2>
          </div>

          {scriptLines.length > 0 ? (
            <>
              <div className="script-list">
                {scriptLines.map((line, index) => (
                  <div className="script-line" key={`${line}-${index}`}>
                    <span>{index + 1}</span>
                    <p>{line}</p>
                  </div>
                ))}
              </div>

              <button className="icon-button" disabled={isSynthesizing} onClick={synthesizeSuggestion} type="button">
                <PlayCircle size={17} />
                {isSynthesizing ? "TTS..." : "Scriptni ovozga aylantirish"}
              </button>

              {ttsResult && (
                <div className="tts-output">
                  <span>{ttsResult.message}</span>
                  {ttsResult.audio_url && <audio controls src={ttsResult.audio_url} />}
                </div>
              )}

              <ListBlock icon={Target} title="Aniqlashtiruvchi savollar" items={analysis?.follow_up_questions ?? []} />
            </>
          ) : (
            <div className="empty-state compact">
              <p>Tahlildan keyin agent aytadigan tayyor gaplar shu yerda chiqadi.</p>
            </div>
          )}
        </section>

        <section className="panel compliance-panel">
          {compliance ? <CompliancePanel compliance={compliance} /> : <EmptyCompliance />}
        </section>
      </section>

      {summary && (
        <section className="summary-band">
          <h2>CRM uchun xulosa</h2>
          <p>{summary.summary}</p>
          <div>
            <span>CRM note</span>
            <strong>{summary.crm_note}</strong>
          </div>
          <div>
            <span>Keyingi qadam</span>
            <strong>{summary.recommended_next_step}</strong>
          </div>
        </section>
      )}
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

function CompliancePanel({ compliance }: { compliance: ComplianceResult }) {
  return (
    <>
      <div className="panel-heading">
        <ShieldCheck size={20} />
        <h2>Compliance</h2>
      </div>

      <div className="compliance-head">
        <div>
          <span>Status</span>
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
    </>
  );
}

function EmptyCompliance() {
  return (
    <div className="empty-state compact">
      <ShieldCheck size={28} />
      <p>Compliance checklist tahlildan keyin chiqadi.</p>
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
