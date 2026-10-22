import React, { useEffect, useMemo, useState } from "react";
import { Search, ChevronRight, ArrowLeft, CheckCircle2, Circle, Clock, StickyNote, Wrench, Tag, X, PackageCheck } from "lucide-react";
import { listActiveRentals, getCustomerBalance, updateCustomer, settleReturn } from "../lib/api.js";
import { nowIST, isoDateIST, hhmmIST, toIndianDate, to12Hour } from "../lib/dates.js";
import { billableDays } from "../lib/billing.js";
import Pager from "./Pager.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { readReturnDraft, listReturnDrafts, saveReturnDraft, deleteReturnDraft } from "../lib/offlineReturnDrafts.js";
import { autoReturnDiscount } from "../lib/autoDiscount.js";
import { returnEventCharges } from "../lib/returnTotals.js";

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

const STEPS = ["Browse", "Pick", "Settle", "Done"];

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "10px 12px", border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 14.5, fontFamily: "inherit", color: INK, background: "#fff", outline: "none" };
const compactInputStyle = { ...inputStyle, padding: "7px 9px", borderRadius: 6, fontSize: 13 };

function PrimaryButton({ children, onClick, disabled, style }) {
  return <button onClick={onClick} disabled={disabled} style={{ background: disabled ? "#B9C4BE" : FOREST, color: "#fff", border: "none", padding: "11px 22px", borderRadius: 8, fontSize: 14.5, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 8, ...style }}>{children}</button>;
}
function GhostButton({ children, onClick, style }) {
  return <button onClick={onClick} style={{ background: "transparent", color: INK_SOFT, border: `1px solid ${LINE}`, padding: "10px 18px", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, ...style }}>{children}</button>;
}
function StepTicket({ current }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 26 }}>
      {STEPS.map((label, i) => {
        const done = i < current, active = i === current;
        return (
          <React.Fragment key={label}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 54 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: active ? FOREST : done ? FOREST_BG : "#fff", border: `1.5px solid ${active || done ? FOREST : LINE}`, color: active ? "#fff" : done ? FOREST_DARK : INK_SOFT, fontSize: 13, fontWeight: 600 }}>
                {done ? <CheckCircle2 size={16} /> : i + 1}
              </div>
              <span style={{ fontSize: 11, color: active ? INK : INK_SOFT, fontWeight: active ? 600 : 400 }}>{label}</span>
            </div>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: 0, borderTop: `1.5px dashed ${i < current ? FOREST : LINE}`, marginBottom: 18 }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}
function Row({ label, value, bold, warn, good }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
      <span style={{ color: INK_SOFT }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 600, color: warn ? RED : good ? FOREST_DARK : INK }}>{value}</span>
    </div>
  );
}

