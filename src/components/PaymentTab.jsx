import React, { useEffect, useMemo, useState } from "react";
import { Search, ArrowLeft, IndianRupee, Undo2, ReceiptText, Tag, AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { listCustomersWithBalance, recordStandaloneTransaction, getPaymentsTabActivity } from "../lib/api.js";
import { isoDateIST, hhmmIST, nowIST } from "../lib/dates.js";
import Pager from "./Pager.jsx";

const INK = "#1C2333";
const INK_SOFT = "#4A5268";
const PAPER = "#F6F5F1";
const CARD = "#FFFFFF";
const LINE = "#E4E2D8";
const FOREST = "#2F6F4E";
const FOREST_DARK = "#1F4E36";
const FOREST_BG = "#E7F1EB";
const AMBER = "#B5762A";
const AMBER_BG = "#FBF0DF";
const RED = "#A5402C";
const RED_BG = "#FBEAE5";

const MODES = ["Cash", "UPI", "Bank Transfer", "Card", "Other"];

const ACTIONS = [
  { key: "collect", label: "Collect payment", icon: IndianRupee, tone: "forest", desc: "" },
  { key: "refund", label: "Give refund / payout", icon: Undo2, tone: "amber", desc: "" },
  { key: "charge", label: "Add charge", icon: ReceiptText, tone: "red", desc: "" },
  { key: "discount", label: "Add discount / waiver", icon: Tag, tone: "amber", desc: "" },
];

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "10px 12px", border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 14.5, fontFamily: "inherit", color: INK, background: "#fff", outline: "none" };

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12.5, color: INK_SOFT, marginBottom: 5, fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}
function PrimaryButton({ children, onClick, disabled, style }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ background: disabled ? "#B9C4BE" : FOREST, color: "#fff", border: "none", padding: "11px 22px", borderRadius: 8, fontSize: 14.5, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 8, ...style }}>
      {children}
    </button>
  );
}
function GhostButton({ children, onClick, style }) {
  return <button onClick={onClick} style={{ background: "transparent", color: INK_SOFT, border: `1px solid ${LINE}`, padding: "10px 18px", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, ...style }}>{children}</button>;
}
function ErrorText({ children }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: RED, marginTop: 5 }}><AlertTriangle size={13} /> {children}</div>;
}

const TYPE_LABEL = {
  PAYMENT_RECEIVED: "Payment collected",
  REFUND_PAID: "Refund paid out",
  EXTRA_CHARGE: "Charge added",
  DISCOUNT_ADJUSTMENT: "Discount / waiver",
  RENT_CHARGE: "Rent charge",
  ADVANCE_RECEIVED: "Advance received",
  SWAP: "Machine swapped",
  NOTE: "Note",
  CREDIT_APPLIED: "Credit applied",
};

