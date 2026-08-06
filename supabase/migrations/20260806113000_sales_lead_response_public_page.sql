BEGIN;

-- Hosted Supabase Edge Functions rewrite GET text/html responses to text/plain.
-- Future e-mail snapshots therefore link to a static OneMil page, which uses
-- the Edge Function only as a JSON API. Existing immutable items are untouched.
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
  v_project_ref text;
  v_public_page constant text := 'https://onemil.cz/partner-response.html';
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

  v_project_ref := substring(v_edge_base from '^https://([a-z0-9-]+)\.supabase\.co');
  IF v_project_ref NOT IN ('dxmowysntemfqfnanxua', 'xkzhjldrojjlrkezorey') THEN
    RAISE EXCEPTION 'sales_lead_response_project_not_allowed';
  END IF;

  v_response_url := v_public_page || '?project=' || v_project_ref;

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

  v_interest_url := v_response_url || '&token=' || v_token || '&action=interest';
  v_decline_url := v_response_url || '&token=' || v_token || '&action=decline';
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

COMMIT;
