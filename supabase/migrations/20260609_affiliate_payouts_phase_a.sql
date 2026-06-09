-- ============================================================================
-- DÁVKOVÉ VÝPLATY PROVIZÍ — FÁZE A: DB ZÁKLAD (NEAPLIKOVÁNO)
-- ============================================================================
-- Směr: OneMil → obchodník/affiliate. Plně automatický model:
--   doklad/samofaktura, číslo, VS, PDF, e-maily, platební dávka, Air Bank export
--   generuje SYSTÉM. Admin jen vybírá provize, vytvoří dávku, stáhne ABO soubor,
--   po odeslání plateb v Air Bank označí CELOU DÁVKU jako zaplacenou.
--
-- TATO MIGRACE = jen DB schéma (tabulky, sloupce, sekvence, buckety, RLS).
-- Edge Functions, PDF, ABO export, e-maily a UI jsou v dalších fázích (B–E).
--
-- ⛔ NEAPLIKOVAT bez výslovného schválení Pavla. Nejdřív STAGING + postcheck.
-- ⚠️ Předchozí migrace 20260609_affiliate_commission_payout_evidence.sql je
--    NAHRAZENA tímto modelem a NESMÍ se aplikovat.
-- Rollback na konci.
-- ============================================================================

BEGIN;

-- ── 1) Rozšíření affiliate_commissions ──────────────────────────────────────
-- Nové stavy workflow (commission-level). bank_export_generated a
-- payment_batch_created jsou stavy DÁVKY, ne provize → provize je 'in_payment_batch'.
ALTER TABLE public.affiliate_commissions
  DROP CONSTRAINT IF EXISTS affiliate_commissions_status_check;

ALTER TABLE public.affiliate_commissions
  ADD CONSTRAINT affiliate_commissions_status_check
  CHECK (status IN (
    'calculated',
    'approved',
    'payout_document_created',
    'ready_to_pay',
    'in_payment_batch',
    'paid'
  ));

ALTER TABLE public.affiliate_commissions
  ADD COLUMN IF NOT EXISTS payout_document_id uuid,
  ADD COLUMN IF NOT EXISTS payout_batch_id uuid,
  ADD COLUMN IF NOT EXISTS paid_by uuid,                  -- mirror batch.marked_paid_by
  ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz;
-- paid_at zůstává (nastaví se při označení dávky zaplacené).

-- ── 2) Číselné řady (doklady, dávky) ────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.affiliate_payout_document_seq;
CREATE SEQUENCE IF NOT EXISTS public.affiliate_payout_batch_seq;

-- ── 3) affiliate_payout_documents — výplatní doklad / samofaktura ────────────
CREATE TABLE IF NOT EXISTS public.affiliate_payout_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id   uuid NOT NULL REFERENCES public.affiliate_commissions(id) ON DELETE RESTRICT,
  affiliate_id    uuid NOT NULL REFERENCES public.affiliate_accounts(id) ON DELETE RESTRICT,
  document_number text NOT NULL UNIQUE,                   -- napr. 'APD-2026-000001'
  document_type   text NOT NULL DEFAULT 'commission_statement'
                    CHECK (document_type IN ('commission_statement','self_billed_tax_invoice')),
  -- Snapshot příjemce v okamžiku vytvoření dokladu (neměnit zpětně při změně profilu).
  recipient_name  text NOT NULL,
  recipient_email text,
  recipient_ico   text,
  recipient_vat_id text,
  recipient_billing_address text,
  recipient_is_vat_payer boolean NOT NULL DEFAULT false,
  recipient_subject_type text,
  amount_base_czk  numeric NOT NULL,
  vat_rate         numeric NOT NULL DEFAULT 0,
  amount_total_czk numeric NOT NULL,
  pdf_url         text,
  email_status    text NOT NULL DEFAULT 'pending'
                    CHECK (email_status IN ('pending','sent_affiliate','sent_accounting','sent_both','failed')),
  affiliate_email text,
  accounting_email text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  UNIQUE (commission_id)                                   -- 1 doklad na provizi
);
CREATE INDEX IF NOT EXISTS idx_apd_commission ON public.affiliate_payout_documents(commission_id);
CREATE INDEX IF NOT EXISTS idx_apd_affiliate  ON public.affiliate_payout_documents(affiliate_id);

-- ── 4) affiliate_payout_batches — hromadná dávka ────────────────────────────
CREATE TABLE IF NOT EXISTS public.affiliate_payout_batches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number     text NOT NULL UNIQUE,                  -- napr. 'APB-2026-000001'
  status           text NOT NULL DEFAULT 'created'
                    CHECK (status IN ('created','exported','paid','cancelled')),
  bank             text NOT NULL DEFAULT 'airbank',
  bank_export_format text NOT NULL DEFAULT 'abo_kpc',     -- ABO .kpc (Air Bank tuzemský CZK)
  bank_export_encoding text NOT NULL DEFAULT 'windows-1250',
  bank_export_line_endings text NOT NULL DEFAULT 'crlf',
  bank_export_url  text,                                  -- privátní bucket
  due_date         date,
  payer_account    text,
  payer_bank_code  text NOT NULL DEFAULT '3030',
  total_amount_czk numeric NOT NULL DEFAULT 0,
  item_count       integer NOT NULL DEFAULT 0,
  created_by       uuid NOT NULL,                         -- admin auth.uid()
  created_at       timestamptz NOT NULL DEFAULT now(),
  exported_at      timestamptz,
  marked_paid_by   uuid,
  marked_paid_at   timestamptz,
  cancelled_at     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_apb_status ON public.affiliate_payout_batches(status);

