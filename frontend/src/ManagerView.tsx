import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Clock3,
  FileText,
  Lock,
  LogOut,
  MessageSquareText,
  Phone,
  Server,
  Shield,
  Users,
  Zap,
} from "lucide-react";
import {
  apiGetManager,
  apiPostManager,
  getManagerToken,
  setManagerToken,
} from "./lib/api";

type RiskLevel = "low" | "medium" | "high";
type Sentiment = "positive" | "neutral" | "negative";
type Priority = "normal" | "attention" | "urgent";
type Speaker = "customer" | "agent";

type SessionCard = {
  id: string;
  operator: { id: string; name: string; initial: string };
  customer_label: string;
  status: string;
  last_text: string;
  last_summary: string;
  risk_level: RiskLevel;
  sentiment: Sentiment;
  priority: Priority;
  intent: string;
  updated_at: string;
  message_count: number;
};

type SessionDetail = SessionCard & {
  transcript: { speaker: Speaker; text: string }[];
  last_analysis: {
    analysis_mode?: "rules" | "openai";
    confidence?: number;
    customer_summary?: string;
    next_best_action?: string;
    suggested_response?: string;
    agent_script?: string[];
    follow_up_questions?: string[];
    do_not_say?: string[];
    closing_line?: string;
    escalation_packet?: {
      should_escalate: boolean;
      reason: string;
      handoff_note: string;
      transcript_excerpt: string;
    } | null;
  } | null;
};

const RISK_RANK: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };
const riskLabels: Record<RiskLevel, string> = { high: "Yuqori", medium: "O'rta", low: "Past" };
const sentimentLabels: Record<Sentiment, string> = {
  positive: "Ijobiy",
  neutral: "Neytral",
  negative: "Salbiy",
};

type TranscriptTurn = {
  end?: number;
  rawSpeaker?: string;
  speaker: Speaker;
  start?: number;
  text: string;
};

type RawTranscriptSegment = {
  end?: unknown;
  speaker?: unknown;
  start?: unknown;
  text?: unknown;
};

export function ManagerView() {
  const [authed, setAuthed] = useState<boolean>(() => !!getManagerToken());

  if (!authed) {
    return <ManagerLogin onSuccess={() => setAuthed(true)} />;
  }

  return (
    <ManagerDashboard
      onLogout={() => {
        setManagerToken(null);
        setAuthed(false);
      }}
    />
  );
}

function ManagerLogin({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError("");
    try {
      const result = await apiPostManager<{ password: string }, { token: string }>(
        "/api/manager/login",
        { password },
      );
      setManagerToken(result.token);
      onSuccess();
    } catch {
      setError("Parol noto'g'ri");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="login-icon">
          <Lock size={28} />
        </div>
        <h2>SQB Manager Console</h2>
        <p>Parolni kiriting (faqat menedjerlar uchun)</p>
        <input
          aria-label="Manager paroli"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Parol"
          autoFocus
        />
        {error && <span className="login-error">{error}</span>}
        <button type="submit" disabled={loading || !password}>
          {loading ? "Tekshirilmoqda..." : "Kirish"}
        </button>
      </form>
    </main>
  );
}

function ManagerDashboard({ onLogout }: { onLogout: () => void }) {
  const [cards, setCards] = useState<SessionCard[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const data = await apiGetManager<SessionCard[]>("/api/manager/sessions");
        if (!cancelled) {
          data.sort((a, b) => RISK_RANK[a.risk_level] - RISK_RANK[b.risk_level]);
          setCards(data);
          setAuthError(false);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes("Manager")) {
          setAuthError(true);
        }
      }
    };
    void tick();
    const id = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (authError) {
    setManagerToken(null);
    onLogout();
    return null;
  }

  const stats = {
    total: cards.length,
    urgent: cards.filter((c) => c.priority === "urgent").length,
    negative: cards.filter((c) => c.sentiment === "negative").length,
  };

  return (
    <main className="manager-shell">
      <header className="manager-header">
        <div>
          <p className="eyebrow">SQB Manager Console</p>
          <h1>Jonli kuzatuv paneli</h1>
        </div>
        <div className="manager-header-actions">
          <div className="manager-stats">
            <div>
              <Users size={18} />
              <span>Faol</span>
              <strong>{stats.total}</strong>
            </div>
            <div className="stat-urgent">
              <AlertTriangle size={18} />
              <span>Shoshilinch</span>
              <strong>{stats.urgent}</strong>
            </div>
            <div className="stat-negative">
              <Shield size={18} />
              <span>Norozi</span>
              <strong>{stats.negative}</strong>
            </div>
          </div>
          <button className="logout-btn" type="button" onClick={onLogout}>
            <LogOut size={14} /> Chiqish
          </button>
        </div>
      </header>

      <section className="manager-mode-strip" aria-label="Monitoring rejimi">
        <span>
          <FileText size={15} />
          Demo transcript
        </span>
        <span>
          <Zap size={15} />
          Real-time target: &lt;1s
        </span>
        <span>
          <Server size={15} />
          Gemma 4 offline fallback
        </span>
      </section>

      <section className="operator-grid">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            className={`op-card op-card--${card.risk_level} ${
              card.status === "escalated" ? "op-card--alert" : ""
            }`}
            onClick={() => setSelectedId(card.id)}
          >
            <div className="op-card-top">
              <div className="op-avatar">{card.operator.initial}</div>
              <div>
                <strong>{card.operator.name}</strong>
                <span>{card.customer_label}</span>
              </div>
              <span className={`risk-badge risk-badge--${card.risk_level}`}>
                {riskLabels[card.risk_level]}
              </span>
            </div>
            <p className="op-card-summary">
              {card.last_summary || "Tahlil hali yo'q"}
            </p>
            <div className="op-card-foot">
              <span>
                <Phone size={13} /> {card.message_count} xabar
              </span>
              <span className={`tone tone--${card.sentiment}`}>
                {sentimentLabels[card.sentiment]}
              </span>
            </div>
          </button>
        ))}
        {cards.length === 0 && (
          <p className="empty-state">Hozircha faol qo'ng'iroq yo'q.</p>
        )}
      </section>

      {selectedId && (
        <SessionDrawer
          cardId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </main>
  );
}

