import React, { useEffect, useMemo, useState } from "react";
import { PlusCircle, CalendarClock, ChevronRight, ChevronDown, StickyNote, Search, ArrowLeft, Pencil, Check, X, IndianRupee } from "lucide-react";
import {
  listActiveRentals, listMachines, listProducts,
  addMachineToOrder, updateExpectedReturn, updateOrderRemarks,
  correctOrderAdvance, correctOrderExtraExpense,
} from "../lib/api.js";
import { nowIST, isoDateIST, istDateTimeToUTC } from "../lib/dates.js";
import { billableDays } from "../lib/billing.js";

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

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "8px 10px", border: `1px solid ${LINE}`, borderRadius: 7, fontSize: 13, fontFamily: "inherit", color: INK, background: "#fff", outline: "none" };

function daysOf(seg, endOverride) {
  const fromDate = seg.from_at.slice(0, 10), fromTime = seg.from_at.slice(11, 16);
  const toDate = (seg.to_at || endOverride).slice(0, 10), toTime = (seg.to_at || endOverride).slice(11, 16);
  return billableDays(fromDate, fromTime, toDate, toTime, { isSwapClose: true }); // ongoing/preview — no 1-day floor forced
}
function itemRunningTotal(item, nowUTC) {
  return item.rental_item_segments.reduce((s, seg) => s + daysOf(seg, nowUTC) * seg.daily_rate, 0);
}
function fmtRange(seg) {
  const from = seg.from_at.slice(5, 10).replace("-", "/");
  const to = seg.to_at ? seg.to_at.slice(5, 10).replace("-", "/") : "ongoing";
  return `${from}–${to}`;
}

