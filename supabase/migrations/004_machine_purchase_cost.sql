-- RentDesk V12: optional historical purchase cost; required for new machine creation form.
-- Safe to apply once after migrations 001-003. Existing machines default to 0.
alter table public.machines
  add column if not exists purchase_cost numeric(12,2) not null default 0;
alter table public.machines
  drop constraint if exists machines_purchase_cost_nonnegative;
alter table public.machines
  add constraint machines_purchase_cost_nonnegative check (purchase_cost >= 0);
