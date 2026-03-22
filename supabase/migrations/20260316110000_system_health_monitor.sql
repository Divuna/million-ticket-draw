-- System health monitoring view
-- Global monitoring of system activity and errors.
-- No table or RLS changes.

CREATE OR REPLACE VIEW public.system_health_monitor AS
SELECT
    (SELECT COUNT(*) FROM public.users)                    AS total_users,
    (SELECT COUNT(*) FROM public.contests WHERE status = 'active') AS active_contests,
    (SELECT COUNT(*) FROM public.tickets WHERE created_at > now() - interval '1 hour') AS tickets_last_hour,
    (SELECT COUNT(*) FROM public.wallet_transactions WHERE created_at > now() - interval '1 hour') AS wallet_tx_last_hour,
    (SELECT COUNT(*) FROM public.payments WHERE created_at > now() - interval '1 hour') AS payments_last_hour,
    (SELECT COUNT(*) FROM public.audit_logs WHERE created_at > now() - interval '1 hour') AS audit_events_last_hour,
    (SELECT MAX(created_at) FROM public.tickets)           AS last_ticket_time,
    (SELECT MAX(created_at) FROM public.payments)          AS last_payment_time;
