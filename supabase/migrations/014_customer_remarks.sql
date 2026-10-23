-- Optional customer-level remarks. Non-destructive; existing customers remain unchanged.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS remarks text;
