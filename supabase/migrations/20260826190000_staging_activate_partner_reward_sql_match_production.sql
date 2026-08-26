-- STAGING ONLY — last item of the staging security drift.
--
-- ⚠️ Intended for staging (dxmowysntemfqfnanxua). It is a no-op on production
-- (xkzhjldrojjlrkezorey): the definition below IS production's current definition,
-- byte for byte, so applying it there would change nothing.
--
-- public.activate_partner_reward_sql(text, text, uuid) was the one remaining case
-- where staging was less safe than production, and it was NOT grant drift -- the
-- grants are identical in both environments (anon and authenticated are allowed on
-- production too). The difference was the body:
--
--   production : a stub. It hashes the api key and returns {success, partner_id}.
--                It writes NOTHING.
--   staging    : the old live version. It UPDATEs partner_reward_codes to
--                'activated' (the trigger trg_log_partner_coin_activation_reward
--                then inserts partner_coin_activations), stamps a hardcoded system
--                user id, and performs NO authorization check whatsoever.
--
-- Because production has no guard here to transplant -- it removed the logic
-- instead -- the previous migration deliberately stopped and reported this rather
-- than inventing a guard. It is resolved now by adopting production's definition
-- verbatim, after confirming production's stub really is the canonical behaviour:
--
--   1. Production definition captured exactly: plpgsql, SECURITY DEFINER,
--      SET search_path TO 'public','extensions','pg_temp', RETURNS jsonb,
--      prosrc md5 a1347dbb7defa440d0e439663902a0a9, 206 chars.
--   2. Callers are identical in both environments and there are only two:
--      src/pages/PartnerDashboard.tsx (partner, authenticated) and the
--      partner-activate Edge Function (service_role). Zero database-side callers
--      in either environment.
--   3. Production's callers therefore already get stub behaviour today -- the
--      database function simply IS the stub. The Edge Function reads
--      result.coins / result.activation_id, which the stub does not return, so it
--      answers with nulls; the dashboard reads result.success and sees true.
--   4. The old activation logic was REPLACED on production, not lost. Activation
--      now happens through redeem_miocoin_code() plus the trigger
--      trg_log_partner_coin_activation_reward -> log_partner_coin_activation_from_reward
--      (this is the documented canonical path). Proof it is live: production holds
--      6 partner_coin_activations and 4 activated reward codes, most recently
--      2026-08-18, while the stub does nothing. Staging has that same
--      redeem_miocoin_code path, so it loses no capability here.
--
-- No new guard and no new business logic is invented. The body below is copied
-- from production unchanged, which is exactly what makes this safe: it is not a
-- rewrite, it is convergence onto the canonical version.

BEGIN;

CREATE OR REPLACE FUNCTION public.activate_partner_reward_sql(
  p_reward_code text,
  p_api_key text,
  p_partner_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_hash bytea;
BEGIN
  v_hash := extensions.digest(convert_to(p_api_key, 'UTF8'), 'sha256');

  RETURN jsonb_build_object(
    'success', true,
    'partner_id', p_partner_id
  );
END;
$function$;

-- Grants are set to production's exactly: postgres, anon, authenticated,
-- service_role. They are NOT tightened -- production keeps anon and authenticated
-- here, and the point of this migration is to match production, not to exceed it.
-- The function is safe with those grants precisely because it no longer writes.
--
-- PUBLIC is revoked because production's ACL has no PUBLIC entry. Staging had one
-- (Postgres grants EXECUTE to PUBLIC by default and this function was never in the
-- earlier lockdown lists, since production allows anon here). It made no practical
-- difference once anon and authenticated hold the grant explicitly, but the target
-- is an ACL identical to production's, so it goes.
REVOKE ALL ON FUNCTION public.activate_partner_reward_sql(text, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.activate_partner_reward_sql(text, text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.activate_partner_reward_sql(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_partner_reward_sql(text, text, uuid) TO service_role;

COMMIT;
