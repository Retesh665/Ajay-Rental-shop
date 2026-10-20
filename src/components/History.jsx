import React, { useEffect, useMemo, useState } from "react";
import Pager from "./Pager.jsx";
import { Search, Download, Filter } from "lucide-react";
import { getHistoryFeed, getAuditHistory } from "../lib/api.js";
import { nowIST, isoDateIST, addDaysISO, istDateTimeToUTC } from "../lib/dates.js";

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

const TYPE_META = {
  RENT_CHARGE: { label: "Rent Charge", tone: "neutral" },
  EXTRA_CHARGE: { label: "Charge Added", tone: "neutral" },
  ADVANCE_RECEIVED: { label: "Advance Received", tone: "forest" },
  PAYMENT_RECEIVED: { label: "Payment Collected", tone: "forest" },
  DISCOUNT_ADJUSTMENT: { label: "Discount Added", tone: "amber" },
  REFUND_PAID: { label: "Refund", tone: "amber" },
  SWAP: { label: "Active Rental Modified", tone: "neutral" },
  NOTE: { label: "Note", tone: "neutral" },
  CREDIT_APPLIED: { label: "Credit Applied", tone: "neutral" },
};
const CORRECTION_TONE = "red";

const RANGES = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "custom", label: "Custom" },
];

const inputStyle = {
  boxSizing: "border-box", padding: "9px 11px", border: `1px solid ${LINE}`, borderRadius: 8,
  fontSize: 13.5, fontFamily: "inherit", color: INK, background: "#fff", outline: "none",
};

function signedAmount(r) {
  if (!r.amount) return "";
  const negative = ["DISCOUNT_ADJUSTMENT", "REFUND_PAID"].includes(r.type);
  return `${negative ? "-" : "+"}${Math.abs(Number(r.amount))}`;
}
function toCSV(rows) {
  const columns = ["Timestamp (IST)", "Event Type", "Name", "Mobile", "Description", "Amount (INR)", "Entity", "Before", "After", "Actor"];
  const quote = value => `"${String(value ?? "").replace(/^[=+@\t\r]/, "'$&").replace(/"/g, '""')}"`;
  return '\uFEFF' + [columns, ...rows.map(r => [
    new Date(r.occurred_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), typeLabel(r),
    r.customers?.name || "", r.customers?.mobile || "", r.description || "", signedAmount(r),
    r.entity_type || "", r.before_data ? JSON.stringify(r.before_data) : "",
    r.after_data ? JSON.stringify(r.after_data) : "", r.actor_id || r.created_by || "Unknown",
  ])].map(row => row.map(quote).join(",")).join("\r\n");
}
function typeLabel(r) {
  if (r.eventLabel) return r.eventLabel;
  if (r.is_correction) return "Transaction Correction";
  return TYPE_META[r.type]?.label || r.type;
}
function typeTone(r) {
  if (r.is_correction) return CORRECTION_TONE;
  return TYPE_META[r.type]?.tone || "neutral";
}
function rangeToUTCBounds(range, customStart, customEnd) {
  const todayISO = isoDateIST(nowIST());
  if (range === "all") return {};
  if (range === "today") return { fromUTC: istDateTimeToUTC(todayISO, "00:00").toISOString(), toUTC: istDateTimeToUTC(todayISO, "23:59").toISOString() };
  if (range === "week") return { fromUTC: istDateTimeToUTC(addDaysISO(todayISO, -6), "00:00").toISOString(), toUTC: istDateTimeToUTC(todayISO, "23:59").toISOString() };
  if (range === "month") return { fromUTC: istDateTimeToUTC(addDaysISO(todayISO, -29), "00:00").toISOString(), toUTC: istDateTimeToUTC(todayISO, "23:59").toISOString() };
  if (range === "custom" && customStart && customEnd) return { fromUTC: istDateTimeToUTC(customStart, "00:00").toISOString(), toUTC: istDateTimeToUTC(customEnd, "23:59").toISOString() };
  return {};
}

