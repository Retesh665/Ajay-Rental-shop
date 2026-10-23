import { matchesFinancialFilter } from "../lib/statementFilters.js";
import React, { useEffect, useMemo, useState } from "react";
import Pager from "./Pager.jsx";
import {
  Search, ArrowLeft, MapPin, ReceiptText, IndianRupee, AlertTriangle,
  Pencil, Tag, X, Check, ArrowLeftRight, PlusCircle, ChevronRight, SlidersHorizontal, Flag, Phone, CreditCard, FileText,
} from "lucide-react";
import {
  listCustomersWithBalance, getCustomerProfile, createCustomer, updateCustomer, getCustomerTransactions,
  getCustomerOrders, getCustomerEvents, setCustomerFlag, correctTransaction,
} from "../lib/api.js";
import { isValidMobile, isoDateIST, hhmmIST, toIndianDate, to12Hour } from "../lib/dates.js";
import { billableDays } from "../lib/billing.js";
import PhotoCapture from "./PhotoCapture.jsx";
import PrivatePhoto from "./PrivatePhoto.jsx";

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

const PROFESSIONS = [
  "Individual", "Contractor", "Karigar/Raj Mistri", "Helper (Mazdoor)", "Electrician",
  "Solar Installer", "Plumber", "Carpenter", "Tile Mistri", "Welder",
  "Machinery Rental Partner", "Social Organization", "Government Department", "Demolition Worker", "Other",
]; // §7 — must match Start Rental exactly

const FLAG_META = {
  green: { label: "Good standing", bg: FOREST_BG, fg: FOREST_DARK },
  yellow: { label: "Watch", bg: AMBER_BG, fg: AMBER },
  red: { label: "Risk", bg: RED_BG, fg: RED },
};

const TYPE_META = {
  RENT_CHARGE: { sign: "+", label: "Rental charge" },
  EXTRA_CHARGE: { sign: "+", label: "Charge" },
  ADVANCE_RECEIVED: { sign: "−", label: "Advance received" },
  PAYMENT_RECEIVED: { sign: "−", label: "Payment received" },
  DISCOUNT_ADJUSTMENT: { sign: "−", label: "Discount" },
  REFUND_PAID: { sign: "+", label: "Refund paid" },
  SWAP: { sign: null, label: "Machine swapped" },
  NOTE: { sign: null, label: "Note" },
  CREDIT_APPLIED: { sign: null, label: "Credit applied" },
};
const EVENT_TYPE_META = {
  START_RENTAL: "Start Rental", RETURN_RENTAL: "Return Rental",
  MANAGE_ACTIVE_RENTAL: "Manage Active Rental", PAYMENT_TAB: "Payment", CORRECTION: "Correction",
};
const CASH_TYPES = ["ADVANCE_RECEIVED", "PAYMENT_RECEIVED", "REFUND_PAID"];

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "9px 11px", border: `1px solid ${LINE}`, borderRadius: 7, fontSize: 13.5, fontFamily: "inherit", color: INK, background: "#fff", outline: "none" };

function StatChip({ label, value, tone = "neutral" }) {
  const tones = { neutral: [PAPER, INK], forest: [FOREST_BG, FOREST_DARK], amber: [AMBER_BG, AMBER], red: [RED_BG, RED] }[tone];
  return (
    <div style={{ background: tones[0], borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: INK_SOFT, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: tones[1] }}>{value}</div>
    </div>
  );
}
function SectionLabel({ children }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: INK_SOFT, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 10, marginTop: 22 }}>{children}</div>;
}

const emptyEdit = { name: "", mobile: "", additionalMobile: "", profession: "", customProfession: "", village: "", address: "", remarks: "", notes: "", referredByName: "", referredByMobile: "", referredByAddress: "" };

