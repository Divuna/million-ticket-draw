-- Bezpečnostní oprava A4 — sync_partner_offer_activations jen pro interní systém
--
-- Nález: `public.sync_partner_offer_activations()` je SECURITY DEFINER (owner
-- postgres) a měla EXECUTE pro PUBLIC, anon i authenticated, přitom uvnitř
-- nemá žádné ověření volajícího. Kdokoli s veřejným anon klíčem tak mohl
-- kdykoli hromadně materializovat řádky v `partner_offer_activations`, které
-- jsou podkladem pro fakturaci partnerů.
--
-- Oprava: odebrat veřejné spuštění a ponechat jen `service_role`.
--
-- Proč je to bezpečné (ověřeno na produkci před aplikací):
-- - funkci nevolá žádná jiná DB funkce ani trigger (0 nálezů v `pg_proc`),
-- - není navázaná na žádný pg_cron job,
-- - v repu ji nevolá frontend ani Edge Function (jediný výskyt je komentář
--   v migraci `20260412_trigger_auto_activate_partner_offer.sql`).
-- Jde tedy o ad-hoc údržbovou funkci, kterou má spouštět pouze interní
-- backend / service-role.
--
-- Pravidlo (neměnit): EXECUTE pro `anon`/`authenticated`/`PUBLIC` už této
-- funkci nevracet.
--
-- Migrace nemění data ani definici funkce — pouze přístupová práva.

REVOKE EXECUTE ON FUNCTION public.sync_partner_offer_activations()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sync_partner_offer_activations()
TO service_role;
