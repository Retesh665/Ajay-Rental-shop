# RentDesk performance audit and deployment checklist

## Inspected source (not production telemetry)
- React 18.3.1, Vite 6.0.5, Supabase JS ^2.45.0, Lucide ^0.468.0, AWS S3 SDK ^3.800.0. These are package.json version ranges; resolved versions require `npm install`.
- Vercel hosts static `dist/` and `/api/r2/*` serverless routes. Supabase hosts authentication, PostgreSQL and RLS. Cloudflare R2 holds private photos.
- Existing screen-level `React.lazy` imports, esbuild minification, CSS splitting, hashed asset caching, network-first HTML navigation and service worker were present BEFORE this pass.
- Dashboard's getDashboardStats launches nine independent requests, including complete machine/product/active-rental lists and period-filtered transactions. This remains the largest identifiable data-transfer bottleneck and requires live query plans and server-side aggregate RPC design before replacing it.
- Customer list currently fetches the full `customers_with_balance` view for client-side filtering/paging; it will grow with the shop. Server-side pagination is a separate change because current filters operate over the full result.
- Start Rental currently fetches a full customer directory in the background for offline search. Removing it would break existing offline behavior; it is retained intentionally.
- Rental start/return financial writes currently span multiple PostgREST calls. They are NOT guaranteed atomic across requests. Move to carefully reviewed database transactions/RPC before production multi-staff use.

## Baseline (source-level only)
- Dashboard: nine independent data requests per range change, with full-machine/full-product/active-rental/customer-balance reads; customer-balance response included all columns.
- Customer Profile open: four concurrent reads, one of which fetched the ENTIRE customers-with-balance view just to find a single ID.
- Customer search: 250 ms debounce, but previous search requests could finish out of order and overwrite newer results.
- Initial screen: already lazy-split by screen; do not add more eager preload.
- Existing test suite: 43 tests passed before edits; 43 tests passed afterward.
- Production bundle bytes, waterfall timings, network latency, SQL EXPLAIN plans, Lighthouse scores: NOT MEASURED. Dependency installation timed out, so production build is NOT VERIFIED.

## Changes in this pass
1. Customer Profile now queries one customer by ID, preserving concurrent loading of orders/transactions/events. Eliminates a whole-table read on profile open.
2. Dashboard customer balances fetch only `id,balance` for positive balances; reduces response size, while preserving the same outstanding totals. Dashboard product/machine status summaries now run in O(products + machines) instead of repeatedly filtering the full machine list per product.
3. Dashboard period requests and Start Rental / Customer Database searches ignore stale responses after selection/search changes. No stale response can overwrite a newer selection. The network request may still complete; this is not a claimed network cancellation.
4. Photo blob URLs are revoked and in-memory private-photo cache cleared when a session is replaced or signed out.
5. Removed a forced standalone Lucide chunk; retained screen splitting, production minification and CSS splitting. The impact on actual bundle sizes requires a production build to confirm.
6. Explicit no-cache/revalidation for index.html; Vercel already has immutable fingerprinted-asset caching. Versioned service-worker caches bumped for update hygiene. Authenticated API responses and private images are excluded from SW caches.
7. Existing database indexes and RLS policies remain unchanged. No speculative indexes, no destructive migrations.

## Run the validation locally (same device and network for before/after)
```
npm.cmd install
npm.cmd run test
npm.cmd run build
npm.cmd run preview
```
Open Chrome DevTools > Network (Disable cache ON for cold load) > record transferred JS/CSS, request count, LCP, and tab transition timing for Dashboard, Start Rental, Return Rental, Customers, Inventory and Reports. Repeat 3 times and compare medians. For warm navigations turn Disable cache OFF. Use Performance panel to find expensive rerenders. Test on Slow 3G and offline, especially existing drafts.

## Database review (read-only)
Use `supabase/performance-diagnostics.sql` in SQL Editor. For query plans, copy the exact PostgREST-equivalent SQL and run `EXPLAIN (ANALYZE, BUFFERS)` on staging only. Indexes should be selected based on these plans and row counts, not guesses. Supabase connection/region latency requires real deployment telemetry.

## Deployment
Vercel root directory must contain package.json (usually rdwork/); framework Vite; build `npm run build`; output `dist`. Add frontend Supabase VITE_* values, server-only SUPABASE_URL / SUPABASE_ANON_KEY and R2_* credentials. Never expose R2 secrets via VITE_. Redeploy after changing environment variables. Verify photo auth, image upload/view, sign-out, single-session revocation, financial workflows and offline drafts before production cutover. Vercel compression/CDN must be confirmed from actual response headers in deployed environment; this source package does not prove they are active.

## Not implemented without production evidence / a safe data migration
- New indexes, SQL aggregate RPCs, virtualized lists, wholesale server pagination, query-cache library, new background worker, financial write refactor. These would alter data access or behavior without sufficient test coverage. No measurable performance improvement is claimed.
