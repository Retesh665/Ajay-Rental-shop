-- Run after 001-004. Keep customer discounts unchanged; this table is reporting-only.
alter table public.machines drop constraint if exists machines_status_check;
alter table public.machines add constraint machines_status_check check(status in ('available','rented','repair','dismantled'));

create table if not exists public.machine_discount_allocations (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.events(id),
 rental_item_id uuid not null references public.rental_items(id),
 amount numeric(12,2) not null check(amount >= 0),
 unique(event_id,rental_item_id)
);
create index if not exists machine_discount_allocations_item_idx on public.machine_discount_allocations(rental_item_id);
alter table public.machine_discount_allocations enable row level security;
create policy "Staff read machine discount allocations" on public.machine_discount_allocations for select to authenticated using (true);
create policy "Staff insert machine discount allocations" on public.machine_discount_allocations for insert to authenticated with check (true);

-- Enforce rented lock at DB level, including direct updates and stale browser tabs.
create or replace function public.rd_machine_status_guard() returns trigger language plpgsql as $$
begin
 if new.status is distinct from old.status then
  if old.status='rented' and new.status <> 'available' and new.status <> 'repair' then
   raise exception 'Return the rented machine before changing its status';
  end if;
  if old.status='rented' and new.status in ('available','repair') and exists (
    select 1 from public.rental_items where machine_id=old.id and status='active'
  ) then
   raise exception 'Machine still has an active rental; return it first';
  end if;
  if new.status='rented' and old.status <> 'available' then
   raise exception 'Only available machines can be rented';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists rd_machine_status_guard on public.machines;
create trigger rd_machine_status_guard before update of status on public.machines for each row execute function public.rd_machine_status_guard();

create or replace function public.rd_change_machine_status(p_machine_id uuid,p_status text)
returns void language plpgsql security invoker as $$
declare v_status text;
begin
 if p_status not in ('available','repair','dismantled') then raise exception 'Invalid manual machine status'; end if;
 select status into v_status from public.machines where id=p_machine_id for update;
 if not found then raise exception 'Machine not found'; end if;
 if v_status='rented' then raise exception 'Return the machine before changing status'; end if;
 if v_status='repair' and p_status='available' then raise exception 'Complete repair with cost and notes first'; end if;
 if v_status='repair' and exists(select 1 from public.machine_repairs where machine_id=p_machine_id and status='open') then
  raise exception 'Complete open repair records before changing status';
 end if;
 update public.machines set status=p_status where id=p_machine_id;
end $$;

create or replace function public.rd_complete_machine_repair(p_machine_id uuid,p_cost numeric,p_notes text)
returns void language plpgsql security invoker as $$
declare v_status text;
begin
 if p_cost is null or p_cost<0 or nullif(btrim(p_notes),'') is null then raise exception 'Repair cost and note are required'; end if;
 select status into v_status from public.machines where id=p_machine_id for update;
 if v_status <> 'repair' then raise exception 'Machine is not under repair'; end if;
 update public.machine_repairs set status='completed',completed_at=now(),cost=cost+p_cost,
 notes=concat_ws(E'\n',nullif(notes,''),p_notes)
 where machine_id=p_machine_id and status='open';
 if not found then
  insert into public.machine_repairs(machine_id,problem,cost,notes,status,completed_at)
  values(p_machine_id,'Repair completed',p_cost,p_notes,'completed',now());
 end if;
 update public.machines set status='available' where id=p_machine_id;
end $$;
