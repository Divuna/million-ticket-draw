-- Bezpečná serverová cesta pro změnu stavu influencerských provizí.
--
-- PROBLÉM
-- `src/pages/AdminInfluencerCommissions.tsx` měnil `influencer_commissions.status`
-- přímo přes PostgREST `.update()`. Tabulka má ale zapnuté RLS a JEDINOU policy —
-- `influencer_commissions_read` (SELECT, `is_superadmin()`). UPDATE policy neexistuje,
-- takže zápis nikdy neprojde. PostgREST v takovém případě NEVRACÍ chybu: UPDATE prostě
-- zasáhne 0 řádků a vrátí 204. Frontend tedy zobrazil „Provize schválena" a přepnul badge,
-- ale v databázi se nezměnilo nic — falešný úspěch nad finančním stavem.
--
-- ŘEŠENÍ
-- Dvě SECURITY DEFINER RPC se stejným vzorem jako `admin_set_affiliate_commission_status`
-- a `admin_mark_partner_invoice_paid`. Obecná UPDATE policy se ZÁMĚRNĚ nepřidává —
-- frontend nesmí do finanční tabulky zapisovat přímo.
--
-- ROZSAH OPRÁVNĚNÍ
-- Guard je `is_superadmin()`, ne `is_admin()`. Produkční SELECT policy je dnes
-- superadmin-only, takže běžný admin tabulku stejně nevidí; `is_admin()` by oprávnění
-- ROZŠÍŘIL. Affiliate finance je podle `CLAUDE.md` (Phase 1) superadmin-only a sesterská
-- `admin_set_affiliate_commission_status` používá rovněž `is_superadmin()`.
--
-- POVOLENÉ PŘECHODY (jiné se odmítnou)
--   calculated -> approved
--   approved   -> paid
--
-- Tato migrace NEPŘIDÁVÁ CHECK constraint na `status`. Produkce obsahuje historický řádek
-- se stavem `pending`, který sem nepatří a vyřeší ho předstartovní reset; CHECK by ho
-- znemožnil aktualizovat.

-- ── 1. Jedna provize ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_influencer_commission_status(
  p_commission_id uuid,
  p_new_status    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_current    text;
  v_updated_at timestamptz;
BEGIN
  IF NOT public.is_superadmin() THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  IF p_commission_id IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_commission');
  END IF;

  IF p_new_status IS NULL OR p_new_status NOT IN ('approved', 'paid') THEN
    RETURN jsonb_build_object('status', 'invalid_status');
  END IF;

  -- Zámek řádku: stav se načte a změní ve stejné transakci, takže dva souběžné
  -- požadavky nemohou provést tentýž přechod dvakrát.
  SELECT ic.status
  INTO v_current
  FROM public.influencer_commissions ic
  WHERE ic.id = p_commission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF NOT (
       (v_current = 'calculated' AND p_new_status = 'approved')
    OR (v_current = 'approved'   AND p_new_status = 'paid')
  ) THEN
    RETURN jsonb_build_object(
      'status', 'invalid_transition',
      'id',     p_commission_id,
      'from',   v_current,
      'to',     p_new_status
    );
  END IF;

  UPDATE public.influencer_commissions
  SET status     = p_new_status,
      updated_at = now()                 -- čas nastavuje server, ne klient
  WHERE id = p_commission_id
    AND status = v_current               -- pojistka proti souběžné změně
  RETURNING updated_at INTO v_updated_at;

  IF v_updated_at IS NULL THEN
    RETURN jsonb_build_object('status', 'conflict', 'id', p_commission_id);
  END IF;

  PERFORM public.log_admin_action(
    'influencer_commission_status_changed',
    'influencer_commission',
    p_commission_id,
    jsonb_build_object('status', v_current),
    jsonb_build_object('status', p_new_status)
  );

  RETURN jsonb_build_object(
    'status',     'updated',
    'id',         p_commission_id,
    'from',       v_current,
    'to',         p_new_status,
    'updated_at', v_updated_at
  );
END;
$function$;

COMMENT ON FUNCTION public.admin_set_influencer_commission_status(uuid, text) IS
  'Superadmin-only přechod stavu influencerské provize. Povoleno pouze calculated->approved a approved->paid. Jediná povolená zápisová cesta — tabulka nemá UPDATE policy.';

REVOKE ALL ON FUNCTION public.admin_set_influencer_commission_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_influencer_commission_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_influencer_commission_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_influencer_commission_status(uuid, text) TO service_role;

-- ── 2. Hromadné označení jako vyplacené ─────────────────────────────────────────
-- Nevolá UPDATE napřímo — každý řádek prochází funkcí výše, takže hromadná cesta
-- nemůže obejít kontrolu přechodů. Je all-or-nothing: jakýkoli neplatný řádek celou
-- dávku odmítne a nezmění NIC (funkce běží v jedné transakci).
CREATE OR REPLACE FUNCTION public.admin_set_influencer_commissions_paid(
  p_commission_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_ids      uuid[];
  v_id       uuid;
  v_result   jsonb;
  v_rejected jsonb := '[]'::jsonb;
  v_updated  integer := 0;
BEGIN
  IF NOT public.is_superadmin() THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  IF p_commission_ids IS NULL OR array_length(p_commission_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_input');
  END IF;

  -- Deduplikace: tentýž identifikátor dvakrát v poli by druhý průchod vyhodnotil
  -- jako neplatný přechod approved->paid a zbytečně shodil celou dávku.
  SELECT array_agg(DISTINCT id) INTO v_ids FROM unnest(p_commission_ids) AS id;

  FOREACH v_id IN ARRAY v_ids LOOP
    v_result := public.admin_set_influencer_commission_status(v_id, 'paid');

    IF v_result ->> 'status' = 'updated' THEN
      v_updated := v_updated + 1;
    ELSE
      v_rejected := v_rejected || jsonb_build_array(
        jsonb_build_object(
          'id',     v_id,
          'status', v_result ->> 'status',
          'from',   v_result ->> 'from'
        )
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_rejected) > 0 THEN
    -- Celá transakce se zahodí, včetně už provedených řádků i jejich audit záznamů.
    RAISE EXCEPTION 'influencer_commission_bulk_rejected'
      USING ERRCODE   = '22023',
            DETAIL    = v_rejected::text,
            HINT      = 'Žádná provize nebyla změněna. Obnovte přehled a zkuste znovu.';
  END IF;

  RETURN jsonb_build_object(
    'status',        'updated',
    'updated_count', v_updated
  );
END;
$function$;

COMMENT ON FUNCTION public.admin_set_influencer_commissions_paid(uuid[]) IS
  'Superadmin-only hromadné approved->paid. Deleguje na admin_set_influencer_commission_status, takže neobchází kontrolu přechodů. All-or-nothing: neplatný řádek odmítne celou dávku.';

REVOKE ALL ON FUNCTION public.admin_set_influencer_commissions_paid(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_influencer_commissions_paid(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_influencer_commissions_paid(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_influencer_commissions_paid(uuid[]) TO service_role;
