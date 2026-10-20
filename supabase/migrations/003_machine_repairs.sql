-- Run once in Supabase SQL Editor before using Inventory repair history.
create table if not exists public.machine_repairs (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.machines(id),
  problem text not null,
  cost numeric(12,2) not null default 0 check (cost >= 0),
  notes text,
  status text not null default 'open' check(status in ('open','completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id)
);
create index if not exists machine_repairs_machine_idx on public.machine_repairs(machine_id,started_at desc);
alter table public.machine_repairs enable row level security;
create policy "Authenticated staff read repairs" on public.machine_repairs for select to authenticated using (true);
create policy "Authenticated staff create repairs" on public.machine_repairs for insert to authenticated with check (true);
create policy "Authenticated staff complete repairs" on public.machine_repairs for update to authenticated using (true) with check (true);
