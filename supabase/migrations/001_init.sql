-- RentDesk schema — matches RentDesk-requirements.md §1 exactly.
-- Run in order; this is the only migration so far.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ============ CUSTOMERS ============
create table customers (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  mobile                  text not null unique,
  additional_mobile       text,
  profession              text,
  custom_profession       text,
  village                 text,
  address                 text,
  photo_url               text,
  id_proof_front_url      text,
  id_proof_back_url       text,
  referred_by_customer_id uuid references customers(id),
  referred_by_name        text,
  referred_by_mobile      text,
  referred_by_address     text,
  flag                    text not null default 'green'
                            check (flag in ('green','yellow','red')),
  notes                   text,
  created_at              timestamptz not null default now(),
  created_by              uuid references auth.users(id),
  constraint mobile_format check (mobile ~ '^[6-9][0-9]{9}$'),
  constraint additional_mobile_format check (additional_mobile is null or additional_mobile ~ '^[6-9][0-9]{9}$'),
  constraint mobile_not_additional check (additional_mobile is null or mobile <> additional_mobile)
);
create index customers_mobile_idx on customers (mobile);
create index customers_name_idx on customers using gin (name gin_trgm_ops);
-- additional_mobile must be unique too, but only among rows that HAVE one
-- (a partial index lets multiple NULLs coexist, which a plain UNIQUE column
-- constraint would not).
create unique index customers_additional_mobile_key on customers (additional_mobile) where additional_mobile is not null;

-- A plain UNIQUE constraint only covers one column at a time, so it can't
-- stop "my additional number is someone else's primary number" (or vice
-- versa). This trigger is the real enforcement across BOTH columns, for
-- every customer, in both directions — every phone number in the whole
-- table (primary or additional) must be unique across the whole table.
create or replace function check_phone_uniqueness() returns trigger as $$
begin
  if exists (
    select 1 from customers
    where id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and (
        mobile = new.mobile
        or additional_mobile = new.mobile
        or (new.additional_mobile is not null and (mobile = new.additional_mobile or additional_mobile = new.additional_mobile))
      )
  ) then
    raise exception 'Wrong number — this mobile number is already registered to another customer';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger customers_phone_uniqueness
  before insert or update on customers
  for each row execute function check_phone_uniqueness();

-- ============ PRODUCTS ============
create table products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  daily_rent  integer not null check (daily_rent >= 0),
  created_at  timestamptz not null default now()
);

-- ============ MACHINES ============
create table machines (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references products(id),
  machine_number text not null unique,
  status         text not null default 'available'
                   check (status in ('available','rented','repair')),
  created_at     timestamptz not null default now()
);
create index machines_product_status_idx on machines (product_id, status);

-- ============ RENTAL ORDERS ============
create table rental_orders (
  id             uuid primary key default gen_random_uuid(),
  display_id     text not null unique,
  customer_id    uuid not null references customers(id),
  advance_amount integer not null default 0,
  extra_expense  integer not null default 0,
  remarks        text,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id)
);
create index rental_orders_customer_idx on rental_orders (customer_id);

-- ============ RENTAL ITEMS ============
create table rental_items (
  id                 uuid primary key default gen_random_uuid(),
  rental_order_id    uuid not null references rental_orders(id),
  product_id         uuid not null references products(id),
  machine_id         uuid not null references machines(id),
  daily_rate         integer not null,
  expected_return_at timestamptz not null,
  status             text not null default 'active'
                       check (status in ('active','returned')),
  created_at         timestamptz not null default now()
);
create index rental_items_order_idx on rental_items (rental_order_id);
create index rental_items_status_idx on rental_items (status);
create index rental_items_machine_idx on rental_items (machine_id);

-- ============ RENTAL ITEM SEGMENTS ============
create table rental_item_segments (
  id             uuid primary key default gen_random_uuid(),
  rental_item_id uuid not null references rental_items(id),
  machine_id     uuid not null references machines(id),
  daily_rate     integer not null,
  from_at        timestamptz not null,
  to_at          timestamptz,
  reason         text
);
create index segments_item_idx on rental_item_segments (rental_item_id);

-- ============ EVENTS ============
create table events (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  event_type  text not null check (event_type in (
                'START_RENTAL','RETURN_RENTAL','MANAGE_ACTIVE_RENTAL',
                'PAYMENT_TAB','CUSTOMER_EDIT','CORRECTION'
              )),
  occurred_at timestamptz not null default now(),
  created_by  uuid references auth.users(id)
);
create index events_customer_idx on events (customer_id);
create index events_occurred_idx on events (occurred_at desc);

-- ============ TRANSACTIONS (immutable ledger) ============
create table transactions (
  id                      uuid primary key default gen_random_uuid(),
  event_id                uuid not null references events(id),
  customer_id             uuid not null references customers(id),
  rental_order_id         uuid references rental_orders(id),
  rental_item_id          uuid references rental_items(id),
  type                    text not null check (type in (
                            'RENT_CHARGE','ADVANCE_RECEIVED','PAYMENT_RECEIVED',
                            'EXTRA_CHARGE','DISCOUNT_ADJUSTMENT','REFUND_PAID',
                            'CREDIT_APPLIED','SWAP','NOTE'
                          )),
  amount                  integer not null,
  payment_mode            text check (payment_mode in ('Cash','UPI','Bank Transfer','Card','Other')),
  description             text not null,
  machine_number          text,
  swap_to_machine_number  text,
  days                    integer,
  occurred_at             timestamptz not null,
  is_correction           boolean not null default false,
  corrects_transaction_id uuid references transactions(id),
  created_at              timestamptz not null default now(),
  created_by              uuid references auth.users(id)
);
create index transactions_customer_idx on transactions (customer_id);
create index transactions_order_idx on transactions (rental_order_id);
create index transactions_event_idx on transactions (event_id);

-- junction table for payments/discounts spanning multiple orders (§5 "don't split" rule)
create table transaction_order_refs (
  transaction_id  uuid not null references transactions(id),
  rental_order_id uuid not null references rental_orders(id),
  primary key (transaction_id, rental_order_id)
);

-- ============ BALANCE — a view, never a column (§1 core rule) ============
create view customer_balances as
select customer_id, coalesce(sum(amount), 0) as balance
from transactions
group by customer_id;

-- Order status is derived (§4): "closed" iff every rental_item is 'returned'.
create view rental_order_status as
select
  ro.id as rental_order_id,
  case when count(ri.id) > 0 and count(ri.id) = count(ri.id) filter (where ri.status = 'returned')
       then 'closed' else 'active' end as status
from rental_orders ro
left join rental_items ri on ri.rental_order_id = ro.id
group by ro.id;

-- Customer list + balance in one query, for Payment Tab / Customer Database
-- browse screens (avoids an N+1 balance lookup per customer).
create view customers_with_balance as
select c.*, coalesce(cb.balance, 0) as balance
from customers c
left join customer_balances cb on cb.customer_id = c.id;

