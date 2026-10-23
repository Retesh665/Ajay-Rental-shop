# RentDesk performance audit — 23 October 2026

## Scope and preservation
Source: latest `RentDesk-customer-profile-remarks-fix.zip`. React 18.3.1, Vite 6.0.5, Supabase JS ^2.45.0, lucide-react ^0.468.0, AWS S3 client ^3.800.0; Vercel static frontend + `/api/r2` serverless endpoints, private Cloudflare R2, Supabase Auth and Postgres. The app already uses route-level `React.lazy` except Dashboard, hashed-asset caching, private-photo lazy loading, customer image preparation, IndexedDB snapshots and offline Start/Return drafts. All of these remain.

## Baseline: source inspection (NOT network measurements)
- Dashboard: 1 aggregate RPC plus 6 additional concurrent data calls when migration 013 is installed, including complete product/machine/customer balance/active-rental datasets and period rental-item data. When migration 013 is missing, 4 fallback period queries also run. PostgREST result caps may affect large installations. Do not treat these as measured network waterfalls.
- Dashboard availability calculation: previous implementation scanned the entire machine list twice per product (O(P*M)).
- Start Rental: 250 ms customer and referrer search debounce existed, but outstanding requests could update UI after a new query was typed.
- Customer Database: 250 ms debounce existed, but old responses could overwrite new results.
- Customer Profile: customer row and balance row already fetched concurrently; customer remark read directly from `customers`.
- Route splitting, photo compression, service worker and offline drafts were already present; retained unchanged.
- No production assets, authenticated session, production traffic waterfall, database EXPLAIN plans or infrastructure region details supplied. Bundle bytes, real timings, API latency, and compression/CDN status therefore **not measured**.

## Implemented changes
1. Customer and referrer search: prevent stale request results from changing UI. Preserve 250 ms debounce and offline search fallback.
2. Customer Database search: request generation guard prevents out-of-order result updates; preserves existing search behavior.
3. Dashboard product availability: single machine-count pass and reused counts for Top 5 and low-availability; same output schema and sorting.
4. No new dependencies, SQL migrations, server infrastructure, caching layer, financial logic or offline write behavior.

## Verification
- `npm test`: **45/45 passed** (Node 22.16.0).
- `npm run build`: **not completed** (`vite: not found`, dependencies absent in supplied archive). Install dependencies and build before production deployment.
- Live Supabase/Auth/R2/slow-network/mobile workflows: **not tested**.
- No measured before/after bundle, waterfall or user-flow timings; do not claim faster load times based on these source-level improvements.

## Deployment / required checks
1. Keep existing Supabase and R2 environment variables; do not expose R2 secrets with `VITE_` prefixes.
2. Run `npm.cmd install`, `npm.cmd test`, `npm.cmd run build` on Windows.
3. Deploy to Vercel staging; verify Sign Out, dashboard Today/Week totals, customer registration/photos/remarks, customer search/profile, Start/Return Rental, payments, inventory/report screens, offline drafts and reconnection.
4. Measure Chrome DevTools Performance and Network for initial load, customer search/profile, rentals, inventory and reports, comparing identical data/network settings before/after.
5. Use Supabase Query Performance and EXPLAIN ANALYZE before adding indexes. Existing `011_v19_6_query_indexes.sql` already supplies relevant indexes. Do not run destructive migrations.

## Remaining bottlenecks / caution
- Dashboard still loads broad lists for outstanding balances, machines, and product ranking; exact server-side aggregates need verified live schema, RLS and financial rules. This was intentionally not changed.
- Customer Database currently loads all matching customer balances; server-side pagination should be planned alongside balance filtering to avoid changing the result set.
- Inventory reports still may require broad machine history; optimize only after measured traces.
- Browser service worker caches static assets and navigation shell, not authenticated APIs or R2 photos; do not clear offline IndexedDB during app upgrades.
- Vercel may provide compression/CDN automatically, but deployment behavior has not been verified here.
