-- Blokace staré zákaznické cesty nákupu samotného ticketu.
-- Od nasazení garantovaných benefitů musí zákaznický nákup používat výhradně
-- purchase_guaranteed_benefit_bundle_atomic, který atomicky vydá benefit a ticket.
--
-- Tato migrace NEMĚNÍ obsah buy_ticket_atomic ani soutěžní logiku. Pouze odebere
-- možnost volat legacy bare-ticket RPC z klientské role authenticated.
-- service_role zůstává kvůli řízeným interním testům / recovery nástrojům.
--
-- Bezpečnostní invarianta:
--   zákazník nesmí být schopen obejít garantovaný benefit přímým RPC voláním.

begin;

revoke all on function public.buy_ticket_atomic(uuid, uuid) from public;
revoke all on function public.buy_ticket_atomic(uuid, uuid) from anon;
revoke all on function public.buy_ticket_atomic(uuid, uuid) from authenticated;
grant execute on function public.buy_ticket_atomic(uuid, uuid) to service_role;

-- Produkční test helper už má být service-role-only; zopakujeme to zde,
-- aby nemohl sloužit jako nepřímý bypass po případném schema driftu.
revoke all on function public._test_buy_ticket(uuid, uuid) from public;
revoke all on function public._test_buy_ticket(uuid, uuid) from anon;
revoke all on function public._test_buy_ticket(uuid, uuid) from authenticated;
grant execute on function public._test_buy_ticket(uuid, uuid) to service_role;

commit;
