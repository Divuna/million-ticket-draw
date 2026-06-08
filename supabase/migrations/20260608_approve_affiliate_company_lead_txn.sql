-- ============================================================================
-- OneMil B2B company leads — Phase 2D Block 1: admin approval RPC
-- ============================================================================
-- Two new SECURITY DEFINER functions for the admin approval / rejection of
-- company leads that have been confirmed by the company (status =
-- 'pending_admin_approval').
--
-- Isolation guarantees:
--   - No change to customer accounts, payments, tickets, contests, wallet,
--     buy_ticket_atomic, or commission logic.
--   - Does NOT modify existing record_affiliate_company_ref(text, uuid) —
--     that function's signature and behaviour are unchanged (risk of regress).
--   - New internal helper record_affiliate_company_ref_by_id is called ONLY
--     from approve_affiliate_company_lead_txn.
--   - Commissions are NEVER created here; they arise only from paid/invoiced
--     company activity (partner_invoices → affiliate_commissions).
--
-- Both functions:
--   - SECURITY DEFINER, SET search_path = '' (all refs schema-qualified)
--   - Return a safe jsonb result object (no raw errors leaked)
--   - Idempotent: CREATE OR REPLACE
--
-- Status transitions handled:
--   pending_admin_approval → approved       (p_action = 'approve')
--   pending_admin_approval → admin_rejected  (p_action = 'reject')
-- Any other source status returns { "status": "conflict" } (caller → HTTP 409).
--
-- Production application requires explicit approval from Pavel + postcheck.
-- Staging-only until that approval is given.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) record_affiliate_company_ref_by_id
--    Internal helper: writes attribution by affiliate UUID, not by ref_code.
--    Called exclusively from approve_affiliate_company_lead_txn.
--    Does NOT call is_admin() — privilege is inherited from the calling
--    SECURITY DEFINER context; never expose this function to end users.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_affiliate_company_ref_by_id(
  p_affiliate_id  uuid,
  p_partner_id    uuid,
  p_source        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_aff_exists  boolean;
  v_par_exists  boolean;
  v_existing    uuid;
BEGIN
  -- Basic NULL guard
  IF p_affiliate_id IS NULL OR p_partner_id IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_args');
  END IF;

  -- Verify affiliate account exists
  SELECT EXISTS (
    SELECT 1 FROM public.affiliate_accounts WHERE id = p_affiliate_id
  ) INTO v_aff_exists;
  IF NOT v_aff_exists THEN
    RETURN jsonb_build_object('status', 'invalid_affiliate');
  END IF;

  -- Verify partner exists
  SELECT EXISTS (
    SELECT 1 FROM public.partners WHERE id = p_partner_id
  ) INTO v_par_exists;
  IF NOT v_par_exists THEN
    RETURN jsonb_build_object('status', 'invalid_partner');
  END IF;

  -- First-touch: if this company already has attribution, keep it.
  SELECT affiliate_id INTO v_existing
  FROM public.affiliate_company_refs
  WHERE partner_id = p_partner_id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_attributed', 'affiliate_id', v_existing);
  END IF;

  -- Write attribution
  INSERT INTO public.affiliate_company_refs (affiliate_id, partner_id, source)
  VALUES (p_affiliate_id, p_partner_id, p_source)
  ON CONFLICT (partner_id) DO NOTHING;

  -- Mirror onto partners only when currently null (first-touch, no overwrite)
  UPDATE public.partners
  SET referred_by_affiliate_id = p_affiliate_id
  WHERE id = p_partner_id
    AND referred_by_affiliate_id IS NULL;

  RETURN jsonb_build_object('status', 'recorded', 'affiliate_id', p_affiliate_id);
END;
$$;

-- Restrict: only internal callers (SECURITY DEFINER context); not for end users
REVOKE ALL ON FUNCTION public.record_affiliate_company_ref_by_id(uuid, uuid, text) FROM PUBLIC;
-- No GRANT to authenticated — this function is internal only, called from
-- approve_affiliate_company_lead_txn which is itself SECURITY DEFINER.


-- ---------------------------------------------------------------------------
-- 2) approve_affiliate_company_lead_txn
--    Atomic DB portion of the admin approve / reject flow.
--    The Edge Function (approve-affiliate-company-lead) performs:
--      - Admin JWT validation (before calling this RPC)
--      - auth.admin.createUser (before calling with action='approve')
--      - auth.admin.generateLink (after this RPC returns for action='approve')
--      - email_queue INSERT (best-effort after generateLink)
--    This RPC handles only the DB part in one transaction.
--
--    Parameters:
--      p_lead_id          — UUID of the affiliate_company_leads row
--      p_admin_user_id    — auth.users.id of the calling admin (for audit cols)
--      p_partner_auth_id  — auth.users.id of the newly created company account
--                           (NULL for reject — no company account is created)
--      p_action           — 'approve' | 'reject'
--      p_rejection_reason — optional text (trimmed, max 1 000 chars), reject only
--
--    Return value (jsonb):
--      { "status": "approved",       "partner_id": "<uuid>", "attribution_written": bool }
--      { "status": "admin_rejected"                                                       }
--      { "status": "conflict"   }  — lead not in pending_admin_approval (caller → 409)
--      { "status": "error",     "detail": "<message>" }
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_affiliate_company_lead_txn(
  p_lead_id           uuid,
  p_admin_user_id     uuid,
  p_partner_auth_id   uuid,       -- NULL for reject
  p_action            text,       -- 'approve' | 'reject'
  p_rejection_reason  text        -- nullable
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lead            public.affiliate_company_leads%ROWTYPE;
  v_partner_id      uuid;
  v_now             timestamptz := now();
  v_reason          text;
  v_attr_result     jsonb;
  v_attr_written    boolean := false;
BEGIN
  -- ── Input validation ──────────────────────────────────────────────────────
  IF p_lead_id IS NULL OR p_admin_user_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'detail', 'missing_required_args');
  END IF;

  IF p_action NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object('status', 'error', 'detail', 'invalid_action');
  END IF;

  IF p_action = 'approve' AND p_partner_auth_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'detail', 'partner_auth_id_required_for_approve');
  END IF;

  -- ── Verify caller is admin (defence-in-depth; EF also checks before calling) ─
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_admin_user_id
      AND role = ANY (ARRAY['admin'::public.app_role, 'superadmin'::public.app_role])
  ) THEN
    RETURN jsonb_build_object('status', 'error', 'detail', 'caller_not_admin');
  END IF;

  -- ── Lock the lead row and verify status guard ─────────────────────────────
  SELECT * INTO v_lead
  FROM public.affiliate_company_leads
  WHERE id = p_lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'conflict', 'detail', 'lead_not_found');
  END IF;

  IF v_lead.status <> 'pending_admin_approval' THEN
    RETURN jsonb_build_object(
      'status', 'conflict',
      'detail', 'wrong_status',
      'current_status', v_lead.status
    );
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- APPROVE path
  -- ══════════════════════════════════════════════════════════════════════════
  IF p_action = 'approve' THEN

    -- ── Create or reuse partner record ──────────────────────────────────────
    -- Idempotency: if a partner already exists for this auth_user_id (e.g. a
    -- previous partial attempt), reuse it rather than failing.
    SELECT id INTO v_partner_id
    FROM public.partners
    WHERE auth_user_id = p_partner_auth_id
    LIMIT 1;

    IF v_partner_id IS NULL THEN
      INSERT INTO public.partners (
        auth_user_id,
        name,
        company_name,
        website_url,
        logo_url,
        contact_email,
        contact_phone,
        ico,
        dic,
        status,
        approved_at
      ) VALUES (
        p_partner_auth_id,
        COALESCE(NULLIF(btrim(v_lead.company_name), ''), 'Partner'),
        NULLIF(btrim(v_lead.company_name), ''),
        COALESCE(NULLIF(btrim(v_lead.website), ''), 'https://onemil.cz'),
        'https://placehold.co/200x200/1a1a2e/gold?text=Logo',
        v_lead.company_email,
        NULLIF(btrim(COALESCE(v_lead.contact_phone, '')), ''),
        NULLIF(btrim(COALESCE(v_lead.ico, '')), ''),
        NULLIF(btrim(COALESCE(v_lead.dic, '')), ''),
        'approved',
        v_now
      )
      RETURNING id INTO v_partner_id;
    END IF;

    -- ── Update lead ──────────────────────────────────────────────────────────
    UPDATE public.affiliate_company_leads
    SET
      status            = 'approved',
      partner_id        = v_partner_id,
      approved_at       = v_now,
      admin_reviewed_by = p_admin_user_id,
      admin_reviewed_at = v_now
    WHERE id = p_lead_id;

    -- ── Write attribution (best-effort — never fail approve on this step) ────
    -- Only when lead.affiliate_id is NOT NULL. If the sales rep account was
    -- deleted (ON DELETE SET NULL), we simply skip attribution.
    IF v_lead.affiliate_id IS NOT NULL THEN
      BEGIN
        v_attr_result := public.record_affiliate_company_ref_by_id(
          v_lead.affiliate_id,
          v_partner_id,
          'company_lead'
        );
        v_attr_written := (v_attr_result->>'status' = 'recorded');
      EXCEPTION WHEN OTHERS THEN
        -- Attribution failure must never rollback the approve.
        -- Log is best-effort; the EF should log this separately.
        v_attr_written := false;
      END;
    END IF;

    RETURN jsonb_build_object(
      'status',              'approved',
      'partner_id',          v_partner_id,
      'attribution_written', v_attr_written
    );

  END IF; -- END approve

  -- ══════════════════════════════════════════════════════════════════════════
  -- REJECT path
  -- ══════════════════════════════════════════════════════════════════════════

  -- Sanitise rejection reason: trim, cap at 1 000 chars, NULL if blank
  v_reason := NULLIF(btrim(COALESCE(p_rejection_reason, '')), '');
  IF v_reason IS NOT NULL THEN
    v_reason := left(v_reason, 1000);
  END IF;

  UPDATE public.affiliate_company_leads
  SET
    status                = 'admin_rejected',
    admin_rejection_reason = v_reason,
    admin_reviewed_by     = p_admin_user_id,
    admin_reviewed_at     = v_now
  WHERE id = p_lead_id;

  RETURN jsonb_build_object('status', 'admin_rejected');

END;
$$;

-- Only authenticated users can call this RPC; the EF further enforces admin role
REVOKE ALL ON FUNCTION public.approve_affiliate_company_lead_txn(uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_affiliate_company_lead_txn(uuid, uuid, uuid, text, text) TO authenticated;


-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON FUNCTION public.record_affiliate_company_ref_by_id(uuid, uuid, text) IS
  'Internal helper: write company attribution by affiliate UUID. '
  'Called exclusively from approve_affiliate_company_lead_txn. '
  'Not exposed to end users. Phase 2D, 2026-06-08.';

COMMENT ON FUNCTION public.approve_affiliate_company_lead_txn(uuid, uuid, uuid, text, text) IS
  'Atomic DB portion of admin approve/reject for B2B company leads. '
  'Caller (Edge Function approve-affiliate-company-lead) handles auth.admin.createUser, '
  'generateLink, and email_queue before/after this RPC. '
  'Returns jsonb {status, partner_id?, attribution_written?}. '
  'Status conflict → HTTP 409. Phase 2D, 2026-06-08.';
