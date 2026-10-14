BEGIN;

-- Fix PR #318: response links must be part of the immutable snapshot at INSERT
-- time. The original AFTER INSERT trigger tried to UPDATE an already protected
-- snapshot and therefore correctly failed closed.
ALTER TABLE public.sales_lead_email_batch_items
  ADD COLUMN IF NOT EXISTS response_token_hash text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_lead_email_batch_items_response_token_hash_check'
      AND conrelid = 'public.sales_lead_email_batch_items'::regclass
  ) THEN
    ALTER TABLE public.sales_lead_email_batch_items
      ADD CONSTRAINT sales_lead_email_batch_items_response_token_hash_check
      CHECK (
        response_token_hash IS NULL
        OR response_token_hash ~ '^[0-9a-f]{64}$'
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_lead_email_batch_items_response_token_hash
  ON public.sales_lead_email_batch_items (response_token_hash)
  WHERE response_token_hash IS NOT NULL;

DROP TRIGGER IF EXISTS trg_sales_lead_email_attach_response_links
  ON public.sales_lead_email_batch_items;
DROP FUNCTION IF EXISTS public.sales_lead_email_attach_response_links();

CREATE OR REPLACE FUNCTION public.sales_lead_email_prepare_response_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token text;
  v_token_hash text;
  v_edge_base text;
  v_response_url text;
  v_interest_url text;
  v_decline_url text;
  v_html_interest_url text;
  v_html_decline_url text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT btrim(decrypted_secret)
  INTO v_edge_base
  FROM vault.decrypted_secrets
  WHERE name = 'edge_functions_url'
  LIMIT 1;

  IF nullif(v_edge_base, '') IS NULL THEN
    RAISE EXCEPTION 'sales_lead_response_url_not_configured';
  END IF;

  v_edge_base := regexp_replace(v_edge_base, '/+$', '', 'g');
  IF v_edge_base !~* '^https://[a-z0-9-]+\.supabase\.co(/functions/v1)?$' THEN
    RAISE EXCEPTION 'sales_lead_response_url_invalid';
  END IF;
  IF v_edge_base !~* '/functions/v1$' THEN
    v_edge_base := v_edge_base || '/functions/v1';
  END IF;
  v_response_url := v_edge_base || '/sales-lead-response';

  LOOP
    v_token :=
      replace(gen_random_uuid()::text, '-', '')
      || replace(gen_random_uuid()::text, '-', '');
    v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.sales_lead_email_batch_items i
      WHERE i.response_token_hash = v_token_hash
    ) AND NOT EXISTS (
      SELECT 1
      FROM public.sales_lead_email_response_tokens r
      WHERE r.token_hash = v_token_hash
    );
  END LOOP;

  v_interest_url := v_response_url || '?token=' || v_token || '&action=interest';
  v_decline_url := v_response_url || '?token=' || v_token || '&action=decline';
  v_html_interest_url := replace(v_interest_url, '&', '&amp;');
  v_html_decline_url := replace(v_decline_url, '&', '&amp;');

  NEW.response_token_hash := v_token_hash;
  NEW.body_source_snapshot := NEW.body_source_snapshot
    || E'\n\n**Vyberte prosím:**'
    || E'\n\n[Mám zájem](' || v_interest_url || ')'
    || E'\n\n[Nemám zájem](' || v_decline_url || ')';
  NEW.body_text_snapshot := NEW.body_text_snapshot
    || E'\n\nMám zájem: ' || v_interest_url
    || E'\nNemám zájem: ' || v_decline_url;
  NEW.body_html_snapshot := NEW.body_html_snapshot
    || '<div style="margin-top:24px;padding-top:20px;border-top:1px solid #eee7dc;font-family:Arial,sans-serif">'
    || '<div style="margin:0 0 12px 0;font-size:14px;color:#4b5563">Vyberte prosím:</div>'
    || '<a href="' || v_html_interest_url || '" style="display:inline-block;margin:0 10px 10px 0;padding:12px 20px;border-radius:10px;background:#f97316;color:#ffffff;text-decoration:none;font-weight:700">Mám zájem</a>'
    || '<a href="' || v_html_decline_url || '" style="display:inline-block;margin:0 0 10px 0;padding:11px 18px;border-radius:10px;border:1px solid #d6d3d1;background:#ffffff;color:#57534e;text-decoration:none;font-weight:600">Nemám zájem</a>'
    || '</div>';

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_email_prepare_response_links()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_prepare_response_links()
  TO service_role;

CREATE TRIGGER trg_sales_lead_email_prepare_response_links
BEFORE INSERT ON public.sales_lead_email_batch_items
FOR EACH ROW
EXECUTE FUNCTION public.sales_lead_email_prepare_response_links();

CREATE OR REPLACE FUNCTION public.sales_lead_email_store_response_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.response_token_hash IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.sales_lead_email_response_tokens (
    token_hash,
    lead_id,
    batch_item_id,
    recipient_snapshot,
    expires_at
  )
  VALUES (
    NEW.response_token_hash,
    NEW.lead_id,
    NEW.id,
    lower(btrim(NEW.recipient_snapshot)),
    now() + interval '90 days'
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_email_store_response_token()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_store_response_token()
  TO service_role;

CREATE TRIGGER trg_sales_lead_email_store_response_token
AFTER INSERT ON public.sales_lead_email_batch_items
FOR EACH ROW
EXECUTE FUNCTION public.sales_lead_email_store_response_token();

CREATE OR REPLACE FUNCTION public.sales_lead_email_batch_item_preserve_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.batch_id IS DISTINCT FROM OLD.batch_id
     OR NEW.lead_id IS DISTINCT FROM OLD.lead_id
     OR NEW.scheduled_for IS DISTINCT FROM OLD.scheduled_for
     OR NEW.recipient_snapshot IS DISTINCT FROM OLD.recipient_snapshot
     OR NEW.email_source_snapshot IS DISTINCT FROM OLD.email_source_snapshot
     OR NEW.email_verification_method_snapshot IS DISTINCT FROM OLD.email_verification_method_snapshot
     OR NEW.email_verified_at_snapshot IS DISTINCT FROM OLD.email_verified_at_snapshot
     OR NEW.subject_snapshot IS DISTINCT FROM OLD.subject_snapshot
     OR NEW.body_source_snapshot IS DISTINCT FROM OLD.body_source_snapshot
     OR NEW.body_text_snapshot IS DISTINCT FROM OLD.body_text_snapshot
     OR NEW.body_html_snapshot IS DISTINCT FROM OLD.body_html_snapshot
     OR NEW.template_id_snapshot IS DISTINCT FROM OLD.template_id_snapshot
     OR NEW.template_updated_at_snapshot IS DISTINCT FROM OLD.template_updated_at_snapshot
     OR NEW.company_name_snapshot IS DISTINCT FROM OLD.company_name_snapshot
     OR NEW.response_token_hash IS DISTINCT FROM OLD.response_token_hash THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'sales_lead_email_batch_snapshot_immutable';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
