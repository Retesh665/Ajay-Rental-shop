# RentDesk

Rental management application for construction equipment. Production-ready project layout (React/Vite, Supabase and private Cloudflare R2).

## Local development

1. Install Node.js 20.6+ and run `npm.cmd install` in this directory.
2. Copy `.env.example` to `.env.local` and enter the **frontend** Supabase URL and publishable/anon key.
3. Copy `.env.r2.example` to `.env.r2.local` and enter the **server-only** R2 keys and matching Supabase project details.
4. Run `npm.cmd run dev:all`. Open `http://localhost:5173`.
5. Test the API at `http://127.0.0.1:8787/api/r2/health` (health confirms configuration presence, not R2 access).
6. Run `npm.cmd test` and `npm.cmd run build` before deployment.

## Vercel

Deploy this folder as the Vercel project root (Vite, output `dist`). Configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` for the browser and `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` as server environment variables. Never prefix R2 secrets with `VITE_`. Keep R2 private; browser-to-R2 CORS and Supabase Edge Functions are not required for the current server-mediated API.

## Photo uploads

Customer images are uploaded through `/api/r2/upload`, and read through `/api/r2/photo`. Camera files are automatically resized/compressed as needed for Vercel's HTTP request limit; there is no 4MB restriction on the **source photo**. Extremely large or unsupported images can still fail browser decoding; serverless platforms also impose payload and execution limits. Images are stored in R2, while the customer database stores an `r2:` object reference. Authenticated API access is required. Existing photo keys are scoped to the uploading user; multi-staff photo sharing needs a separate access-control design.

## Database

SQL migrations are retained in `supabase/migrations/` for reproducibility. Do not rerun all migrations against production. Use `supabase/diagnostics.sql` for read-only checks and review results before any schema changes. Live production data and permissions have **not** been audited in this package.

## Important limitations

Offline drafts are not final rentals or returns. The app must reconnect and confirm against Supabase. Concurrent booking and return settlement still need database-level atomicity/idempotency review before relying on multiple simultaneous staff submissions. The single-active-session migration and policies require live staging verification.
