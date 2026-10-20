import React, { useState } from "react";
import { Loader2, LogIn } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

const INK = "#1C2333";
const INK_SOFT = "#4A5268";
const PAPER = "#F6F5F1";
const CARD = "#FFFFFF";
const LINE = "#E4E2D8";
const FOREST = "#2F6F4E";
const FOREST_DARK = "#1F4E36";
const RED = "#A5402C";
const RED_BG = "#FBEAE5";

// No self-signup by design (see HANDOFF §3.5) — the owner provisions
// credentials for each of the 2 staff users directly via Supabase.
export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Enter both email and password.");
      return;
    }
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err.message || "Sign in failed. Check your email and password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        background: PAPER,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: CARD,
          border: `1px solid ${LINE}`,
          borderRadius: 12,
          padding: "32px 28px",
          width: "100%",
          maxWidth: 360,
        }}
      >
        <div style={{ fontSize: 12, color: FOREST_DARK, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>
          RentDesk
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: INK, marginTop: 2, marginBottom: 22 }}>
          Sign in
        </div>

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: INK_SOFT, marginBottom: 6 }}>
          Email
        </label>
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "9px 11px",
            border: `1px solid ${LINE}`,
            borderRadius: 8,
            fontSize: 14,
            fontFamily: "inherit",
            marginBottom: 14,
          }}
          placeholder="you@shop.com"
        />

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: INK_SOFT, marginBottom: 6 }}>
          Password
        </label>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "9px 11px",
            border: `1px solid ${LINE}`,
            borderRadius: 8,
            fontSize: 14,
            fontFamily: "inherit",
            marginBottom: 18,
          }}
          placeholder="••••••••"
        />

        {error && (
          <div
            style={{
              background: RED_BG,
              color: RED,
              fontSize: 12.5,
              padding: "8px 10px",
              borderRadius: 8,
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background: FOREST,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 0",
            fontSize: 14,
            fontWeight: 600,
            cursor: submitting ? "default" : "pointer",
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? <Loader2 size={16} className="spin" /> : <LogIn size={16} />}
          {submitting ? "Signing in…" : "Sign in"}
        </button>

        <div style={{ fontSize: 11.5, color: INK_SOFT, marginTop: 16, textAlign: "center" }}>
          No account signup here — ask the shop owner for a login.
        </div>
      </form>
    </div>
  );
}
