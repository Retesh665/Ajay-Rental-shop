# RentDesk deployment and performance checklist

## Already in source
- Screen-level React.lazy code splitting and pointer/focus prefetch when online.
- Vite JS minification, tree shaking, CSS splitting, fingerprinted assets.
- Vercel CDN immutable caching for /assets; no-store for /api; service worker caches only static assets and app shell.
- Cloudflare R2 server-side upload; private photos and auth are never stored in service worker cache.
- Existing targeted database indexes in migration 011; read-only performance diagnostics in supabase/PERFORMANCE-REVIEW.sql.

## Deploy
1. Keep the root directory at the folder containing package.json. Build: npm run build; output: dist.
2. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for browser; SUPABASE_URL and SUPABASE_ANON_KEY for server (matching project).
3. Configure R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME as server-only Vercel environment variables. Never use VITE_ on secrets.
4. Deploy to Preview and verify /api/r2/health, photo upload and viewing, login, rental start/return, offline drafts and mobile layouts.
5. Inspect Chrome DevTools Network transfer sizes and Lighthouse before/after; use Supabase query plans to choose any additional indexes.

## Important limits
- Vercel automatically serves static assets via CDN and negotiates supported compression; do not double-compress files.
- The service worker does not queue or submit financial transactions offline.
- Database requests still require internet; no caching of private API data or photos.
- No background processing or new server-side data cache was added: financial writes must not be asynchronously retried without idempotency.
- Existing R2 HTTP 500 must be diagnosed from Vercel Function logs; performance optimization cannot fix incorrect R2 credentials or server errors.
