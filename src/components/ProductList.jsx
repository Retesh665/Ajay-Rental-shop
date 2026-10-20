import React, { useEffect, useState } from "react";
import { Plus, Trash2, Package } from "lucide-react";
import { listProducts, addProduct, deleteProduct } from "../lib/api.js";

const INK = "#1C2333";
const INK_SOFT = "#4A5268";
const PAPER = "#F6F5F1";
const CARD = "#FFFFFF";
const LINE = "#E4E2D8";
const FOREST = "#2F6F4E";
const FOREST_DARK = "#1F4E36";
const FOREST_BG = "#E7F1EB";
const RED = "#A5402C";

const inputStyle = {
  boxSizing: "border-box", padding: "10px 12px",
  border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 14.5,
  fontFamily: "inherit", color: INK, background: "#fff", outline: "none",
};

export default function ProductList() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [rent, setRent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  async function refresh() {
    setLoading(true);
    setLoadError("");
    try {
      setProducts(await listProducts());
    } catch (e) {
      setLoadError(e.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function handleAdd() {
    if (!name.trim() || !rent) return;
    setSaving(true);
    setSaveError("");
    try {
      const created = await addProduct({ name: name.trim(), daily_rent: Math.round(Number(rent)) });
      setProducts((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setRent("");
    } catch (e) {
      setSaveError(e.message || "Failed to add product");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      // Most likely FK violation — machines still reference this product.
      setLoadError(e.message?.includes("foreign key") ? "Can't delete — machines still exist under this product." : e.message);
    } finally {
      setConfirmDelete(null);
    }
  }

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: PAPER, minHeight: 600, padding: "28px 20px" }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>

        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 12, color: FOREST_DARK, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>RentDesk</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: INK, marginTop: 2 }}>Product list</div>
          <p style={{ fontSize: 13, color: INK_SOFT, marginTop: 4, marginBottom: 0 }}>
            The product types your shop rents out, and the daily rate for each. Individual machine units live in Machine List.
          </p>
        </div>

        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginBottom: 12 }}>Add a product</div>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="Product name, e.g. Hammer Drill"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <input
              style={{ ...inputStyle, width: 140 }}
              type="number"
              placeholder="Daily rent (₹)"
              value={rent}
              onChange={(e) => setRent(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <button
              onClick={handleAdd}
              disabled={!name.trim() || !rent || saving}
              style={{
                background: !name.trim() || !rent || saving ? "#B9C4BE" : FOREST, color: "#fff", border: "none",
                borderRadius: 8, padding: "0 16px", cursor: !name.trim() || !rent || saving ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600,
              }}
            >
              <Plus size={16} /> {saving ? "Adding…" : "Add"}
            </button>
          </div>
          {saveError && <div style={{ color: RED, fontSize: 12.5, marginTop: 8 }}>{saveError}</div>}
        </div>

        {loadError && <div style={{ color: RED, fontSize: 13, marginBottom: 12 }}>{loadError}</div>}

        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
          {loading && <div style={{ padding: 32, textAlign: "center", color: INK_SOFT, fontSize: 13.5 }}>Loading…</div>}
          {!loading && products.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: INK_SOFT, fontSize: 13.5 }}>No products yet. Add your first one above.</div>
          )}
          {!loading && products.map((p, i) => (
            <div
              key={p.id}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "13px 18px", borderTop: i === 0 ? "none" : `1px solid ${LINE}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: FOREST_BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Package size={16} color={FOREST_DARK} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: INK_SOFT, fontFamily: "monospace" }}>{p.id.slice(0, 8)}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>₹{p.daily_rent}<span style={{ fontSize: 11.5, color: INK_SOFT, fontWeight: 400 }}>/day</span></div>
                {confirmDelete === p.id ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => handleDelete(p.id)} style={{ fontSize: 12, background: RED, color: "#fff", border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontWeight: 600 }}>Delete</button>
                    <button onClick={() => setConfirmDelete(null)} style={{ fontSize: 12, background: "transparent", color: INK_SOFT, border: `1px solid ${LINE}`, borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(p.id)}
                    aria-label={`Delete ${p.name}`}
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "#B9B7AB", padding: 4 }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = RED)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#B9B7AB")}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 11.5, color: "#9A988E", marginTop: 14 }}>
          Deleting a product here doesn't remove machine units already listed under it — check Machine List first.
        </p>
      </div>
    </div>
  );
}
