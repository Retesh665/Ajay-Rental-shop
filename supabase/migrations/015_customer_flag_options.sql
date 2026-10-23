-- Customer flags: one canonical set of values across RentDesk.
-- Safe and non-destructive: existing customer rows and unrelated data remain intact.
BEGIN;

-- The initial schema allowed green/yellow/red. Translate the legacy yellow
-- value to its new name before installing the four-value constraint.
ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_flag_check;

UPDATE public.customers
SET flag = 'amber'
WHERE flag = 'yellow';

UPDATE public.customers
SET flag = 'green'
WHERE flag IS NULL OR flag NOT IN ('green', 'amber', 'red', 'gold');

ALTER TABLE public.customers
  ALTER COLUMN flag SET DEFAULT 'green',
  ALTER COLUMN flag SET NOT NULL;

ALTER TABLE public.customers
  ADD CONSTRAINT customers_flag_check
  CHECK (flag IN ('green', 'amber', 'red', 'gold'));

COMMIT;
