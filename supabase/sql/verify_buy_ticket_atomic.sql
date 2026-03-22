-- Run in Supabase SQL Editor AFTER deploying deploy_buy_ticket_atomic_with_drop.sql (or deploy_buy_ticket_atomic.sql).

-- 1) Check function exists
SELECT p.proname,
       pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_args
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'buy_ticket_atomic';

-- 2) Full definition (must show RETURNS jsonb, v_new_ticket_id BIGINT, RETURNING id INTO v_new_ticket_id)
SELECT pg_get_functiondef('public.buy_ticket_atomic(uuid,uuid)'::regprocedure);
