-- Human-friendly rental IDs: AA-0001 ... AA-9999, AB-0001 ... ZZ-9999.
-- UUID rental_orders.id remains the internal primary key.
create sequence if not exists rental_display_seq start with 1 increment by 1 minvalue 1 maxvalue 6759324 no cycle;

create or replace function next_rental_display_id()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
  prefix_index bigint;
  serial_no bigint;
  first_letter int;
  second_letter int;
begin
  n := nextval('rental_display_seq');
  prefix_index := (n - 1) / 9999;
  serial_no := ((n - 1) % 9999) + 1;
  if prefix_index >= 676 then
    raise exception 'Rental display ID sequence exhausted';
  end if;
  first_letter := prefix_index / 26;
  second_letter := prefix_index % 26;
  return chr(65 + first_letter) || chr(65 + second_letter) || '-' || lpad(serial_no::text, 4, '0');
end;
$$;

grant execute on function next_rental_display_id() to anon, authenticated;
