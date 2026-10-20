import { supabase } from "../lib/supabaseClient.js";
import React, { useEffect, useMemo, useState } from "react";
import { Search, UserPlus, CheckCircle2, ArrowLeft, ChevronRight, Trash2, AlertCircle, MapPin, Plus, CalendarDays, Clock3 } from "lucide-react";
import { listProducts, listMachines, searchCustomers, listRecentRentalCustomers, createCustomer, startRental, getCustomerBalance, getCustomerOrders, updateCustomer, syncOfflineCustomerDirectory } from "../lib/api.js";
import { nowIST, isoDateIST, hhmmIST, addDaysISO, toIndianDate, to12Hour, isValidMobile } from "../lib/dates.js";
import PhotoCapture from "./PhotoCapture.jsx";
import { readRentalDraft, listRentalDrafts, saveRentalDraft, deleteRentalDraft, saveStartRentalDraftLocked, machineDraftConflicts } from "../lib/offlineDrafts.js";
import { useAuth } from "../context/AuthContext.jsx";
import Pager from "./Pager.jsx";

const INK = "#1C2333";
const INK_SOFT = "#4A5268";
const PAPER = "#F6F5F1";
const CARD = "#FFFFFF";
const LINE = "#E4E2D8";
const FOREST = "#2F6F4E";
const FOREST_DARK = "#1F4E36";
const FOREST_BG = "#E7F1EB";
const RED = "#A5402C";

const PROFESSIONS = [
  "Individual", "Contractor", "Karigar/Raj Mistri", "Helper (Mazdoor)", "Electrician",
  "Solar Installer", "Plumber", "Carpenter", "Tile Mistri", "Welder",
  "Machinery Rental Partner", "Social Organization", "Government Department", "Demolition Worker", "Other",
]; // §7 — must match exactly

const STEPS = ["Search", "Customer", "Items", "Advance", "Done"];

const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "10px 12px",
  border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 14.5,
  fontFamily: "inherit", color: INK, background: "#fff", outline: "none",
};
const compactInputStyle = { ...inputStyle, padding: "7px 9px", borderRadius: 6, fontSize: 13 };

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12.5, color: INK_SOFT, marginBottom: 5, fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}
function ErrorText({ children }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: RED, marginTop: 5 }}><AlertCircle size={13} /> {children}</div>;
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

const emptyNewCustomer = {
  name: "", mobile: "", additionalMobile: "", showAdditionalMobile: false,
  profession: "", customProfession: "",
  village: "", address: "",
  photo_url: null, id_proof_front_url: null, id_proof_back_url: null,
  referredBy: { id: "", name: "", mobile: "", address: "" },
};

