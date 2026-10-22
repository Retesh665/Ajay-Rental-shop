# RentDesk performance audit — 2026-10-22

## Inspected source and environment
- Source: supplied `RentDesk-customer-inventory-fixes.zip`.
- React ^18.3.1, React DOM ^18.3.1, Vite ^6.0.5, Supabase JS ^2.45.0, lucide-react ^0.468.0, AWS S3 client ^3.800.0; versions are package ranges, not resolved installed versions (no lockfile).
- Hosting: Vercel Vite SPA with serverless `/api/r2/*`, private Cloudflare R2; Supabase PostgreSQL with RLS and RPC-backed staff session validation.
- Existing optimizations: React.lazy screen imports, Vite esbuild minification, CSS splitting, immutable hashed assets, service worker assets/offline shell, IndexedDB offline snapshots and multiple rental/return drafts, index migration `011_v19_6_query_indexes.sql`.

## Reproducible baseline (source-only)
- Nine lazy screen components. No production `dist/` and no installed `node_modules` in supplied archive, so compressed bundle sizes, request waterfall and Core Web Vitals cannot be measured here.
- Search uses a 250ms debounce but previously did not ignore stale in-flight results. Same private photo requested concurrently could cause multiple authenticated POST downloads.
- The app intentionally synchronizes the full customer directory **when Start Rental opens** to support offline customer search. This is a real scalability tradeoff; do not remove without a replacement offline sync design.
- Existing automated test suite: 43 tests pass, before/after same environment. No browser integration tests or live Supabase credentials available.

## Implemented
1. Guarded customer and referral search effects against late responses from obsolete searches; preserved 250ms debounce and offline fallback.
2. Deduplicated concurrent private R2 photo fetches; reused in-session object URLs and cleared them on explicit logout or session replacement.
3. Added explicit HTML revalidation caching header for Vercel while preserving immutable hashed asset caching and no-store private API routes.
4. Preserved existing lazy-loaded screens, offline snapshots, offline rental/return drafts, financial code and existing migrations. No destructive SQL.
5. PrivatePhoto now provides numeric dimensions when its caller supplies numeric width/height.

## Validation
- `npm test`: 43/43 pass.
- `npm run build`: unavailable (`vite: not found`). Dependency install timed out. Production bundle sizes and live timings **not measured**; no performance percentage claimed.
- Live login, sign-out, R2 uploads, rental financial flows, mobile performance and database EXPLAIN plans **not tested**. Existing unit tests are not a substitute.

## Remaining priority work / deployment checks
- On a connected development machine: `npm.cmd install`, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run preview`. Record `dist/assets` sizes, browser Performance/Network traces with throttling and production auth before and after deployment.
- Inspect Supabase Query Performance and EXPLAIN ANALYZE on customer search, active rentals, customer balances, machine availability, payments and reports before considering new indexes. Existing `011_v19_6_query_indexes.sql` must be reviewed for duplicates.
- The full offline customer sync and full customer transaction/profile loads are potential large payloads. Changing them requires a versioned incremental offline directory and progressive UI behavior to avoid breaking existing offline use; deliberately not changed here.
- Verify Vercel CDN compression and region, Supabase project region, and R2 bucket region in deployed environment. No provider settings were changed or claimed active.
- Check authenticated photos in mobile browser; monitor object URL memory if hundreds of photos are viewed per session.
- Existing service worker caches immutable assets and navigation fallback only; no authenticated API caching or offline financial writes were added.
