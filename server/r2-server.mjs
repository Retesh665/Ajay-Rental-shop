import { createServer } from "node:http";
import { handleUpload, handlePhoto, handleAuthCheck } from "./r2-vercel-shared.mjs";

const port = Number(process.env.R2_SERVER_PORT || 8787);
const server = createServer(async (req, nativeRes) => {
  const url = new URL(req.url, "http://localhost");
  const res = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(payload) { nativeRes.writeHead(this.code || 200, { ...this.headers, "Content-Type": "application/json" }); nativeRes.end(JSON.stringify(payload)); },
    send(payload) { nativeRes.writeHead(this.code || 200, this.headers); nativeRes.end(payload); }
  };
  if (req.method === "GET" && url.pathname === "/api/r2/health") return res.status(200).json({ status: "ok", platform: "local", r2Configured: ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "SUPABASE_URL", "SUPABASE_ANON_KEY"].every(k => !!process.env[k]) });
  if (url.pathname === "/api/r2/auth-check") return handleAuthCheck(req, res);
  if (url.pathname === "/api/r2/upload") return handleUpload(req, res);
  if (url.pathname === "/api/r2/photo") return handlePhoto(req, res);
  return res.status(404).json({ error: "Not found" });
});
server.on("error", e => { console.error(`Cannot start R2 API on port ${port}:`, e.code === "EADDRINUSE" ? "Port already in use. Stop the old server or change R2_SERVER_PORT and vite.config.js proxy." : e.message); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => console.log(`RentDesk R2 API ready at http://127.0.0.1:${port}/api/r2/health`));