export default function CustomerDatabase({customerContext}) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [listPage,setListPage]=useState(1);
  const [statementPage,setStatementPage]=useState(1);
  const [rentalPage,setRentalPage]=useState(1);
  const [showBalanceFilter, setShowBalanceFilter] = useState(false);
  const [balanceMode, setBalanceMode] = useState("due");
  const [balanceMin, setBalanceMin] = useState("");
  const [balanceMax, setBalanceMax] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [orders, setOrders] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [customerEvents, setCustomerEvents] = useState([]);
  const [statementFilter, setStatementFilter] = useState("All");
  const [statementOpen, setStatementOpen] = useState(null);
  useEffect(()=>setListPage(1),[query,balanceMode,balanceMin,balanceMax]);
  useEffect(()=>setStatementPage(1),[statementFilter,selectedId]);
  useEffect(()=>setRentalPage(1),[selectedId]);

  const [tab, setTab] = useState("overview");
  const [flagOpen, setFlagOpen] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState(new Set());
  const [expandedRentals, setExpandedRentals] = useState(new Set());
  const [photoEditOpen, setPhotoEditOpen] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(emptyEdit);
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);

  const [correctingId, setCorrectingId] = useState(null);
  const [correctionStage, setCorrectionStage] = useState("ask");
  const [correctionAmount, setCorrectionAmount] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionNotice, setCorrectionNotice] = useState(null);

  // Ignore obsolete search responses (for example, slow network responses
  // arriving after the staff has already typed a newer query).
  const listRequestId = React.useRef(0);
  async function refreshList(q = query) {
    const requestId = ++listRequestId.current;
    setLoading(true);
    setLoadError("");
    try {
      const rows = await listCustomersWithBalance(q);
      if (requestId === listRequestId.current) setCustomers(rows);
    } catch (e) {
      if (requestId === listRequestId.current) setLoadError(e.message || "Failed to load customers");
    } finally {
      if (requestId === listRequestId.current) setLoading(false);
    }
  }
  useEffect(() => {
    const h = setTimeout(() => refreshList(query), 250);
    return () => { clearTimeout(h); listRequestId.current += 1; };
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleCustomers = useMemo(() => {
    if (balanceMin === "" && balanceMax === "") return customers;
    return customers.filter((c) => {
      const compareValue = balanceMode === "due" ? c.balance : -c.balance;
      if (balanceMode === "due" && c.balance <= 0) return false;
      if (balanceMode === "credit" && c.balance >= 0) return false;
      if (balanceMin !== "" && compareValue < Number(balanceMin)) return false;
      if (balanceMax !== "" && compareValue > Number(balanceMax)) return false;
      return true;
    });
  }, [customers, balanceMode, balanceMin, balanceMax]);

  const balanceFilterActive = balanceMin !== "" || balanceMax !== "";
  function balanceChipLabel() {
    const m = balanceMode === "due" ? "Due" : "Credit";
    if (balanceMin !== "" && balanceMax !== "") return `Balance (${m}) ₹${balanceMin}–₹${balanceMax}`;
    if (balanceMin !== "") return `Balance (${m}) ≥ ₹${balanceMin}`;
    return `Balance (${m}) ≤ ₹${balanceMax}`;
  }

  useEffect(()=>{
    if(customerContext?.action==='customers' && customerContext.customer?.id) openCustomer(customerContext.customer.id);
  },[customerContext]);

  async function openCustomer(id) {
    setSelectedId(id);
    setTab("overview");
    setEditing(false);
    setPhotoEditOpen(false);
    try {
      const [customer, o, t, events] = await Promise.all([
        getCustomerProfile(id),
        getCustomerOrders(id),
        getCustomerTransactions(id),
        getCustomerEvents(id),
      ]);
      setSelected(customer);
      setOrders(o);
      setExpandedRentals(new Set(o.length ? [o[0].id] : []));
      setTransactions(t);
      setCustomerEvents(events);
    } catch (e) {
      setLoadError(e.message);
    }
  }

  const eventGroups = useMemo(() => {
    const map = new Map(customerEvents.map(e => [e.id, { eventId: e.id, eventType: e.event_type, occurredAt: e.occurred_at, entries: [], orderIds: new Set() }]));
    transactions.forEach(t => {
      if (!map.has(t.event_id)) map.set(t.event_id, { eventId: t.event_id, eventType: t.events?.event_type, occurredAt: t.events?.occurred_at || t.occurred_at, entries: [], orderIds: new Set() });
      const group = map.get(t.event_id);
      group.entries.push(t);
      if (t.rental_order_id) group.orderIds.add(t.rental_order_id);
    });
    return [...map.values()].filter(g => ["START_RENTAL", "RETURN_RENTAL", "MANAGE_ACTIVE_RENTAL", "PAYMENT_TAB", "CORRECTION"].includes(g.eventType))
      .map(g => ({ ...g, net: g.entries.reduce((sum, t) => sum + Number(t.amount || 0), 0) }))
      .sort((a,b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  }, [transactions, customerEvents]);
  const statement = useMemo(() => {
    // Start from the live ledger balance; walk backwards to derive balances after
    // every historical event. Filtering never changes the running balance.
    let balance = Number(selected?.balance || 0);
    return [...eventGroups].reverse().map(g => {
      const row = { ...g, balanceAfter: balance };
      balance -= g.net;
      return row;
    });
  }, [eventGroups, selected?.balance]);
  const money = value => `${value < 0 ? "−" : value > 0 ? "+" : ""}₹${Math.abs(Number(value || 0)).toLocaleString("en-IN")}`;
  const balanceText = value => value > 0 ? `₹${value.toLocaleString("en-IN")} Due` : value < 0 ? `₹${Math.abs(value).toLocaleString("en-IN")} Credit` : "₹0 Settled";
  const statementKind = g => g.eventType === "START_RENTAL" ? "Start Rental" : g.eventType === "RETURN_RENTAL" ? "Return Rental" : g.eventType === "MANAGE_ACTIVE_RENTAL" || g.eventType === "CORRECTION" ? "Modify Rental" : "Payment";
  const matchesStatementFilter = g => matchesFinancialFilter(g, statementFilter);
  const totalRevenue = transactions.filter((t) => t.type === "RENT_CHARGE" || t.type === "EXTRA_CHARGE").reduce((s, t) => s + t.amount, 0);
  const totalDiscount = transactions.filter((t) => t.type === "DISCOUNT_ADJUSTMENT").reduce((s, t) => s + Math.abs(t.amount), 0);
  const activeOrders = orders.filter((o) => o.status === "active");
  const overdueOrders = []; // Profile intentionally omits overdue alert
  const stamp = (value) => value ? `${toIndianDate(isoDateIST(value))} ${to12Hour(hhmmIST(value))}` : "Not returned";

  function startEdit() {
    setEditForm({
      name: selected.name, mobile: selected.mobile, additionalMobile: selected.additional_mobile || "",
      profession: selected.profession || "", customProfession: selected.custom_profession || "",
      village: selected.village || "", address: selected.address || "", remarks: selected.remarks || "", notes: selected.notes || "",
      referredByName: selected.referred_by_name || "", referredByMobile: selected.referred_by_mobile || "", referredByAddress: selected.referred_by_address || "",
    });
    setEditError("");
    setEditing(true);
  }

  async function saveEdit() {
    setEditError("");
    if (!editForm.name.trim()) { setEditError("Name can't be empty."); return; }
    if (!isValidMobile(editForm.mobile)) { setEditError("Wrong number — enter a 10-digit mobile number starting with 6, 7, 8, or 9."); return; }
    if (editForm.additionalMobile && !isValidMobile(editForm.additionalMobile)) { setEditError("Additional mobile isn't a valid 10-digit number."); return; }
    if (editForm.additionalMobile && editForm.additionalMobile.trim() === editForm.mobile.trim()) { setEditError("Additional mobile must be different from the primary mobile number."); return; }
    setSaving(true);
    try {
      const updated = await updateCustomer(selected.id, {
        name: editForm.name.trim(), mobile: editForm.mobile.trim(),
        additional_mobile: editForm.additionalMobile.trim() || null,
        profession: editForm.profession || null,
        custom_profession: editForm.profession === "Other" ? editForm.customProfession.trim() : null,
        village: editForm.village.trim() || null, address: editForm.address.trim() || null, remarks: editForm.remarks.trim() || null, notes: editForm.notes.trim() || null,
        referred_by_name: editForm.referredByName.trim() || null,
        referred_by_mobile: editForm.referredByMobile.trim() || null,
        referred_by_address: editForm.referredByAddress.trim() || null,
      }, { logAsEdit: true });
      setSelected((prev) => ({ ...prev, ...updated }));
      setCustomers((prev) => prev.map((c) => (c.id === selected.id ? { ...c, ...updated } : c)));
      setEditing(false);
    } catch (e) {
      setEditError(e.message?.includes("duplicate") ? "A customer with this mobile number already exists." : e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function setFlag(color) {
    try {
      await setCustomerFlag(selected.id, color);
      setSelected((prev) => ({ ...prev, flag: color }));
      setCustomers((prev) => prev.map((c) => (c.id === selected.id ? { ...c, flag: color } : c)));
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setFlagOpen(false);
    }
  }

  async function savePhoto(field, url) {
    try {
      const updated = await updateCustomer(selected.id, { [field]: url });
      setSelected((prev) => ({ ...prev, ...updated }));
    } catch (e) {
      setLoadError(e.message);
      throw e; // Keep photo tile in error state when database update fails.
    }
  }

  // ---------- Correction workflow ----------
  function openCorrection(entry) {
    setCorrectingId(entry.id);
    setCorrectionStage(CASH_TYPES.includes(entry.type) ? "ask" : "form");
    setCorrectionAmount(String(Math.abs(entry.amount)));
    setCorrectionReason("");
    setCorrectionNotice(null);
  }
  function closeCorrection() {
    setCorrectingId(null); setCorrectionStage("ask"); setCorrectionAmount(""); setCorrectionReason("");
  }
  function chooseCashWasWrong() {
    setCorrectionNotice("Handled from the Payment tab instead — collect the shortfall or refund the excess as a new, today-dated entry. Nothing here has been changed.");
    setCorrectingId(null);
  }
  function proceedToForm() { setCorrectionStage("form"); }
  async function submitCorrection(entry) {
    if (!correctionReason.trim()) return;
    const isSameDay = entry.occurred_at.slice(0, 10) === new Date().toISOString().slice(0, 10);
    if (!isSameDay && correctionStage !== "confirmOld") { setCorrectionStage("confirmOld"); return; }
    try {
      await correctTransaction({ originalTransactionId: entry.id, newAmount: Number(correctionAmount) || 0, reason: correctionReason });
      setTransactions(await getCustomerTransactions(selected.id));
      const all = await listCustomersWithBalance("");
      const bal = all.find((x) => x.id === selected.id);
      if (bal) { setSelected((prev) => ({ ...prev, balance: bal.balance })); setCustomers((prev) => prev.map((c) => (c.id === selected.id ? { ...c, balance: bal.balance } : c))); }
      closeCorrection();
    } catch (e) {
      setLoadError(e.message || "Failed to save correction");
    }
  }

  function CorrectionPanel({ entry }) {
    if (correctingId !== entry.id) return null;
    if (correctionStage === "ask") {
      return (
        <div style={{ background: AMBER_BG, borderRadius: 8, padding: 12, marginTop: 6, marginBottom: 4 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: AMBER, marginBottom: 8 }}>Was the cash also wrong, or just the record?</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={proceedToForm} style={{ flex: 1, fontSize: 12, fontWeight: 600, padding: "8px 10px", borderRadius: 7, border: `1px solid ${LINE}`, background: "#fff", cursor: "pointer" }}>Just the record</button>
            <button onClick={chooseCashWasWrong} style={{ flex: 1, fontSize: 12, fontWeight: 600, padding: "8px 10px", borderRadius: 7, border: `1px solid ${LINE}`, background: "#fff", cursor: "pointer" }}>Cash was wrong too</button>
          </div>
          <button onClick={closeCorrection} style={{ marginTop: 8, background: "none", border: "none", color: INK_SOFT, fontSize: 11.5, cursor: "pointer", padding: 0 }}>Cancel</button>
        </div>
      );
    }
    if (correctionStage === "confirmOld") {
      return (
        <div style={{ background: RED_BG, borderRadius: 8, padding: 12, marginTop: 6, marginBottom: 4 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: RED, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={13} /> This is from {entry.occurred_at.slice(0, 10)} — sure you want to correct it?
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={closeCorrection} style={{ flex: 1, fontSize: 12, fontWeight: 600, padding: "8px 10px", borderRadius: 7, border: `1px solid ${LINE}`, background: "#fff", cursor: "pointer" }}>Cancel</button>
            <button onClick={() => submitCorrection(entry)} style={{ flex: 1, fontSize: 12, fontWeight: 600, padding: "8px 10px", borderRadius: 7, border: "none", background: RED, color: "#fff", cursor: "pointer" }}>Yes, correct it</button>
          </div>
        </div>
      );
    }
    return (
      <div style={{ background: PAPER, borderRadius: 8, padding: 12, marginTop: 6, marginBottom: 4 }}>
        <label style={{ display: "block", fontSize: 11.5, color: INK_SOFT, marginBottom: 4, fontWeight: 500 }}>Correct amount (₹)</label>
        <input type="number" style={{ ...inputStyle, padding: "7px 9px", marginBottom: 8 }} value={correctionAmount} onChange={(e) => setCorrectionAmount(e.target.value)} />
        <label style={{ display: "block", fontSize: 11.5, color: INK_SOFT, marginBottom: 4, fontWeight: 500 }}>Reason (required)</label>
        <input style={{ ...inputStyle, padding: "7px 9px", marginBottom: 10 }} value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} placeholder="e.g. typed wrong amount" />
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={closeCorrection} style={{ flex: 1, fontSize: 12, fontWeight: 600, padding: "8px 10px", borderRadius: 7, border: `1px solid ${LINE}`, background: "#fff", cursor: "pointer" }}>Cancel</button>
          <button onClick={() => submitCorrection(entry)} disabled={!correctionReason.trim()} style={{ flex: 1, fontSize: 12, fontWeight: 600, padding: "8px 10px", borderRadius: 7, border: "none", background: correctionReason.trim() ? FOREST : "#B9C4BE", color: "#fff", cursor: correctionReason.trim() ? "pointer" : "not-allowed" }}>Save correction</button>
        </div>
      </div>
    );
  }
  function CorrectButton({ entry }) {
    if (entry.is_correction) return null;
    return <button onClick={() => openCorrection(entry)} title="Correct this" style={{ background: "none", border: "none", cursor: "pointer", color: "#B9B7AB", display: "flex", padding: 2, marginLeft: 8 }}><Pencil size={12} /></button>;
  }

  function statementRow(g) {
    const sum=type=>g.entries.filter(t=>t.type===type).reduce((v,t)=>v+Number(t.amount||0),0);
    const rental=sum('RENT_CHARGE'),extra=sum('EXTRA_CHARGE'),discount=sum('DISCOUNT_ADJUSTMENT');
    const paid=sum('PAYMENT_RECEIVED')+sum('ADVANCE_RECEIVED')-sum('REFUND_PAID');
    const machineDetails=g.entries.filter(t=>t.machine_number).map(t=>`${t.machine_number}${t.days?`: ${t.days} day(s)`:''}`);
    const notes=g.entries.filter(t=>t.type==='NOTE'||/note:/i.test(t.description||'')).map(t=>t.description).filter(Boolean);
    const rentalIds=orders.filter(o=>g.orderIds.has(o.id)).map(o=>o.display_id).join('; ');
    return { date:stamp(g.occurredAt),activity:statementKind(g),rentalIds,machineDetails:[...new Set(machineDetails)].join('; '),rental:-rental,extra:-extra,discount:-discount,paid:-paid,net:-g.net,balance:g.balanceAfter,notes:notes.join('; ') };
  }
  function downloadStatement() {
    const columns=['Date & Time (IST)','Activity','Rental ID','Machine Details','Rental Charges (INR)','Extra Charges (INR)','Discount (INR)','Paid (INR)','Net Change (INR)','Balance After (INR)','Notes'];
    const quote=value=>'"'+String(value??'').replace(/^[=+@\t\r]/,m=>"'"+m).replace(/"/g,'""')+'"';
    const lines=[columns,...[...statement].reverse().map(g=>{const r=statementRow(g);return [r.date,r.activity,r.rentalIds,r.machineDetails,r.rental,r.extra,r.discount,r.paid,r.net,r.balance,r.notes]})];
    const csv='\uFEFF'+lines.map(row=>row.map(quote).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=`RentDesk_Customer_Statement_${selected.id}_${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function StatementTable() {
    const cell={padding:'10px 9px',borderBottom:`1px solid ${LINE}`,textAlign:'left',fontSize:12,verticalAlign:'top'};
    const multiLine=value=><div style={{whiteSpace:'pre-line',lineHeight:1.7}}>{String(value||'—').split('; ').join('\n')}</div>;
    const headers=['Date & Time','Activity / Rental ID','Machine Details','Rental Charges','Extra Charges','Discount','Paid','Net Change','Balance After','Notes'];
    return <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:12,flexWrap:'wrap'}}><strong>Current customer balance: {balanceText(Number(selected.balance||0))}</strong><button onClick={downloadStatement} style={{background:FOREST,color:'white',border:0,borderRadius:7,padding:'10px 14px',cursor:'pointer',fontWeight:600}}>↓ Download CSV</button></div>
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>{['All','Charges','Payments','Adjustments'].map(f=><button key={f} onClick={()=>setStatementFilter(f)} style={{border:`1px solid ${statementFilter===f?FOREST:LINE}`,borderRadius:18,padding:'7px 13px',background:statementFilter===f?FOREST_BG:'white',cursor:'pointer'}}>{f}</button>)}</div>
      <div style={{overflowX:'auto',border:`1px solid ${LINE}`,borderRadius:9,background:'white'}}><table style={{width:'100%',minWidth:1250,borderCollapse:'collapse'}}><thead><tr style={{background:PAPER}}>{headers.map(h=><th key={h} style={{...cell,color:INK_SOFT}}>{h}</th>)}</tr></thead><tbody>{statement.filter(matchesStatementFilter).slice((statementPage-1)*15,statementPage*15).map(g=>{const r=statementRow(g),open=statementOpen===g.eventId;return <React.Fragment key={g.eventId}><tr onClick={()=>setStatementOpen(open?null:g.eventId)} style={{cursor:'pointer',background:open?FOREST_BG:'white'}}><td style={cell}>{r.date}</td><td style={cell}><strong>{r.activity} {open?'⌄':'›'}</strong>{multiLine(r.rentalIds)}</td><td style={cell}>{multiLine(r.machineDetails)}</td><td style={cell}>{r.rental===0?'—':money(r.rental)}</td><td style={cell}>{r.extra===0?'—':money(r.extra)}</td><td style={{...cell,color:FOREST_DARK}}>{r.discount===0?'—':money(r.discount)}</td><td style={cell}>{r.paid===0?'—':money(r.paid)}</td><td style={cell}>{money(r.net)}</td><td style={cell}>{balanceText(r.balance)}</td><td style={cell}>{r.notes||'—'}</td></tr>{open&&<tr><td colSpan={10} style={{...cell,background:'#FAFBF9'}}>{g.entries.map(t=><div key={t.id} style={{display:'flex',justifyContent:'space-between',gap:12,padding:'5px 0'}}><span>{t.machine_number?`${t.machine_number}${t.days?` · ${t.days} day(s)`:''}`:t.description}</span><strong>{t.amount===0?'—':money(t.amount)}</strong></div>)}<strong>Net change (credit perspective): {money(-g.net)} · {balanceText(g.balanceAfter)}</strong><div style={{color:INK_SOFT,fontSize:11}}>Historical record · Read only</div></td></tr>}</React.Fragment>})}</tbody></table>{!statement.some(matchesStatementFilter)&&<p style={{padding:14}}>No matching transactions.</p>}<Pager page={statementPage} onChange={setStatementPage} total={statement.filter(matchesStatementFilter).length}/></div>
    </div>;
  }

  // ---------- LIST VIEW ----------
  if (!selected) {
    return (
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: PAPER, minHeight: 600, padding: "28px 20px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 12, color: FOREST_DARK, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>RentDesk</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: INK, marginTop: 2 }}>Customers</div>
          </div>
          {loadError && <div style={{ color: RED, fontSize: 13, marginBottom: 12 }}>{loadError}</div>}

          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={15} color={INK_SOFT} style={{ position: "absolute", left: 12, top: 12 }} />
              <input style={{ ...inputStyle, paddingLeft: 34, padding: "10px 12px 10px 34px" }} placeholder="Search by name, mobile, or address" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <button onClick={() => setShowBalanceFilter((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, border: `1px solid ${showBalanceFilter || balanceFilterActive ? FOREST : LINE}`, background: showBalanceFilter || balanceFilterActive ? FOREST_BG : "#fff", color: showBalanceFilter || balanceFilterActive ? FOREST_DARK : INK_SOFT }}>
              <SlidersHorizontal size={14} /> Filter
            </button>
          </div>

          {showBalanceFilter && (
            <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 11.5, color: INK_SOFT, fontWeight: 600, marginBottom: 8 }}>Balance</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {["due", "credit"].map((m) => (
                  <button key={m} onClick={() => setBalanceMode(m)} style={{ flex: 1, fontSize: 12.5, fontWeight: 600, padding: "7px 0", borderRadius: 7, cursor: "pointer", border: `1px solid ${balanceMode === m ? FOREST : LINE}`, background: balanceMode === m ? FOREST_BG : "#fff", color: balanceMode === m ? FOREST_DARK : INK_SOFT }}>{m === "due" ? "Due" : "Credit"}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="number" placeholder="Min ₹" value={balanceMin} onChange={(e) => setBalanceMin(e.target.value)} style={{ ...inputStyle, padding: "8px 10px" }} />
                <span style={{ fontSize: 12, color: INK_SOFT }}>to</span>
                <input type="number" placeholder="Max ₹ (optional)" value={balanceMax} onChange={(e) => setBalanceMax(e.target.value)} style={{ ...inputStyle, padding: "8px 10px" }} />
              </div>
            </div>
          )}
          {balanceFilterActive && !showBalanceFilter && (
            <div style={{ display: "flex", marginBottom: 14 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, background: FOREST_BG, color: FOREST_DARK, padding: "5px 10px", borderRadius: 20 }}>
                {balanceChipLabel()}
                <button onClick={() => { setBalanceMin(""); setBalanceMax(""); }} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 0 }}><X size={12} color={FOREST_DARK} /></button>
              </span>
            </div>
          )}

          <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
            {loading && <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: INK_SOFT }}>Loading…</div>}
            {!loading && visibleCustomers.length === 0 && <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: INK_SOFT }}>No customers match{balanceFilterActive ? " these filters" : " that search"}.</div>}
            {!loading && visibleCustomers.slice((listPage-1)*15,listPage*15).map((c, i) => {
              const flag = FLAG_META[c.flag];
              return (
                <div key={c.id} onClick={() => openCustomer(c.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderTop: i === 0 ? "none" : `1px solid ${LINE}`, cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ position: "relative", width: 38, height: 38, borderRadius: "50%", background: FOREST_BG, color: FOREST_DARK, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0, overflow: "hidden" }}>
                      {c.photo_url ? <PrivatePhoto value={c.photo_url} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : c.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                      <span style={{ position: "absolute", bottom: -1, right: -1, width: 10, height: 10, borderRadius: "50%", background: flag.fg, border: "1.5px solid #fff" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: INK_SOFT, marginTop: 2, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontFamily: "monospace" }}>{c.mobile}</span>
                        {c.address && <span style={{ display: "flex", alignItems: "center", gap: 3 }}><MapPin size={11} /> {c.address}</span>}
                      </div>
                    </div>
                  </div>
                  {c.balance !== 0 && (
                    <span style={{ fontSize: 11, fontWeight: 600, background: c.balance > 0 ? RED_BG : FOREST_BG, color: c.balance > 0 ? RED : FOREST_DARK, padding: "4px 8px", borderRadius: 6 }}>
                      ₹{Math.abs(c.balance)} {c.balance > 0 ? "due" : "credit"}
                    </span>
                  )}
                </div>
              );
            })}
            <Pager page={listPage} onChange={setListPage} total={visibleCustomers.length}/>
          </div>
        </div>
      </div>
    );
  }

  // ---------- PROFILE VIEW ----------
  const flag = FLAG_META[selected.flag] || FLAG_META.green;
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: PAPER, minHeight: 600, padding: "28px 20px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <button onClick={() => { setSelectedId(null); setSelected(null); }} style={{ background: "transparent", color: INK_SOFT, border: `1px solid ${LINE}`, padding: "9px 16px", borderRadius: 8, fontSize: 13.5, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
          <ArrowLeft size={15} /> All customers
        </button>
        {loadError && <div style={{ color: RED, fontSize: 13, marginBottom: 12 }}>{loadError}</div>}

        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 16, padding: 22, marginBottom: 16, boxShadow:"0 3px 14px rgba(31,78,54,.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <button type="button" title="View or change customer photo" onClick={() => setPhotoEditOpen(v => !v)} style={{ width: 64, height: 64, borderRadius: "50%", background: FOREST_BG, color: FOREST_DARK, display: "grid", placeItems: "center", overflow: "hidden", fontWeight: 700, border: `2px solid ${FOREST}`, boxShadow:"0 0 0 5px #edf7f0", cursor: "pointer", padding: 0 }}>
                {selected.photo_url ? <PrivatePhoto value={selected.photo_url} alt={selected.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : selected.name.split(" ").map(p => p[0]).slice(0,2).join("")}
              </button>
              <div><div style={{ fontWeight: 700, fontSize: 20 }}>{selected.name}</div><div style={{ color: INK_SOFT, fontSize: 12 }}>Customer since {selected.created_at ? toIndianDate(isoDateIST(selected.created_at)) : "—"}</div></div>
            </div>
            <button onClick={editing ? () => setEditing(false) : startEdit} style={{ padding: "8px 12px", border: `1px solid ${LINE}`, borderRadius: 7, background: "white", cursor: "pointer" }}><Pencil size={12} /> {editing ? "Cancel edit" : "Edit"}</button>
          </div>
          <div style={{ position: "relative", marginTop: 14, marginBottom: 16 }}>
            <button onClick={() => setFlagOpen(v => !v)} style={{ background: flag.bg, color: flag.fg, border: "1px solid #d5e6d9", padding: "7px 12px", borderRadius: 9, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><Flag size={13}/>{flag.label} <Pencil size={11}/></button>
            {flagOpen && <div style={{ position: "absolute", top: 36, left: 0, background: "white", border: `1px solid ${LINE}`, borderRadius: 8, padding: 5, zIndex: 10 }}>{Object.entries(FLAG_META).map(([key,m]) => <button key={key} onClick={() => setFlag(key)} style={{ display: "flex", gap: 5, alignItems: "center", width: "100%", border: 0, padding: 8, background: m.bg, color: m.fg, cursor: "pointer" }}><Flag size={12}/>{m.label}</button>)}</div>}
          </div>
          {photoEditOpen && <div style={{ marginBottom: 12, padding: 12, border: `1px solid ${LINE}`, borderRadius: 9 }}><PhotoCapture label="Profile photo — view, upload or replace" value={selected.photo_url} onChange={url => savePhoto("photo_url", url)} /></div>}
          {tab === "overview" && !editing && <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
              <PhotoCapture label="ID — front" value={selected.id_proof_front_url} onChange={url => savePhoto("id_proof_front_url", url)} />
              <PhotoCapture label="ID — back" value={selected.id_proof_back_url} onChange={url => savePhoto("id_proof_back_url", url)} />

            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, fontSize: 13, color: INK_SOFT }}>
              <div><Phone size={13}/> {selected.mobile}</div><div><Phone size={13}/> {selected.additional_mobile || "No alternate number"}</div>
              <div><MapPin size={13}/> {[selected.address,selected.village].filter(Boolean).join(", ") || "No address"}</div>
              <div>{selected.profession === "Other" ? selected.custom_profession : selected.profession || "No profession"}</div>
            </div>
            {selected.remarks && <div style={{ marginTop: 12, background: PAPER, padding: 12, borderRadius: 8, color: INK_SOFT, fontSize: 13 }}><strong style={{ color: INK }}>Remarks</strong><div style={{ marginTop: 4, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{selected.remarks}</div></div>}
            {selected.notes && <div style={{ marginTop: 12, background: PAPER, padding: 12, borderRadius: 8, color: INK_SOFT, fontSize: 13 }}><FileText size={13}/> {selected.notes}</div>}
          </>}
        </div>
        {!editing && <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {["overview", "transactions"].map(t => <button key={t} onClick={() => {setTab(t);setEditing(false);}} style={{ padding: "8px 14px", borderRadius: 9, cursor: "pointer", border: `1px solid ${tab===t?FOREST:LINE}`, background: tab===t?FOREST_BG:"white", color: INK }}>{t === "transactions" ? `Transactions (${transactions.length})` : "Overview"}</button>)}
        </div>}
        {tab === "overview" && !editing && <>
          <SectionLabel>Financial summary</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 9 }}>
            <StatChip label="Total revenue" value={`₹${totalRevenue}`} tone="forest"/>
            <StatChip label={selected.balance > 0 ? "Balance (due)" : "Balance (credit)"} value={`₹${Math.abs(selected.balance||0)}`} tone={selected.balance>0?"red":"forest"}/>
            <StatChip label="Discount given" value={`₹${totalDiscount}`} tone="neutral"/>
            <StatChip label="Total rentals" value={orders.length} tone="neutral"/>
          </div>
          <SectionLabel>Rental history</SectionLabel>
          <div style={{ overflowX: "auto", background: "white", border: `1px solid ${LINE}`, borderRadius: 9 }}>
            <table style={{ width: "100%", minWidth: 590, borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ background: PAPER }}>{["Order date & time / ID", "Machine", "Return date & time", "Billed days", "Status"].map(h => <th key={h} style={{ padding: 10, textAlign: "left", color: INK_SOFT, borderBottom: `1px solid ${LINE}` }}>{h}</th>)}</tr></thead>
              <tbody>{orders.slice((rentalPage-1)*15,rentalPage*15).flatMap(o => {
                const rows = (o.rental_items || []).flatMap(i => {
                  const segments = i.rental_item_segments || [];
                  return segments.length ? segments.map(seg => ({ i, seg })) : [{ i, seg: null }];
                });
                if (!rows.length) return [<tr key={o.id}><td style={{ padding: 12 }}>{stamp(o.created_at)}<div>{o.display_id}</div></td><td colSpan={4}>No machines</td></tr>];
                return rows.map(({ i, seg }, index) => {
                  const end = seg?.to_at;
                  const days = end && seg?.from_at ? billableDays(isoDateIST(seg.from_at), hhmmIST(seg.from_at), isoDateIST(end), hhmmIST(end), { isSwapClose: !!seg.reason && seg.reason.toLowerCase().includes("swap") }) : null;
                  const td = { padding: "11px 10px", borderBottom: `1px solid ${LINE}`, verticalAlign: "top" };
                  return <tr key={seg?.id || i.id}>
                    {index === 0 && <td rowSpan={rows.length} style={{ ...td, fontWeight: 600, minWidth: 130 }}>{stamp(o.created_at)}<div style={{ color: INK_SOFT, marginTop: 4 }}>{o.display_id}</div></td>}
                    <td style={td}><strong>{i.machines?.machine_number || "Machine"}</strong></td>
                    <td style={td}>{end ? stamp(end) : "Not returned"}</td>
                    <td style={td}>{days === null ? "—" : days}</td>
                    <td style={td}><span style={{ color: end ? FOREST_DARK : AMBER }}>{end ? "Closed" : "Active"}</span></td>
                  </tr>;
                });
              })}</tbody>
            </table>
            {orders.length === 0 && <div style={{ padding: 15 }}>No rentals yet.</div>}
            <Pager page={rentalPage} onChange={setRentalPage} total={orders.length}/>
          </div>
        </>}
          {editing && (
            <div>
              <SectionLabel>Edit customer</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><label style={{ fontSize: 11.5, color: INK_SOFT }}>Name *</label><input style={inputStyle} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></div>
                <div><label style={{ fontSize: 11.5, color: INK_SOFT }}>Mobile *</label><input style={inputStyle} value={editForm.mobile} onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })} /></div>
                <div><label style={{ fontSize: 11.5, color: INK_SOFT }}>Additional mobile</label><input style={inputStyle} value={editForm.additionalMobile} onChange={(e) => setEditForm({ ...editForm, additionalMobile: e.target.value })} /></div>
                <div>
                  <label style={{ fontSize: 11.5, color: INK_SOFT }}>Profession</label>
                  <select style={inputStyle} value={editForm.profession} onChange={(e) => setEditForm({ ...editForm, profession: e.target.value })}>
                    <option value="">— Select —</option>
                    {PROFESSIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                {editForm.profession === "Other" && <div><label style={{ fontSize: 11.5, color: INK_SOFT }}>Specify</label><input style={inputStyle} value={editForm.customProfession} onChange={(e) => setEditForm({ ...editForm, customProfession: e.target.value })} /></div>}
                <div><label style={{ fontSize: 11.5, color: INK_SOFT }}>Village</label><input style={inputStyle} value={editForm.village} onChange={(e) => setEditForm({ ...editForm, village: e.target.value })} /></div>
              </div>
              <div style={{ marginTop: 10 }}><label style={{ fontSize: 11.5, color: INK_SOFT }}>Address</label><textarea rows={2} style={inputStyle} value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></div>
              <div style={{ marginTop: 10 }}><label style={{ fontSize: 11.5, color: INK_SOFT }}>Remarks</label><textarea rows={2} style={inputStyle} value={editForm.remarks} onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })} /></div>
              <div style={{ marginTop: 10 }}><label style={{ fontSize: 11.5, color: INK_SOFT }}>Notes</label><textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></div>

              <SectionLabel>Referred by</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><label style={{ fontSize: 11.5, color: INK_SOFT }}>Name</label><input style={inputStyle} value={editForm.referredByName} onChange={(e) => setEditForm({ ...editForm, referredByName: e.target.value })} /></div>
                <div><label style={{ fontSize: 11.5, color: INK_SOFT }}>Mobile</label><input style={inputStyle} value={editForm.referredByMobile} onChange={(e) => setEditForm({ ...editForm, referredByMobile: e.target.value })} /></div>
              </div>

              {editError && <div style={{ color: RED, fontSize: 12.5, marginTop: 10 }}>{editError}</div>}
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button onClick={() => setEditing(false)} style={{ background: "transparent", color: INK_SOFT, border: `1px solid ${LINE}`, padding: "10px 18px", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Cancel</button>
                <button onClick={saveEdit} disabled={saving} style={{ flex: 1, background: saving ? "#B9C4BE" : FOREST, color: "#fff", border: "none", padding: "11px 22px", borderRadius: 8, fontSize: 14.5, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}>{saving ? "Saving…" : "Save changes"}</button>
              </div>
            </div>
          )}

          {!editing && tab === "transactions" && <StatementTable />}
      </div>
    </div>
  );
}
