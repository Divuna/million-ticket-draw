-- Contest integrity monitoring view
-- Detects inconsistencies between tickets, wallets, and winners.
-- No table or RLS changes.

CREATE OR REPLACE VIEW public.contest_integrity_check AS
SELECT
    c.id                                  AS contest_id,
    c.title                               AS contest_title,
    (SELECT COUNT(*) FROM public.tickets t WHERE t.contest_id = c.id)
                                          AS tickets_sold,
    (SELECT COUNT(DISTINCT w.ticket_id) FROM public.winners w WHERE w.contest_id = c.id)
                                          AS winners_count,
    (SELECT COUNT(*) FROM public.bonus_prizes bp WHERE bp.contest_id = c.id)
                                          AS bonus_prizes_defined,
    (SELECT COUNT(DISTINCT w.ticket_id)
     FROM public.winners w
     JOIN public.bonus_prizes bp ON bp.id = w.prize_id AND bp.contest_id = w.contest_id
     WHERE w.contest_id = c.id)
                                          AS bonus_prizes_triggered,
    (SELECT COALESCE(SUM(ABS(wt.amount)), 0)
     FROM public.wallet_transactions wt
     JOIN public.tickets t ON t.user_id = wt.user_id AND t.contest_id = c.id
     WHERE wt.amount < 0
       AND wt.metadata->>'contest_id' = c.id::text)
                                          AS coins_spent_ledger,
    (SELECT COUNT(*) FROM public.tickets t WHERE t.contest_id = c.id)
                                          AS expected_ticket_sales,
    CASE
        WHEN (SELECT COUNT(*) FROM public.tickets t WHERE t.contest_id = c.id) = 0
        THEN 'OK'
        WHEN (SELECT COALESCE(SUM(ABS(wt.amount)), 0)
              FROM public.wallet_transactions wt
              JOIN public.tickets t ON t.user_id = wt.user_id AND t.contest_id = c.id
              WHERE wt.amount < 0 AND wt.metadata->>'contest_id' = c.id::text)
             = (SELECT COUNT(*) FROM public.tickets t WHERE t.contest_id = c.id) * c.ticket_price
        THEN 'OK'
        ELSE 'MISMATCH'
    END                                   AS wallet_vs_ticket_check
FROM public.contests c;