export default function PaymentTab() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [page,setPage]=useState(1);
  useEffect(()=>setPage(1),[query]);
  const [selectedId, setSelectedId] = useState(null);
  const [activeAction, setActiveAction] = useState(null);
  const [form, setForm] = useState({ amount: "", mode: MODES[0], note: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [log, setLog] = useState([]);

  async function refresh(q = query) {
    setLoading(true);
    setLoadError("");
    try {
      setCustomers(await listCustomersWithBalance(q));
    } catch (e) {
      setLoadError(e.message || "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { const h = setTimeout(() => refresh(query), 250); return () => clearTimeout(h); }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = customers.find((c) => c.id === selectedId);

  async function openCustomer(id) {
    setSelectedId(id);
    setConfirmation(null);
    try {
      setLog(await getPaymentsTabActivity(id));
    } catch (e) {
      setLoadError(e.message);
    }
  }

  function openAction(key) {
    setActiveAction(key);
    setForm({ amount: "", mode: MODES[0], note: "" });
    setError("");
  }
  function closeAction() {
    setActiveAction(null);
    setError("");
  }

  async function submit() {
    setError("");
    setSubmitting(true);
    try {
      const result = await recordStandaloneTransaction({
        customerId: selected.id,
        action: activeAction,
        amount: Number(form.amount),
        paymentMode: form.mode,
        note: form.note,
      });
      setCustomers((prev) => prev.map((c) => (c.id === selected.id ? { ...c, balance: result.newBalance } : c)));
      setLog(await getPaymentsTabActivity(selected.id));
      const labels = { collect: "collected", refund: "refunded", charge: "charge added", discount: "discount applied" };
      setConfirmation(`₹${form.amount} ${labels[activeAction]}${activeAction === "collect" && result.newBalance < 0 ? " — now in credit." : "."}`);
      setActiveAction(null);
    } catch (e) {
      setError(e.message || "Failed to record this");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: PAPER, minHeight: 600, padding: "28px 20px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: FOREST_DARK, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>RentDesk</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: INK, marginTop: 2 }}>Payment</div>
          
        </div>

        {loadError && <div style={{ color: RED, fontSize: 13, marginBottom: 12 }}>{loadError}</div>}

        {!selected && (
          <div>
            <div style={{ position: "relative", marginBottom: 16 }}>
              <Search size={15} color={INK_SOFT} style={{ position: "absolute", left: 12, top: 12 }} />
              <input style={{ ...inputStyle, paddingLeft: 34 }} placeholder="Search by name or mobile" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
              {loading && <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: INK_SOFT }}>Loading…</div>}
              {!loading && customers.length === 0 && <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: INK_SOFT }}>No customers match that search.</div>}
              {!loading && customers.slice((page-1)*15,page*15).map((c, i) => (
                <div key={c.id} onClick={() => openCustomer(c.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderTop: i === 0 ? "none" : `1px solid ${LINE}`, cursor: "pointer" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: INK_SOFT, marginTop: 2, fontFamily: "monospace" }}>{c.mobile}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {c.balance > 0 && <span style={{ fontSize: 11, fontWeight: 600, background: RED_BG, color: RED, padding: "4px 8px", borderRadius: 6 }}>₹{c.balance} due</span>}
                    {c.balance < 0 && <span style={{ fontSize: 11, fontWeight: 600, background: FOREST_BG, color: FOREST_DARK, padding: "4px 8px", borderRadius: 6 }}>₹{-c.balance} credit</span>}
                    <ChevronRight size={18} color={INK_SOFT} />
                  </div>
                </div>
              ))}
              <Pager page={page} onChange={setPage} total={customers.length}/>
            </div>
          </div>
        )}

        {selected && (
          <div>
            <GhostButton onClick={() => { setSelectedId(null); setActiveAction(null); setConfirmation(null); }} style={{ marginBottom: 16 }}>
              <ArrowLeft size={15} /> All customers
            </GhostButton>

            <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 18, marginBottom: 18 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>{selected.name}</div>
              <div style={{ fontSize: 12.5, color: INK_SOFT, fontFamily: "monospace", marginBottom: 12 }}>{selected.mobile}</div>
              <div style={{ background: selected.balance > 0 ? RED_BG : selected.balance < 0 ? FOREST_BG : PAPER, borderRadius: 8, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: selected.balance > 0 ? RED : selected.balance < 0 ? FOREST_DARK : INK_SOFT }}>
                  {selected.balance > 0 ? "Balance due" : selected.balance < 0 ? "Balance (credit)" : "Balance"}
                </span>
                <span style={{ fontSize: 17, fontWeight: 700, color: selected.balance > 0 ? RED : selected.balance < 0 ? FOREST_DARK : INK }}>
                  {selected.balance === 0 ? "₹0 · Settled" : `₹${Math.abs(selected.balance)}`}
                </span>
              </div>
            </div>

            {confirmation && !activeAction && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: FOREST_BG, color: FOREST_DARK, borderRadius: 8, padding: "10px 12px", fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
                <CheckCircle2 size={16} /> {confirmation}
              </div>
            )}

            {!activeAction ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {ACTIONS.map((a) => {
                  const toneColors = { forest: [FOREST_BG, FOREST_DARK], amber: [AMBER_BG, AMBER], red: [RED_BG, RED] }[a.tone];
                  return (
                    <button key={a.key} onClick={() => openAction(a.key)} style={{ textAlign: "left", background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, padding: 14, cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 7, background: toneColors[0], display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <a.icon size={15} color={toneColors[1]} />
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{a.label}</div>
                      <div style={{ fontSize: 11.5, color: INK_SOFT, lineHeight: 1.4 }}>{a.desc}</div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: INK, marginBottom: 4 }}>{ACTIONS.find((a) => a.key === activeAction).label}</div>
                <p style={{ fontSize: 12.5, color: INK_SOFT, marginTop: 0, marginBottom: 16 }}>{ACTIONS.find((a) => a.key === activeAction).desc}</p>

                <Field label="Amount (₹)">
                  <input type="number" style={inputStyle} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" autoFocus />
                </Field>

                {(activeAction === "collect" || activeAction === "refund") && (
                  <Field label="Mode">
                    <select style={inputStyle} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                      {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </Field>
                )}

                {activeAction === "refund" && (
                  <p style={{ fontSize: 11.5, color: "#9A988E", marginTop: -8, marginBottom: 14 }}>Available credit: ₹{selected.balance < 0 ? -selected.balance : 0}</p>
                )}

                <Field label={activeAction === "charge" ? "Description (required)" : activeAction === "discount" ? "Reason (required)" : "Note (optional)"}>
                  <textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={activeAction === "charge" ? "e.g. Delivery charge" : activeAction === "discount" ? "e.g. Waived for loyal customer" : "Optional remark"} />
                </Field>

                {error && <ErrorText>{error}</ErrorText>}

                <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                  <GhostButton onClick={closeAction}>Cancel</GhostButton>
                  <PrimaryButton onClick={submit} disabled={submitting} style={{ flex: 1, justifyContent: "center" }}>{submitting ? "Saving…" : "Confirm"}</PrimaryButton>
                </div>
              </div>
            )}

            {log.length > 0 && !activeAction && (
              <div style={{ marginTop: 22 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: INK_SOFT, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 10 }}>Recent activity</div>
                <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
                  {log.map((entry, i) => (
                    <div key={entry.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderTop: i === 0 ? "none" : `1px solid ${LINE}` }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>{TYPE_LABEL[entry.type] || entry.type}</div>
                        <div style={{ fontSize: 11.5, color: INK_SOFT }}>{entry.occurred_at.slice(0, 10)}{entry.payment_mode ? ` · ${entry.payment_mode}` : ""}{entry.description ? ` · ${entry.description}` : ""}</div>
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>₹{Math.abs(entry.amount)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
