-- OneMil: one shared MIO campaign code, redeemable once per verified player.
-- NOT for production execution without Pavel's explicit approval.
-- Does not change partner/referral attribution, Stripe or contest ticket rules.
-- The wallet lot source is added explicitly so promo credits remain auditable.
ALTER TABLE public.wallet_lots
  DROP CONSTRAINT wallet_lots_source_check;
ALTER TABLE public.wallet_lots
  ADD CONSTRAINT wallet_lots_source_check CHECK (source = ANY (ARRAY[
    'payment_paid','payment_bonus','payment_legacy','partner_code',
    'partner_new_customer_bonus','winner_bonus','winner_bonus_transfer',
    'legacy_opening','direct_balance_change','refund_restore_legacy',
    'referral_reward','referral_first_topup_bonus','referral_shortfall_release',
    'promo_campaign'
  ]::text[]));

CREATE TABLE public.promo_mio_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9-]{5,32}$'),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  mio_amount integer NOT NULL CHECK (mio_amount BETWEEN 1 AND 10000),
  max_redemptions integer CHECK (max_redemptions BETWEEN 1 AND 1000000),
  redeemed_count integer NOT NULL DEFAULT 0 CHECK (redeemed_count >= 0),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  existing_users_allowed boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promo_mio_campaign_dates CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT promo_mio_campaign_limit CHECK (max_redemptions IS NULL OR redeemed_count <= max_redemptions)
);

CREATE TABLE public.promo_mio_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.promo_mio_campaigns(id),
  user_id uuid NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, user_id)
);
CREATE INDEX promo_mio_redemptions_user_idx ON public.promo_mio_redemptions (user_id, created_at DESC);

-- Never expose the underlying tables directly; every access goes through a
-- checked SECURITY DEFINER function. No DELETE/UPDATE route for redemptions.
ALTER TABLE public.promo_mio_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_mio_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.promo_mio_campaigns, public.promo_mio_redemptions FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.admin_create_promo_mio_campaign(
  p_code text, p_title text, p_mio_amount integer,
  p_max_redemptions integer DEFAULT NULL,
  p_valid_from timestamptz DEFAULT NULL,
  p_valid_until timestamptz DEFAULT NULL,
  p_existing_users_allowed boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_code text := upper(trim(coalesce(p_code, '')));
  v_title text := trim(coalesce(p_title, ''));
  v_start timestamptz := coalesce(p_valid_from, now());
  v_id uuid;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;
  IF v_code !~ '^[A-Z0-9-]{5,32}$' OR length(v_title) NOT BETWEEN 1 AND 120
    OR p_mio_amount IS NULL OR p_mio_amount NOT BETWEEN 1 AND 10000
    OR (p_max_redemptions IS NOT NULL AND p_max_redemptions NOT BETWEEN 1 AND 1000000)
    OR (p_valid_until IS NOT NULL AND p_valid_until <= v_start) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_fields');
  END IF;
  -- Keep existing per-order reward codes authoritative, never share their keys.
  IF EXISTS (SELECT 1 FROM public.partner_reward_codes WHERE upper(code) = v_code) THEN
    RETURN jsonb_build_object('success', false, 'error', 'code_in_use');
  END IF;
  INSERT INTO public.promo_mio_campaigns
    (code, title, mio_amount, max_redemptions, valid_from, valid_until,
     existing_users_allowed, created_by)
  VALUES
    (v_code, v_title, p_mio_amount, p_max_redemptions, v_start,
     p_valid_until, coalesce(p_existing_users_allowed, true), auth.uid())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'id', v_id, 'code', v_code);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'code_in_use');
END;
$$;

CREATE FUNCTION public.admin_list_promo_mio_campaigns()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;
  RETURN jsonb_build_object(
    'success', true,
    'campaigns', coalesce((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC)
      FROM public.promo_mio_campaigns AS c
    ), '[]'::jsonb)
  );