function SessionDrawer({
  cardId,
  onClose,
}: {
  cardId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const transcriptTurns = useMemo(
    () => (detail ? buildTranscriptTurns(detail.transcript) : []),
    [detail],
  );
  const transcriptDuration = useMemo(() => formatDuration(transcriptTurns), [transcriptTurns]);
  const analysis = detail?.last_analysis ?? null;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await apiGetManager<SessionDetail>(
          `/api/manager/sessions/${cardId}`,
        );
        if (!cancelled) setDetail(data);
      } catch {
        /* ignore */
      }
    };
    void load();
    const id = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [cardId]);

  return (
    <aside
      aria-labelledby="session-drawer-title"
      aria-modal="true"
      className="drawer"
      onClick={onClose}
      role="dialog"
    >
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <span className="drawer-kicker">Supervisor ko'rigi</span>
            <h3 id="session-drawer-title">
              {detail ? `${detail.operator.name} - ${detail.customer_label}` : "Sessiya yuklanmoqda"}
            </h3>
          </div>
          <button aria-label="Drawerni yopish" type="button" onClick={onClose}>
            x
          </button>
        </header>

        {!detail && (
          <div className="drawer-loading" role="status">
            Sessiya ma'lumotlari yuklanmoqda...
          </div>
        )}

        {detail && (
          <>
            <section className="drawer-metrics" aria-label="Sessiya ko'rsatkichlari">
              <div>
                <span>Holat</span>
                <strong>{detail.status === "escalated" ? "Eskalatsiya" : "Faol"}</strong>
              </div>
              <div>
                <span>Xavf</span>
                <strong>{riskLabels[detail.risk_level]}</strong>
              </div>
              <div>
                <span>Davomiylik</span>
                <strong>{transcriptDuration}</strong>
              </div>
              <div>
                <span>AI rejim</span>
                <strong>{analysis?.analysis_mode === "openai" ? "OpenAI" : "Rules"}</strong>
              </div>
            </section>

            {analysis && (
              <section className="drawer-summary">
                <div className="drawer-section-head">
                  <span className={`risk-badge risk-badge--${detail.risk_level}`}>
                    {detail.priority}
                  </span>
                  {typeof analysis.confidence === "number" && (
                    <span className="confidence-pill">{Math.round(analysis.confidence * 100)}% ishonch</span>
                  )}
                </div>
                <p>{analysis.customer_summary}</p>
                {analysis.next_best_action && (
                  <div className="next-action-box">
                    <span>Keyingi qadam</span>
                    <strong>{analysis.next_best_action}</strong>
                  </div>
                )}
                {analysis.escalation_packet?.should_escalate && (
                  <div className="escalation-box">
                    <strong>Eskalatsiya</strong>
                    <p>{analysis.escalation_packet.reason}</p>
                    <small>{analysis.escalation_packet.handoff_note}</small>
                  </div>
                )}
              </section>
            )}

            {analysis?.suggested_response && (
              <section className="drawer-section">
                <div className="drawer-section-title">
                  <MessageSquareText size={16} />
                  <h4>Operator uchun javob</h4>
                </div>
                <div className="manager-script-card">
                  <strong>{analysis.suggested_response}</strong>
                  {analysis.agent_script && analysis.agent_script.length > 0 && (
                    <ol>
                      {analysis.agent_script.slice(0, 4).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ol>
                  )}
                </div>
              </section>
            )}

            <section className="drawer-section">
              <div className="drawer-section-title">
                <Clock3 size={16} />
                <h4>Suhbat timeline</h4>
                <span>{transcriptTurns.length} segment</span>
              </div>
              <div className="drawer-transcript">
                {transcriptTurns.map((turn, i) => (
                  <div key={`${turn.speaker}-${i}-${turn.start ?? "na"}`} className={`bubble bubble--${turn.speaker}`}>
                    <span>
                      {speakerLabel(turn.speaker)}
                      {turn.start !== undefined && turn.end !== undefined ? ` | ${formatRange(turn.start, turn.end)}` : ""}
                      {turn.rawSpeaker ? ` | ${turn.rawSpeaker}` : ""}
                    </span>
                    <p>{turn.text}</p>
                  </div>
                ))}
              </div>
            </section>

            <footer>
              <button
                type="button"
                onClick={async () => {
                  await apiPostManager(`/api/manager/sessions/${cardId}/close`, {});
                  onClose();
                }}
              >
                Yopish
              </button>
            </footer>
          </>
        )}
      </div>
    </aside>
  );
}

