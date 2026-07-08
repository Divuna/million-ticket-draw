-- ============================================================================
-- SALES LEADS — Dynamic lead groups for admin discovery
-- ============================================================================
-- Purpose:
--   Allow admins to add reusable lead groups/segments from the admin UI instead
--   of keeping the "Najít nové firmy" dropdown hard-coded.
--
-- Scope:
--   - new table public.sales_lead_groups
--   - seed existing hard-coded groups
--   - replace sales_leads.lead_group fixed CHECK with a DB-backed FK
--   - RPC sales_lead_group_create for admin-created groups
--
-- Safety:
--   - additive for existing data
--   - does not send emails
--   - does not touch wallets/payments/contests/tickets/winners/Stripe
--   - production application requires explicit approval and postcheck
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sales_lead_groups (
  slug text PRIMARY KEY,
  label text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_lead_groups_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT sales_lead_groups_label_not_blank CHECK (length(btrim(label)) > 0)
);

INSERT INTO public.sales_lead_groups (slug, label, sort_order)
VALUES
  ('e-shopy', 'E-shopy', 10),
  ('auto-moto', 'Auto / moto', 20),
  ('luxusni-zbozi', 'Luxusní zboží', 30),
  ('sport', 'Sport', 40),
  ('cestovani', 'Cestování', 50),
  ('gastronomie', 'Gastronomie', 60),
  ('lokalni-sluzby', 'Lokální služby', 70),
  ('jine', 'Jiné', 999)
ON CONFLICT (slug) DO UPDATE
SET label = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order,
    is_active = true,
    updated_at = now();

-- Replace the fixed hard-coded CHECK with a DB-backed list.
ALTER TABLE public.sales_leads DROP CONSTRAINT IF EXISTS sales_leads_lead_group_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_leads_lead_group_fk'
      AND conrelid = 'public.sales_leads'::regclass
  ) THEN
    ALTER TABLE public.sales_leads
      ADD CONSTRAINT sales_leads_lead_group_fk
      FOREIGN KEY (lead_group)
      REFERENCES public.sales_lead_groups(slug)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_lead_groups_active_order
  ON public.sales_lead_groups (is_active, sort_order, label);

ALTER TABLE public.sales_lead_groups ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.sales_lead_groups FROM anon;
GRANT SELECT ON TABLE public.sales_lead_groups TO authenticated;

DROP POLICY IF EXISTS sales_lead_groups_admin_select ON public.sales_lead_groups;
CREATE POLICY sales_lead_groups_admin_select
  ON public.sales_lead_groups
  FOR SELECT TO authenticated
  USING (
    public.has_admin_permission('sales_leads.manage', auth.uid())
    OR public.is_superadmin(auth.uid())
  );

CREATE OR REPLACE FUNCTION public.sales_lead_group_slugify(p_label text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text;
BEGIN
  v := lower(btrim(coalesce(p_label, '')));
  v := translate(v, 'áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ', 'acdeeinorstuuyzACDEEINORSTUUYZ');
  v := regexp_replace(v, '[^a-z0-9]+', '-', 'g');
  v := regexp_replace(v, '(^-+|-+$)', '', 'g');
  v := regexp_replace(v, '-+', '-', 'g');
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_lead_group_create(p_label text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_label text := btrim(coalesce(p_label, ''));
  v_slug text;
  v_sort integer;
BEGIN
  IF v_caller IS NULL
     OR NOT (public.has_admin_permission('sales_leads.manage', v_caller)
             OR public.is_superadmin(v_caller)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  IF length(v_label) < 2 OR length(v_label) > 80 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_label');
  END IF;

  v_slug := public.sales_lead_group_slugify(v_label);
  IF v_slug IS NULL OR length(v_slug) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_label');
  END IF;

  SELECT COALESCE(MAX(sort_order), 0) + 10 INTO v_sort FROM public.sales_lead_groups;

  INSERT INTO public.sales_lead_groups (slug, label, sort_order, created_by)
  VALUES (v_slug, v_label, v_sort, v_caller)
  ON CONFLICT (slug) DO UPDATE
  SET label = EXCLUDED.label,
      is_active = true,
      updated_at = now()
  WHERE public.sales_lead_groups.is_active = false;

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.sales_lead_groups WHERE slug = v_slug AND is_active = true) THEN
      RETURN jsonb_build_object('success', false, 'error', 'duplicate', 'slug', v_slug);
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'slug', v_slug, 'label', v_label);
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_group_create(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sales_lead_group_create(text) TO authenticated;

COMMENT ON TABLE public.sales_lead_groups IS
  'Admin-managed reusable segments for Sales Leads discovery dropdown.';

COMMENT ON FUNCTION public.sales_lead_group_create(text) IS
  'Creates or reactivates an admin-managed Sales Leads group. Requires sales_leads.manage.';
