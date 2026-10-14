-- ============================================================================
-- FÁZE 4 — Jednorázový bonus 15 MC pro nového zákazníka z partnerského odkazu
--
-- ⚠️ TENTO SOUBOR JE ZPĚTNÝ ZÁZNAM JIŽ APLIKOVANÉ PRODUKČNÍ MIGRACE.
--    Verze `20260903200954` (`partner_new_customer_bonus`) je na produkci
--    `xkzhjldrojjlrkezorey` aplikovaná od 03. 09. 2026. SQL níže je doslovný
--    přepis `supabase_migrations.schema_migrations.statements` pro tuto verzi
--    (read-only export, 05. 09. 2026) — nic se jím znovu nenasazuje.
--
-- Pravidlo (Pavel, 03. 09. 2026):
--   Zákazník, který přijde na `/register?p=KOD[&c=CONNECTION_ID]` z odkazu
--   partnerského e-shopu a TEPRVE POTOM si založí účet, dostane jednorázově
--   15 MioCoinů. Atribuce je trvalá a jeden uživatel může být připsán právě
--   jednomu partnerovi (`partner_customer_refs_user_unique`).
--
-- ZÁVAZNÉ INVARIANTY:
--   * O nároku rozhoduje POŘADÍ UDÁLOSTÍ, ne stáří účtu:
--     `auth.users.created_at` musí být PŘÍSNĚ POZDĚJŠÍ než `created_at` nonce
--     (`account_predates_intent`). Účet, který vznikl dřív a partnerský odkaz
--     otevřel až potom, nemá nárok — jakkoli nový je.
--   * Klient nikdy nedrží surový partnerský kód, jen NONCE vydaný funkcí
--     `record_pending_partner_attribution_intent` ještě před vznikem účtu.
--     Nonce má platnost 60 minut a je jednorázový (`consumed_at`).
--   * `partner_pending_attributions` je service-role only (žádný grant pro
--     `anon`/`authenticated`); zapisuje se výhradně přes SECURITY DEFINER RPC.
--   * `partner_customer_refs` má RLS: čte vlastní uživatel, vlastník partnera
--     (`partners.auth_user_id`), admin a superadmin. Zápis jen service_role
--     nebo SECURITY DEFINER RPC.
--   * Bonus je 15 MC natvrdo v `record_partner_customer_ref` (`v_bonus`) a
--     zapisuje se do `wallets.balance_coins` + auditní řádek
--     `wallet_transactions` typu `partner_new_customer_bonus`. Bonus se připíše
--     nejvýše jednou (`ON CONFLICT (user_id) DO NOTHING` + kontrola existence).
--   * Zcela oddělené od legacy referral (`PENDING_REFERRAL_STORAGE_KEY`) i od
--     affiliate atribuce — jiná tabulka, jiná RPC, jiný sessionStorage klíč.
--
-- ⚠️ STAV K 05. 09. 2026 — NASAZENO, ALE PRODUKTOVĚ NEAKTIVNÍ:
--   Produkce má 0 partnerů s vyplněným `public_ref_code`, 0 řádků
--   v `partner_pending_attributions` i `partner_customer_refs`. Odkaz
--   `/register?p=KOD` proto dnes nikdo nemůže reálně použít. Vydání kódů
--   partnerům je samostatný krok vyžadující schválení Pavla.
--
-- FRONTEND: `src/pages/Register.tsx` + `src/hooks/useApplyPendingPartnerRef.ts`
--   (konstanta `PENDING_PARTNER_ATTRIBUTION_STORAGE_KEY`) jsou už v `main`.
--
-- ROLLBACK: viz docs/rollback/phase4_partner_new_customer_bonus_rollback.sql
-- ============================================================================

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS public_ref_code text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_public_ref_code
  ON public.partners (public_ref_code)
  WHERE public_ref_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.partner_pending_attributions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id          uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  connection_id       uuid REFERENCES public.shoptet_connection_requests(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL DEFAULT (now() + interval '60 minutes'),
  consumed_at         timestamptz,
  consumed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.partner_pending_attributions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_partner_pending_attributions_expires_at
  ON public.partner_pending_attributions (expires_at);

REVOKE ALL ON public.partner_pending_attributions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.partner_pending_attributions TO service_role;

CREATE TABLE IF NOT EXISTS public.partner_customer_refs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id       uuid NOT NULL REFERENCES public.partners(id),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id    uuid REFERENCES public.shoptet_connection_requests(id) ON DELETE SET NULL,
  source           text NOT NULL DEFAULT 'partner_link',
  bonus_coins      numeric,
  bonus_granted_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_customer_refs_user_unique UNIQUE (user_id)
);

ALTER TABLE public.partner_customer_refs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_partner_customer_refs_partner_id
  ON public.partner_customer_refs (partner_id);