-- ── 5) affiliate_payout_batch_items — položky dávky ─────────────────────────
CREATE TABLE IF NOT EXISTS public.affiliate_payout_batch_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id         uuid NOT NULL REFERENCES public.affiliate_payout_batches(id) ON DELETE CASCADE,
  commission_id    uuid NOT NULL REFERENCES public.affiliate_commissions(id) ON DELETE RESTRICT,
  amount_czk       numeric NOT NULL,
  recipient_account text NOT NULL,                        -- snapshot z affiliate_accounts.payout_account
  recipient_bank_code text NOT NULL,                      -- snapshot z affiliate_accounts.payout_bank
  recipient_name   text NOT NULL,                         -- snapshot
  variable_symbol  text NOT NULL,                         -- SYSTÉM generuje (z čísla dokladu)
  payment_message  text,                                  -- zpráva pro příjemce, ABO max 35 znaků
  constant_symbol  text NOT NULL DEFAULT '0000',
  specific_symbol  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (variable_symbol ~ '^[0-9]{1,10}$'),
  CHECK (char_length(coalesce(payment_message, '')) <= 35),
  CHECK (constant_symbol ~ '^[0-9]{4}$'),
  CHECK (specific_symbol IS NULL OR specific_symbol ~ '^[0-9]{1,10}$'),
  UNIQUE (commission_id)                                  -- 1 provize max v 1 dávce
);
CREATE INDEX IF NOT EXISTS idx_apbi_batch ON public.affiliate_payout_batch_items(batch_id);

-- ── 6) FK zpět z affiliate_commissions (po vzniku tabulek) ──────────────────
ALTER TABLE public.affiliate_commissions
  DROP CONSTRAINT IF EXISTS fk_ac_payout_document,
  ADD  CONSTRAINT fk_ac_payout_document
       FOREIGN KEY (payout_document_id) REFERENCES public.affiliate_payout_documents(id) ON DELETE SET NULL;
ALTER TABLE public.affiliate_commissions
  DROP CONSTRAINT IF EXISTS fk_ac_payout_batch,
  ADD  CONSTRAINT fk_ac_payout_batch
       FOREIGN KEY (payout_batch_id) REFERENCES public.affiliate_payout_batches(id) ON DELETE SET NULL;

-- ── 7) Storage buckety (PRIVÁTNÍ — citlivé doklady a bankovní exporty) ───────
INSERT INTO storage.buckets (id, name, public)
VALUES ('affiliate-payout-docs', 'affiliate-payout-docs', false)
ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public)
VALUES ('affiliate-bank-exports', 'affiliate-bank-exports', false)
ON CONFLICT (id) DO NOTHING;

-- ── 8) RLS — jen admin/superadmin ───────────────────────────────────────────
ALTER TABLE public.affiliate_payout_documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_payout_batches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_payout_batch_items   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS apd_admin_all ON public.affiliate_payout_documents;
CREATE POLICY apd_admin_all ON public.affiliate_payout_documents
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS apb_admin_all ON public.affiliate_payout_batches;
CREATE POLICY apb_admin_all ON public.affiliate_payout_batches
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS apbi_admin_all ON public.affiliate_payout_batch_items;
CREATE POLICY apbi_admin_all ON public.affiliate_payout_batch_items
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Storage RLS: privátní buckety — jen admin čte/zapisuje (přes signed URL).
DROP POLICY IF EXISTS apdocs_admin ON storage.objects;
CREATE POLICY apdocs_admin ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id IN ('affiliate-payout-docs','affiliate-bank-exports') AND public.is_admin())
  WITH CHECK (bucket_id IN ('affiliate-payout-docs','affiliate-bank-exports') AND public.is_admin());

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- BEGIN;
-- DROP POLICY IF EXISTS apdocs_admin ON storage.objects;
-- DROP TABLE IF EXISTS public.affiliate_payout_batch_items;
-- DROP TABLE IF EXISTS public.affiliate_payout_batches;
-- ALTER TABLE public.affiliate_commissions
--   DROP CONSTRAINT IF EXISTS fk_ac_payout_document,
--   DROP CONSTRAINT IF EXISTS fk_ac_payout_batch;
-- DROP TABLE IF EXISTS public.affiliate_payout_documents;
-- DROP SEQUENCE IF EXISTS public.affiliate_payout_document_seq;
-- DROP SEQUENCE IF EXISTS public.affiliate_payout_batch_seq;
-- ALTER TABLE public.affiliate_commissions
--   DROP COLUMN IF EXISTS confirmation_sent_at,
--   DROP COLUMN IF EXISTS paid_by,
--   DROP COLUMN IF EXISTS payout_batch_id,
--   DROP COLUMN IF EXISTS payout_document_id,
--   DROP CONSTRAINT IF EXISTS affiliate_commissions_status_check,
--   ADD  CONSTRAINT affiliate_commissions_status_check
--        CHECK (status IN ('calculated','approved','paid'));
-- DELETE FROM storage.buckets WHERE id IN ('affiliate-payout-docs','affiliate-bank-exports');
-- COMMIT;
-- ============================================================================
