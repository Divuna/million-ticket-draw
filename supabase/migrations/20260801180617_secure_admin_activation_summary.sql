CREATE OR REPLACE FUNCTION public.get_admin_activation_summary()
RETURNS TABLE(
  partner_id uuid,
  partner_name text,
  display_name text,
  total_activations bigint,
  opened_count bigint,
  hidden_count bigint,
  open_rate_pct numeric,
  billing_mode text,
  price_per_activation numeric,
  unbilled_activations bigint,
  estimated_unbilled_czk numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    p.id,
    p.name,
    COALESCE(p.company_name, p.name),
    COUNT(poa.id),
    COUNT(poa.id) FILTER (WHERE upo.opened_at IS NOT NULL),
    COUNT(poa.id) FILTER (WHERE upo.hidden_at IS NOT NULL),
    ROUND(100.0 * COUNT(poa.id) FILTER (WHERE upo.opened_at IS NOT NULL) / NULLIF(COUNT(poa.id), 0), 1),
    COALESCE(cfg.billing_mode, 'free'),
    COALESCE(cfg.price_per_activation, 0),
    COUNT(poa.id) FILTER (WHERE NOT poa.invoiced),
    CASE
      WHEN COALESCE(cfg.billing_mode, 'free') = 'paid_distribution'
      THEN COUNT(poa.id) FILTER (WHERE NOT poa.invoiced) * COALESCE(cfg.price_per_activation, 0)
      ELSE 0
    END
  FROM public.partners p
  LEFT JOIN public.partner_offer_activations poa ON poa.partner_id = p.id
  LEFT JOIN public.user_partner_offers upo ON upo.id = poa.upo_id
  LEFT JOIN public.partner_offer_billing_configs cfg ON cfg.partner_id = p.id
  WHERE public.is_admin()
  GROUP BY p.id, p.name, p.company_name, cfg.billing_mode, cfg.price_per_activation;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_admin_activation_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_activation_summary() TO authenticated, service_role;