REVOKE ALL ON public.partner_customer_refs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.partner_customer_refs TO authenticated;
GRANT ALL ON public.partner_customer_refs TO service_role;

CREATE POLICY partner_customer_refs_select ON public.partner_customer_refs
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR partner_id IN (SELECT id FROM public.partners WHERE auth_user_id = auth.uid())
    OR public.is_admin()
    OR public.is_superadmin()
  );

CREATE OR REPLACE FUNCTION public.record_pending_partner_attribution_intent(
  p_ref_code text,
  p_connection_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_partner_id    uuid;
  v_connection_id uuid := NULL;
  v_nonce         uuid;
BEGIN
  IF p_ref_code IS NULL OR length(btrim(p_ref_code)) = 0 THEN
    RETURN jsonb_build_object('status', 'invalid_code');
  END IF;

  SELECT id INTO v_partner_id
  FROM public.partners
  WHERE public_ref_code = btrim(p_ref_code)
    AND status = 'approved'
  LIMIT 1;

  IF v_partner_id IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_code');
  END IF;

  IF p_connection_id IS NOT NULL THEN
    SELECT id INTO v_connection_id
    FROM public.shoptet_connection_requests
    WHERE id = p_connection_id
      AND partner_id = v_partner_id
      AND status IN ('approved', 'active')
    LIMIT 1;
  END IF;

  INSERT INTO public.partner_pending_attributions (partner_id, connection_id)
  VALUES (v_partner_id, v_connection_id)
  RETURNING id INTO v_nonce;

  RETURN jsonb_build_object('status', 'ok', 'nonce', v_nonce);
END;
$$;

REVOKE ALL ON FUNCTION public.record_pending_partner_attribution_intent(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_pending_partner_attribution_intent(text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_partner_customer_ref(p_nonce uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid                 uuid := auth.uid();
  v_pending             public.partner_pending_attributions%ROWTYPE;
  v_account_created_at  timestamptz;
  v_bonus               numeric := 15;
  v_wallet_id           uuid;
  v_balance             numeric;
  v_row_id              uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthenticated');
  END IF;
  IF p_nonce IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_or_expired_intent');
  END IF;

  SELECT * INTO v_pending
  FROM public.partner_pending_attributions
  WHERE id = p_nonce
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid_or_expired_intent');
  END IF;

  IF v_pending.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'invalid_or_expired_intent');
  END IF;

  IF v_pending.expires_at < now() THEN
    RETURN jsonb_build_object('status', 'invalid_or_expired_intent');
  END IF;

  SELECT created_at INTO v_account_created_at FROM auth.users WHERE id = v_uid;

  IF v_account_created_at IS NULL OR v_account_created_at <= v_pending.created_at THEN
    RETURN jsonb_build_object('status', 'account_predates_intent');
  END IF;

  IF EXISTS (SELECT 1 FROM public.partner_customer_refs WHERE user_id = v_uid) THEN
    UPDATE public.partner_pending_attributions
       SET consumed_at = now(), consumed_by_user_id = v_uid
     WHERE id = p_nonce;
    RETURN jsonb_build_object('status', 'already_attributed');
  END IF;

  UPDATE public.partner_pending_attributions
     SET consumed_at = now(), consumed_by_user_id = v_uid
   WHERE id = p_nonce;

  INSERT INTO public.partner_customer_refs (partner_id, user_id, connection_id, source)
  VALUES (v_pending.partner_id, v_uid, v_pending.connection_id, 'partner_link')
  ON CONFLICT (user_id) DO NOTHING
  RETURNING id INTO v_row_id;

  IF v_row_id IS NULL THEN
    RETURN jsonb_build_object('status', 'already_attributed');
  END IF;

  PERFORM public.ensure_wallet_exists(v_uid);

  UPDATE public.wallets
     SET balance_coins = balance_coins + v_bonus
   WHERE user_id = v_uid
  RETURNING id, balance_coins INTO v_wallet_id, v_balance;

  INSERT INTO public.wallet_transactions
    (user_id, wallet_id, amount, balance_after, type, source, metadata)
  VALUES (
    v_uid, v_wallet_id, v_bonus, v_balance,
    'partner_new_customer_bonus', 'record_partner_customer_ref',
    jsonb_build_object('partner_id', v_pending.partner_id, 'connection_id', v_pending.connection_id)
  );

  UPDATE public.partner_customer_refs
     SET bonus_coins = v_bonus, bonus_granted_at = now()
   WHERE id = v_row_id;

  RETURN jsonb_build_object(
    'status', 'recorded',
    'partner_id', v_pending.partner_id,
    'bonus_coins', v_bonus
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_partner_customer_ref(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_partner_customer_ref(uuid) TO authenticated;