function Badge({ children, tone }) {
  const t = { amber: [AMBER_BG, AMBER], red: [RED_BG, RED], forest: [FOREST_BG, FOREST_DARK], neutral: [PAPER, INK_SOFT] }[tone];
  return <span style={{ fontSize: 10.5, fontWeight: 600, background: t[0], color: t[1], padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap" }}>{children}</span>;
}
function SmallButton({ children, onClick, tone = "ghost", disabled }) {
  const styles = tone === "primary" ? { background: disabled ? "#B9C4BE" : FOREST, color: "#fff", border: "none" } : { background: "transparent", color: INK_SOFT, border: `1px solid ${LINE}` };
  return <button onClick={onClick} disabled={disabled} style={{ ...styles, fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: 6, cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>{children}</button>;
}

export default function ManageActiveRental({customerContext}) {
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [availableMachines, setAvailableMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");

  const [query, setQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [openPanel, setOpenPanel] = useState(null);
  const [editingOrderField, setEditingOrderField] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [historyOpenFor, setHistoryOpenFor] = useState(null);
  const [busy, setBusy] = useState(false);

  const nowUTC = new Date().toISOString();

  async function refresh() {
    setLoading(true);
    setLoadError("");
    try {
      const [i, p, m] = await Promise.all([listActiveRentals(), listProducts(), listMachines({ status: "available" })]);
      setItems(i);
      setProducts(p);
      setAvailableMachines(m);
    } catch (e) {
      setLoadError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);
  useEffect(() => { if(customerContext?.action==='active' && customerContext.customer?.id) setSelectedCustomerId(customerContext.customer.id); }, [customerContext]);

  const customerGroups = useMemo(() => {
    const byCustomer = {};
    items.forEach((item) => {
      const cust = item.rental_orders.customers;
      if (!byCustomer[cust.id]) byCustomer[cust.id] = { customer: cust, orders: {} };
      const g = byCustomer[cust.id];
      const oid = item.rental_order_id;
      if (!g.orders[oid]) g.orders[oid] = { id: oid, display_id: item.rental_orders.display_id, advance_amount: item.rental_orders.advance_amount, extra_expense: item.rental_orders.extra_expense, remarks: item.rental_orders.remarks, items: [] };
      g.orders[oid].items.push(item);
    });
    return Object.values(byCustomer).map((g) => ({ customer: g.customer, orders: Object.values(g.orders) }));
  }, [items]);

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customerGroups;
    return customerGroups.filter((g) => g.customer.name.toLowerCase().includes(q) || g.customer.mobile.includes(q) || g.orders.some((o) => o.display_id.toLowerCase().includes(q)));
  }, [query, customerGroups]);

  const group = customerGroups.find((g) => g.customer.id === selectedCustomerId);

  function closePanel() { setOpenPanel(null); setActionError(""); }
  function startEditOrder(orderId, field, currentValue) {
    setEditingOrderField({ orderId, field });
    setEditValue(String(currentValue));
  }

  async function saveEditOrder() {
    const { orderId, field } = editingOrderField;
    setBusy(true); setActionError("");
    try {
      if (field === "remarks") {
        await updateOrderRemarks(orderId, editValue);
      } else if (field === "advance") {
        await correctOrderAdvance({ rentalOrderId: orderId, customerId: group.customer.id, newAdvanceAmount: Number(editValue) || 0 });
      }
      await refresh();
      setEditingOrderField(null);
    } catch (e) {
      setActionError(e.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function saveExpense(orderId, value) {
    setBusy(true); setActionError("");
    try {
      await correctOrderExtraExpense({ rentalOrderId: orderId, customerId: group.customer.id, newExtraExpense: Number(value) || 0 });
      await refresh();
      closePanel();
    } catch (e) {
      setActionError(e.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  // ---------- LIST VIEW ----------
  if (!group) {
    return (
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: PAPER, minHeight: 600, padding: "28px 20px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: FOREST_DARK, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>RentDesk</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: INK, marginTop: 2 }}>Manage active rentals</div>
            <p style={{ fontSize: 13, color: INK_SOFT, marginTop: 4 }}>Grouped by customer — someone with more than one order shows as a single entry.</p>
          </div>
          {loadError && <div style={{ color: RED, fontSize: 13, marginBottom: 12 }}>{loadError}</div>}
          <div style={{ position: "relative", marginBottom: 16 }}>
            <Search size={15} color={INK_SOFT} style={{ position: "absolute", left: 12, top: 12 }} />
            <input style={{ ...inputStyle, paddingLeft: 34, padding: "10px 12px 10px 34px" }} placeholder="Search by name, mobile, or order ID" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
            {loading && <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: INK_SOFT }}>Loading…</div>}
            {!loading && visibleGroups.length === 0 && <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: INK_SOFT }}>No matching active rentals.</div>}
            {!loading && visibleGroups.map((g, i) => {
              const activeItems = g.orders.flatMap((o) => o.items);
              const lateItems = activeItems.filter((it) => new Date(it.expected_return_at) < new Date());
              return (
                <div key={g.customer.id} onClick={() => setSelectedCustomerId(g.customer.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderTop: i === 0 ? "none" : `1px solid ${LINE}`, cursor: "pointer" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{g.customer.name}</div>
                    <div style={{ fontSize: 12.5, color: INK_SOFT, marginTop: 2, fontFamily: "monospace" }}>{g.customer.mobile}</div>
                    <div style={{ fontSize: 12, color: INK_SOFT, marginTop: 2 }}>
                      {activeItems.length} machine{activeItems.length === 1 ? "" : "s"}{g.orders.length > 1 ? ` across ${g.orders.length} orders` : ` · ${g.orders[0].display_id}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Badge tone="forest">{activeItems.length} active</Badge>
                    {lateItems.length > 0 && <Badge tone="red">{lateItems.length} late</Badge>}
                    <ChevronRight size={18} color={INK_SOFT} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function EditDatePanel({ item }) {
    const [date, setDate] = useState(item.expected_return_at.slice(0, 10));
    const [time, setTime] = useState(item.expected_return_at.slice(11, 16));
    const [saving, setSaving] = useState(false);
    async function confirm() {
      setSaving(true); setActionError("");
      try {
        await updateExpectedReturn(item.id, istDateTimeToUTC(date, time).toISOString());
        await refresh();
        closePanel();
      } catch (e) {
        setActionError(e.message || "Failed to save");
      } finally {
        setSaving(false);
      }
    }
    return (
      <div style={{ background: PAPER, borderRadius: 8, padding: 12, marginTop: 8 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input type="date" style={{ ...inputStyle, padding: "7px 9px" }} value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="time" style={{ ...inputStyle, padding: "7px 9px", width: 100 }} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        {actionError && <div style={{ color: RED, fontSize: 11.5, marginBottom: 8 }}>{actionError}</div>}
        <div style={{ display: "flex", gap: 6 }}>
          <SmallButton onClick={closePanel} disabled={saving}>Cancel</SmallButton>
          <SmallButton tone="primary" onClick={confirm} disabled={saving}>{saving ? "Saving…" : "Save date"}</SmallButton>
        </div>
      </div>
    );
  }

  function AddItemPanel({ orders }) {
    const [targetOrder, setTargetOrder] = useState(orders[0].id);
    const [productId, setProductId] = useState(products[0]?.id || "");
    const options = availableMachines.filter((m) => m.product_id === productId);
    const [chosen, setChosen] = useState(options[0]?.id || "");
    const [returnDate, setReturnDate] = useState("");
    const [returnTime, setReturnTime] = useState("11:00");
    const [saving, setSaving] = useState(false);
    const rate = products.find((p) => p.id === productId)?.daily_rent || 0;

    async function confirm() {
      if (!chosen || !returnDate) return;
      setSaving(true); setActionError("");
      try {
        await addMachineToOrder({ rentalOrderId: targetOrder, productId, machineId: chosen, dailyRate: rate, expectedReturnAtUTC: istDateTimeToUTC(returnDate, returnTime).toISOString() });
        await refresh();
        closePanel();
      } catch (e) {
        setActionError(e.message || "Failed to add machine");
      } finally {
        setSaving(false);
      }
    }

    return (
      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 10, padding: 14, marginTop: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginBottom: 10 }}>Add a machine</div>
        {orders.length > 1 && (
          <div style={{ marginBottom: 8 }}>
            <select style={{ ...inputStyle, padding: "7px 9px" }} value={targetOrder} onChange={(e) => setTargetOrder(e.target.value)}>
              {orders.map((o) => <option key={o.id} value={o.id}>Add to {o.display_id}</option>)}
            </select>
          </div>
        )}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select style={{ ...inputStyle, padding: "7px 9px" }} value={productId} onChange={(e) => { setProductId(e.target.value); setChosen(""); }}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} — ₹{p.daily_rent}/day</option>)}
          </select>
          <select style={{ ...inputStyle, padding: "7px 9px" }} value={chosen} onChange={(e) => setChosen(e.target.value)}>
            <option value="">Pick unit…</option>
            {options.map((m) => <option key={m.id} value={m.id}>{m.machine_number}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <input type="date" style={{ ...inputStyle, padding: "7px 9px" }} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} placeholder="Expected return" />
          <input type="time" style={{ ...inputStyle, padding: "7px 9px", width: 100 }} value={returnTime} onChange={(e) => setReturnTime(e.target.value)} />
        </div>
        {actionError && <div style={{ color: RED, fontSize: 11.5, marginBottom: 8 }}>{actionError}</div>}
        <div style={{ display: "flex", gap: 6 }}>
          <SmallButton onClick={closePanel} disabled={saving}>Cancel</SmallButton>
          <SmallButton tone="primary" onClick={confirm} disabled={saving || !chosen || !returnDate}>{saving ? "Adding…" : "Add"}</SmallButton>
        </div>
      </div>
    );
  }

  function ItemRow({ item, orderId, isLast }) {
    const lateDays = Math.max(Math.round((new Date() - new Date(item.expected_return_at)) / (1000 * 60 * 60 * 24)), 0);
    const running = itemRunningTotal(item, nowUTC);
    const isOpen = openPanel?.itemId === item.id && openPanel?.orderId === orderId;
    const showHistory = historyOpenFor === item.id;
    const hasHistory = item.rental_item_segments.length > 1;
    const currentSeg = item.rental_item_segments.find((s) => !s.to_at) || item.rental_item_segments[item.rental_item_segments.length - 1];

    return (
      <div style={{ padding: "12px 0", borderBottom: isLast ? "none" : `1px solid ${LINE}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{item.machines.machine_number}</div>
            <div style={{ fontSize: 11.5, color: INK_SOFT, marginTop: 3 }}>
              since {currentSeg.from_at.slice(5, 10)} · ₹{running} so far · due {item.expected_return_at.slice(0, 10)}
            </div>
            {hasHistory && (
              <button onClick={() => setHistoryOpenFor(showHistory ? null : item.id)} style={{ background: "none", border: "none", padding: 0, marginTop: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: FOREST_DARK, fontWeight: 600 }}>
                History <ChevronDown size={11} style={{ transform: showHistory ? "rotate(180deg)" : "none" }} />
              </button>
            )}
            {showHistory && (
              <div style={{ marginTop: 6 }}>
                {item.rental_item_segments.map((seg, i) => (
                  <div key={i} style={{ fontSize: 11, color: INK_SOFT, marginTop: i > 0 ? 2 : 0 }}>
                    {fmtRange(seg)}, {daysOf(seg, nowUTC)}d @ ₹{seg.daily_rate}{seg.reason && ` — ${seg.reason}`}
                  </div>
                ))}
              </div>
            )}
          </div>
          {lateDays > 0 ? <Badge tone={lateDays >= 3 ? "red" : "amber"}>{lateDays}d late</Badge> : <Badge tone="forest">On track</Badge>}
        </div>

        {!isOpen ? (
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <SmallButton onClick={() => { setOpenPanel({ type: "edit", itemId: item.id, orderId }); setActionError(""); }}><CalendarClock size={12} /> Edit date</SmallButton>
          </div>
        ) : <EditDatePanel item={item} />}
      </div>
    );
  }

  function OrderCard({ order }) {
    const isEditingRemarks = editingOrderField?.orderId === order.id && editingOrderField?.field === "remarks";
    const isEditingAdvance = editingOrderField?.orderId === order.id && editingOrderField?.field === "advance";
    const isAddingExpense = openPanel?.type === "expense" && openPanel?.orderId === order.id;

    return (
      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderLeft: `3px solid ${FOREST}`, borderRadius: 10, padding: "16px 18px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: INK }}>{order.display_id}</span>
            <Badge tone="neutral">{order.items.length} item{order.items.length === 1 ? "" : "s"}</Badge>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12.5 }}>
            {isEditingAdvance ? (
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <input type="number" autoFocus style={{ ...inputStyle, width: 84, padding: "5px 7px" }} value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                <button onClick={saveEditOrder} disabled={busy} style={{ background: FOREST, border: "none", borderRadius: 5, padding: 5, cursor: "pointer", display: "flex" }}><Check size={12} color="#fff" /></button>
                <button onClick={() => setEditingOrderField(null)} style={{ background: "transparent", border: `1px solid ${LINE}`, borderRadius: 5, padding: 5, cursor: "pointer", display: "flex" }}><X size={12} color={INK_SOFT} /></button>
              </div>
            ) : (
              <div onClick={() => startEditOrder(order.id, "advance", order.advance_amount)} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: INK_SOFT }}>
                Advance <strong style={{ color: INK }}>₹{order.advance_amount}</strong> <Pencil size={11} />
              </div>
            )}

            {isAddingExpense ? (
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <input type="number" autoFocus style={{ ...inputStyle, width: 84, padding: "5px 7px" }} value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                <button onClick={() => saveExpense(order.id, editValue)} disabled={busy} style={{ background: FOREST, border: "none", borderRadius: 5, padding: 5, cursor: "pointer", display: "flex" }}><Check size={12} color="#fff" /></button>
                <button onClick={closePanel} style={{ background: "transparent", border: `1px solid ${LINE}`, borderRadius: 5, padding: 5, cursor: "pointer", display: "flex" }}><X size={12} color={INK_SOFT} /></button>
              </div>
            ) : order.extra_expense > 0 ? (
              <div onClick={() => { setOpenPanel({ type: "expense", orderId: order.id }); setEditValue(String(order.extra_expense)); }} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: INK_SOFT }}>
                Extra <strong style={{ color: INK }}>₹{order.extra_expense}</strong> <Pencil size={11} />
              </div>
            ) : (
              <button onClick={() => { setOpenPanel({ type: "expense", orderId: order.id }); setEditValue("0"); }} style={{ background: "transparent", border: "none", color: FOREST_DARK, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 3, padding: 0 }}>
                <IndianRupee size={11} /> Add expense
              </button>
            )}
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          {isEditingRemarks ? (
            <div>
              <textarea rows={2} dir="ltr" style={{ ...inputStyle, direction: "ltr", textAlign: "left", resize: "vertical", marginBottom: 6, padding: "7px 9px" }} value={editValue} onChange={(e) => setEditValue(e.target.value)} placeholder="Note for this order" autoFocus />
              <div style={{ display: "flex", gap: 6 }}>
                <SmallButton onClick={saveEditOrder} tone="primary" disabled={busy}>Save</SmallButton>
                <SmallButton onClick={() => setEditingOrderField(null)}>Cancel</SmallButton>
              </div>
            </div>
          ) : (
            <div onClick={() => startEditOrder(order.id, "remarks", order.remarks || "")} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: INK_SOFT, cursor: "pointer" }}>
              <StickyNote size={12} style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ flex: 1 }}>{order.remarks || <span style={{ fontStyle: "italic", color: "#B9B7AB" }}>No note — click to add one</span>}</span>
              <Pencil size={11} style={{ flexShrink: 0, marginTop: 2, opacity: 0.6 }} />
            </div>
          )}
        </div>

        {actionError && (editingOrderField?.orderId === order.id || openPanel?.orderId === order.id) && (
          <div style={{ color: RED, fontSize: 11.5, marginTop: 8 }}>{actionError}</div>
        )}

        {order.items.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 4, borderTop: `1px solid ${LINE}` }}>
            {order.items.map((item, i) => <ItemRow key={item.id} item={item} orderId={order.id} isLast={i === order.items.length - 1} />)}
          </div>
        )}
      </div>
    );
  }

  const orders = group.orders;

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: PAPER, minHeight: 600, padding: "28px 20px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>

        <button onClick={() => { setSelectedCustomerId(null); setOpenPanel(null); setEditingOrderField(null); setHistoryOpenFor(null); }} style={{ background: "transparent", color: INK_SOFT, border: `1px solid ${LINE}`, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
          <ArrowLeft size={14} /> All active rentals
        </button>

        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: INK }}>{group.customer.name}</div>
          <div style={{ fontSize: 12, color: INK_SOFT, fontFamily: "monospace" }}>{group.customer.mobile}</div>
          {orders.length > 1 && <span style={{ fontSize: 11.5, color: INK_SOFT }}>· {orders.length} orders</span>}
        </div>

        {orders.map((order) => <React.Fragment key={order.id}>{OrderCard({ order })}</React.Fragment>)}

        {openPanel?.type === "add" ? (
          <AddItemPanel orders={orders} />
        ) : (
          <SmallButton onClick={() => { setOpenPanel({ type: "add", itemId: null }); setActionError(""); }}><PlusCircle size={13} /> Add another machine</SmallButton>
        )}
      </div>
    </div>
  );
}