export default function ReturnRental({customerContext}) {
  const { user } = useAuth();
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [pendingDraft, setPendingDraft] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [restoredDraftId, setRestoredDraftId] = useState(null);
  const [draftNotice, setDraftNotice] = useState('');
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    const up = () => { setOnline(true); setVerified(false); };
    const down = () => { setOnline(false); setVerified(false); };
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    readReturnDraft(user.id).then(() => listReturnDrafts(user.id)).then(ds => { if (active) { setDrafts(ds); setPendingDraft(ds[0] || null); } }).catch(() => {});
    return () => { active = false; };
  }, [user?.id]);
  const [items, setItems] = useState([]); // raw active rental_items from the API
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [phase, setPhase] = useState("browse");
  const contextConsumed = React.useRef(false);
  const [query, setQuery] = useState("");
  const [browsePage,setBrowsePage] = useState(1);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [returningIds, setReturningIds] = useState([]); // rental_item ids being returned this event
  const [conditions, setConditions] = useState({}); // itemId -> 'good' | 'damaged'
  const [returnEdits, setReturnEdits] = useState({}); // itemId -> { date, time }

  const [oldBalance, setOldBalance] = useState(0);
  const [amountPaid, setAmountPaid] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const [showRemark, setShowRemark] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [discount, setDiscount] = useState("");
  const [manualDiscount, setManualDiscount] = useState(false);
  const [settlementPath, setSettlementPath] = useState(null); // adjust_against_old_due | pay_refund_now | apply_credit
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [completed, setCompleted] = useState(null);

  const now = nowIST();
  const TODAY_ISO = isoDateIST(new Date());
  const NOW_TIME = hhmmIST(new Date());

  async function refresh() {
    setLoading(true);
    setLoadError("");
    try {
      setItems(await listActiveRentals());
    } catch (e) {
      setLoadError(e.message || "Failed to load active rentals");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  // Group by customer — one customer can span multiple orders.
  const customerGroups = useMemo(() => {
    const byCustomer = {};
    items.forEach((item) => {
      const cust = item.rental_orders.customers;
      if (!byCustomer[cust.id]) byCustomer[cust.id] = { customer: cust, items: [] };
      byCustomer[cust.id].items.push(item);
    });
    return Object.values(byCustomer);
  }, [items]);

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customerGroups;
    return customerGroups.filter((g) =>
      g.customer.name.toLowerCase().includes(q) ||
      g.customer.mobile.includes(q) ||
      g.items.some((it) => it.machines.machine_number.toLowerCase().includes(q) || it.rental_orders.display_id.toLowerCase().includes(q))
    );
  }, [query, customerGroups]);

  useEffect(()=>setBrowsePage(1),[query]);
  const selectedGroup = customerGroups.find((g) => g.customer.id === selectedCustomerId);
  useEffect(()=>{
    if(customerContext?.action==='return' && phase==='browse' && !contextConsumed.current && !selectedCustomerId && !loading && customerGroups.some(g=>g.customer.id===customerContext.customer?.id)) {
      contextConsumed.current = true;
      openCustomer(customerContext.customer.id);
    }
  },[loading,customerContext,customerGroups,selectedCustomerId]);

  async function openCustomer(customerId, { skipBalance = false } = {}) {
    const group = customerGroups.find((g) => g.customer.id === customerId);
    if (!group) { setLoadError('This customer has no active rentals in the cached list. Reconnect and refresh.'); return; }
    setSelectedCustomerId(customerId);
    setReturningIds(group.items.map((it) => it.id));
    const initCond = {}, initReturn = {};
    const capturedAt = new Date();
    group.items.forEach((it) => { initCond[it.id] = "good"; initReturn[it.id] = { date: isoDateIST(capturedAt), time: hhmmIST(capturedAt) }; });
    setConditions(initCond);
    setReturnEdits(initReturn);
    if (!skipBalance) {
      try { setOldBalance(await getCustomerBalance(customerId)); }
      catch (e) { setLoadError(e.message); }
    }
    setPhase("pick");
  }

  function toggleReturning(id) {
    setReturningIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Live preview of days/charge per item — mirrors the §3 formula exactly,
  // computed client-side for instant feedback; the server recomputes the
  // same thing from segments when settleReturn() actually runs.
  const machineBreakdown = useMemo(() => {
    if (!selectedGroup) return [];
    return selectedGroup.items
      .filter((it) => returningIds.includes(it.id))
      .map((it) => {
        const ret = returnEdits[it.id] || { date: TODAY_ISO, time: NOW_TIME };
        const rentedOnDate = it.rentedOnAt.slice(0, 10);
        const rentedOnTime = it.rentedOnAt.slice(11, 16);
        const days = billableDays(rentedOnDate, rentedOnTime, ret.date, ret.time);
        return { ...it, days, subtotal: days * it.daily_rate, returnDate: ret.date, returnTime: ret.time, rentedOnDate, rentedOnTime };
      });
  }, [selectedGroup, returningIds, returnEdits]);

  const touchedOrderIds = useMemo(() => [...new Set(machineBreakdown.map((m) => m.rental_order_id))], [machineBreakdown]);
  const touchedOrders = useMemo(() => {
    if (!selectedGroup) return [];
    const map = {};
    selectedGroup.items.forEach((it) => { map[it.rental_order_id] = it.rental_orders; });
    return touchedOrderIds.map((id) => map[id]);
  }, [touchedOrderIds, selectedGroup]);

  const settlementTotals = useMemo(() => {
    return returnEventCharges(machineBreakdown, touchedOrders);
  }, [machineBreakdown, touchedOrders]);

  function goToSettle() {
    // Refresh untouched return timestamps at the moment settlement begins.
    const at = new Date();
    setReturnEdits(prev => Object.fromEntries(Object.entries(prev).map(([id, val]) => [id, val.edited ? val : { date: isoDateIST(at), time: hhmmIST(at) }])));
    setAmountPaid(String(Math.max(0, oldBalance + settlementTotals.chargesForThisEvent)));
    setShowDiscount(false);
    setDiscount("");
    setManualDiscount(false);
    setSettlementPath(null);
    setSubmitError("");
    setPhase("settle");
  }

  const paidNum = Number(amountPaid) || 0;
  const invalidPaid = !Number.isFinite(Number(amountPaid)) || paidNum < 0 || !Number.isInteger(paidNum);
  const preDiscountPayable = oldBalance + settlementTotals.chargesForThisEvent;
  const discountNum = showDiscount ? (manualDiscount ? Math.max(0, Number(discount) || 0) : autoReturnDiscount(preDiscountPayable, paidNum)) : 0;
  const invalidDiscount = !Number.isFinite(discountNum) || !Number.isInteger(discountNum) || discountNum < 0;
  const thisSettlement = settlementTotals.chargesForThisEvent - discountNum - paidNum;
  const newBalance = oldBalance + thisSettlement;

  function openDiscount() {
    const suggested = autoReturnDiscount(preDiscountPayable, paidNum);
    setDiscount(String(suggested));
    setManualDiscount(false);
    setShowDiscount(true);
  }
  function toggleDiscount() {
    if (showDiscount) { setShowDiscount(false); setDiscount(""); setManualDiscount(false); } else openDiscount();
  }

  function backFromPick() {
    setPhase("browse");
    setSelectedCustomerId(null);
    setReturningIds([]);
    setSubmitError("");
  }

  function reset() {
    setPhase("browse"); setQuery(""); setSelectedCustomerId(null);
    setReturningIds([]); setConditions({}); setReturnEdits({});
    setAmountPaid(""); setReturnNote(""); setShowRemark(false); setShowDiscount(false); setDiscount(""); setSettlementPath(null);
    setCompleted(null); setSubmitError("");
    if (navigator.onLine) refresh();
  }

  async function storeReturnDraft() {
    if (!selectedCustomerId || !machineBreakdown.length) throw new Error('Select at least one machine to return.');
    if (invalidPaid || invalidDiscount) throw new Error('Enter valid nonnegative whole-rupee amounts.');
    const draft = {
      customerId: selectedCustomerId,
      itemIds: machineBreakdown.map(m => m.id),
      returnEdits, conditions, amountPaid, returnNote, showRemark, showDiscount,
      discount: discountNum, manualDiscount, oldBalance,
    };
    const saved = await saveReturnDraft(user?.id, {...draft,id:restoredDraftId || undefined,customerName:selectedGroup?.customer?.name,machines:machineBreakdown.map(m=>m.machines?.machine_number)});
    const ds = await listReturnDrafts(user.id); setDrafts(ds); setPendingDraft(ds[0] || null); setRestoredDraftId(null);
    setVerified(false);
    setDraftNotice('Return draft saved on this device. No payment was recorded and machines remain rented.');
    setSubmitError('');
    reset();
  }
  async function restoreReturnDraft(draft = pendingDraft) {
    if (!draft) return;
    const group = customerGroups.find(g => g.customer.id === draft.customerId);
    if (!group || draft.itemIds.some(id => !group.items.some(it => it.id === id))) {
      setDraftNotice('Draft machines are not in the loaded active rentals. Reconnect and refresh first.');
      return;
    }
    await openCustomer(draft.customerId, { skipBalance: true });
    setRestoredDraftId(draft.id);
    setReturningIds(draft.itemIds);
    setReturnEdits(draft.returnEdits);
    setConditions(draft.conditions);
    setAmountPaid(draft.amountPaid);
    setReturnNote(draft.returnNote);
    setShowRemark(draft.showRemark);
    setShowDiscount(draft.showDiscount);
    setDiscount(String(draft.discount));
    setManualDiscount(true); // preserve exact saved discount rather than recomputing it
    setOldBalance(draft.oldBalance);
    setVerified(false);
    setDraftNotice('Draft restored. Live rental and balance will be verified automatically on confirmation.');
    setPhase('settle');
  }
  async function verifyReturnDraft() {
    if (!navigator.onLine) throw new Error('Reconnect before verifying the return.');
    if (!selectedCustomerId || !machineBreakdown.length) throw new Error('Select machines to return.');
    const [liveItems, liveBalance] = await Promise.all([
      listActiveRentals({ fresh: true }), getCustomerBalance(selectedCustomerId, { fresh: true }),
    ]);
    const chosen = machineBreakdown.map(m => m.id);
    const matching = liveItems.filter(it => chosen.includes(it.id) && it.rental_orders?.customer_id === selectedCustomerId);
    if (matching.length !== chosen.length || matching.some(it => !chosen.includes(it.id))) {
      setVerified(false);
      throw new Error('One or more machines are no longer rented by this customer. Refresh Return Rental before submitting.');
    }
    if (liveBalance !== oldBalance) {
      setOldBalance(liveBalance);
      setVerified(false);
      throw new Error('Customer balance changed. The current balance has been updated; review the payment and discount, then verify again.');
    }
    setVerified(true);
    setDraftNotice('');
    setSubmitError('');
  }

  async function confirmReturn() {
    if (submitting) return;
    if (!navigator.onLine || !online) { setSubmitError('You are offline. Save a return draft; no payment or machine status has been recorded.'); return; }

    if (invalidPaid || invalidDiscount) { setSubmitError("Enter valid nonnegative whole-rupee payment and discount amounts."); return; }
    setSubmitting(true);
    setSubmitError("");
    try {
      await verifyReturnDraft();
      const returnsByItem = {};
      const conditionsByItem = {};
      machineBreakdown.forEach((m) => {
        returnsByItem[m.id] = { returnDateISO: m.returnDate, returnTimeHHMM: m.returnTime };
        conditionsByItem[m.id] = conditions[m.id] || "good";
      });

      const result = await settleReturn({
        customerId: selectedCustomerId,
        itemIds: machineBreakdown.map((m) => m.id),
        rentalOrderIds: touchedOrderIds,
        returnsByItem,
        conditionsByItem,
        discountAmount: discountNum,
        paymentReceived: paidNum,
        returnNote,
        settlementPath: null,
      });

      if (result.needsDecision) {
        // Shouldn't normally happen since the UI already asks first, but
        // guard anyway rather than silently posting the wrong path.
        setSubmitError("Please choose a settlement option below.");
        setSubmitting(false);
        return;
      }

      // Re-read active rentals after the write so the Done summary reflects
      // the same live Supabase state every other screen will read.
      if (restoredDraftId) { await deleteReturnDraft(user?.id, restoredDraftId); const ds=await listReturnDrafts(user.id);setDrafts(ds);setPendingDraft(ds[0]||null);setRestoredDraftId(null); }
      // The write has succeeded. A subsequent refresh failure must not imply that
      // the return failed or encourage staff to submit the payment twice.
      let activeRentalsRemaining = null;
      try {
        const refreshedActive = await listActiveRentals({ fresh: true });
        activeRentalsRemaining = refreshedActive.filter(it => it.rental_orders?.customer_id === selectedCustomerId).length;
      } catch (refreshError) {
        console.warn('Return saved, but active rental refresh failed', refreshError);
      }
      setCompleted({
        machineBreakdown, touchedOrders, settlementTotals, amountPaid: paidNum, discount: discountNum,
        oldBalance, thisSettlement, newBalance, activeRentalsRemaining,
        statuses: Object.fromEntries(machineBreakdown.map((m) => [m.machines.machine_number, conditions[m.id] === "damaged" ? "repair" : "available"])),
        customer: selectedGroup.customer,
      });
      setPhase("done");
    } catch (e) {
      setVerified(false);
      setSubmitError(`Return confirmation was not verified: ${e.message || 'Network error'}. Check the live rental and payment history before trying again.`);
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => { setVerified(false); }, [returningIds, returnEdits, conditions, amountPaid, discount, showDiscount, returnNote, selectedCustomerId]);

  const stepIndex = { browse: 0, pick: 1, settle: 2, done: 3 }[phase];

  const itemsByOrder = useMemo(() => {
    if (!selectedGroup) return [];
    const map = {};
    selectedGroup.items.forEach((it) => {
      const oid = it.rental_order_id;
      if (!map[oid]) map[oid] = { orderId: it.rental_orders.display_id, remarks: it.rental_orders.remarks, items: [] };
      map[oid].items.push(it);
    });
    return Object.values(map);
  }, [selectedGroup]);

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: PAPER, minHeight: 600, padding: "28px 20px" }}>
      <div style={{ maxWidth: 660, margin: "0 auto" }}>

        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 12, color: FOREST_DARK, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>RentDesk</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: INK, marginTop: 2 }}>Return rental</div>
          
        </div>

        {loadError && <div style={{ color: RED, fontSize: 13, marginBottom: 12 }}>{loadError}</div>}
        {!online && <div style={{ background: AMBER_BG, color: '#865417', padding: 11, borderRadius: 8, marginBottom: 14, fontSize: 12.5 }}>Offline — cached rentals and balances may be outdated. Save a draft; no return or payment can be finalized until online verification.</div>}
        {draftNotice && <div role="status" style={{ background: FOREST_BG, color: FOREST_DARK, padding: 11, borderRadius: 8, marginBottom: 14, fontSize: 12.5 }}>{draftNotice}</div>}
        {drafts.length > 0 && phase === 'browse' && <section style={{background:'#F0F7F2',border:'1px solid #BCD8C7',borderRadius:12,padding:14,marginBottom:18}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}><strong style={{color:FOREST_DARK}}>Saved return drafts</strong><span style={{background:FOREST,color:'#fff',borderRadius:20,padding:'3px 9px',fontSize:12}}>{drafts.length}</span></div>
          <p style={{fontSize:12,color:INK_SOFT,margin:'8px 0'}}>Local drafts only · No machines returned or payments recorded</p>
          {drafts.map(d=><div key={d.id} style={{background:'#fff',border:'1px solid #DCE9DF',borderRadius:9,padding:12,marginTop:8}}>
            <strong>{d.customerName||'Customer'}</strong><div style={{fontSize:12,color:INK_SOFT,marginTop:4}}>{(d.machines||[]).join(', ')}</div><div style={{fontSize:11,color:INK_SOFT,marginTop:5}}>Saved {new Date(d.savedAt).toLocaleString('en-IN')} · <b>Unsubmitted</b></div>
            <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}><button onClick={()=>restoreReturnDraft(d).catch(e=>setDraftNotice(e.message))} style={{background:FOREST,color:'#fff',border:0,borderRadius:7,padding:'7px 12px'}}>Resume draft</button><button onClick={async()=>{if(window.confirm('Delete this local return draft?')){await deleteReturnDraft(user.id,d.id);const ds=await listReturnDrafts(user.id);setDrafts(ds);setPendingDraft(ds[0]||null);}}} style={{background:'#fff',color:RED,border:'1px solid #E7C4BD',borderRadius:7,padding:'7px 12px'}}>Delete</button></div>
          </div>)}
        </section>}
        <StepTicket current={stepIndex} />

        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 24 }}>

          {phase === "browse" && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: INK, marginBottom: 4 }}>Current rentals</div>
              
              <div style={{ position: "relative", marginBottom: 16 }}>
                <Search size={15} color={INK_SOFT} style={{ position: "absolute", left: 12, top: 12 }} />
                <input style={{ ...inputStyle, paddingLeft: 34 }} placeholder="Filter by mobile, name, order ID, or machine number" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>

              {loading && <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: INK_SOFT }}>Loading…</div>}
              {!loading && visibleGroups.length === 0 && <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: INK_SOFT }}>No matching active rentals.</div>}

              {!loading && visibleGroups.slice((browsePage-1)*15,browsePage*15).map((g) => {
                const anyLate = g.items.some((it) => new Date(it.expected_return_at) < new Date());
                const orderIds = [...new Set(g.items.map((it) => it.rental_orders.display_id))];
                return (
                  <div key={g.customer.id} onClick={() => openCustomer(g.customer.id)} style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: "14px 16px", marginBottom: 10, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{g.customer.name}</div>
                      <div style={{ fontSize: 12.5, color: INK_SOFT, marginTop: 2, fontFamily: "monospace" }}>{g.customer.mobile}</div>
                      <div style={{ fontSize: 12, color: INK_SOFT, marginTop: 2 }}>
                        {g.items.length} machine{g.items.length > 1 ? "s" : ""}{orderIds.length > 1 ? ` across ${orderIds.length} orders (${orderIds.join(", ")})` : ` · ${orderIds[0]}`}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {anyLate && <span style={{ fontSize: 11, fontWeight: 600, background: AMBER_BG, color: AMBER, padding: "4px 8px", borderRadius: 6 }}>Past due</span>}
                      <ChevronRight size={18} color={INK_SOFT} />
                    </div>
                  </div>
                );
              })}
              <Pager page={browsePage} onChange={setBrowsePage} total={visibleGroups.length}/>
            </div>
          )}

          {phase === "pick" && selectedGroup && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <div style={{ background: oldBalance > 0 ? RED_BG : oldBalance < 0 ? FOREST_BG : PAPER, borderRadius: 7, padding: "5px 10px" }}>
                  <div style={{ fontSize: 10, color: INK_SOFT, fontWeight: 600 }}>Balance till settlement</div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: oldBalance > 0 ? RED : oldBalance < 0 ? FOREST_DARK : INK }}>
                    {oldBalance === 0 ? "₹0" : `₹${Math.abs(oldBalance)} ${oldBalance > 0 ? "due" : "credit"}`}
                  </div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: INK, textAlign: "right" }}>{selectedGroup.customer.name}</div>
              </div>
              

              {itemsByOrder.map((group) => (
                <div key={group.orderId} style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: INK_SOFT, letterSpacing: 0.4, marginBottom: 8 }}>{group.orderId}</div>
                  {group.remarks && (
                    <div style={{ display: "flex", gap: 8, background: PAPER, borderRadius: 8, padding: "9px 12px", marginBottom: 10, fontSize: 12.5, color: INK_SOFT }}>
                      <StickyNote size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                      <div><strong style={{ color: INK }}>Note:</strong> {group.remarks}</div>
                    </div>
                  )}

                  {group.items.map((it) => {
                    const isReturning = returningIds.includes(it.id);
                    const isDamaged = conditions[it.id] === "damaged";
                    const ret = returnEdits[it.id] || { date: TODAY_ISO, time: NOW_TIME };
                    const rentedOnDate = it.rentedOnAt.slice(0, 10);
                    const rentedOnTime = it.rentedOnAt.slice(11, 16);
                    const age = billableDays(rentedOnDate, rentedOnTime, ret.date, ret.time);

                    return (
                      <div key={it.id} style={{ border: `1.5px solid ${isReturning ? FOREST : LINE}`, borderRadius: 10, padding: "12px 14px", marginBottom: 10, background: isReturning ? FOREST_BG : "#fff" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div onClick={() => toggleReturning(it.id)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                            {isReturning ? <CheckCircle2 size={18} color={FOREST} /> : <Circle size={18} color={LINE} />}
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>{it.machines.machine_number}</div>
                              <div style={{ fontSize: 11.5, color: INK_SOFT }}>₹{it.daily_rate}/day</div>
                            </div>
                          </div>
                          {isReturning && (
                            <div style={{ display: "flex", gap: 6 }}>
                              {["good", "damaged"].map((c) => (
                                <button key={c} onClick={() => setConditions((prev) => ({ ...prev, [it.id]: c }))} style={{ fontSize: 11.5, padding: "5px 10px", borderRadius: 6, fontWeight: 600, cursor: "pointer", border: `1px solid ${conditions[it.id] === c ? (c === "damaged" ? RED : FOREST) : LINE}`, background: conditions[it.id] === c ? (c === "damaged" ? RED_BG : FOREST_BG) : "#fff", color: conditions[it.id] === c ? (c === "damaged" ? RED : FOREST_DARK) : INK_SOFT }}>
                                  {c === "good" ? "Good" : "Damaged"}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${isReturning ? "rgba(0,0,0,0.06)" : LINE}` }}>
                          <div>
                            <div style={{ fontSize: 10.5, color: INK_SOFT, fontWeight: 600, marginBottom: 4 }}>Rented on</div>
                            <div style={{ fontSize: 12.5, color: INK, display: "flex", alignItems: "center", gap: 5 }}>
                              <Clock size={11} color={INK_SOFT} /> {toIndianDate(rentedOnDate)}, {to12Hour(rentedOnTime)}
                            </div>
                            <div style={{ fontSize: 10.5, color: "#9A988E", marginTop: 3 }}>Originally due {toIndianDate(it.expected_return_at.slice(0, 10))}, {to12Hour(it.expected_return_at.slice(11, 16))}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10.5, color: INK_SOFT, fontWeight: 600, marginBottom: 4 }}>Return date & time</div>
                            <div style={{ display: "flex", gap: 5 }}>
                              <input type="date" style={{ ...compactInputStyle, flex: 1 }} value={ret.date} onChange={(e) => setReturnEdits((prev) => ({ ...prev, [it.id]: { ...prev[it.id], date: e.target.value, edited: true } }))} />
                              <input type="time" style={{ ...compactInputStyle, width: 84, flex: "none" }} value={ret.time} onChange={(e) => setReturnEdits((prev) => ({ ...prev, [it.id]: { ...prev[it.id], time: e.target.value, edited: true } }))} />
                            </div>
                            <div style={{ fontSize: 11, color: FOREST_DARK, fontWeight: 600, marginTop: 4 }}>= {age} day{age === 1 ? "" : "s"} billed</div>
                          </div>
                        </div>

                        {isReturning && isDamaged && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 11.5, color: RED }}>
                            <Wrench size={12} /> This machine will be moved to <strong>Under Repair</strong> automatically on confirm.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <GhostButton onClick={backFromPick}><ArrowLeft size={15} /> Back</GhostButton>
                <PrimaryButton onClick={goToSettle} disabled={returningIds.length === 0} style={{ flex: 1, justifyContent: "center" }}>
                  Calculate settlement <ChevronRight size={16} />
                </PrimaryButton>
              </div>
            </div>
          )}

          {phase === "settle" && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: INK, marginBottom: 4 }}>Settle up</div>
              <p style={{ fontSize: 13, color: INK_SOFT, marginTop: 0, marginBottom: 14 }}>
                {touchedOrders.length > 1 ? `Across ${touchedOrders.length} orders: ${touchedOrders.map((o) => o.display_id).join(", ")}` : touchedOrders[0]?.display_id}
              </p>

              <div style={{ marginBottom: 14, border: `1px solid ${LINE}`, borderRadius: 9, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead><tr style={{ background: PAPER, color: INK_SOFT }}><th style={{ padding: 10, textAlign: "left" }}>Machine / Rental ID</th><th style={{ padding: 10, textAlign: "right" }}>Days</th><th style={{ padding: 10, textAlign: "right" }}>Charge</th></tr></thead>
                  <tbody>{machineBreakdown.map(m => <tr key={m.id} style={{ borderTop: `1px solid ${LINE}` }}><td style={{ padding: 10 }}><strong>{m.machines.machine_number}</strong><div style={{ color: INK_SOFT }}>{m.rental_orders.display_id}</div></td><td style={{ padding: 10, textAlign: "right" }}>{m.days}</td><td style={{ padding: 10, textAlign: "right", fontWeight: 600 }}>₹{m.subtotal.toLocaleString("en-IN")}</td></tr>)}</tbody>
                </table>
              </div>
              <div style={{ background: PAPER, borderRadius: 10, padding: 14, fontSize: 13.5, marginBottom: 14 }}>
                <Row label="Rental charges" value={`₹${settlementTotals.rentTotal.toLocaleString("en-IN")}`} />
                {/* Extra expenses were charged at rental start and are already in previous balance. */}
                {oldBalance !== 0 && <Row label={oldBalance > 0 ? "Previous customer due" : "Previous customer credit"} value={`${oldBalance > 0 ? "+" : "−"}₹${Math.abs(oldBalance).toLocaleString("en-IN")}`} />}
                {discountNum > 0 && <Row label="Discount" value={`−₹${discountNum.toLocaleString("en-IN")}`} />}
                <div style={{ borderTop: `1px solid ${LINE}`, margin: "8px 0" }} />
                <Row label="Total payable" value={oldBalance + settlementTotals.chargesForThisEvent - discountNum < 0 ? `₹${Math.abs(oldBalance + settlementTotals.chargesForThisEvent - discountNum).toLocaleString("en-IN")} credit` : `₹${(oldBalance + settlementTotals.chargesForThisEvent - discountNum).toLocaleString("en-IN")}`} bold />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12.5, color: INK_SOFT, marginBottom: 5, fontWeight: 500 }}>Amount received now (₹)</label>
                <input type="number" style={{ ...inputStyle, fontSize: 16, fontWeight: 600 }} value={amountPaid} onChange={(e) => { setAmountPaid(e.target.value); setManualDiscount(false); }} placeholder="0" />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                <button onClick={toggleDiscount} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "white", border: `1px dashed ${LINE}`, color: INK_SOFT, fontSize: 12.5, borderRadius: 7, padding: "7px 12px", cursor: "pointer" }}><Tag size={13} /> {showDiscount ? "Remove discount" : "Add discount"}</button>
                <button onClick={() => setShowRemark(v => !v)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "white", border: `1px dashed ${LINE}`, color: INK_SOFT, fontSize: 12.5, borderRadius: 7, padding: "7px 12px", cursor: "pointer" }}><StickyNote size={13} /> {showRemark ? "Hide remark" : "Add remark"}</button>
              </div>
              {showDiscount && <div style={{ marginBottom: 12 }}><label style={{ display: "block", fontSize: 12, color: INK_SOFT, marginBottom: 5 }}>Discount (₹)</label><input type="number" style={inputStyle} value={manualDiscount ? discount : discountNum} min="0" onChange={(e) => { setManualDiscount(true); setDiscount(e.target.value); }} title="Automatically calculated; edit to override. Changing payment recalculates automatically." placeholder="0" /></div>}
              {showRemark && <div style={{ marginBottom: 12 }}><label style={{ display: "block", fontSize: 12, color: INK_SOFT, marginBottom: 5 }}>Return remark (optional)</label><textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={returnNote} onChange={(e) => setReturnNote(e.target.value)} placeholder="Machine condition, customer request, payment promise…" /></div>}
              <div style={{ background: newBalance > 0 ? RED_BG : FOREST_BG, borderRadius: 9, padding: 14, marginBottom: 16 }}><Row label="Balance after return" value={newBalance === 0 ? "₹0 · Settled" : `₹${Math.abs(newBalance).toLocaleString("en-IN")} ${newBalance > 0 ? "due" : "credit"}`} bold warn={newBalance > 0} good={newBalance <= 0} /></div>
              {submitError && <div style={{ color: RED, fontSize: 12.5, marginBottom: 12 }}>{submitError}</div>}

              <div style={{ display: "flex", gap: 10, flexWrap: 'wrap' }}>
                <GhostButton onClick={() => setPhase("pick")}><ArrowLeft size={15} /> Back</GhostButton>
                <GhostButton onClick={() => storeReturnDraft().catch(e => setSubmitError(e.message))}>Save return draft</GhostButton>

                <PrimaryButton onClick={confirmReturn} disabled={submitting || !online} style={{ flex: 1, justifyContent: "center" }}>
                  <PackageCheck size={16} /> {submitting ? "Recording…" : "Confirm return"}
                </PrimaryButton>
              </div>
            </div>
          )}

          {phase === "done" && completed && (
            <div style={{ textAlign: "center", padding: "10px 0" }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: FOREST_BG, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                <CheckCircle2 size={26} color={FOREST_DARK} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: INK }}>Return recorded</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 16 }}>
                {Object.entries(completed.statuses).map(([number, status]) => (
                  <span key={number} style={{ fontSize: 11, fontWeight: 600, padding: "4px 9px", borderRadius: 6, background: status === "repair" ? RED_BG : FOREST_BG, color: status === "repair" ? RED : FOREST_DARK }}>
                    {number} → {status === "repair" ? "Under repair" : "Available"}
                  </span>
                ))}
              </div>

              <div style={{ background: PAPER, borderRadius: 10, padding: 16, textAlign: "left", fontSize: 13.5, marginBottom: 16 }}>
                {completed.discount > 0 && <Row label="Discount given" value={`₹${completed.discount}`} good />}
                <Row label="Paid now" value={`₹${completed.amountPaid}`} bold good />
              </div>

              <div style={{ fontSize: 12, fontWeight: 700, color: INK_SOFT, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 10, textAlign: "left" }}>Customer summary</div>
              <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 16, marginBottom: 20, textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{completed.customer.name}</div>
                  <select aria-label="Customer flag" title="Change customer flag" value={completed.customer.flag || "green"} onChange={async (e) => { const flag = e.target.value; try { await updateCustomer(completed.customer.id, { flag }); setCompleted(prev => ({ ...prev, customer: { ...prev.customer, flag } })); } catch (err) { alert(err.message || "Could not save flag"); } }} style={{ fontSize: 12, borderRadius: 7, padding: "6px 8px", background: ({ green: FOREST_BG, amber: AMBER_BG, red: RED_BG, gold: "#FFF2C9" })[completed.customer.flag || "green"], color: INK, border: `1px solid ${LINE}` }}>
                    <option value="green">⚑ Green</option><option value="amber">⚑ Amber</option><option value="red">⚑ Red</option><option value="gold">⚑ Gold</option>
                  </select>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ background: completed.newBalance > 0 ? RED_BG : completed.newBalance < 0 ? FOREST_BG : PAPER, borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: INK_SOFT }}>Total balance</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: completed.newBalance > 0 ? RED : completed.newBalance < 0 ? FOREST_DARK : INK }}>
                      {completed.newBalance === 0 ? "₹0" : `₹${Math.abs(completed.newBalance)} ${completed.newBalance > 0 ? "due" : "credit"}`}
                    </div>
                  </div>
                  <div style={{ background: PAPER, borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: INK_SOFT }}>Active rentals</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>{completed.activeRentalsRemaining}</div>
                  </div>
                </div>
              </div>

              <PrimaryButton onClick={reset} style={{ width: "100%", justifyContent: "center" }}>
                Process next return
              </PrimaryButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