function buildTranscriptTurns(transcript: { speaker: Speaker; text: string }[]): TranscriptTurn[] {
  return transcript.flatMap((line) => parseTranscriptText(line.text, line.speaker));
}

function parseTranscriptText(text: string, fallbackSpeaker: Speaker): TranscriptTurn[] {
  const parsed = safeJsonParse(text.trim());
  if (!parsed) {
    return [{ speaker: fallbackSpeaker, text }];
  }

  const segments = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null && "transcript" in parsed && Array.isArray((parsed as { transcript?: unknown }).transcript)
      ? (parsed as { transcript: unknown[] }).transcript
      : [parsed];

  const rawSpeakers = Array.from(
    new Set(
      segments
        .map((segment) => (isTranscriptSegment(segment) && typeof segment.speaker === "string" ? segment.speaker : ""))
        .filter(Boolean),
    ),
  );
  const speakerMap = new Map<string, Speaker>();
  rawSpeakers.forEach((rawSpeaker, index) => {
    speakerMap.set(rawSpeaker, rawSpeakers.length === 1 ? fallbackSpeaker : index === 0 ? "customer" : "agent");
  });

  return segments.flatMap((segment): TranscriptTurn[] => {
    if (!isTranscriptSegment(segment) || typeof segment.text !== "string") {
      return [];
    }
    const rawSpeaker = typeof segment.speaker === "string" ? segment.speaker : undefined;
    return [
      {
        end: toNumber(segment.end),
        rawSpeaker,
        speaker: rawSpeaker ? speakerMap.get(rawSpeaker) ?? fallbackSpeaker : fallbackSpeaker,
        start: toNumber(segment.start),
        text: segment.text,
      },
    ];
  });
}

function safeJsonParse(value: string): unknown | null {
  if (!value.startsWith("[") && !value.startsWith("{")) {
    return null;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isTranscriptSegment(value: unknown): value is RawTranscriptSegment {
  return typeof value === "object" && value !== null && "text" in value;
}

function toNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function speakerLabel(speaker: Speaker): string {
  return speaker === "customer" ? "Mijoz" : "Operator";
}

function formatRange(start: number, end: number): string {
  return `${formatSeconds(start)}-${formatSeconds(end)}`;
}

function formatDuration(turns: TranscriptTurn[]): string {
  const lastEnd = turns.reduce((max, turn) => Math.max(max, turn.end ?? 0), 0);
  return lastEnd > 0 ? formatSeconds(lastEnd) : `${turns.length} xabar`;
}

function formatSeconds(value: number): string {
  const totalSeconds = Math.max(0, Math.round(value));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
