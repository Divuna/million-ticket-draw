-- Proposal only: bridge existing approved influencer partners into the new affiliate DB layer.
-- This migration is intentionally not wired into /influencer, /influencer/register,
-- /influencer/dashboard, /admin/influencers, payments, Stripe, wallet, or any referral flow.
--
-- Existing legacy influencer flow remains based on public.partners and existing /?ref=...
-- links. The new affiliate layer must use only ?aff=KOD later, never ref.
--
-- Intended objects:
-- 1. public.affiliate_legacy_partner_links
-- 2. public.admin_bridge_influencer_partner_to_affiliate(...)
-- 3. public.v_admin_influencer_affiliate_bridge_candidates

CREATE TABLE IF NOT EXISTS public.affiliate_legacy_partner_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  affiliate_partner_id uuid NOT NULL REFERENCES public.affiliate_partners(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT affiliate_legacy_partner_links_reason_not_empty
    CHECK (length(trim(reason)) > 0),
  CONSTRAINT affiliate_legacy_partner_links_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT affiliate_legacy_partner_links_one_legacy_partner
    UNIQUE (legacy_partner_id),
  CONSTRAINT affiliate_legacy_partner_links_one_affiliate_partner
    UNIQUE (affiliate_partner_id)
);

COMMENT ON TABLE public.affiliate_legacy_partner_links IS
  'One-way bridge from the legacy approved influencer partner record in public.partners to the new affiliate_partners record. Does not modify the legacy partner.';

COMMENT ON COLUMN public.affiliate_legacy_partner_links.legacy_partner_id IS
  'Existing influencer partner from public.partners. One legacy partner can be bridged only once.';

COMMENT ON COLUMN public.affiliate_legacy_partner_links.affiliate_partner_id IS
  'New affiliate_partners record created by the bridge. One affiliate partner can be linked to only one legacy partner.';

CREATE INDEX IF NOT EXISTS idx_affiliate_legacy_partner_links_created_at
  ON public.affiliate_legacy_partner_links(created_at DESC);

ALTER TABLE public.affiliate_legacy_partner_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin read affiliate legacy partner links" ON public.affiliate_legacy_partner_links;
CREATE POLICY "Admin read affiliate legacy partner links"
  ON public.affiliate_legacy_partner_links
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

GRANT SELECT ON public.affiliate_legacy_partner_links TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_bridge_influencer_partner_to_affiliate(
  p_legacy_partner_id uuid,
  p_code text,
  p_commission_rate numeric DEFAULT 0.02,
  p_reason text DEFAULT 'Bridge approved influencer partner to affiliate layer',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_legacy_partner public.partners%ROWTYPE;
  v_code text := upper(trim(coalesce(p_code, '')));
  v_reason text := trim(coalesce(p_reason, ''));
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_contract_starts_at timestamp with time zone := clock_timestamp();
  v_affiliate_partner_id uuid;
  v_affiliate_code_id uuid;
  v_rate_history_id uuid;
  v_link_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = 'P0001';
  END IF;

  IF p_legacy_partner_id IS NULL THEN
    RAISE EXCEPTION 'legacy_partner_required' USING ERRCODE = 'P0001';
  END IF;

  IF v_code = '' THEN
    RAISE EXCEPTION 'affiliate_code_required' USING ERRCODE = 'P0001';
  END IF;

  IF v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$' THEN
    RAISE EXCEPTION 'affiliate_code_invalid' USING ERRCODE = 'P0001';
  END IF;

  IF p_commission_rate IS NULL OR p_commission_rate < 0 OR p_commission_rate > 1 THEN
    RAISE EXCEPTION 'commission_rate_invalid' USING ERRCODE = 'P0001';
  END IF;

  IF v_reason = '' THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_typeof(v_metadata) <> 'object' THEN
    RAISE EXCEPTION 'metadata_invalid' USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_legacy_partner
  FROM public.partners
  WHERE id = p_legacy_partner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'legacy_partner_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_legacy_partner.status::text <> 'approved' THEN
    RAISE EXCEPTION 'legacy_partner_not_approved' USING ERRCODE = 'P0001';
  END IF;

  IF lower(coalesce(v_legacy_partner.notes, '')) NOT LIKE '%influencer%' THEN
    RAISE EXCEPTION 'legacy_partner_not_influencer' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.affiliate_legacy_partner_links
    WHERE legacy_partner_id = p_legacy_partner_id
  ) THEN
    RAISE EXCEPTION 'legacy_partner_already_bridged' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.affiliate_codes
    WHERE code = v_code
  ) THEN
    RAISE EXCEPTION 'affiliate_code_already_exists' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.affiliate_partners (
    auth_user_id,
    display_name,
    legal_name,
    contact_email,
    affiliate_type,
    status,
    contract_starts_at,
    notes,
    created_by
  )
  VALUES (
    v_legacy_partner.auth_user_id,
    v_legacy_partner.name,
    NULLIF(trim(coalesce(v_legacy_partner.company_name, '')), ''),
    NULLIF(trim(coalesce(v_legacy_partner.contact_email, '')), ''),
    'influencer',
    'active',
    v_contract_starts_at,
    'Bridged from legacy public.partners.id=' || v_legacy_partner.id::text,
    v_actor_user_id
  )
  RETURNING id INTO v_affiliate_partner_id;

  BEGIN
    INSERT INTO public.affiliate_codes (
      affiliate_partner_id,
      code,
      status,
      created_by
    )
    VALUES (
      v_affiliate_partner_id,
      v_code,
      'active',
      v_actor_user_id
    )
    RETURNING id INTO v_affiliate_code_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'affiliate_code_already_exists' USING ERRCODE = 'P0001';
  END;

  INSERT INTO public.affiliate_commission_rate_history (
    affiliate_partner_id,
    commission_rate,
    valid_from,
    valid_to,
    created_by,
    reason
  )
  VALUES (
    v_affiliate_partner_id,
    p_commission_rate,
    v_contract_starts_at,
    NULL,
    v_actor_user_id,
    v_reason
  )
  RETURNING id INTO v_rate_history_id;

  BEGIN
    INSERT INTO public.affiliate_legacy_partner_links (
      legacy_partner_id,
      affiliate_partner_id,
      created_by,
      reason,
      metadata
    )
    VALUES (
      p_legacy_partner_id,
      v_affiliate_partner_id,
      v_actor_user_id,
      v_reason,
      v_metadata
    )
    RETURNING id INTO v_link_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'legacy_partner_already_bridged' USING ERRCODE = 'P0001';
  END;

  INSERT INTO public.affiliate_audit_logs (
    actor_user_id,
    action,
    entity_table,
    entity_id,
    old_data,
    new_data,
    reason,
    metadata
  )
  VALUES (
    v_actor_user_id,
    'legacy_influencer_partner_bridged',
    'affiliate_legacy_partner_links',
    v_link_id,
    NULL,
    jsonb_build_object(
      'legacy_partner_id', v_legacy_partner.id,
      'legacy_partner_status', v_legacy_partner.status::text,
      'affiliate_partner_id', v_affiliate_partner_id,
      'affiliate_partner_status', 'active',
      'affiliate_code_id', v_affiliate_code_id,
      'affiliate_code', v_code,
      'rate_history_id', v_rate_history_id,
      'commission_rate', p_commission_rate,
      'rate_valid_from', v_contract_starts_at
    ),
    v_reason,
    jsonb_build_object(
      'bridge_metadata', v_metadata,
      'uses_aff_parameter_only', true,
      'legacy_ref_flow_unchanged', true
    )
  );

  RETURN jsonb_build_object(
    'status', 'bridged',
    'legacy_partner_id', v_legacy_partner.id,
    'affiliate_partner_id', v_affiliate_partner_id,
    'affiliate_code_id', v_affiliate_code_id,
    'affiliate_code', v_code,
    'commission_rate', p_commission_rate,
    'contract_starts_at', v_contract_starts_at,
    'link_id', v_link_id
  );
