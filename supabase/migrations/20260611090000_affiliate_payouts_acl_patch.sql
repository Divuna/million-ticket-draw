-- =============================================================================
-- Fáze A–D.1 ACL PATCH — explicitní REVOKE implicitních EXECUTE grantů
--
-- Důvod: Supabase přidává při CREATE FUNCTION implicitní EXECUTE granty pro
-- anon/authenticated/service_role. `REVOKE ALL ... FROM PUBLIC` v původních
-- migracích tyto per-role granty NEodstraní. Postcheck na stagingu
-- (11. 06. 2026) našel:
--   - prepare_affiliate_payout_document  : anon + authenticated EXECUTE
--   - finalize_affiliate_payout_document : anon + authenticated EXECUTE
--   - next_affiliate_payout_document_number : anon + authenticated EXECUTE
--   - admin_set_affiliate_commission_status : anon EXECUTE
--   - cancel_affiliate_payout_batch         : anon EXECUTE
--
-- Funkce Fáze C NEMAJÍ vnitřní auth guard (jsou navržené jako service_role-only,
-- volané výhradně z Edge Function `create-affiliate-payout-document`).
-- Granty jsou tedy jediná ochrana — anon/authenticated EXECUTE byla reálná díra.
--
-- Tento patch je idempotentní a MUSÍ se aplikovat jako POSLEDNÍ krok po všech
-- migracích A → B → B guard → C → D → D.1. Nahrazuje dřívější manuální
-- post-apply REVOKE krok z rollout checklistu (DESIGN.md §17).
--
-- APLIKOVÁNO NA STAGING dxmowysntemfqfnanxua (11. 06. 2026).
-- NA PRODUKCI NEAPLIKOVAT bez výslovného schválení Pavla.
-- =============================================================================

-- ── Service-role-only RPC (žádný vnitřní guard — grant je jediná ochrana) ────
REVOKE EXECUTE ON FUNCTION public.prepare_affiliate_payout_document(uuid)
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.finalize_affiliate_payout_document(
  uuid, text, text, text, text, text, text, text
) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.next_affiliate_payout_document_number()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.prepare_affiliate_bank_export(uuid)
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.finalize_affiliate_bank_export(uuid, text, text, integer)
  FROM anon, authenticated;

-- ── Admin RPC (vnitřní is_admin() guard, ale anon nesmí mít EXECUTE) ─────────
REVOKE EXECUTE ON FUNCTION public.admin_set_affiliate_commission_status(uuid, text)
  FROM anon;

REVOKE EXECUTE ON FUNCTION public.cancel_affiliate_payout_batch(uuid)
  FROM anon;

REVOKE EXECUTE ON FUNCTION public.mark_affiliate_payout_batch_paid(uuid)
  FROM anon;

REVOKE EXECUTE ON FUNCTION public.create_affiliate_payout_batch(uuid[])
  FROM anon;

REVOKE EXECUTE ON FUNCTION public.update_affiliate_payout_batch_meta(uuid, text, text, date)
  FROM anon;
