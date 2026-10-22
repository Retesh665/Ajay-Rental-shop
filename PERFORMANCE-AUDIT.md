# RentDesk performance audit — 22 October 2026

## Source baseline (not live production telemetry)
- React 18.3.1, Vite 6.0.5, Supabase JS ^2.45.0, lucide-react ^0.468.0, AWS SDK S3 ^3.800.0. Versions are declared ranges; exact resolved versions are unavailable without an installed lockfile.
- Vercel SPA with `/api/r2` serverless endpoints; Supabase PostgreSQL with RLS and staff-session RPC; private Cloudflare R2 photos.
- All non-dashboard screens were already split using React.lazy. Dashboard was also lazy, delaying the essential initial screen behind a dynamic import.
- Dashboard previously re-fetched on every focus/online event, including consecutive events, without an in-flight guard.
- Staff-session validation previously polled every 10 seconds (up to six RPCs per minute per open client), in addition to focus/online checks.
- IndexedDB offline snapshots and independent Start/Return draft stores already exist; retained untouched.
- Photo upload already uses browser-side `prepareImageForUpload`; list images already use native lazy loading; product and machine list pagination already exists.
- `getDashboardStats` and `listCustomersWithBalance` still contain broad read patterns; a complete database-aggregate rewrite requires verified production schema, row counts, RLS policies and SQL plans.
- No live request waterfall, query plans, region latency, compression headers, CDN headers, or browser CPU timings available. No reliable before/after milliseconds or bytes are claimed.

## Implemented
1. Dashboard imported eagerly, keeping other screens lazy.
2. Dashboard refresh now prevents overlapping requests and coalesces focus/reconnect events within 15 seconds; changing the selected range still fetches immediately.
3. Session validation interval raised from 10 to 30 seconds; focus/reconnect checks retained. Expected background periodic RPC frequency drops from six to two per minute per open client, assuming the tab is active and logged in.
4. Clear session-scoped R2 object URLs on logout and forced session replacement, without deleting offline rental/return drafts.
5. Vercel HTML cache-control added to require revalidation; hashed asset caching retained.
6. Vite dynamic import error handler refreshes once per minute when online to recover from a deployment with missing old chunks.

## Validation and limitations
- `npm test`: 45 passed, 0 failed.
- `npm install` timed out in this environment; no production bundle sizes or build success can be asserted.
- Live Supabase queries, sign-in/out, photo uploads, browser/mobile/slow-network flows, and Vercel compression/CDN remain untested.
- No migrations were added. Existing migrations are preserved; do not reapply them indiscriminately.
- Existing offline snapshots, drafts, billing, payments, RLS and R2 backend were not rewritten.

## Deploy
1. Back up the current project; extract the archive.
2. Keep existing Vercel and Supabase environment variables, and server-only R2 credentials; never prefix R2 secrets with `VITE_`.
3. In Windows PowerShell run `npm.cmd install`, `npm.cmd test`, `npm.cmd run build`.
4. Deploy to Vercel staging first; test Dashboard Today/Week totals against actual SQL data, sign-out/relogin, all three customer photos, Start/Return rental, payments, inventory, reports and offline drafts.
5. In browser DevTools Network, compare transfer sizes and request counts using the same account/data and cache settings; verify live Brotli/Gzip/CDN response headers. Do not assume deployment delivery optimizations are active.
6. Review Supabase query plans and index usage with the included `supabase/performance-checks.sql` before adding new indexes.
