import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, CheckCircle2, Wrench, IndianRupee, UserX, PackagePlus, Undo2, UserPlus } from "lucide-react";
import { getDashboardStats } from "../lib/api.js";
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

const RANGES = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "thisMonth", label: "This month" },
  { key: "custom", label: "Custom" },
];

function StatCard({ icon: Icon, label, value, tone = "neutral", size = "md" }) {
  const tones = {
    neutral: { fg: INK, iconBg: PAPER, iconFg: INK_SOFT },
    forest: { fg: FOREST_DARK, iconBg: FOREST_BG, iconFg: FOREST_DARK },
    amber: { fg: AMBER, iconBg: AMBER_BG, iconFg: AMBER },
    red: { fg: RED, iconBg: RED_BG, iconFg: RED },
  }[tone];
  return (
    <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, padding: size === "md" ? "14px 16px" : "11px 13px", display: "flex", alignItems: "center", gap: 11 }}>
      <div style={{ width: size === "md" ? 34 : 28, height: size === "md" ? 34 : 28, borderRadius: 8, background: tones.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={size === "md" ? 16 : 14} color={tones.iconFg} />
      </div>
      <div>
        <div style={{ fontSize: size === "md" ? 17 : 15, fontWeight: 700, color: tones.fg, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: INK_SOFT, marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}
function SectionLabel({ children }) {
  return <div style={{ fontSize: 11.5, fontWeight: 700, color: INK_SOFT, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 }}>{children}</div>;
}

function rangeToUTCBounds(range, customStart, customEnd) {
  const now = nowIST();
  const todayISO = isoDateIST(new Date());
  if (range === "today") return { fromUTC: istDateTimeToUTC(todayISO, "00:00").toISOString(), toUTC: istDateTimeToUTC(todayISO, "23:59").toISOString() };
  if (range === "week") return { fromUTC: istDateTimeToUTC(addDaysISO(todayISO, -6), "00:00").toISOString(), toUTC: istDateTimeToUTC(todayISO, "23:59").toISOString() };
  if (range === "month") return { fromUTC: istDateTimeToUTC(addDaysISO(todayISO, -29), "00:00").toISOString(), toUTC: istDateTimeToUTC(todayISO, "23:59").toISOString() };
  if (range === "thisMonth") {
    const firstOfMonth = `${todayISO.slice(0, 7)}-01`;
    return { fromUTC: istDateTimeToUTC(firstOfMonth, "00:00").toISOString(), toUTC: istDateTimeToUTC(todayISO, "23:59").toISOString() };
  }
  if (range === "custom" && customStart && customEnd) return { fromUTC: istDateTimeToUTC(customStart, "00:00").toISOString(), toUTC: istDateTimeToUTC(customEnd, "23:59").toISOString() };
  return { fromUTC: istDateTimeToUTC(todayISO, "00:00").toISOString(), toUTC: istDateTimeToUTC(todayISO, "23:59").toISOString() };
}

function dueLabel(dueDateISO) {
  const now = new Date();
  const due = new Date(dueDateISO);
  const diffDays = Math.round((due - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, tone: "red" };
  if (diffDays === 0) return { label: "due today", tone: "amber" };
  if (diffDays === 1) return { label: "due tomorrow", tone: "amber" };
  return { label: `due in ${diffDays}d`, tone: "forest" };
}

export default function Dashboard({onCustomerAction}) {
  const [actionCustomer,setActionCustomer] = useState(null);
  const now = nowIST();
  const [range, setRange] = useState("today");
  const [customStart, setCustomStart] = useState(addDaysISO(isoDateIST(new Date()), -7));
  const [customEnd, setCustomEnd] = useState(isoDateIST(new Date()));
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const rangeLabel = RANGES.find((r) => r.key === range)?.label || "";
  const bounds = useMemo(() => rangeToUTCBounds(range, customStart, customEnd), [range, customStart, customEnd]);

  useEffect(() => {
    setLoading(true);
    setError("");
    getDashboardStats(bounds)
      .then(setStats)
      .catch((e) => setError(e.message || "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [bounds]);

  return (
    <div className="rd-dashboard" style={{ fontFamily: "'Inter', system-ui, sans-serif", background: PAPER, minHeight: 600, padding: "28px 20px" }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 12, color: FOREST_DARK, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>RentDesk</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: INK, marginTop: 2 }}>Dashboard</div>
          </div>
          <div className="rd-range" style={{ display: "flex", gap: 4, background: CARD, border: `1px solid ${LINE}`, borderRadius: 9, padding: 4 }}>
            {RANGES.map((r) => (
              <button key={r.key} onClick={() => setRange(r.key)} style={{ fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: 6, cursor: "pointer", border: "none", background: range === r.key ? FOREST_BG : "transparent", color: range === r.key ? FOREST_DARK : INK_SOFT }}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {range === "custom" && (
          <div className="rd-date-range" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 18 }}>
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} style={{ padding: "7px 9px", border: `1px solid ${LINE}`, borderRadius: 7, fontSize: 13, fontFamily: "inherit" }} />
            <span style={{ fontSize: 12, color: INK_SOFT }}>to</span>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} style={{ padding: "7px 9px", border: `1px solid ${LINE}`, borderRadius: 7, fontSize: 13, fontFamily: "inherit" }} />
          </div>
        )}

        {error && <div style={{ color: RED, fontSize: 13, marginBottom: 16 }}>{error}</div>}
        {loading && <div style={{ fontSize: 13, color: INK_SOFT, marginBottom: 16 }}>Loading…</div>}

        {stats && (
          <>
            {stats.lowAvailability.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                {stats.lowAvailability.map((p) => (
                  <div key={p.product} style={{ display: "flex", alignItems: "center", gap: 8, background: RED_BG, borderRadius: 9, padding: "10px 14px", marginBottom: 6, fontSize: 13, color: RED, fontWeight: 600 }}>
                    <AlertTriangle size={15} /> Low availability — {p.product} has 0 units free
                  </div>
                ))}
              </div>
            )}

            <SectionLabel>This period · {rangeLabel}</SectionLabel>
            <div className="rd-period-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
              <StatCard icon={PackagePlus} label="New rentals" value={stats.newRentals} tone="forest" />
              <StatCard icon={Undo2} label="Returns" value={stats.returnsCount} tone="forest" />
              <StatCard icon={UserPlus} label="New customers" value={stats.newCustomers} tone="forest" />
              <StatCard icon={IndianRupee} label="Total collected" value={`₹${stats.totalCollected}`} tone="forest" />
            </div>

            <SectionLabel>Right now</SectionLabel>
            <div className="rd-live-stats" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 26 }}>
              <StatCard icon={Boxes} label="Active rentals" value={stats.activeRentals} size="sm" />
              <StatCard icon={CheckCircle2} label="Rented" value={stats.rented} tone="amber" size="sm" />
              <StatCard icon={Wrench} label="Under repair" value={stats.repair} tone="red" size="sm" />
              <StatCard icon={UserX} label="Outstanding custs" value={stats.outstandingCustomers} tone={stats.outstandingCustomers > 0 ? "red" : "neutral"} size="sm" />
              <StatCard icon={IndianRupee} label="Outstanding amt" value={`₹${stats.outstandingAmount}`} tone={stats.outstandingAmount > 0 ? "red" : "neutral"} size="sm" />
            </div>

            <SectionLabel>Top 5 products · {rangeLabel}</SectionLabel>
            <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 16, marginBottom: 26 }}>
              {stats.topProducts.length === 0 && <div style={{ fontSize: 12.5, color: INK_SOFT }}>No products yet.</div>}
              {stats.topProducts.map((p, i) => (
                <div key={p.product} style={{ marginBottom: i === stats.topProducts.length - 1 ? 0 : 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                    <span style={{ color: INK, fontWeight: 500 }}>{p.product}</span>
                    <span style={{ color: p.availableNow === 0 ? RED : INK_SOFT }}>
                      {p.rentedNow}/{p.total} = {p.availableNow} available
                    </span>
                  </div>
                  <div style={{ height: 7, background: PAPER, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${p.total > 0 ? (p.rentedNow / p.total) * 100 : 0}%`, background: FOREST, borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>

            <SectionLabel>Active customers</SectionLabel>
            <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
              {stats.activeCustomerList.length === 0 && <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: INK_SOFT }}>No active rentals right now.</div>}
              {stats.activeCustomerList.map((c, i) => {
                const d = dueLabel(c.dueDate);
                const toneStyle = { red: [RED_BG, RED], amber: [AMBER_BG, AMBER], forest: [FOREST_BG, FOREST_DARK] }[d.tone];
                return (
                  <button type="button" key={c.id} onClick={()=>setActionCustomer(c)} style={{ width:"100%",textAlign:"left",background:CARD,border:"none",cursor:"pointer",display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 18px", borderTop: i === 0 ? "none" : `1px solid ${LINE}` }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: INK_SOFT, marginTop: 2 }}>{c.items.join(", ")} · <span style={{ fontFamily: "monospace" }}>{c.mobile}</span></div>
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 6, background: toneStyle[0], color: toneStyle[1] }}>{d.label}</span>
                  </button>
                );
              })}
            </div>
            {actionCustomer && <div role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setActionCustomer(null);}} style={{position:'fixed',inset:0,zIndex:110,background:'rgba(0,0,0,.45)',display:'grid',placeItems:'center',padding:16}}>
              <section role="dialog" aria-modal="true" aria-label="Customer actions" style={{background:CARD,borderRadius:12,padding:22,width:'min(100%,400px)',boxSizing:'border-box',display:'grid',gap:12}}>
                <strong>{actionCustomer.name}</strong><span style={{color:INK_SOFT,fontSize:13}}>{actionCustomer.mobile}</span>
                {[['start','Start New Rental'],['return','Return Rental'],['active','Modify Rental'],['customers','View Customer Profile']].map(([action,label])=><button key={action} style={{padding:12,borderRadius:8,border:`1px solid ${LINE}`,background:action==='start'?FOREST:CARD,color:action==='start'?'white':INK,cursor:'pointer',fontWeight:600}} onClick={()=>{onCustomerAction?.(action,actionCustomer);setActionCustomer(null);}}>{label}</button>)}
                <button onClick={()=>setActionCustomer(null)} style={{border:'none',background:'transparent',padding:8,cursor:'pointer'}}>Cancel</button>
              </section>
            </div>}
          </>
        )}
      </div>
    </div>
  );
}