END;
$$;

CREATE FUNCTION public.admin_set_promo_mio_campaign_active(p_id uuid, p_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;
  UPDATE public.promo_mio_campaigns SET active = coalesce(p_active, false)
  WHERE id = p_id
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE FUNCTION public.redeem_promo_mio_campaign(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_campaign public.promo_mio_campaigns%rowtype;
  v_created_at timestamptz;
  v_confirmed timestamptz;
  v_credit jsonb;
  v_redemption_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_logged_in');
  END IF;
  IF v_code = '' OR length(v_code) > 32 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;
  SELECT * INTO v_campaign FROM public.promo_mio_campaigns
   WHERE code = v_code FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;
  SELECT u.created_at, u.email_confirmed_at INTO v_created_at, v_confirmed
    FROM auth.users u WHERE u.id = v_uid;
  IF v_confirmed IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'email_not_verified');
  END IF;
  IF EXISTS (SELECT 1 FROM public.partners p WHERE p.auth_user_id = v_uid)
     OR EXISTS (SELECT 1 FROM public.affiliate_accounts a WHERE a.auth_user_id = v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_eligible');
  END IF;
  IF EXISTS (SELECT 1 FROM public.promo_mio_redemptions r
             WHERE r.campaign_id = v_campaign.id AND r.user_id = v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_claimed');
  END IF;
  IF NOT v_campaign.active THEN
    RETURN jsonb_build_object('success', false, 'error', 'inactive');
  END IF;
  IF now() < v_campaign.valid_from THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_started');
  END IF;
  IF v_campaign.valid_until IS NOT NULL AND now() >= v_campaign.valid_until THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  END IF;
  IF NOT v_campaign.existing_users_allowed AND v_created_at < v_campaign.valid_from THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_eligible');
  END IF;
  IF v_campaign.max_redemptions IS NOT NULL
     AND v_campaign.redeemed_count >= v_campaign.max_redemptions THEN
    RETURN jsonb_build_object('success', false, 'error', 'limit_reached');
  END IF;

  -- Insert claim and wallet credit in ONE transaction. An error anywhere
  -- rolls everything back; campaign row lock serializes concurrent claims.
  INSERT INTO public.promo_mio_redemptions (campaign_id, user_id, amount)
  VALUES (v_campaign.id, v_uid, v_campaign.mio_amount)
  RETURNING id INTO v_redemption_id;

  v_credit := public.wallet_credit_lot(
    v_uid, v_campaign.mio_amount, 'promo_campaign', v_campaign.id, v_campaign.code,
    null, null, 0, v_campaign.mio_amount, null, 'promo_mio_code',
    jsonb_build_object('promo_campaign_id', v_campaign.id, 'redemption_id', v_redemption_id)
  );
  INSERT INTO public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
  ) VALUES (
    v_uid, (v_credit->>'wallet_id')::uuid,
    v_campaign.mio_amount, (v_credit->>'new_balance')::numeric,
    'promo_mio_credit', 'redeem_promo_mio_campaign', v_campaign.id,
    jsonb_build_object('promo_campaign_id', v_campaign.id, 'redemption_id', v_redemption_id,
                       'lot_id', v_credit->>'lot_id')
  );
  UPDATE public.promo_mio_campaigns
  SET redeemed_count = redeemed_count + 1 WHERE id = v_campaign.id;

  RETURN jsonb_build_object('success', true, 'coins', v_campaign.mio_amount,
                            'new_balance', (v_credit->>'new_balance')::numeric);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_promo_mio_campaign(text,text,integer,integer,timestamptz,timestamptz,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_promo_mio_campaigns() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_promo_mio_campaign_active(uuid,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.redeem_promo_mio_campaign(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_promo_mio_campaign(text,text,integer,integer,timestamptz,timestamptz,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_promo_mio_campaigns() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_promo_mio_campaign_active(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_promo_mio_campaign(text) TO authenticated;
