-- Customer MioCoin reward e-mail: correct Czech spelling.
--
-- Cause: the e-mail body inside update_partner_order_reward_status was authored
-- WITHOUT Czech diacritics ("Mate pripravene MioCoiny", "Dobry den", "dekujeme
-- za nakup"...). This is not an Outlook problem and not a charset problem on the
-- recipient's side -- the source string itself is missing the accents, so every
-- customer that ever received it read stripped Czech.
--
-- This migration ONLY replaces the human-readable strings. Deliberately unchanged:
--   * the MioCoin amount (still public.format_miocoin_cz(v_row.coins))
--   * the paid / delivered / completed and cancelled / returned / unpaid /
--     not_picked_up branches -- the trigger logic is byte-identical
--   * idempotency: the customer_email_enqueued_at guard, the pending -> issued
--     transition and the already_redeemed / not_activatable early returns
--   * the redeem URL and the voucher code itself
--   * the HTML structure, the OneMil logo block and every inline style
--   * the function signature, SECURITY DEFINER, search_path and the ACL
--
-- No historical e-mail is rewritten: rows already in public.email_queue keep the
-- body they were generated with. Only newly enqueued e-mails get the fixed text.
--
-- Supersedes the wording introduced by 20260629160000 and carried forward by
-- 20260818100200. Those migrations are left untouched on purpose -- they are
-- already applied and history must not be rewritten.

begin;

CREATE OR REPLACE FUNCTION public.update_partner_order_reward_status(
  p_partner_id        uuid,
  p_external_order_id text,
  p_order_status      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order_id text := nullif(trim(coalesce(p_external_order_id, '')), '');
  v_order_status text := lower(replace(trim(coalesce(p_order_status, '')), '-', '_'));
  v_row public.partner_reward_codes%rowtype;
  v_new_status public.partner_code_status;
  v_metadata jsonb;
  v_was_pending boolean := false;
  v_delivery text;
  v_partner_name text;
  v_email_enqueued boolean := false;
  v_redeem_url text;
  v_email_body text;
BEGIN
  IF p_partner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_partner_id');
  END IF;

  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_external_order_id');
  END IF;

  IF v_order_status IS NULL OR v_order_status = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_order_status');
  END IF;

  SELECT * INTO v_row
  FROM public.partner_reward_codes
  WHERE partner_id = p_partner_id
    AND external_order_id = v_order_id
    AND metadata->>'source' = 'partner_order_api'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'reward_not_found');
  END IF;

  SELECT shoptet_customer_delivery, name
    INTO v_delivery, v_partner_name
  FROM public.partners
  WHERE id = p_partner_id;

  v_metadata := coalesce(v_row.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'order_status', v_order_status,
      'order_status_updated_at', now()
    );

  IF v_order_status IN ('paid', 'delivered', 'completed') THEN
    IF v_row.status = 'activated' THEN
      RETURN jsonb_build_object(
        'success', true,
        'code', v_row.code,
        'coins', v_row.coins,
        'status', 'activated',
        'external_order_id', v_row.external_order_id,
        'already_redeemed', true
      );
    END IF;

    IF v_row.status IN ('cancelled', 'expired') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'reward_not_activatable',
        'code', v_row.code,
        'status', v_row.status
      );
    END IF;

    v_was_pending := (v_row.status = 'pending');
    v_new_status := 'issued';

    IF v_was_pending
       AND v_delivery = 'onemil'
       AND (v_metadata->>'customer_email_enqueued_at') IS NULL
       AND v_row.customer_email IS NOT NULL THEN

      v_redeem_url := 'https://onemil.cz/profile?miocoin_code=' || v_row.code;

      v_email_body := format($html$<!DOCTYPE html>
<html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1d2128;">
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#0A0B0F;padding:24px 32px;"><span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">One<span style="color:#FF8A00;">Mil</span></span></td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 16px;font-size:22px;color:#1d2128;">Máte připravené MioCoiny</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a3f47;">Dobrý den,</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a3f47;">děkujeme za nákup u <strong>%1$s</strong>. Získali jste <strong>%2$s</strong>, které můžete uplatnit ve své peněžence OneMil.</p>
<div style="margin:24px 0;padding:20px;background:#fff7ed;border:1px solid #FF8A00;border-radius:10px;text-align:center;">
<div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#8E98A6;margin-bottom:8px;">Váš MioCoin kód</div>
<div style="font-size:26px;font-weight:700;letter-spacing:3px;color:#0A0B0F;font-family:'Courier New',monospace;">%3$s</div></div>
<div style="text-align:center;margin:28px 0;"><a href="%4$s" style="display:inline-block;background:#FF8A00;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;">Uplatnit MioCoiny</a></div>
<p style="margin:0;font-size:13px;line-height:1.6;color:#8E98A6;">Kód uplatníte po přihlášení v sekci Profil &rarr; Peněženka. Pokud tlačítko nefunguje, použijte odkaz:<br><a href="%4$s" style="color:#FF8A00;word-break:break-all;">%4$s</a></p>
</td></tr>
<tr><td style="background:#f4f5f7;padding:20px 32px;text-align:center;"><p style="margin:0;font-size:12px;color:#8E98A6;">MioCoiny jsou interní kredit OneMil a lze je použít pouze v rámci platformy OneMil.<br>&copy; OneMil - Luxusní soutěže. Skutečné výhry.</p></td></tr>
</table></td></tr></table></body></html>$html$,
        coalesce(v_partner_name, 'partnera OneMil'),
        public.format_miocoin_cz(v_row.coins),
        v_row.code,
        v_redeem_url
      );

      INSERT INTO public.email_queue (email, subject, body, status)
      VALUES (
        v_row.customer_email::text,
        'Máte připravené MioCoiny od OneMil',
        v_email_body,
        'pending'
      );

      v_email_enqueued := true;
      v_metadata := v_metadata || jsonb_build_object('customer_email_enqueued_at', now());
    END IF;

    UPDATE public.partner_reward_codes
    SET status = v_new_status,
        metadata = v_metadata
    WHERE code = v_row.code
    RETURNING * INTO v_row;

  ELSIF v_order_status IN ('cancelled', 'returned', 'unpaid', 'not_picked_up') THEN
    IF v_row.status = 'activated' THEN
      RETURN jsonb_build_object(
        'success', true,
        'code', v_row.code,
        'coins', v_row.coins,
        'status', 'activated',
        'external_order_id', v_row.external_order_id,
        'already_redeemed', true,
        'not_cancelled_reason', 'already_redeemed'
      );
    END IF;

    IF v_row.status = 'cancelled' THEN
      UPDATE public.partner_reward_codes
      SET metadata = v_metadata
      WHERE code = v_row.code
      RETURNING * INTO v_row;
    ELSE
      UPDATE public.partner_reward_codes
      SET status = 'cancelled',
          cancelled_at = coalesce(cancelled_at, now()),
          metadata = v_metadata
      WHERE code = v_row.code
      RETURNING * INTO v_row;
    END IF;

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'unsupported_order_status');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'code', v_row.code,
    'coins', v_row.coins,
    'status', v_row.status,
    'external_order_id', v_row.external_order_id,
    'customer_email', v_row.customer_email,
    'newly_issued', v_was_pending AND v_row.status = 'issued',
    'email_enqueued', v_email_enqueued
  );
END;
$$;

-- Unchanged ACL, re-asserted so a rebuilt database ends up in the same state.
REVOKE ALL ON FUNCTION public.update_partner_order_reward_status(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_partner_order_reward_status(uuid, text, text) TO service_role;

commit;
