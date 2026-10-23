# Customer Remarks update

Run `supabase/migrations/014_customer_remarks.sql` in Supabase SQL Editor **before** deploying the updated frontend. This adds an optional customer-level `remarks` field without changing existing records or RLS policies.

Changes: registration remarks, Start Rental read-only Remarks display, Customer Profile view/edit Remarks, matching Address/Remarks field styling, and suppression of only the Dashboard “due tomorrow” badge. Existing rental-level remarks and customer `notes` are preserved separately. Offline draft/cache modules are unchanged.

Verify registration, profile edit, Start Rental display, other due badges, and offline drafts on staging.
