# RentDesk deployment and performance verification

## Local test
1. Configure `.env.local` and `.env.r2.local` using the existing examples. Never commit secrets.
2. `npm.cmd install`
3. `npm.cmd run test` and `npm.cmd run build`
4. `npm.cmd run dev:all` to test the private R2 server with Vite.
5. Test login, photo upload/view, Start Rental, Return Rental, offline drafts and multi-device session behavior with test records.

## Vercel
- Import repository with root directory `rdwork` if this folder is nested in your repository.
- Framework: Vite. Build: `npm run build`. Output: `dist`.
- Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the browser.
- Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` for server functions. Never use VITE_ for R2 secrets.
- Redeploy after changing environment variables. Private R2 bucket does not require browser CORS for server-side uploads.
- Vercel serves hashed `/assets/*` with immutable cache headers; SPA HTML and service worker should not be long-cached.
- Vercel's CDN handles static asset delivery and HTTP compression when supported; do not manually gzip API JSON or customer photos.

## Performance checks
- Chrome DevTools Network: compare initial JS transferred, requests, and navigation to each tab before/after.
- Lighthouse mobile and Slow 3G: measure LCP, INP and CLS; do not assume improvements without measurements.
- Supabase: run `supabase/performance-checks.sql` read-only. Migration 011 contains existing query indexes; do not apply duplicate indexes.
- Do not cache authenticated API responses or private photo URLs in CDN/service worker. Offline data remains in existing IndexedDB cache.
- Vercel Functions have request body limits: browser-side photo optimization is still required for oversized originals.
- No background job queue added; financial writes must remain synchronous and acknowledged.
- Production safety still requires verifying atomic booking/return transactions, auth/RLS and R2 upload end-to-end.
