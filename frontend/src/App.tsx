import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FilePlus2,
  MessageSquareText,
  PhoneCall,
  RefreshCw,
  Send,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost } from "./lib/api";
import type { CallSession, CaseStatus, CrmSpeaker, CustomerProfile, Lead, Ticket } from "./types";

const statusLabels: Record<CaseStatus, string> = {
  new: "Yangi",
  in_progress: "Jarayonda",
  pending_customer: "Mijoz javobi kutilmoqda",
  resolved: "Hal qilindi",
  not_bank_issue: "Bank muammosi emas",
  escalated: "Eskalatsiya",
};

const statusOptions: CaseStatus[] = [
  "new",
  "in_progress",
  "pending_customer",
  "resolved",
  "not_bank_issue",
  "escalated",
];

const speakerLabels: Record<CrmSpeaker, string> = {
  customer: "Mijoz",
  agent: "Agent",
  system: "Tizim",
};

interface SummaryResult {
  session: CallSession;
  summary: string;
  crm_note: string;
}

function App() {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [calls, setCalls] = useState<CallSession[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [activeCallId, setActiveCallId] = useState("");
  const [message, setMessage] = useState("Mijoz kartadan notanish yechim bo'lganini aytdi.");
  const [speaker, setSpeaker] = useState<CrmSpeaker>("customer");
  const [statusNote, setStatusNote] = useState("");
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) ?? customers[0],
    [customers, selectedCustomerId],
  );

  const activeCall = useMemo(
    () => calls.find((call) => call.id === activeCallId) ?? calls.find((call) => call.customer_id === selectedCustomer?.id) ?? calls[0],
    [activeCallId, calls, selectedCustomer?.id],
  );

  const customerCalls = useMemo(
    () => calls.filter((call) => call.customer_id === selectedCustomer?.id),
    [calls, selectedCustomer?.id],
  );

  const metrics = useMemo(() => {
    const openCases = calls.filter((call) => !["resolved", "not_bank_issue"].includes(call.status)).length;
    const tickets = calls.reduce((total, call) => total + call.tickets.length, 0);
    const leads = calls.reduce((total, call) => total + call.leads.length, 0);
    const avgQuality = calls.length
      ? Math.round(calls.reduce((total, call) => total + call.quality_score, 0) / calls.length)
      : 0;
    return { openCases, tickets, leads, avgQuality };
  }, [calls]);

  useEffect(() => {
    void loadCrm();
  }, []);

  useEffect(() => {
    if (!selectedCustomerId && customers.length > 0) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers, selectedCustomerId]);

  async function loadCrm() {
    setError("");
    setIsLoading(true);
    try {
      const [customerData, callData] = await Promise.all([
        apiGet<CustomerProfile[]>("/api/crm/customers"),
        apiGet<CallSession[]>("/api/crm/calls"),
      ]);
      setCustomers(customerData);
      setCalls(callData);
      if (!selectedCustomerId && customerData.length > 0) {
        setSelectedCustomerId(customerData[0].id);
      }
      if (!activeCallId && callData.length > 0) {
        setActiveCallId(callData[0].id);
      }
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsLoading(false);
    }
  }

  async function createCall() {
    if (!selectedCustomer) return;
    setError("");
    setIsWorking(true);
    try {
      const call = await apiPost<{ customerId: string; mode: "copilot" }, CallSession>("/api/crm/calls", {
        customerId: selectedCustomer.id,
        mode: "copilot",
      });
      setCalls((current) => [call, ...current.filter((item) => item.id !== call.id)]);
      setActiveCallId(call.id);
      setSummary(null);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsWorking(false);
    }
  }

  async function appendTranscript() {
    if (!activeCall || !message.trim()) return;
    setError("");
    setIsWorking(true);
    try {
      const updated = await apiPost<{ speaker: CrmSpeaker; text: string }, CallSession>(
        `/api/crm/calls/${activeCall.id}/transcript`,
        { speaker, text: message },
      );
      replaceCall(updated);
      setMessage("");
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsWorking(false);
    }
  }

  async function updateStatus(status: CaseStatus) {
    if (!activeCall) return;
    setError("");
    setIsWorking(true);
    try {
      const updated = await apiPatch<{ status: CaseStatus; note?: string }, CallSession>(
        `/api/crm/calls/${activeCall.id}/status`,
        { status, note: statusNote || undefined },
      );
      replaceCall(updated);
      setStatusNote("");
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsWorking(false);
    }
  }

  async function createTicket() {
    if (!activeCall) return;
    setError("");
    setIsWorking(true);
    try {
      await apiPost<
        { type: Ticket["type"]; department: Ticket["department"]; priority: Ticket["priority"]; summary: string },
        Ticket
      >(`/api/crm/calls/${activeCall.id}/tickets`, {
        type: activeCall.intent === "complaint" ? "complaint" : "service_request",
        department: activeCall.intent === "credit_request" ? "credit" : "support",
        priority: activeCall.quality_score < 75 ? "high" : "medium",
        summary: activeCall.outcome || "Mijoz murojaati",
      });
      await refreshActiveCall(activeCall.id);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsWorking(false);
    }
  }

  async function createLead() {
    if (!activeCall) return;
    setError("");
    setIsWorking(true);
    try {
      await apiPost<{ productType: Lead["product_type"]; score: number; nextAction: string }, Lead>(
        `/api/crm/calls/${activeCall.id}/leads`,
        {
          productType: "credit_card",
          score: Math.max(60, activeCall.quality_score),
          nextAction: "Operator follow-up qilib, taklifni yopadi",
        },
      );
      await refreshActiveCall(activeCall.id);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsWorking(false);
    }
  }

  async function saveSummary() {
    if (!activeCall) return;
    setError("");
    setIsWorking(true);
    try {
      const result = await apiPost<Record<string, never>, SummaryResult>(`/api/crm/calls/${activeCall.id}/summary`, {});
      replaceCall(result.session);
      setSummary(result);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsWorking(false);
    }
  }

  async function refreshActiveCall(callId: string) {
    const updated = await apiGet<CallSession>(`/api/crm/calls/${callId}`);
    replaceCall(updated);
  }

  function replaceCall(call: CallSession) {
    setCalls((current) => [call, ...current.filter((item) => item.id !== call.id)]);
    setActiveCallId(call.id);
  }

  return (
    <main className="crm-shell">
      <header className="crm-header">
        <div>
          <span className="eyebrow">Bank CRM</span>
          <h1>Mijoz murojaatlari</h1>
        </div>
        <div className="header-actions">
          <button disabled={isLoading} onClick={() => void loadCrm()} type="button">
            <RefreshCw size={16} />
            Yangilash
          </button>
          <button disabled={!selectedCustomer || isWorking} onClick={() => void createCall()} type="button">
            <PhoneCall size={16} />
            Yangi call
          </button>
        </div>
      </header>

      {error ? (
        <div className="error-line">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : null}

      <section className="metric-row">
        <Metric icon={Clock3} label="Ochiq case" value={metrics.openCases.toString()} />
        <Metric icon={FilePlus2} label="Ticketlar" value={metrics.tickets.toString()} />
        <Metric icon={MessageSquareText} label="Leadlar" value={metrics.leads.toString()} />
        <Metric icon={CheckCircle2} label="Sifat score" value={`${metrics.avgQuality}%`} />
      </section>

      <section className="crm-grid">
        <aside className="panel customer-panel">
          <PanelTitle title="Mijozlar" subtitle={`${customers.length} profil`} />
          <div className="customer-list">
            {customers.map((customer) => (
              <button
                className={customer.id === selectedCustomer?.id ? "customer-row active" : "customer-row"}
                key={customer.id}
                onClick={() => {
                  setSelectedCustomerId(customer.id);
                  setActiveCallId(calls.find((call) => call.customer_id === customer.id)?.id ?? "");
                }}
                type="button"
              >
                <UserRound size={17} />
                <span>
                  <strong>{customer.full_name}</strong>
                  <small>{customer.phone_masked} · {customer.segment}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="panel profile-panel">
          {selectedCustomer ? (
            <>
              <PanelTitle title={selectedCustomer.full_name} subtitle={selectedCustomer.phone_masked} />
              <div className="profile-strip">
                <Chip label="Segment" value={selectedCustomer.segment} />
                <Chip label="KYC" value={selectedCustomer.kyc_status} tone={selectedCustomer.kyc_status === "complete" ? "good" : "warn"} />
                <Chip label="Risk" value={selectedCustomer.risk_level} tone={selectedCustomer.risk_level === "high" ? "danger" : "neutral"} />
                <Chip label="PEP" value={selectedCustomer.is_pep ? "ha" : "yo'q"} tone={selectedCustomer.is_pep ? "danger" : "good"} />
              </div>
              <div className="section-block">
                <h2>Mahsulotlar</h2>
                <div className="product-list">
                  {selectedCustomer.products.map((product) => (
                    <div className="product-row" key={product.id}>
                      <span>
                        <strong>{product.title}</strong>
                        <small>{product.type} · {product.status}</small>
                      </span>
                      <b>{product.balance_range}</b>
                    </div>
                  ))}
                </div>
              </div>
              <div className="section-block">
                <h2>Next best products</h2>
                <div className="tag-row">
                  {selectedCustomer.next_best_products.map((product) => (
                    <span key={product}>{product}</span>
                  ))}
                </div>
              </div>
              <div className="section-block">
                <h2>Call sessiyalar</h2>
                <div className="case-list">
                  {customerCalls.length ? customerCalls.map((call) => (
                    <button
                      className={call.id === activeCall?.id ? "case-row active" : "case-row"}
                      key={call.id}
                      onClick={() => setActiveCallId(call.id)}
                      type="button"
                    >
                      <span>
                        <strong>{statusLabels[call.status]}</strong>
                        <small>{call.intent} · {new Date(call.started_at).toLocaleString()}</small>
                      </span>
                      <b>{call.quality_score}%</b>
                    </button>
                  )) : <p className="empty-text">Bu mijoz uchun call yo'q. Yangi call yarating.</p>}
                </div>
              </div>
            </>
          ) : (
            <p className="empty-text">CRM mijozlari yuklanmoqda.</p>
          )}
        </section>

        <section className="panel case-panel">
          {activeCall ? (
            <>
              <PanelTitle title={`Case ${activeCall.id}`} subtitle={`${activeCall.channel} · ${activeCall.mode}`} />
              <div className="profile-strip">
                <Chip label="Status" value={statusLabels[activeCall.status]} tone={activeCall.status === "resolved" ? "good" : "neutral"} />
                <Chip label="Intent" value={activeCall.intent} />
                <Chip label="Sentiment" value={activeCall.sentiment} />
                <Chip label="Score" value={`${activeCall.quality_score}%`} tone={activeCall.quality_score < 75 ? "warn" : "good"} />
              </div>

              <div className="status-editor">
                <select
                  disabled={isWorking}
                  onChange={(event) => void updateStatus(event.target.value as CaseStatus)}
                  value={activeCall.status}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>{statusLabels[status]}</option>
                  ))}
                </select>
                <input
                  onChange={(event) => setStatusNote(event.target.value)}
                  placeholder="Status izohi"
                  value={statusNote}
                />
              </div>

              <div className="transcript-box">
                {activeCall.transcript.length ? activeCall.transcript.map((line) => (
                  <div className={`transcript-line ${line.speaker}`} key={`${line.at}-${line.text}`}>
                    <span>{speakerLabels[line.speaker]}</span>
                    <p>{line.text}</p>
                  </div>
                )) : <p className="empty-text">Transcript hali yo'q.</p>}
              </div>

              <div className="message-compose">
                <select onChange={(event) => setSpeaker(event.target.value as CrmSpeaker)} value={speaker}>
                  <option value="customer">Mijoz</option>
                  <option value="agent">Agent</option>
                  <option value="system">Tizim</option>
                </select>
                <textarea onChange={(event) => setMessage(event.target.value)} value={message} />
                <button disabled={isWorking || !message.trim()} onClick={() => void appendTranscript()} type="button">
                  <Send size={16} />
                  Qo'shish
                </button>
              </div>

              <div className="action-row">
                <button disabled={isWorking} onClick={() => void createTicket()} type="button">Ticket</button>
                <button disabled={isWorking} onClick={() => void createLead()} type="button">Lead</button>
                <button disabled={isWorking} onClick={() => void saveSummary()} type="button">Summary</button>
              </div>

              <div className="split-block">
                <MiniList title="Ticketlar" items={activeCall.tickets.map(formatTicket)} />
                <MiniList title="Leadlar" items={activeCall.leads.map(formatLead)} />
              </div>

              {summary ? (
                <div className="summary-card">
                  <strong>CRM xulosa</strong>
                  <p>{summary.summary}</p>
                  <small>{summary.crm_note}</small>
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state">
              <PhoneCall size={24} />
              <p>CRM case ochish uchun mijoz tanlab, yangi call yarating.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) {
  return (
    <div className="metric-card">
      <Icon size={18} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="panel-title">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function Chip({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "warn" | "danger" }) {
  return (
    <span className={`chip ${tone}`}>
      <small>{label}</small>
      <b>{value}</b>
    </span>
  );
}

function MiniList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mini-list">
      <h3>{title}</h3>
      {items.length ? items.map((item) => <p key={item}>{item}</p>) : <p className="empty-text">Hali yo'q.</p>}
    </div>
  );
}

function formatTicket(ticket: Ticket) {
  return `${ticket.id} · ${ticket.department} · ${statusLabels[ticket.status]}`;
}

function formatLead(lead: Lead) {
  return `${lead.id} · ${lead.product_type} · ${lead.score}%`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Noma'lum xatolik";
}

export default App;