export default function History() {
  const now = nowIST();
  const TODAY_ISO = isoDateIST(now);

  const [rows, setRows] = useState([]);
  const [auditRows, setAuditRows] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [page,setPage]=useState(1);
  const [typeFilter, setTypeFilter] = useState("all");
  const [range, setRange] = useState("all");
  const [customStart, setCustomStart] = useState(addDaysISO(TODAY_ISO, -7));
  const [customEnd, setCustomEnd] = useState(TODAY_ISO);
  const [showFilters, setShowFilters] = useState(false);
  useEffect(()=>setPage(1),[query,typeFilter,range,customStart,customEnd]);


  const bounds = useMemo(() => rangeToUTCBounds(range, customStart, customEnd), [range, customStart, customEnd]);

  useEffect(() => {
    setLoading(true);
    setLoadError("");
    Promise.all([getHistoryFeed(bounds), getAuditHistory(bounds)])
      .then(([financial, audit]) => { setRows(financial); setAuditRows(audit); })
      .catch((e) => setLoadError(e.message || "Failed to load history"))
      .finally(() => setLoading(false));
  }, [bounds]);

  const combined = useMemo(() => [
    ...rows,
    ...auditRows.map(a => ({ ...a, type: `AUDIT_${a.entity_type}`, description: a.details, amount: 0,
      customers: null, eventLabel: `${a.entity_type.replace(/_/g, ' ')} ${a.action.toLowerCase()}` })),
  ].sort((a,b) => new Date(b.occurred_at) - new Date(a.occurred_at)), [rows, auditRows]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return combined.filter(r => typeFilter === "all" || typeLabel(r) === typeFilter)
      .filter(r => !q || [r.customers?.name, r.customers?.mobile, r.description, r.machine_number,
        r.entity_id, r.rental_order_id, JSON.stringify(r.before_data || {}), JSON.stringify(r.after_data || {})]
        .some(v => String(v || "").toLowerCase().includes(q)));
  }, [combined, query, typeFilter]);
  const typeOptions = useMemo(() => [...new Set(combined.map(typeLabel))].sort(), [combined]);

  function handleExport() {
    const csv = toCSV(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rentdesk-history-${TODAY_ISO}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: PAPER, minHeight: 600, padding: "28px 20px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 12, color: FOREST_DARK, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>RentDesk</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: INK, marginTop: 2 }}>History</div>
            <p style={{ fontSize: 12.5, color: INK_SOFT, marginTop: 4, marginBottom: 0 }}>Every action, in order, exactly as it happened — nothing here is ever edited.</p>
          </div>
          <button onClick={handleExport} style={{ display: "flex", alignItems: "center", gap: 6, background: FOREST, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <Download size={14} /> Export CSV ({filtered.length})
          </button>
        </div>

        {loadError && <div style={{ color: RED, fontSize: 13, marginBottom: 12 }}>{loadError}</div>}

        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 220px" }}>
            <Search size={15} color={INK_SOFT} style={{ position: "absolute", left: 12, top: 11 }} />
            <input style={{ ...inputStyle, width: "100%", paddingLeft: 34 }} placeholder="Search name, mobile, rental ID, machine, description…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select style={{ ...inputStyle, minWidth: 190 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All event types</option>
            {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={() => setShowFilters((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, border: `1px solid ${showFilters ? FOREST : LINE}`, background: showFilters ? FOREST_BG : "#fff", color: showFilters ? FOREST_DARK : INK_SOFT }}>
            <Filter size={14} /> Date
          </button>
        </div>

        {showFilters && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 16, background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, padding: 10 }}>
            {RANGES.map((r) => (
              <button key={r.key} onClick={() => setRange(r.key)} style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 6, cursor: "pointer", border: "none", background: range === r.key ? FOREST_BG : "transparent", color: range === r.key ? FOREST_DARK : INK_SOFT }}>
                {r.label}
              </button>
            ))}
            {range === "custom" && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: 4 }}>
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} style={{ ...inputStyle, padding: "6px 8px" }} />
                <span style={{ fontSize: 12, color: INK_SOFT }}>to</span>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} style={{ ...inputStyle, padding: "6px 8px" }} />
              </div>
            )}
          </div>
        )}

        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "108px 150px 1fr 100px 90px", gap: 8, padding: "10px 16px", fontSize: 10.5, fontWeight: 700, color: INK_SOFT, letterSpacing: 0.4, textTransform: "uppercase", borderBottom: `1px solid ${LINE}` }}>
            <span>Timestamp</span><span>Event type</span><span>Name / mobile · description</span><span></span><span style={{ textAlign: "right" }}>Amount</span>
          </div>

          {loading && <div style={{ padding: 28, textAlign: "center", fontSize: 13, color: INK_SOFT }}>Loading…</div>}
          {!loading && filtered.length === 0 && <div style={{ padding: 28, textAlign: "center", fontSize: 13, color: INK_SOFT }}>No events match these filters.</div>}

          {!loading && filtered.slice((page-1)*15,page*15).map((r, i) => {
            const tone = { forest: [FOREST_BG, FOREST_DARK], amber: [AMBER_BG, AMBER], red: [RED_BG, RED], neutral: [PAPER, INK_SOFT] }[typeTone(r)];
            const dateStr = r.occurred_at.slice(5, 10).replace("-", "/");
            const timeStr = new Date(r.occurred_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
            return (
              <div key={r.id} onClick={() => setExpanded(expanded === r.id ? null : r.id)} style={{ cursor: "pointer", display: "grid", gridTemplateColumns: "108px 150px 1fr 100px 90px", gap: 8, alignItems: "center", padding: "11px 16px", borderTop: i === 0 ? "none" : `1px solid ${LINE}` }}>
                <div>
                  <div style={{ fontSize: 12, color: INK }}>{dateStr}</div>
                  <div style={{ fontSize: 10.5, color: INK_SOFT }}>{timeStr}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 8px", borderRadius: 6, background: tone[0], color: tone[1], width: "fit-content" }}>{typeLabel(r)}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>{r.customers?.name || "—"} <span style={{ fontWeight: 400, color: INK_SOFT, fontSize: 11.5, fontFamily: "monospace" }}>· {r.customers?.mobile}</span></div>
                  <div style={{ fontSize: 12, color: INK_SOFT, marginTop: 1 }}>{r.description}</div>
                </div>
                <span></span>
                <span style={{ fontSize: 13, fontWeight: 700, textAlign: "right", color: r.amount === 0 ? "#B9B7AB" : INK }}>{signedAmount(r) ? `${signedAmount(r).startsWith("-") ? "−" : "+"}₹${Math.abs(r.amount)}` : "—"}</span>
                {expanded === r.id && <div style={{ gridColumn: "1 / -1", padding: 12, background: PAPER, borderRadius: 8, fontSize: 12, overflowWrap: "anywhere" }}>
                  <strong>Event details · Read only</strong>
                  <div>Timestamp: {new Date(r.occurred_at).toLocaleString("en-IN", {timeZone:"Asia/Kolkata"})}</div>
                  <div>Performed by: {r.actor_id || r.created_by || "Unknown / Unauthenticated"}</div>
                  {r.description && <div>{r.description}</div>}
                  {r.before_data && <div><strong>Before:</strong> <pre style={{whiteSpace:"pre-wrap"}}>{JSON.stringify(r.before_data,null,2)}</pre></div>}
                  {r.after_data && <div><strong>After:</strong> <pre style={{whiteSpace:"pre-wrap"}}>{JSON.stringify(r.after_data,null,2)}</pre></div>}
                </div>}
              </div>
            );
          })}
          <Pager page={page} onChange={setPage} total={filtered.length}/>
        </div>
      </div>
    </div>
  );
}
