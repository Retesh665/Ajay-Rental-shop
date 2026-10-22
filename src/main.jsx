// When a deployment removes an old hashed chunk, refresh once to load the new app.
// Never loop endlessly when the device is offline.
window.addEventListener('vite:preloadError', event => {
  event.preventDefault();
  if (!navigator.onLine) return;
  const key = 'rentdesk:chunk-reload';
  const last = Number(sessionStorage.getItem(key) || 0);
  if (Date.now() - last > 60000) {
    sessionStorage.setItem(key, String(Date.now()));
    window.location.reload();
  }
});
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider><App /></AuthProvider>
  </React.StrictMode>
);

// Cache the application shell after the first successful online visit.
// Never cache Supabase data or queue financial writes.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Offline shell unavailable', error));
  });
}
