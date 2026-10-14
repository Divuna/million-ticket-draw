-- Prepared remediation for the known false positive. This migration is
-- intentionally narrow and idempotent: only the exact ICO + catalogue host is
-- affected. The rejected URL is retained as audit-only alternative evidence.
WITH target AS (
  SELECT
    id,
    website,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(alternative_websites, '[]'::jsonb)) item
        WHERE item->>'url' = website
      ) THEN COALESCE(alternative_websites, '[]'::jsonb)
      ELSE COALESCE(alternative_websites, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'url', website,
          'source', 'stored_catalog_profile',
          'confidence', 0,
          'reason', 'non_official_third_party'
        )
      )
    END AS alternatives
  FROM public.sales_leads
  WHERE regexp_replace(COALESCE(ico, ''), '\D', '', 'g') = '26255430'
    AND lower(regexp_replace(split_part(regexp_replace(website, '^https?://', '', 'i'), '/', 1), ':\d+$', '')) = 'rojik.sluzby.cz'
), updated AS (
  UPDATE public.sales_leads lead
  SET
    website = NULL,
    website_verification_status = 'neovereny',
    website_verification_source = NULL,
    website_confidence = 0,
    website_verified_at = NULL,
    website_verification_evidence = jsonb_build_object(
      'reason', 'non_official_third_party',
      'remediated_at', now(),
      'matched_rule', 'sluzby.cz'
    ),
    alternative_websites = target.alternatives,
    contact_data_provenance = COALESCE(lead.contact_data_provenance, '{}'::jsonb) - 'website' - 'contact_form',
    discovery_meta = jsonb_set(
      COALESCE(lead.discovery_meta, '{}'::jsonb),
      '{website_verification}',
      jsonb_build_object(
        'status', 'unverified',
        'confidence', 0,
        'source', NULL,
        'verifiedAt', NULL,
        'evidence', jsonb_build_object(
          'reason', 'non_official_third_party',
          'matched_rule', 'sluzby.cz'
        ),
        'alternatives', target.alternatives
      ),
      true
    ),
    updated_at = now()
  FROM target
  WHERE lead.id = target.id
  RETURNING lead.id, target.website
)
INSERT INTO public.audit_logs (event, event_type, user_id, reference_id, metadata, created_at)
SELECT
  'sales_lead_non_official_website_cleared',
  'sales_lead_non_official_website_cleared',
  NULL,
  id,
  jsonb_build_object(
    'lead_id', id,
    'ico', '26255430',
    'rejected_website', website,
    'matched_rule', 'sluzby.cz'
  ),
  now()
FROM updated;
