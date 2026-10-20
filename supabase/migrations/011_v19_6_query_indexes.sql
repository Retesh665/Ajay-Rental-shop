-- RentDesk V19.6: targeted indexes for actual app queries.
-- Safe to re-run. Apply after migrations 001 through 010.
-- These are normal CREATE INDEX statements; run during a low-traffic period.
-- Do not add indexes that already exist in 001/003/006/010.

-- Dashboard period filters and latest rental customer list.
create index if not exists rd_rental_orders_created_at_idx
  on public.rental_orders (created_at desc);
create index if not exists rd_rental_items_created_at_idx
  on public.rental_items (created_at desc);
create index if not exists rd_customers_created_at_idx
  on public.customers (created_at desc);

-- Customer profile rental history: customer filter + newest first.
create index if not exists rd_rental_orders_customer_created_idx
  on public.rental_orders (customer_id, created_at desc);

-- Transaction history, recent activity, and dashboard period-by-type queries.
create index if not exists rd_transactions_occurred_idx
  on public.transactions (occurred_at desc);
create index if not exists rd_transactions_customer_occurred_idx
  on public.transactions (customer_id, occurred_at desc);
create index if not exists rd_transactions_type_occurred_idx
  on public.transactions (type, occurred_at desc);

-- Active rental list and machine-level charge lookups.
create index if not exists rd_rental_items_active_idx
  on public.rental_items (rental_order_id) where status = 'active';
create index if not exists rd_transactions_rent_item_idx
  on public.transactions (rental_item_id) where type = 'RENT_CHARGE';

-- Inventory history and latest returned segment lookups.
create index if not exists rd_segments_machine_from_idx
  on public.rental_item_segments (machine_id, from_at desc);
create index if not exists rd_segments_machine_returned_idx
  on public.rental_item_segments (machine_id, to_at desc)
  where to_at is not null;

-- Events customer timeline. Existing events_customer_idx alone doesn't
-- provide newest-first ordering within a customer.
create index if not exists rd_events_customer_occurred_idx
  on public.events (customer_id, occurred_at desc);

-- Recheck index usage after collecting real production query plans.
-- More indexes increase write overhead and storage; these are not a guarantee
-- of faster tab transitions, which also depend on round-trip latency.
