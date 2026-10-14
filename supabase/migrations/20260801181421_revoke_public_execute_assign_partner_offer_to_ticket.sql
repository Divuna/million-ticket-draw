-- Bezpečnostní oprava A3 — assign_partner_offer_to_ticket jen pro interní systém
--
-- Nález: `public.assign_partner_offer_to_ticket(uuid, uuid, uuid)` je SECURITY
-- DEFINER (owner postgres) a měla EXECUTE pro PUBLIC, anon i authenticated.
-- Funkce přijímá `p_user_id` jako parametr a neověřuje volajícího, takže kdokoli
-- s veřejným anon klíčem mohl přiřadit partnerskou nabídku libovolnému
-- uživateli a tiketu. Vzniklé `user_partner_offers` se přes
-- `partner_offer_activations` promítají do fakturace partnerů.
--
-- Oprava: odebrat veřejné spuštění a ponechat jen `service_role`.
--
-- Proč je to bezpečné (ověřeno na produkci před aplikací):
-- - jediný volající je trigger `trg_assign_offer_on_ticket_insert` na `tickets`,
--   jehož funkce `trg_fn_assign_offer_on_ticket_insert` je SECURITY DEFINER
--   vlastněná rolí postgres → běží pod vlastníkem, ne pod volajícím uživatelem,
--   takže nákup tiketu funguje dál beze změny,
-- - v repu neexistuje žádné přímé volání z frontendu ani z Edge Functions.
--
-- Pravidlo (neměnit): EXECUTE pro `anon`/`authenticated`/`PUBLIC` už této funkci
-- nevracet. Přiřazení nabídky patří výhradně internímu/atomickému backendu.
--
-- Migrace nemění data ani definici funkce — pouze přístupová práva.

REVOKE EXECUTE ON FUNCTION public.assign_partner_offer_to_ticket(uuid, uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.assign_partner_offer_to_ticket(uuid, uuid, uuid)
TO service_role;
