-- Reload PostgREST schema cache (use after creating/replacing RPCs such as buy_ticket_atomic).
NOTIFY pgrst, 'reload schema';