END;
$$;

COMMENT ON FUNCTION public.admin_bridge_influencer_partner_to_affiliate(uuid, text, numeric, text, jsonb) IS
  'Admin-only bridge RPC. Creates a new active affiliate partner, active human affiliate code, current commission rate interval, and immutable link for an already approved legacy influencer partner. Does not update public.partners.';

REVOKE ALL ON FUNCTION public.admin_bridge_influencer_partner_to_affiliate(uuid, text, numeric, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_bridge_influencer_partner_to_affiliate(uuid, text, numeric, text, jsonb) TO authenticated;

CREATE OR REPLACE VIEW public.v_admin_influencer_affiliate_bridge_candidates
WITH (security_invoker = true)
AS
SELECT
  p.id AS legacy_partner_id,
  p.auth_user_id AS legacy_auth_user_id,
  p.name AS legacy_name,
  p.company_name AS legacy_company_name,
  p.contact_email AS legacy_contact_email,
  p.status::text AS legacy_status,
  p.notes AS legacy_notes,
  p.created_at AS legacy_created_at,
  p.approved_at AS legacy_approved_at,
  (lower(coalesce(p.notes, '')) LIKE '%influencer%') AS is_legacy_influencer,
  (p.status::text = 'approved') AS is_bridge_eligible,
  (l.id IS NOT NULL) AS is_bridged,
  l.id AS bridge_link_id,
  l.created_at AS bridged_at,
  l.created_by AS bridged_by,
  ap.id AS affiliate_partner_id,
  ap.display_name AS affiliate_display_name,
  ap.status AS affiliate_status,
  ac.code AS affiliate_code,
  ac.status AS affiliate_code_status
FROM public.partners p
LEFT JOIN public.affiliate_legacy_partner_links l
  ON l.legacy_partner_id = p.id
LEFT JOIN public.affiliate_partners ap
  ON ap.id = l.affiliate_partner_id
LEFT JOIN LATERAL (
  SELECT c.code, c.status
  FROM public.affiliate_codes c
  WHERE c.affiliate_partner_id = ap.id
  ORDER BY
    CASE WHEN c.status = 'active' THEN 0 ELSE 1 END,
    c.created_at ASC
  LIMIT 1
) ac ON true
WHERE lower(coalesce(p.notes, '')) LIKE '%influencer%';

COMMENT ON VIEW public.v_admin_influencer_affiliate_bridge_candidates IS
  'Read-only admin view of legacy influencer partners and their optional bridge into the new affiliate layer.';

GRANT SELECT ON public.v_admin_influencer_affiliate_bridge_candidates TO authenticated;
