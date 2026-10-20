-- V16: authenticated repair completion and machine status timing.
-- Run after 005. Does not change customer billing or ledger.
create table if not exists public.machine_status_history (
 id uuid primary key default gen_random_uuid(),
 machine_id uuid not null references public.machines(id),
 status text not null check(status in ('available','rented','repair','dismantled')),
 started_at timestamptz not null default now()
);
create index if not exists machine_status_history_latest_idx on public.machine_status_history(machine_id,started_at desc);
alter table public.machine_status_history enable row level security;
drop policy if exists "Staff read machine status history" on public.machine_status_history;
create policy "Staff read machine status history" on public.machine_status_history for select to authenticated using (true);

-- Backfill: current status is known, but historical transition time may not be.
-- For existing repair machines, use the oldest open repair start when available.
insert into public.machine_status_history(machine_id,status,started_at)
select m.id,m.status,case when m.status='repair' then coalesce((select min(r.started_at) from public.machine_repairs r where r.machine_id=m.id and r.status='open'),now()) else now() end
from public.machines m where not exists(select 1 from public.machine_status_history h where h.machine_id=m.id);

create or replace function public.rd_log_machine_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
 if new.status is distinct from old.status then
  insert into public.machine_status_history(machine_id,status,started_at) values(new.id,new.status,now());
 end if;
 return new;
end $$;
drop trigger if exists rd_log_machine_status on public.machines;
create trigger rd_log_machine_status after update of status on public.machines
for each row execute function public.rd_log_machine_status();

-- Repair writes are performed through a single authenticated, locked, atomic RPC.
-- A direct browser INSERT into machine_repairs is no longer needed.
create or replace function public.rd_complete_machine_repair(p_machine_id uuid,p_cost numeric,p_notes text)
returns void language plpgsql security definer set search_path=public as $$
declare v_status text; v_start timestamptz;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_cost is null or p_cost < 0 or nullif(btrim(p_notes),'') is null then
  raise exception 'Repair cost and note are required';
 end if;
 select status into v_status from public.machines where id=p_machine_id for update;
 if not found then raise exception 'Machine not found'; end if;
 if v_status <> 'repair' then raise exception 'Machine is not under repair'; end if;
 select started_at into v_start from public.machine_status_history
 where machine_id=p_machine_id and status='repair' order by started_at desc limit 1;
 -- Legacy open repair records are completed as one repair episode; cost applied once.
 update public.machine_repairs set status='completed',completed_at=now(),
 notes=concat_ws(E'\n',nullif(notes,''),p_notes)
 where machine_id=p_machine_id and status='open';
 insert into public.machine_repairs(machine_id,problem,cost,notes,status,started_at,completed_at,created_by)
 values(p_machine_id,'Repair completed',p_cost,p_notes,'completed',coalesce(v_start,now()),now(),auth.uid());
 update public.machines set status='available' where id=p_machine_id;
end $$;
revoke all on function public.rd_complete_machine_repair(uuid,numeric,text) from public,anon;
grant execute on function public.rd_complete_machine_repair(uuid,numeric,text) to authenticated;

-- Restrict manual status changes to authenticated staff; enforce rented lock.
create or replace function public.rd_change_machine_status(p_machine_id uuid,p_status text)
returns void language plpgsql security definer set search_path=public as $$
declare v_status text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_status not in ('available','repair','dismantled') then raise exception 'Invalid status'; end if;
 select status into v_status from public.machines where id=p_machine_id for update;
 if not found then raise exception 'Machine not found'; end if;
 if v_status='rented' then raise exception 'Return the rented machine first'; end if;
 if v_status='repair' and p_status='available' then raise exception 'Use Repair Done to complete repair'; end if;
 if v_status='repair' and p_status='dismantled' then raise exception 'Complete repair before dismantling'; end if;
 update public.machines set status=p_status where id=p_machine_id;
end $$;
revoke all on function public.rd_change_machine_status(uuid,text) from public,anon;
grant execute on function public.rd_change_machine_status(uuid,text) to authenticated;
