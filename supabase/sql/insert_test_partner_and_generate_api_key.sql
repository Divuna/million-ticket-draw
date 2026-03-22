-- =============================================================================
-- Single run: insert test partner + call generate_partner_api_key(p_partner_id)
-- Schema: aligned with src/integrations/supabase/types.ts (partners Row, partner_status)
-- If this errors, run partners_schema_introspect.sql and adjust columns/types.
-- =============================================================================

WITH new_partner AS (
  INSERT INTO public.partners (
    name,
    logo_url,
    website_url,
    currency,
    logo_status,
    mc_per_99_czk,
    payout_ready,
    price_per_coin,
    reward_base_czk,
    reward_mc,
    status,
    vat_rate,
    approved_at,
    company_name,
    contact_email
  ) VALUES (
    'SQL Test Partner ' || to_char(now(), 'YYYYMMDDHH24MISS'),
    'https://placehold.co/200x200/1a1a2e/gold?text=Logo',
    'https://example.invalid/sql-test-partner',
    'CZK',
    'none',
    1,
    false,
    1,
    99,
    10,
    'approved'::public.partner_status,
    21,
    now(),
    'SQL Test Partner s.r.o.',
    'sql-test-partner@example.invalid'
  )
  RETURNING id
),
verify AS (
  SELECT id AS partner_id FROM new_partner
)
SELECT
  v.partner_id,
  g.api_key,
  g.key_id,
  g.key_prefix,
  g.created_at
FROM verify v
CROSS JOIN LATERAL (SELECT * FROM public.generate_partner_api_key(v.partner_id)) AS g;
