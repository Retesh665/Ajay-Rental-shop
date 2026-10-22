-- Read-only, security-invoker period aggregates. No business data is changed.
-- Run in Supabase SQL Editor before deploying the new frontend.
CREATE OR REPLACE FUNCTION public.rd_dashboard_period_metrics(p_from timestamptz, p_to timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'new_rentals', (SELECT count(*) FROM public.rental_orders WHERE created_at >= p_from AND created_at <= p_to),
    'returns_count', (SELECT count(DISTINCT rental_item_id) FROM public.transactions WHERE type = 'RENT_CHARGE' AND occurred_at >= p_from AND occurred_at <= p_to),
    'new_customers', (SELECT count(*) FROM public.customers WHERE created_at >= p_from AND created_at <= p_to),
    'total_collected', (SELECT coalesce(sum(abs(amount)), 0) FROM public.transactions WHERE type = 'PAYMENT_RECEIVED' AND occurred_at >= p_from AND occurred_at <= p_to)
  );
$$;
REVOKE ALL ON FUNCTION public.rd_dashboard_period_metrics(timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rd_dashboard_period_metrics(timestamptz,timestamptz) TO authenticated;
