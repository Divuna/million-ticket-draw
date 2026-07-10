-- ============================================================================
-- SALES LEADS — evidence přečtení příchozích odpovědí (nepřečtené zprávy).
-- Spec: docs/SALES_LEADS_ADMIN_SPEC.md §18 (příjem a stav odpovědí)
-- ============================================================================
-- Zapsáno jako soubor v repu. Aplikace na staging/produkci vyžaduje výslovné
-- schválení Pavla (přes apply_migration). ŽÁDNÉ SQL se tímto PR nespouští.
--
-- Cíl: každá nová příchozí odpověď (`reply_received`, zapisuje ji EF
-- `sales-lead-inbound`) je automaticky NEPŘEČTENÁ. Po otevření detailu leadu se
-- odpovědi označí jako přečtené. Slouží jen k UI upozornění — NIKDY nemění stav
-- leadu (`jednani`/`odpovedel` zůstávají beze změny) ani žádnou jinou logiku.
--
-- Model: aditivní sloupec `read_at` na append-only tabulce `sales_lead_activities`.
--   • `read_at IS NULL`  = nepřečteno (výchozí u nově vloženého řádku)
--   • `read_at` vyplněno = přečteno (kdy) + `read_by` (kdo)
-- Inbound funkce `read_at` nenastavuje → nová odpověď je nepřečtená automaticky.
--
-- Rozsah: pouze `sales_lead_activities`. Nesahá na wallets/payments/contests/
-- tickets/winners/Stripe/`buy_ticket_atomic`/`email_queue`.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.sales_lead_mark_replies_read(uuid);
--   DROP INDEX IF EXISTS public.idx_sales_lead_activities_unread_reply;
--   ALTER TABLE public.sales_lead_activities DROP COLUMN IF EXISTS read_by;
--   ALTER TABLE public.sales_lead_activities DROP COLUMN IF EXISTS read_at;
-- ============================================================================

-- ── 1. Sloupce read_at / read_by ────────────────────────────────────────────
ALTER TABLE public.sales_lead_activities
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 2. Parciální index pro rychlé počítání nepřečtených odpovědí ────────────
-- Týká se VÝHRADNĚ nepřečtených `reply_received`. Ostatní aktivity ani přečtené
-- odpovědi index nedrží (malý, levný).
CREATE INDEX IF NOT EXISTS idx_sales_lead_activities_unread_reply
  ON public.sales_lead_activities (lead_id)
  WHERE activity_type = 'reply_received' AND read_at IS NULL;

-- ── 3. Backfill: existující odpovědi označit jako PŘEČTENÉ ───────────────────
-- Jednorázově, aby nasazení nezobrazilo historické odpovědi jako záplavu
-- „nepřečtených". Nové odpovědi po migraci zůstávají nepřečtené (read_at NULL).
UPDATE public.sales_lead_activities
  SET read_at = created_at
  WHERE activity_type = 'reply_received' AND read_at IS NULL;

-- ── 4. RPC: označit odpovědi leadu jako přečtené ────────────────────────────
-- Volá se po otevření detailu leadu. SECURITY DEFINER + guard oprávnění.
-- NIKDY nemění status leadu ani nic mimo `sales_lead_activities`.
CREATE OR REPLACE FUNCTION public.sales_lead_mark_replies_read(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_marked integer;
BEGIN
  IF NOT (public.has_admin_permission('sales_leads.manage') OR public.is_superadmin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  UPDATE public.sales_lead_activities
    SET read_at = now(), read_by = auth.uid()
    WHERE lead_id = p_lead_id
      AND activity_type = 'reply_received'
      AND read_at IS NULL;
  GET DIAGNOSTICS v_marked = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'marked_count', v_marked);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_lead_mark_replies_read(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sales_lead_mark_replies_read(uuid) TO authenticated;