export default function StartRental({customerContext}) {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pendingDraft, setPendingDraft] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [restoredDraftId, setRestoredDraftId] = useState(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [reviewedDraft, setReviewedDraft] = useState(false);
  const [products, setProducts] = useState([]);
  const [availableMachines, setAvailableMachines] = useState([]);
  const [loadError, setLoadError] = useState("");

  const [phase, setPhase] = useState("search");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [recentCustomers, setRecentCustomers] = useState([]);
  const [recentPeriod,setRecentPeriod] = useState("all");
  const [recentCustomStart,setRecentCustomStart] = useState(isoDateIST(new Date()));
  const [recentCustomEnd,setRecentCustomEnd] = useState(isoDateIST(new Date()));
  const [recentPage,setRecentPage] = useState(1);
  const [searchPage,setSearchPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const [activeCustomer, setActiveCustomer] = useState(null);
  const [customerSummary, setCustomerSummary] = useState({ balance: 0, rentalCount: 0, rentals: [], loading: false });

  const [newCustomer, setNewCustomer] = useState(emptyNewCustomer);
  const [newCustomerError, setNewCustomerError] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [referrerMatches, setReferrerMatches] = useState([]);

  const [selectedProductId, setSelectedProductId] = useState("");
  const [cart, setCart] = useState([]); // [{machineId, number, productId, product, dailyRent}]

  const [rentalDetails, setRentalDetails] = useState(() => {
    const now = nowIST();
    return {
      startDate: isoDateIST(new Date()), startTime: hhmmIST(new Date()),
      returnDate: addDaysISO(isoDateIST(new Date()), 1), returnTime: "11:00",
      advance: "", extraExpense: "", remarks: "",
    };
  });
  const [showExtraExpense, setShowExtraExpense] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [lastOrder, setLastOrder] = useState(null);

  useEffect(() => {
    const online = () => { setIsOnline(true); setReviewedDraft(false); };
    const offline = () => { setIsOnline(false); setReviewedDraft(false); };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, []);
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    readRentalDraft(user.id).then(() => listRentalDrafts(user.id)).then(ds => { if (active) { setDrafts(ds); setPendingDraft(ds[0] || null); } }).catch(() => {});
    return () => { active = false; };
  }, [user?.id]);

  function restoreDraft(draft = pendingDraft) {
    if (!draft) return;
    setRestoredDraftId(draft.id);
    setActiveCustomer(draft.customer);
    setCart(draft.items);
    setRentalDetails(draft.details);
    setShowExtraExpense(draft.showExtraExpense);
    setReviewedDraft(false);
    setDraftMessage('Draft restored. Customer and machine availability will be checked automatically when you submit online.');
    setSubmitError('');
    setPhase('advance');
  }
  async function storeDraft() {
    if (!activeCustomer?.id || !cart.length) throw new Error('Choose a saved customer and at least one machine.');
    const saved = await saveStartRentalDraftLocked(user?.id, { id: restoredDraftId || undefined, customer: activeCustomer, items: cart, details: rentalDetails, showExtraExpense });
    const ds = await listRentalDrafts(user.id);
    setDrafts(ds); setPendingDraft(ds[0] || null); setRestoredDraftId(null);
    setReviewedDraft(false);
    setDraftMessage('Draft saved on this device. No rental was created or machine reserved.');
    setActiveCustomer(null); setCart([]); setSelectedProductId(''); setQuery('');
    setRentalDetails({startDate:isoDateIST(new Date()),startTime:hhmmIST(new Date()),returnDate:addDaysISO(isoDateIST(new Date()),1),returnTime:'11:00',advance:'',extraExpense:'',remarks:''});
    setShowExtraExpense(false); setPhase('search'); setSubmitError('');
    return saved;
  }
  async function verifyDraft() {
    if (!navigator.onLine) throw new Error('Reconnect to verify machines.');
    if (!activeCustomer?.id || !cart.length) throw new Error('Choose a customer and machine.');
    const { data: customer, error: customerError } = await supabase.from('customers').select('id').eq('id', activeCustomer.id).single();
    if (customerError || !customer) throw new Error('Customer could not be verified. Please reconnect and retry.');
    const ids = cart.map(x => x.machineId);
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate machine selected.');
    const { data: machines, error } = await supabase.from('machines').select('id,product_id,status').in('id', ids);
    if (error) throw new Error(`Could not verify machines: ${error.message}`);
    if (!machines || machines.length !== ids.length || cart.some(item => !machines.some(m => m.id === item.machineId && m.product_id === item.productId && m.status === 'available'))) {
      throw new Error('A selected machine is no longer available. Return to Items and update the selection.');
    }
    setReviewedDraft(true);
    setDraftMessage('Customer and machine availability checked online. Confirm to submit; availability may still change before saving.');
  }

  const stepIndex = { search: 0, newcustomer: 1, found: 1, items: 2, advance: 3, confirm: 4 }[phase];

  useEffect(() => {
    // Background full-directory snapshot makes name/mobile lookup possible offline.
    syncOfflineCustomerDirectory().catch(error => console.warn('Offline directory sync unavailable', error));
  }, []);

  useEffect(() => {
    listProducts()
      .then(async (p) => {
        let ordered = p;
        try {
          // Count historical machine rental sessions, including completed rentals.
          const { data, error } = await supabase.from('rental_items').select('machine_id,machines!inner(product_id)');
          if (error) throw error;
          const counts = new Map();
          for (const item of data || []) {
            const id = item.machines?.product_id;
            if (id) counts.set(id, (counts.get(id) || 0) + 1);
          }
          ordered = [...p].sort((a,b) => (counts.get(b.id)||0)-(counts.get(a.id)||0) || a.name.localeCompare(b.name));
        } catch (error) {
          console.warn('Product popularity unavailable; using default product order', error);
        }
        setProducts(ordered);
        if (ordered.length) setSelectedProductId(ordered[0].id);
      })
      .catch((e) => setLoadError(e.message));
  }, []);

  useEffect(() => {
    if (!selectedProductId) return;
    listMachines({ productId: selectedProductId, status: "available" })
      .then(setAvailableMachines)
      .catch((e) => setLoadError(e.message));
  }, [selectedProductId, cart.length]); // refetch after cart changes so a just-added machine drops off the list

  useEffect(() => {
    if (!activeCustomer?.id) {
      setCustomerSummary({ balance: 0, rentalCount: 0, rentals: [], loading: false });
      return;
    }
    let cancelled = false;
    setCustomerSummary((x) => ({ ...x, loading: true }));
    Promise.all([
      getCustomerBalance(activeCustomer.id),
      getCustomerOrders(activeCustomer.id),
    ]).then(([balance, orders]) => {
      if (!cancelled) setCustomerSummary({ balance, rentalCount: orders.length, rentals: orders.slice(0, 3), loading: false });
    }).catch((e) => {
      if (!cancelled) { setLoadError(e.message); setCustomerSummary((x) => ({ ...x, loading: false })); }
    });
    return () => { cancelled = true; };
  }, [activeCustomer?.id]);

  useEffect(() => {
    if (phase !== "search") return;
    let cancelled = false;
    listRecentRentalCustomers(1000)
      .then((rows) => { if (!cancelled) setRecentCustomers(rows); })
      .catch((e) => { if (!cancelled) setLoadError(e.message); });
    return () => { cancelled = true; };
  }, [phase]);

  const recentFiltered=useMemo(()=>{
    const today=isoDateIST(new Date());
    const yesterday=addDaysISO(today,-1);
    return recentCustomers.filter(c=>{
      if(!c.latestRentalAt) return false;
      const day=isoDateIST(c.latestRentalAt);
      if(recentPeriod==='all') return true;
      if(recentPeriod==='today') return day===today;
      if(recentPeriod==='yesterday') return day===yesterday;
      return !!recentCustomStart && !!recentCustomEnd && recentCustomStart<=recentCustomEnd && day>=recentCustomStart && day<=recentCustomEnd;
    });
  },[recentCustomers,recentPeriod,recentCustomStart,recentCustomEnd]);
  useEffect(()=>setRecentPage(1),[recentPeriod,recentCustomStart,recentCustomEnd]);
  useEffect(()=>setSearchPage(1),[query]);
  // Debounced-ish live customer search
  useEffect(() => {
    const q = query.trim();
    if (!q) { setMatches([]); return; }
    setSearching(true);
    const handle = setTimeout(() => {
      searchCustomers(q).then((rows) => { setMatches(rows); setLoadError(''); }).catch((e) => { setMatches([]); setLoadError(e.message); }).finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (newCustomer.referredBy.id) { setReferrerMatches([]); return; }
    const nameQ = newCustomer.referredBy.name.trim();
    const mobileQ = newCustomer.referredBy.mobile.trim();
    const q = mobileQ || nameQ;
    if (q.length < 2) { setReferrerMatches([]); return; }
    const handle = setTimeout(() => {
      searchCustomers(q).then((r) => setReferrerMatches(r.slice(0, 5))).catch(() => {});
    }, 250);
    return () => clearTimeout(handle);
  }, [newCustomer.referredBy.name, newCustomer.referredBy.mobile, newCustomer.referredBy.id]);

  function resetAll() {
    setPhase("search"); setQuery(""); setMatches([]); setActiveCustomer(null);
    setNewCustomer(emptyNewCustomer); setNewCustomerError("");
    setSelectedProductId(products[0]?.id || ""); setCart([]);
    const now = nowIST();
    setRentalDetails({ startDate: isoDateIST(new Date()), startTime: hhmmIST(new Date()), returnDate: addDaysISO(isoDateIST(new Date()), 1), returnTime: "11:00", advance: "", extraExpense: "", remarks: "" });
    setShowExtraExpense(false); setLastOrder(null); setSubmitError("");
  }

  function pickCustomer(c) { setActiveCustomer(c); setPhase("found"); }
  useEffect(()=>{
    if(customerContext?.action==='start' && customerContext.customer?.id) pickCustomer(customerContext.customer);
  },[customerContext]);

  function continueToItems() {
    // Capture pickup time when staff actually proceeds to item selection,
    // rather than keeping the time from when this screen first opened.
    const now = nowIST();
    setRentalDetails((d) => ({ ...d, startDate: isoDateIST(new Date()), startTime: hhmmIST(new Date()) }));
    setPhase("items");
  }

  function openNewCustomer() {
    const looksLikeMobile = /^\d+$/.test(query.trim());
    const validMobile = /^[6-9]\d{9}$/.test(query.trim());
    setNewCustomer((n) => ({ ...n, name: looksLikeMobile ? "" : query, mobile: validMobile ? query.trim() : "" }));
    setNewCustomerError(looksLikeMobile && !validMobile ? "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9." : "");
    setPhase("newcustomer");
  }

  function pickReferrer(c) {
    setNewCustomer((n) => ({ ...n, referredBy: { id: c.id, name: c.name, mobile: c.mobile, address: c.address || "" } }));
    setReferrerMatches([]);
  }

  async function handleCreateCustomer() {
    setNewCustomerError("");
    if (!newCustomer.name.trim()) { setNewCustomerError("Name is required."); return; }
    if (!isValidMobile(newCustomer.mobile)) {
      setNewCustomerError("Wrong number — enter a 10-digit mobile number starting with 6, 7, 8, or 9.");
      return;
    }
    if (newCustomer.showAdditionalMobile && newCustomer.additionalMobile.trim() === newCustomer.mobile.trim()) {
      setNewCustomerError("Additional mobile must be different from the primary mobile number.");
      return;
    }
    setSavingCustomer(true);
    try {
      const record = await createCustomer({
        name: newCustomer.name,
        mobile: newCustomer.mobile,
        additional_mobile: newCustomer.showAdditionalMobile ? newCustomer.additionalMobile : "",
        profession: newCustomer.profession,
        custom_profession: newCustomer.customProfession,
        village: newCustomer.village,
        address: newCustomer.address,
        photo_url: newCustomer.photo_url,
        id_proof_front_url: newCustomer.id_proof_front_url,
        id_proof_back_url: newCustomer.id_proof_back_url,
        referred_by_customer_id: newCustomer.referredBy.id || null,
        referred_by_name: newCustomer.referredBy.name || null,
        referred_by_mobile: newCustomer.referredBy.mobile || null,
        referred_by_address: newCustomer.referredBy.address || null,
      });
      setActiveCustomer(record);
      setPhase("items");
    } catch (e) {
      setNewCustomerError(e.message?.includes("duplicate") ? "A customer with this mobile number already exists." : e.message || "Failed to create customer");
    } finally {
      setSavingCustomer(false);
    }
  }

  const lockedMachineIds = useMemo(() => new Set(drafts
    .filter(d => d.id !== restoredDraftId && d.type !== 'return')
    .flatMap(d => (d.items || []).map(item => String(item.machineId)))), [drafts, restoredDraftId]);

  function addToCart(machine) {
    if (lockedMachineIds.has(String(machine.id))) {
      setLoadError('This machine is already reserved in another saved rental draft on this device.');
      return;
    }
    const product = products.find((p) => p.id === machine.product_id);
    setCart((prev) => prev.some(c => c.machineId === machine.id) ? prev : [...prev, { machineId: machine.id, number: machine.machine_number, productId: machine.product_id, product: product?.name, dailyRent: product?.daily_rent }]);
  }
  function removeFromCart(machineId) { setCart((prev) => prev.filter((c) => c.machineId !== machineId)); }

  async function handleSaveRental() {
    setSubmitError("");
    setSubmitting(true);
    try {
      if (!navigator.onLine) {
        await storeDraft();
        return;
      }
      const latestDrafts = await listRentalDrafts(user.id);
      if (machineDraftConflicts(latestDrafts, cart.map(c => c.machineId), restoredDraftId).length) {
        throw new Error('A selected machine is reserved in another local draft. Remove it before submitting.');
      }
      // Recheck immediately before sending. The server must still enforce availability atomically.
      await verifyDraft();
      const order = await startRental({
        customerId: activeCustomer.id,
        items: cart.map((c) => ({ productId: c.productId, machineId: c.machineId, dailyRate: c.dailyRent })),
        startDateISO: rentalDetails.startDate,
        startTimeHHMM: rentalDetails.startTime,
        returnDateISO: rentalDetails.returnDate,
        returnTimeHHMM: rentalDetails.returnTime,
        advanceAmount: Math.round(Number(rentalDetails.advance) || 0),
        extraExpense: showExtraExpense ? Math.round(Number(rentalDetails.extraExpense) || 0) : 0,
        remarks: rentalDetails.remarks,
      });
      setLastOrder({ ...order, customer: activeCustomer, items: cart, advance: Math.round(Number(rentalDetails.advance) || 0), extraExpense: showExtraExpense ? Math.round(Number(rentalDetails.extraExpense) || 0) : 0, startDate: rentalDetails.startDate, startTime: rentalDetails.startTime, returnDate: rentalDetails.returnDate, returnTime: rentalDetails.returnTime, remarks: rentalDetails.remarks });
      if (restoredDraftId) {
        await deleteRentalDraft(user?.id, restoredDraftId).catch(err => console.warn('Could not remove submitted draft', err));
        const ds = await listRentalDrafts(user.id); setDrafts(ds); setPendingDraft(ds[0] || null); setRestoredDraftId(null); setReviewedDraft(false);
      }
      setDraftMessage('');
      setPhase("confirm");
    } catch (e) {
      setSubmitError(e.message || "Failed to save rental");
    } finally {
      setSubmitting(false);
    }
  }

  const cartTotalDaily = cart.reduce((s, c) => s + (c.dailyRent || 0), 0);

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: PAPER, minHeight: 600, padding: "28px 20px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>

        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 12, color: FOREST_DARK, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>RentDesk</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: INK, marginTop: 2 }}>Start a rental</div>
        </div>
        <p style={{ fontSize: 11, color: "#9A988E", marginTop: 0, marginBottom: 16 }}>All times shown are IST (India Standard Time).</p>
        {loadError && <div style={{ color: RED, fontSize: 13, marginBottom: 12 }}>{loadError}</div>}

        {drafts.length > 0 && phase === 'search' && <section style={{border:'1px solid #BCD8C7',background:'#F0F7F2',borderRadius:12,padding:14,marginBottom:18}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,marginBottom:10}}><strong style={{color:FOREST_DARK}}>Saved rental drafts</strong><span style={{background:FOREST,color:'#fff',padding:'3px 9px',borderRadius:20,fontSize:12}}>{drafts.length}</span></div>
          <p style={{fontSize:12,color:INK_SOFT,margin:'0 0 10px'}}>Stored only on this device · Not submitted · Machines not reserved</p>
          {drafts.map(d => <div key={d.id} style={{background:'#fff',border:'1px solid #DCE9DF',borderRadius:9,padding:12,marginTop:8}}>
            <strong>{d.customer?.name || 'Customer'}</strong><div style={{fontSize:12,color:INK_SOFT,marginTop:3}}>{(d.items||[]).map(x=>x.product+' '+x.number).join(', ')}</div>
            <div style={{fontSize:11,color:INK_SOFT,marginTop:5}}>Saved {new Date(d.savedAt).toLocaleString('en-IN')} · <b>Unsubmitted</b></div>
            <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}><button type="button" onClick={()=>restoreDraft(d)} style={{padding:'7px 12px',background:FOREST,color:'#fff',border:0,borderRadius:7}}>Resume draft</button><button type="button" onClick={async()=>{if(window.confirm('Delete this local draft?')){await deleteRentalDraft(user.id,d.id);const ds=await listRentalDrafts(user.id);setDrafts(ds);setPendingDraft(ds[0]||null);}}} style={{padding:'7px 12px',background:'#fff',color:RED,border:'1px solid #E7C4BD',borderRadius:7}}>Delete</button></div>
          </div>)}
        </section>}
        <StepTicket current={stepIndex} />

        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 24, boxShadow:"0 3px 14px rgba(31,78,54,.035)" }}>

          {/* SEARCH */}
          {phase === "search" && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: INK, marginBottom: 4 }}>Find the customer</div>
              <p style={{ fontSize: 13, color: INK_SOFT, marginTop: 0, marginBottom: 14 }}>Start typing a name or mobile number.</p>
              <div style={{ position: "relative", marginBottom: 14 }}>
                <Search size={15} color={INK_SOFT} style={{ position: "absolute", left: 12, top: 12 }} />
                <input style={{ ...inputStyle, paddingLeft: 34 }} placeholder="Name or mobile number" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              {!query.trim() && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: INK, marginBottom: 8 }}>Recent Customers</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>{[["all","All"],["today","Today"],["yesterday","Yesterday"],["custom","Custom"]].map(([value,label])=><button type="button" key={value} onClick={()=>setRecentPeriod(value)} style={{padding:"7px 13px",border:`1px solid ${recentPeriod===value?FOREST:LINE}`,background:recentPeriod===value?FOREST:"white",color:recentPeriod===value?"white":INK,borderRadius:20,cursor:"pointer",fontWeight:recentPeriod===value?700:500}}>{label}</button>)}</div>
                  {recentPeriod==="custom"&&<div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}><label>From <input aria-label="From date" type="date" value={recentCustomStart} onChange={e=>setRecentCustomStart(e.target.value)} style={compactInputStyle}/></label><label>To <input aria-label="To date" type="date" min={recentCustomStart} value={recentCustomEnd} onChange={e=>setRecentCustomEnd(e.target.value)} style={compactInputStyle}/></label></div>}
                  {recentFiltered.length === 0 && <div style={{ fontSize: 12, color: INK_SOFT }}>No recent rentals yet.</div>}
                  {recentFiltered.slice((recentPage-1)*15,recentPage*15).map((c) => (
                    <button key={c.id} type="button" onClick={() => pickCustomer(c)} style={{ width: "100%", background: "#fbfdfb", border: `1px solid #dce9df`, borderRadius: 10, padding: "12px 14px", marginBottom: 8, textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                      <span><strong style={{ display: "block", fontSize: 13, color: INK }}>{c.name}</strong><span style={{ fontSize: 12, color: INK_SOFT }}>{c.mobile} · {c.latestRentalId}</span>{c.latestRentalAt && <span style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:INK_SOFT,marginTop:4}}><Clock3 size={12}/>{new Date(c.latestRentalAt).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"})}</span>}</span>
                      <ChevronRight size={17} color={INK_SOFT} />
                    </button>
                  ))}
                  <Pager page={recentPage} onChange={setRecentPage} total={recentFiltered.length}/>
                </div>
              )}
              {query.trim() && (
                <div style={{ marginBottom: 14 }}>
                  {searching && <div style={{ fontSize: 13, color: INK_SOFT, padding: "8px 0" }}>Searching…</div>}
                  {!searching && !loadError && matches.length === 0 && (
                    <div style={{ fontSize: 13, color: INK_SOFT, background: PAPER, borderRadius: 8, padding: "12px 14px", marginBottom: 10 }}>No customer matches "{query}".</div>
                  )}
                  {matches.slice((searchPage-1)*15,searchPage*15).map((c) => (
                    <div key={c.id} onClick={() => pickCustomer(c)} style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: INK_SOFT, marginTop: 2, display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontFamily: "monospace" }}>{c.mobile}</span>
                          {(c.village || c.address) && <span style={{ display: "flex", alignItems: "center", gap: 3 }}><MapPin size={11} /> {[c.village, c.address].filter(Boolean).join(", ")}</span>}
                        </div>
                      </div>
                      <ChevronRight size={18} color={INK_SOFT} />
                    </div>
                  ))}
                  <Pager page={searchPage} onChange={setSearchPage} total={matches.length}/>
                  <button onClick={openNewCustomer} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "transparent", border: `1.5px dashed ${LINE}`, color: FOREST_DARK, borderRadius: 8, padding: "11px 14px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", marginTop: 4 }}>
                    <UserPlus size={15} /> None of these — create a new customer
                  </button>
                </div>
              )}
            </div>
          )}

          {/* NEW CUSTOMER */}
          {phase === "newcustomer" && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: INK, marginBottom: 4 }}>New customer</div>
              <Field label="Name *">
                <input style={inputStyle} value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
              </Field>
              <Field label="Mobile *">
                <input style={inputStyle} value={newCustomer.mobile} inputMode="numeric" maxLength={10} onChange={(e) => setNewCustomer({ ...newCustomer, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="10-digit, starts 6-9" />
              </Field>
              {!newCustomer.showAdditionalMobile ? (
                <button onClick={() => setNewCustomer({ ...newCustomer, showAdditionalMobile: true })} style={{ background: "transparent", border: "none", color: FOREST_DARK, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 14 }}>
                  <Plus size={12} style={{ verticalAlign: "middle" }} /> Add another mobile number
                </button>
              ) : (
                <Field label="Additional mobile">
                  <input style={inputStyle} value={newCustomer.additionalMobile} inputMode="numeric" maxLength={10} onChange={(e) => setNewCustomer({ ...newCustomer, additionalMobile: e.target.value.replace(/\D/g, "").slice(0, 10) })} />
                </Field>
              )}
              <Field label="Profession">
                <select style={inputStyle} value={newCustomer.profession} onChange={(e) => setNewCustomer({ ...newCustomer, profession: e.target.value })}>
                  <option value="">— Select —</option>
                  {PROFESSIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              {newCustomer.profession === "Other" && (
                <Field label="Specify profession">
                  <input style={inputStyle} value={newCustomer.customProfession} onChange={(e) => setNewCustomer({ ...newCustomer, customProfession: e.target.value })} />
                </Field>
              )}
              <Field label="Village">
                <input style={inputStyle} value={newCustomer.village} onChange={(e) => setNewCustomer({ ...newCustomer, village: e.target.value })} />
              </Field>
              <Field label="Address">
                <textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={newCustomer.address} onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })} />
              </Field>

              <div className="rd-photo-grid" style={{ marginBottom: 6 }}>
                <PhotoCapture label="Customer photo" value={newCustomer.photo_url} onChange={(url) => setNewCustomer({ ...newCustomer, photo_url: url })} />
                <PhotoCapture label="ID proof — front" value={newCustomer.id_proof_front_url} onChange={(url) => setNewCustomer({ ...newCustomer, id_proof_front_url: url })} />
                <PhotoCapture label="ID proof — back" value={newCustomer.id_proof_back_url} onChange={(url) => setNewCustomer({ ...newCustomer, id_proof_back_url: url })} />
              </div>

              <Field label="Referred by (optional) — search by name or mobile">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11.5, color: INK_SOFT, marginBottom: 5 }}>Name</label>
                    <input style={inputStyle} placeholder="Referrer name" value={newCustomer.referredBy.name} onChange={(e) => setNewCustomer({ ...newCustomer, referredBy: { ...newCustomer.referredBy, id: "", name: e.target.value } })} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11.5, color: INK_SOFT, marginBottom: 5 }}>Mobile</label>
                    <input style={inputStyle} placeholder="Mobile number" value={newCustomer.referredBy.mobile} inputMode="numeric" maxLength={10} onChange={(e) => setNewCustomer({ ...newCustomer, referredBy: { ...newCustomer.referredBy, id: "", mobile: e.target.value.replace(/\D/g, "").slice(0, 10) } })} />
                  </div>
                </div>
                {referrerMatches.length > 0 && (
                  <div style={{ border: `1px solid ${LINE}`, borderRadius: 8, marginTop: 6, overflow: "hidden" }}>
                    {referrerMatches.map((c) => (
                      <div key={c.id} onClick={() => pickReferrer(c)} style={{ padding: "9px 10px", fontSize: 13, cursor: "pointer", borderBottom: `1px solid ${LINE}`, background: "#fff" }}>
                        <strong>{c.name}</strong> · <span style={{ fontFamily: "monospace" }}>{c.mobile}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Field>

              {newCustomerError && <ErrorText>{newCustomerError}</ErrorText>}

              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <GhostButton onClick={() => setPhase("search")}><ArrowLeft size={15} /> Back</GhostButton>
                <PrimaryButton onClick={handleCreateCustomer} disabled={savingCustomer} style={{ flex: 1, justifyContent: "center" }}>
                  {savingCustomer ? "Saving…" : "Create customer & continue"}
                </PrimaryButton>
              </div>
            </div>
          )}

          {/* FOUND — confirm and move to items */}
          {phase === "found" && activeCustomer && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: INK, marginBottom: 12 }}>Customer</div>
              <div style={{ background: PAPER, borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: INK }}>{activeCustomer.name}</div>
                <div style={{ fontSize: 12.5, color: INK_SOFT, marginTop: 2, fontFamily: "monospace" }}>{activeCustomer.mobile}</div>
                {(activeCustomer.village || activeCustomer.address) && <div style={{ fontSize: 12.5, color: INK_SOFT, marginTop: 4 }}><MapPin size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />{[activeCustomer.village, activeCustomer.address].filter(Boolean).join(", ")}</div>}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 14 }}>
                  <div style={{ background: "#fff", borderRadius: 9, padding: 10, border:"1px solid #e3eae5" }}><div style={{ fontSize: 10.5, color: INK_SOFT }}>Rented till now</div><strong>{customerSummary.loading ? "…" : customerSummary.rentalCount}</strong></div>
                  <div style={{ background: "#fff", borderRadius: 9, padding: 10, border:"1px solid #e3eae5" }}><div style={{ fontSize: 10.5, color: INK_SOFT }}>Current balance</div><strong>{customerSummary.loading ? "…" : `₹${Math.abs(Number(customerSummary.balance || 0)).toLocaleString("en-IN")} ${customerSummary.balance > 0 ? "due" : customerSummary.balance < 0 ? "credit" : ""}`}</strong></div>
                  <div style={{ background: "#fff", borderRadius: 9, padding: 10, border:"1px solid #e3eae5" }}><div style={{ fontSize: 10.5, color: INK_SOFT }}>Customer flag</div><select aria-label="Customer flag" value={activeCustomer.flag || "green"} onChange={async e => { const flag = e.target.value; try { await updateCustomer(activeCustomer.id, { flag }); setActiveCustomer(prev => ({ ...prev, flag })); } catch (err) { setLoadError(err.message); } }} style={{ maxWidth: "100%", border: `1px solid ${LINE}`, borderRadius: 6, padding: 4 }}><option value="green">🟢 Green</option><option value="amber">🟡 Amber</option><option value="red">🔴 Red</option><option value="gold">⭐ Gold</option></select></div>
                </div>
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11.5, color: INK_SOFT, fontWeight: 600, marginBottom: 6 }}>Last 3 rentals</div>
                  {customerSummary.loading ? <div style={{ fontSize: 12, color: INK_SOFT }}>Loading…</div> : customerSummary.rentals.length === 0 ? <div style={{ fontSize: 12, color: INK_SOFT }}>No rentals yet.</div> : customerSummary.rentals.map((o) => (
                    <div key={o.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "7px 0", borderTop: `1px solid ${LINE}`, fontSize: 12 }}>
                      <div><div style={{ fontWeight: 700, color: INK }}>{o.display_id} · {o.rental_items.map((i) => i.machines?.machine_number).filter(Boolean).join(", ") || "Rental"}</div><div style={{ color: INK_SOFT }}>{new Date(o.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}</div></div>
                      <strong style={{ color: o.status === "active" ? RED : FOREST_DARK, textTransform: "capitalize" }}>{o.status}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <GhostButton onClick={() => setPhase("search")}><ArrowLeft size={15} /> Back</GhostButton>
                <PrimaryButton onClick={continueToItems} style={{ flex: 1, justifyContent: "center" }}>
                  Continue <ChevronRight size={16} />
                </PrimaryButton>
              </div>
            </div>
          )}

          {/* ITEMS */}
          {phase === "items" && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: INK, marginBottom: 4 }}>Select items</div>
              <p style={{ fontSize: 13, color: INK_SOFT, marginTop: 0, marginBottom: 14 }}>Only available machines are shown.</p>

              <Field label="Product">
                <select style={inputStyle} value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} — ₹{p.daily_rent}/day</option>)}
                </select>
              </Field>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
                {availableMachines.filter((m) => !cart.some((c) => c.machineId === m.id) && !lockedMachineIds.has(String(m.id))).length === 0 && <div style={{ fontSize: 12.5, color: INK_SOFT }}>No free units for this product. Machines in other saved drafts are reserved locally.</div>}
                {availableMachines.filter((m) => !cart.some((c) => c.machineId === m.id)).map((m) => (
                  <button key={m.id} disabled={lockedMachineIds.has(String(m.id))} title={lockedMachineIds.has(String(m.id)) ? "Reserved in another local draft" : "Select machine"} onClick={() => addToCart(m)} style={{ border: "1px solid #b8d7c5", borderRadius: 8, padding: "8px 12px", fontSize: 13, background: lockedMachineIds.has(String(m.id)) ? "#eeeeee" : "#f6fbf7", cursor: lockedMachineIds.has(String(m.id)) ? "not-allowed" : "pointer", color: lockedMachineIds.has(String(m.id)) ? "#777" : FOREST_DARK, fontWeight:600 }}>
                    {m.machine_number}{lockedMachineIds.has(String(m.id)) ? " · In local draft" : ""}
                  </button>
                ))}
              </div>

              {cart.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: INK_SOFT, fontWeight: 600, marginBottom: 8 }}>Items in this rental</div>
                  {cart.map((c) => (
                    <div key={c.machineId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: FOREST_BG, borderRadius: 8, border:"1px solid #cfe7d6", padding: "9px 12px", marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{c.number}</div>
                        <div style={{ fontSize: 11.5, color: INK_SOFT }}>{c.product} · ₹{c.dailyRent}/day</div>
                      </div>
                      <button onClick={() => removeFromCart(c.machineId)} style={{ background: "transparent", border: "none", cursor: "pointer", color: RED }}><Trash2 size={15} /></button>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: INK_SOFT, padding: "6px 4px" }}>
                    <span>Combined daily rent</span>
                    <span style={{ fontWeight: 700, color: FOREST_DARK }}>₹{cartTotalDaily}/day</span>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <GhostButton onClick={() => setPhase("found")}><ArrowLeft size={15} /> Back</GhostButton>
                <PrimaryButton onClick={() => setPhase("advance")} disabled={cart.length === 0} style={{ flex: 1, justifyContent: "center" }}>
                  Continue with {cart.length} item{cart.length === 1 ? "" : "s"} <ChevronRight size={16} />
                </PrimaryButton>
              </div>
            </div>
          )}

          {/* ADVANCE */}
          {phase === "advance" && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: INK, marginBottom: 4 }}>Advance & terms</div>
              <p style={{ fontSize: 13, color: INK_SOFT, marginTop: 0, marginBottom: 16 }}>
                {cart.map((c) => c.number).join(", ")} for {activeCustomer?.name}
              </p>

              <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: INK_SOFT, fontWeight: 600, marginBottom: 6 }}>Expected return</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input type="date" style={compactInputStyle} value={rentalDetails.returnDate} onChange={(e) => setRentalDetails({ ...rentalDetails, returnDate: e.target.value })} />
                  <input type="time" style={{ ...compactInputStyle, width: 92, flex: "none" }} value={rentalDetails.returnTime} onChange={(e) => setRentalDetails({ ...rentalDetails, returnTime: e.target.value })} />
                </div>
                <p style={{ fontSize: 10.5, color: "#9A988E", margin: "8px 0 0" }}>IST · returning by 11:00 AM avoids an extra billed day</p>
              </div>

              <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: 12, marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: INK_SOFT, fontWeight: 600, marginBottom: 6 }}>Advance received (₹)</div>
                    <input type="number" style={compactInputStyle} value={rentalDetails.advance} onChange={(e) => setRentalDetails({ ...rentalDetails, advance: e.target.value })} placeholder="0" />
                  </div>
                  {showExtraExpense && (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: INK_SOFT, fontWeight: 600, marginBottom: 6 }}>Extra expense (₹)</div>
                      <input type="number" style={compactInputStyle} value={rentalDetails.extraExpense} onChange={(e) => setRentalDetails({ ...rentalDetails, extraExpense: e.target.value })} placeholder="0" autoFocus />
                    </div>
                  )}
                </div>
                {!showExtraExpense && (
                  <button onClick={() => setShowExtraExpense(true)} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: "none", color: FOREST_DARK, fontSize: 12, fontWeight: 600, padding: "8px 0 0", cursor: "pointer" }}>
                    <Plus size={12} /> Add extra expense
                  </button>
                )}
              </div>

              <Field label="Remarks">
                <textarea rows={3} style={{ ...inputStyle, resize: "vertical" }} value={rentalDetails.remarks} onChange={(e) => setRentalDetails({ ...rentalDetails, remarks: e.target.value })} placeholder="Optional notes" />
              </Field>

              {draftMessage && <div role="status" style={{color:FOREST_DARK,fontSize:12,marginBottom:10}}>{draftMessage}</div>}
              {submitError && <ErrorText>{submitError}</ErrorText>}

              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <GhostButton onClick={() => setPhase("items")}><ArrowLeft size={15} /> Back</GhostButton>
                <PrimaryButton onClick={handleSaveRental} disabled={submitting || !activeCustomer || !cart.length} style={{ flex: 1, justifyContent: "center" }}>
                  {submitting ? "Saving…" : isOnline ? "Submit rental" : "Save offline draft"}
                </PrimaryButton>
              </div>

              {!isOnline && <p style={{fontSize:12,color:RED}}>Offline draft only — not a completed rental. Reconnect and confirm before handing over the machine.</p>}
            </div>
          )}

          {/* CONFIRM */}
          {phase === "confirm" && lastOrder && (
            <div>
              <div style={{ textAlign: "center", marginBottom: 18 }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: FOREST_BG, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                  <CheckCircle2 size={26} color={FOREST_DARK} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: INK }}>Rental order {lastOrder.display_id} created</div>
                <p style={{ fontSize: 13, color: INK_SOFT, marginBottom: 0 }}>Machine status updated to on rent.</p>
              </div>
              <div style={{ background: PAPER, borderRadius: 10, padding: 16, fontSize: 13.5, color: INK, marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span style={{ color: INK_SOFT }}>Customer</span><span style={{ fontWeight: 600 }}>{lastOrder.customer.name}</span></div>
                {lastOrder.items.map((it) => (
                  <div key={it.machineId} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ color: INK_SOFT }}>{it.number} · {it.product}</span>
                    <span style={{ fontWeight: 600 }}>₹{it.dailyRent}/day</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span style={{ color: INK_SOFT }}>Expected return</span><span style={{ fontWeight: 600 }}>{toIndianDate(lastOrder.returnDate)}, {to12Hour(lastOrder.returnTime)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span style={{ color: INK_SOFT }}>Advance</span><span style={{ fontWeight: 600 }}>₹{lastOrder.advance}</span></div>
              </div>
              <PrimaryButton onClick={resetAll} style={{ width: "100%", justifyContent: "center" }}>Start next rental</PrimaryButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
