BEGIN;

ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS website_verification_status text NOT NULL DEFAULT 'neovereny',
  ADD COLUMN IF NOT EXISTS website_verification_source text,
  ADD COLUMN IF NOT EXISTS website_confidence smallint,
  ADD COLUMN IF NOT EXISTS website_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS website_verification_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS alternative_websites jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS contact_data_provenance jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.sales_leads DROP CONSTRAINT IF EXISTS sales_leads_website_verification_status_check;
ALTER TABLE public.sales_leads ADD CONSTRAINT sales_leads_website_verification_status_check
  CHECK (website_verification_status IN ('overeny','neovereny'));
ALTER TABLE public.sales_leads DROP CONSTRAINT IF EXISTS sales_leads_website_confidence_check;
ALTER TABLE public.sales_leads ADD CONSTRAINT sales_leads_website_confidence_check
  CHECK (website_confidence IS NULL OR website_confidence BETWEEN 0 AND 100);

CREATE OR REPLACE FUNCTION public.sales_lead_enforce_verified_discovery_website()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v jsonb := COALESCE(NEW.discovery_meta->'website_verification','{}'::jsonb);
BEGIN
  IF NEW.source = 'ai_vyhledavani' THEN
    IF NEW.website IS NOT NULL AND COALESCE(v->>'status','') <> 'verified' THEN
      NEW.website := NULL;
    END IF;
    IF NEW.website IS NULL THEN
      NEW.website_verification_status := 'neovereny';
      NEW.website_verification_source := NULL;
      NEW.website_confidence := 0;
      NEW.website_verified_at := NULL;
      NEW.website_verification_evidence := COALESCE(v->'evidence','{}'::jsonb);
    ELSE
      NEW.website_verification_status := 'overeny';
      NEW.website_verification_source := NULLIF(v->>'source','');
      NEW.website_confidence := LEAST(100,GREATEST(0,COALESCE((v->>'confidence')::int,0)));
      NEW.website_verified_at := COALESCE((v->>'verifiedAt')::timestamptz,now());
      NEW.website_verification_evidence := COALESCE(v->'evidence','{}'::jsonb);
    END IF;
    NEW.alternative_websites := COALESCE(v->'alternatives','[]'::jsonb);
  END IF;
  RETURN NEW;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
  NEW.website := NULL;
  NEW.website_verification_status := 'neovereny';
  NEW.website_confidence := 0;
  NEW.website_verified_at := NULL;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sales_leads_verified_discovery_website ON public.sales_leads;
CREATE TRIGGER trg_sales_leads_verified_discovery_website
BEFORE INSERT OR UPDATE OF website,discovery_meta ON public.sales_leads
FOR EACH ROW EXECUTE FUNCTION public.sales_lead_enforce_verified_discovery_website();

CREATE INDEX IF NOT EXISTS idx_sales_leads_website_verification
  ON public.sales_leads(website_verification_status,website_verified_at)
  WHERE source='ai_vyhledavani';

COMMENT ON COLUMN public.sales_leads.website_verification_status IS
  'overeny only after independent registry + HTTP/content identity verification; AI is never evidence.';
COMMENT ON COLUMN public.sales_leads.alternative_websites IS
  'Audit-only alternative candidates. They must never be used for contact enrichment.';

COMMIT;
