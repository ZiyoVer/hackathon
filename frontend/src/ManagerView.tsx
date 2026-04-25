import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Lock, LogOut, Phone, Shield, Users } from "lucide-react";
import {
  apiGetManager,
  apiPostManager,
  getManagerToken,
  setManagerToken,
} from "./lib/api";

type RiskLevel = "low" | "medium" | "high";
type Sentiment = "positive" | "neutral" | "negative";
type Priority = "normal" | "attention" | "urgent";

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
  transcript: { speaker: "customer" | "agent"; text: string }[];
  last_analysis: {
    customer_summary?: string;
    suggested_response?: string;
    agent_script?: string[];
    follow_up_questions?: string[];
    do_not_say?: string[];
    escalation_packet?: {
      should_escalate: boolean;
      reason: string;
      handoff_note: string;
      transcript_excerpt: string;
    } | null;
  } | null;
};

const RISK_RANK: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };

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
        <small style={{ textAlign: "center", color: "#94a3b8" }}>
          Demo parol: <code>sqb2026</code>
        </small>
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
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
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
                {card.risk_level === "high"
                  ? "Yuqori"
                  : card.risk_level === "medium"
                  ? "O'rta"
                  : "Past"}
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
                {card.sentiment}
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

  if (!detail) return null;

  return (
    <aside className="drawer" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>
            {detail.operator.name} ↔ {detail.customer_label}
          </h3>
          <button type="button" onClick={onClose}>
            ✕
          </button>
        </header>

        {detail.last_analysis && (
          <section className="drawer-summary">
            <span className={`risk-badge risk-badge--${detail.risk_level}`}>
              {detail.priority}
            </span>
            <p>{detail.last_analysis.customer_summary}</p>
            {detail.last_analysis.escalation_packet?.should_escalate && (
              <div className="escalation-box">
                <strong>⚠ Eskalatsiya</strong>
                <p>{detail.last_analysis.escalation_packet.reason}</p>
              </div>
            )}
          </section>
        )}

        <section className="drawer-transcript">
          {detail.transcript.map((line, i) => (
            <div key={i} className={`bubble bubble--${line.speaker}`}>
              <span>{line.speaker === "customer" ? "Mijoz" : "Operator"}</span>
              <p>{line.text}</p>
            </div>
          ))}
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
      </div>
    </aside>
  );
}
