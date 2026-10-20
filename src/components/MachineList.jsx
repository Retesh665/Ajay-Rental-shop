import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Wrench } from "lucide-react";
import { listProducts, listMachines, addMachine, deleteMachine, setMachineStatus } from "../lib/api.js";

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

const STATUS_STYLE = {
  available: { bg: FOREST_BG, fg: FOREST_DARK, label: "Available" },
  rented: { bg: AMBER_BG, fg: AMBER, label: "On rent" },
  repair: { bg: RED_BG, fg: RED, label: "In repair" },
};
const STATUS_ORDER = ["available", "rented", "repair"];

const inputStyle = {
  boxSizing: "border-box", padding: "10px 12px",
  border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 14.5,
  fontFamily: "inherit", color: INK, background: "#fff", outline: "none",
};

export default function MachineList() {
  const [products, setProducts] = useState([]);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [number, setNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [filter, setFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [confirmDelete, setConfirmDelete] = useState(null);

  async function refresh() {
    setLoading(true);
    setLoadError("");
    try {
      const [prods, machs] = await Promise.all([listProducts(), listMachines()]);
      setProducts(prods);
      setMachines(machs);
      if (!selectedProductId && prods.length) setSelectedProductId(prods[0].id);
    } catch (e) {
      setLoadError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdd() {
    if (!number.trim() || !selectedProductId) return;
    setSaving(true);
    setSaveError("");
    try {
      const created = await addMachine({ product_id: selectedProductId, machine_number: number.trim() });
      const product = products.find((p) => p.id === selectedProductId);
      setMachines((prev) => [...prev, { ...created, products: { name: product?.name } }].sort((a, b) => a.machine_number.localeCompare(b.machine_number)));
      setNumber("");
    } catch (e) {
      setSaveError(e.message?.includes("duplicate") ? "That machine number already exists." : e.message || "Failed to add machine");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteMachine(id);
      setMachines((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      setLoadError(e.message?.includes("foreign key") ? "Can't delete — this machine has rental history." : e.message);
    } finally {
      setConfirmDelete(null);
    }
  }

  async function cycleStatus(m) {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(m.status) + 1) % STATUS_ORDER.length];
    try {
      await setMachineStatus(m.id, next);
      setMachines((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: next } : x)));
    } catch (e) {
      setLoadError(e.message || "Failed to update status");
    }
  }

  const machinesForProduct = productFilter === "all" ? machines : machines.filter((m) => m.product_id === productFilter);
  const visible = filter === "all" ? machinesForProduct : machinesForProduct.filter((m) => m.status === filter);
  const counts = machinesForProduct.reduce((acc, m) => { acc[m.status] = (acc[m.status] || 0) + 1; return acc; }, {});

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: PAPER, minHeight: 600, padding: "28px 20px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>

        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 12, color: FOREST_DARK, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>RentDesk</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: INK, marginTop: 2 }}>Machine list</div>
          <p style={{ fontSize: 13, color: INK_SOFT, marginTop: 4, marginBottom: 0 }}>
            Every physical unit you own, tagged to a product type. New Rental only offers units marked available.
          </p>
        </div>

        {loadError && <div style={{ color: RED, fontSize: 13, marginBottom: 12 }}>{loadError}</div>}

        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginBottom: 12 }}>Add a machine</div>
          <div style={{ display: "flex", gap: 10 }}>
            <select style={{ ...inputStyle, width: 180 }} value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="Machine number, e.g. Hammer-004"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <button
              onClick={handleAdd}
              disabled={!number.trim() || saving}
              style={{
                background: !number.trim() || saving ? "#B9C4BE" : FOREST, color: "#fff", border: "none",
                borderRadius: 8, padding: "0 16px", cursor: !number.trim() || saving ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600,
              }}
            >
              <Plus size={16} /> {saving ? "Adding…" : "Add"}
            </button>
          </div>
          {saveError && <div style={{ color: RED, fontSize: 12.5, marginTop: 8 }}>{saveError}</div>}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 11.5, color: INK_SOFT, fontWeight: 600, marginBottom: 6 }}>Filter by product</label>
          <select style={{ ...inputStyle, width: 220 }} value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
            <option value="all">All products</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[
            { key: "all", label: `All (${machinesForProduct.length})` },
            { key: "available", label: `Available (${counts.available || 0})` },
            { key: "rented", label: `On rent (${counts.rented || 0})` },
            { key: "repair", label: `In repair (${counts.repair || 0})` },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                fontSize: 12.5, fontWeight: 600, padding: "7px 12px", borderRadius: 7, cursor: "pointer",
                border: `1px solid ${filter === f.key ? FOREST : LINE}`,
                background: filter === f.key ? FOREST_BG : "#fff",
                color: filter === f.key ? FOREST_DARK : INK_SOFT,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
          {loading && <div style={{ padding: 32, textAlign: "center", color: INK_SOFT, fontSize: 13.5 }}>Loading…</div>}
          {!loading && visible.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: INK_SOFT, fontSize: 13.5 }}>No machines in this view.</div>
          )}
          {!loading && visible.map((m, i) => {
            const s = STATUS_STYLE[m.status];
            return (
              <div
                key={m.id}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "13px 18px", borderTop: i === 0 ? "none" : `1px solid ${LINE}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Wrench size={16} color={s.fg} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{m.machine_number}</div>
                    <div style={{ fontSize: 12, color: INK_SOFT }}>{m.products?.name}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <button
                    onClick={() => cycleStatus(m)}
                    title="Click to change status"
                    style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 6, background: s.bg, color: s.fg, border: "none", cursor: "pointer" }}
                  >
                    {s.label}
                  </button>
                  {confirmDelete === m.id ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => handleDelete(m.id)} style={{ fontSize: 12, background: RED, color: "#fff", border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontWeight: 600 }}>Delete</button>
                      <button onClick={() => setConfirmDelete(null)} style={{ fontSize: 12, background: "transparent", color: INK_SOFT, border: `1px solid ${LINE}`, borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(m.id)}
                      aria-label={`Delete ${m.machine_number}`}
                      style={{ background: "transparent", border: "none", cursor: "pointer", color: "#B9B7AB", padding: 4 }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = RED)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#B9B7AB")}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p style={{ fontSize: 11.5, color: "#9A988E", marginTop: 14 }}>
          Click a status badge to cycle it between available, on rent, and in repair — useful for manual corrections outside the normal rental flow.
        </p>
      </div>
    </div>
  );
}
