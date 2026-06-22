-- ============================================================================
-- phase1_baseline.sql — LIVE PRODUCTION rollback reference (READ-ONLY CAPTURE)
-- ============================================================================
-- Project:    onemil (Supabase ref xkzhjldrojjlrkezorey, eu-north-1, Postgres 17.6)
-- Captured:   2026-06-22 (live production state via pg_policies + pg_get_functiondef)
-- DB size:    ~2.28 GB
--
-- PURPOSE — ROLLBACK REVERSE SOURCE ONLY. DO NOT RUN AS A FORWARD MIGRATION.
--   This file is the authoritative snapshot of the CURRENT production definitions
--   of every RLS policy and RPC that the planned "Phase 1 superadmin-only gating"
--   will modify. If a Phase 1 change must be reverted, re-apply the relevant
--   block below to restore the exact prior behavior.
--
-- WHY THIS FILE EXISTS (CRITICAL):
--   Production migration history does NOT fully match live DB state — several live
--   objects (e.g. public.get_admin_subadmins_overview, recent SEC01/RLS tweaks)
--   were applied via the SQL editor and are not represented as tracked migration
--   files. Therefore the git migration files are NOT a reliable reverse source.
--   THIS captured live definition is the real rollback artifact.
--
-- RULES:
--   * No Phase 1 permission/RLS/RPC change may start until backups are confirmed
--     (see phase1_backup_checklist.md).
--   * Every later Phase 1 forward migration MUST ship with a tested reverse script
--     derived from the matching block below.
--   * Capturing this file changed nothing in the database (read-only).
--
-- CURRENT GATE SUMMARY (all of these currently admit a subadmin with role='admin'):
--   is_admin() = role IN ('admin','superadmin'); every block below uses either
--   is_admin(), has_role(...,'admin') OR has_role(...,'superadmin'), or a direct
--   user_roles/users role IN ('admin','superadmin') check. Phase 1 will tighten
--   the sensitive ones to superadmin-only; this file restores the pre-change form.
-- ============================================================================


-- ============================================================================
-- SECTION A — RLS POLICIES (current live definitions)
-- Affected tables: payments, partner_invoices(_lines/_exports), affiliate_commissions,
--   affiliate_payout_batches/_items/_documents, influencer_commissions, contest_economy,
--   tickets, winners, winner_status_history, referral_rewards, settings, event_logs.
-- (audit_logs SELECT policy: capture separately if Phase 1 touches it — not gated
--  by an admin-only SELECT policy in the affected set at capture time.)
-- To restore a single policy: DROP POLICY <name> ON <table>; then run its block.
-- ============================================================================

CREATE POLICY aff_commissions_admin_write ON public.affiliate_commissions AS PERMISSIVE FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY aff_commissions_select ON public.affiliate_commissions AS PERMISSIVE FOR SELECT TO authenticated
  USING (((affiliate_id IN ( SELECT affiliate_accounts.id
   FROM affiliate_accounts
  WHERE (affiliate_accounts.auth_user_id = auth.uid()))) OR is_admin()));
CREATE POLICY apbi_admin_all ON public.affiliate_payout_batch_items AS PERMISSIVE FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY apb_admin_all ON public.affiliate_payout_batches AS PERMISSIVE FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY apd_admin_all ON public.affiliate_payout_documents AS PERMISSIVE FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY contest_economy_admin_all ON public.contest_economy AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)));
CREATE POLICY "Admin access to event logs" ON public.event_logs AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::app_role, 'superadmin'::app_role]))))));
CREATE POLICY influencer_commissions_read ON public.influencer_commissions AS PERMISSIVE FOR SELECT TO public
  USING (true);
CREATE POLICY partner_invoice_exports_admin_select ON public.partner_invoice_exports AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());
CREATE POLICY partner_invoice_exports_partner_select ON public.partner_invoice_exports AS PERMISSIVE FOR SELECT TO authenticated
  USING ((invoice_id IN ( SELECT i.id
   FROM (partner_invoices i
     JOIN partners p ON ((p.id = i.partner_id)))
  WHERE (p.auth_user_id = auth.uid()))));
CREATE POLICY partner_invoice_lines_admin_select ON public.partner_invoice_lines AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());
CREATE POLICY partner_invoice_lines_partner_select ON public.partner_invoice_lines AS PERMISSIVE FOR SELECT TO authenticated
  USING ((invoice_id IN ( SELECT i.id
   FROM (partner_invoices i
     JOIN partners p ON ((p.id = i.partner_id)))
  WHERE (p.auth_user_id = auth.uid()))));
CREATE POLICY partner_invoices_admin_select ON public.partner_invoices AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_admin());
CREATE POLICY partner_invoices_admin_update ON public.partner_invoices AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY partner_invoices_partner_select ON public.partner_invoices AS PERMISSIVE FOR SELECT TO authenticated
  USING ((partner_id IN ( SELECT p.id
   FROM partners p
  WHERE (p.auth_user_id = auth.uid()))));
CREATE POLICY admin_payments_read_all ON public.payments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)));
CREATE POLICY payments_select_own ON public.payments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY payments_user_read ON public.payments AS PERMISSIVE FOR SELECT TO public
  USING ((user_id = auth.uid()));
CREATE POLICY referral_rewards_select_admin ON public.referral_rewards AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)));
CREATE POLICY referral_rewards_select_own ON public.referral_rewards AS PERMISSIVE FOR SELECT TO authenticated
  USING (((referrer_user_id = auth.uid()) OR (referred_user_id = auth.uid())));
CREATE POLICY "Only admins can modify settings" ON public.settings AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::app_role, 'superadmin'::app_role]))))));
CREATE POLICY tickets_admin_select_all ON public.tickets AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)));
CREATE POLICY tickets_select_own ON public.tickets AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY tickets_user_read ON public.tickets AS PERMISSIVE FOR SELECT TO public
  USING ((user_id = auth.uid()));
CREATE POLICY "Admins can insert winner status history" ON public.winner_status_history AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((winner_id IS NOT NULL) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))));
CREATE POLICY "Admins can view winner status history" ON public.winner_status_history AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)));
CREATE POLICY "Allow read winners" ON public.winners AS PERMISSIVE FOR SELECT TO public
  USING (true);
CREATE POLICY admin_manage_winners_secure ON public.winners AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::app_role, 'superadmin'::app_role]))))));
CREATE POLICY user_can_view_own_wins ON public.winners AS PERMISSIVE FOR SELECT TO public
  USING ((user_id = auth.uid()));
CREATE POLICY winners_admin_full ON public.winners AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'superadmin'::app_role]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::app_role, 'superadmin'::app_role]))))));
CREATE POLICY winners_public_read ON public.winners AS PERMISSIVE FOR SELECT TO public
  USING (true);
CREATE POLICY winners_select_authenticated ON public.winners AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY winners_select_own ON public.winners AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));


-- ============================================================================
-- SECTION B — FUNCTION / RPC DEFINITIONS (current live definitions)
-- Reverse source for any Phase 1 RPC gate change. Re-running a block restores the
-- exact prior body (CREATE OR REPLACE). Includes the is_admin() helper as the gate
-- source of truth. NOTE: the chunked-MioCoin append RPC is named
-- admin_append_miocoin_chunk (not admin_append_miocoin_save).
-- ============================================================================

-- is_admin()  [owner=postgres, secdef=f]  — gate helper (role IN admin/superadmin)
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin','superadmin')
  );
$function$;

-- admin_manage_contest(...)  [owner=postgres, secdef=t]
CREATE OR REPLACE FUNCTION public.admin_manage_contest(p_operation text, p_contest_id uuid DEFAULT NULL::uuid, p_title text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_main_prize text DEFAULT NULL::text, p_main_image text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_ticket_count integer DEFAULT NULL::integer, p_ticket_price numeric DEFAULT NULL::numeric, p_fast_game boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_admin_id uuid;
  v_contest_id uuid;
  v_old_record contests%rowtype;
  v_new_record contests%rowtype;
  v_bonus_summary text;
BEGIN
  v_admin_id := auth.uid();

  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = v_admin_id
    AND role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Pouze administrátoři mohou spravovat soutěže';
  END IF;

  IF p_operation = 'update' AND p_contest_id IS NOT NULL THEN
    SELECT * INTO v_old_record FROM contests WHERE id = p_contest_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Soutěž nebyla nalezena'; END IF;
    IF p_ticket_count IS NOT NULL AND p_ticket_count < 5 THEN
      RAISE EXCEPTION 'Počet ticketů musí být platné číslo alespoň 5.';
    END IF;
    UPDATE contests SET
      title = COALESCE(p_title, title),
      description = COALESCE(p_description, description),
      main_prize = COALESCE(p_main_prize, main_prize),
      main_image = COALESCE(p_main_image, main_image),
      status = COALESCE(p_status, status),
      ticket_count = COALESCE(p_ticket_count, ticket_count),
      ticket_price = COALESCE(p_ticket_price, ticket_price),
      fast_game = COALESCE(p_fast_game, fast_game),
      updated_at = now()
    WHERE id = p_contest_id RETURNING * INTO v_new_record;
    v_contest_id := p_contest_id;
  ELSE
    IF p_title IS NULL OR p_main_prize IS NULL THEN
      RAISE EXCEPTION 'Název soutěže a hlavní cena jsou povinné';
    END IF;
    IF p_ticket_count IS NULL OR p_ticket_count < 5 THEN
      RAISE EXCEPTION 'Počet ticketů musí být platné číslo alespoň 5.';
    END IF;
    INSERT INTO contests (title, description, main_prize, main_image, status, ticket_count, ticket_price, fast_game)
    VALUES (p_title, p_description, p_main_prize, p_main_image, p_status, p_ticket_count, p_ticket_price, COALESCE(p_fast_game, false))
    RETURNING * INTO v_new_record;
    v_contest_id := v_new_record.id;
  END IF;

  SELECT STRING_AGG(
    CONCAT(bp.ticket_position,':',bp.description),
    ', ' ORDER BY bp.ticket_position
  ) INTO v_bonus_summary
  FROM bonus_prizes bp WHERE bp.contest_id = v_contest_id;

  INSERT INTO admin_actions (admin_id, action_type, target_table, target_id, notes, metadata)
  VALUES (v_admin_id, CONCAT('contest_', p_operation), 'contests', v_contest_id,
    CONCAT('Soutěž ', p_operation, ': ', v_new_record.title),
    jsonb_build_object('old_data', CASE WHEN p_operation = 'update' THEN to_jsonb(v_old_record) ELSE NULL END,
      'new_data', to_jsonb(v_new_record), 'operation', p_operation));

  PERFORM notify_sofinity_event(CONCAT('contest_', p_operation), v_admin_id, v_contest_id,
    jsonb_build_object('contest_id', v_contest_id, 'title', v_new_record.title,
      'ticket_count', v_new_record.ticket_count, 'admin_id', v_admin_id, 'timestamp', now()));

  RETURN jsonb_build_object('success', true,
    'message', CASE WHEN p_operation = 'create' THEN 'Soutěž byla úspěšně vytvořena' ELSE 'Soutěž byla úspěšně aktualizována' END,
    'contest_id', v_contest_id, 'contest_data', row_to_json(v_new_record));

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Chyba při správě soutěže: %', SQLERRM;
END;
$function$;

-- admin_manage_bonus_prize(... 9-arg overload ...)  [owner=postgres, secdef=t]
CREATE OR REPLACE FUNCTION public.admin_manage_bonus_prize(p_prize_id uuid DEFAULT NULL::uuid, p_contest_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_ticket_position integer DEFAULT NULL::integer, p_amount numeric DEFAULT NULL::numeric, p_status text DEFAULT 'pending'::text, p_operation text DEFAULT 'create'::text, p_image_url text DEFAULT NULL::text, p_detailed_description text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id      uuid;
  v_prize_id      uuid;
  v_old_record    bonus_prizes%rowtype;
  v_new_record    bonus_prizes%rowtype;
  v_contest_title text;
  v_payload       jsonb;
BEGIN
  v_admin_id := auth.uid();

  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = v_admin_id
      AND role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Pouze administrátoři mohou spravovat bonusové výhry';
  END IF;

  IF p_operation = 'update' AND p_prize_id IS NOT NULL THEN
    SELECT * INTO v_old_record FROM bonus_prizes WHERE id = p_prize_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bonusová výhra nebyla nalezena'; END IF;
    UPDATE bonus_prizes
    SET
      description          = COALESCE(p_description,          description),
      ticket_position      = COALESCE(p_ticket_position,      ticket_position),
      amount               = COALESCE(p_amount,               amount),
      status               = COALESCE(p_status,               status),
      image_url            = COALESCE(p_image_url,            image_url),
      detailed_description = COALESCE(p_detailed_description, detailed_description)
    WHERE id = p_prize_id
    RETURNING * INTO v_new_record;
    v_prize_id   := p_prize_id;
    p_contest_id := v_new_record.contest_id;
  ELSE
    IF p_contest_id IS NULL OR p_description IS NULL OR p_ticket_position IS NULL THEN
      RAISE EXCEPTION 'ID soutěže, popis a pozice tiketu jsou povinné';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM contests WHERE id = p_contest_id) THEN
      RAISE EXCEPTION 'Soutěž s daným ID neexistuje';
    END IF;
    IF EXISTS (
      SELECT 1 FROM bonus_prizes
      WHERE contest_id = p_contest_id AND ticket_position = p_ticket_position
    ) THEN
      RAISE EXCEPTION 'Pozice tiketu % je již obsazena v této soutěži', p_ticket_position;
    END IF;
    INSERT INTO bonus_prizes (
      contest_id, description, ticket_position, amount, status,
      image_url, detailed_description
    ) VALUES (
      p_contest_id, p_description, p_ticket_position, p_amount, p_status,
      p_image_url, p_detailed_description
    ) RETURNING * INTO v_new_record;
    v_prize_id := v_new_record.id;
  END IF;

  SELECT title INTO v_contest_title FROM contests WHERE id = p_contest_id;

  INSERT INTO admin_actions (admin_id, action_type, target_table, target_id, notes, metadata)
  VALUES (
    v_admin_id, CONCAT('bonus_prize_', p_operation), 'bonus_prizes', v_prize_id,
    CONCAT('Bonusová výhra ', p_operation, ': ', v_new_record.description, ' (pozice ', v_new_record.ticket_position, ')'),
    jsonb_build_object(
      'old_data', CASE WHEN p_operation = 'update' THEN to_jsonb(v_old_record) ELSE NULL END,
      'new_data', to_jsonb(v_new_record), 'contest_title', v_contest_title, 'operation', p_operation
    )
  );

  v_payload := jsonb_build_object(
    'event_name', CONCAT('bonus_prize_', p_operation), 'contest_id', p_contest_id, 'prize_id', v_prize_id,
    'description', v_new_record.description, 'ticket_position', v_new_record.ticket_position,
    'amount', v_new_record.amount, 'status', v_new_record.status, 'contest_title', v_contest_title,
    'admin_id', v_admin_id, 'timestamp', now()
  );

  PERFORM notify_sofinity_event(CONCAT('bonus_prize_', p_operation), v_admin_id, p_contest_id, v_payload);

  RETURN json_build_object(
    'success', true,
    'message', CASE WHEN p_operation = 'create' THEN 'Bonusová výhra byla úspěšně vytvořena' ELSE 'Bonusová výhra byla úspěšně aktualizována' END,
    'prize_id', v_prize_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$function$;

-- NOTE: a second, 7-arg overload of admin_manage_bonus_prize also exists live
-- (without p_image_url / p_detailed_description). Its body is identical in gate and
-- logic minus those two columns. Capture/restore it from production if a Phase 1
-- change touches the overload set:
--   admin_manage_bonus_prize(p_prize_id uuid, p_contest_id uuid, p_description text,
--     p_ticket_position integer, p_amount numeric, p_status text, p_operation text)

-- update_bonus_prize_delivery_status(p_prize_id uuid, p_status text, p_admin_notes text)  [secdef=t]
CREATE OR REPLACE FUNCTION public.update_bonus_prize_delivery_status(p_prize_id uuid, p_status text, p_admin_notes text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_record bonus_prizes%rowtype;
  v_new_record bonus_prizes%rowtype;
  v_admin_id uuid;
  v_contest_id uuid;
  v_payload jsonb;
BEGIN
  v_admin_id := auth.uid();
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = v_admin_id AND role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Only admin users can update prize delivery status';
  END IF;
  SELECT * INTO v_old_record FROM bonus_prizes WHERE id = p_prize_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bonus prize not found'; END IF;
  v_contest_id := v_old_record.contest_id;
  UPDATE bonus_prizes SET status = p_status, admin_notes = p_admin_notes
  WHERE id = p_prize_id RETURNING * INTO v_new_record;
  INSERT INTO admin_actions (admin_id, action_type, target_table, target_id, notes, metadata)
  VALUES (
    v_admin_id, 'bonus_prize_delivery_updated', 'bonus_prizes', p_prize_id,
    CONCAT('Updated delivery status to: ', p_status, CASE WHEN p_admin_notes IS NOT NULL THEN CONCAT(', Notes: ', p_admin_notes) ELSE '' END),
    jsonb_build_object('old_status', v_old_record.status, 'new_status', v_new_record.status,
      'old_admin_notes', v_old_record.admin_notes, 'new_admin_notes', v_new_record.admin_notes,
      'contest_id', v_contest_id, 'ticket_position', v_new_record.ticket_position, 'description', v_new_record.description)
  );
  v_payload := jsonb_build_object('event_name', 'prize_delivery_updated', 'contest_id', v_contest_id,
    'prize_id', p_prize_id, 'ticket_position', v_new_record.ticket_position, 'description', v_new_record.description,
    'old_status', v_old_record.status, 'new_status', v_new_record.status, 'admin_notes', v_new_record.admin_notes,
    'admin_id', v_admin_id, 'timestamp', now());
  PERFORM notify_sofinity_event('prize_delivery_updated', v_admin_id, v_contest_id, v_payload);
  RETURN json_build_object('success', true, 'message', 'Stav předání výhry byl úspěšně aktualizován', 'updated_prize', row_to_json(v_new_record));
EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION 'Chyba při aktualizaci stavu: %', SQLERRM;
END;
$function$;

-- admin_begin_miocoin_save(p_contest_id uuid, p_expected_count integer)  [secdef=t]
CREATE OR REPLACE FUNCTION public.admin_begin_miocoin_save(p_contest_id uuid, p_expected_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_admin_id AND role IN ('admin', 'superadmin')) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pouze administratori mohou spravovat bonusove vyhry');
  END IF;
  IF p_contest_id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'p_contest_id nesmi byt null'); END IF;
  IF p_expected_count IS NULL OR p_expected_count <= 0 THEN RETURN jsonb_build_object('success', false, 'message', 'p_expected_count musi byt vetsi nez 0'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contests WHERE id = p_contest_id) THEN RETURN jsonb_build_object('success', false, 'message', 'Soutez s danym ID neexistuje'); END IF;
  DELETE FROM public.bonus_prizes WHERE contest_id = p_contest_id AND amount > 0;
  UPDATE public.contests SET total_miocoin_bonus = 0 WHERE id = p_contest_id;
  INSERT INTO public.admin_actions (admin_id, action_type, target_table, target_id, notes, metadata)
  VALUES (v_admin_id, 'miocoin_save_begin', 'bonus_prizes', p_contest_id,
    format('Chunked MioCoin save: begin (expected %s pozic)', p_expected_count),
    jsonb_build_object('contest_id', p_contest_id, 'expected_count', p_expected_count));
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$function$;

-- admin_append_miocoin_chunk(p_contest_id uuid, p_bonuses jsonb)  [secdef=t]
CREATE OR REPLACE FUNCTION public.admin_append_miocoin_chunk(p_contest_id uuid, p_bonuses jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id       uuid;
  v_invalid_count  integer;
  v_inserted_count integer;
BEGIN
  v_admin_id := auth.uid();
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_admin_id AND role IN ('admin', 'superadmin')) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pouze administratori mohou spravovat bonusove vyhry');
  END IF;
  IF p_contest_id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'p_contest_id nesmi byt null'); END IF;
  IF p_bonuses IS NULL OR jsonb_typeof(p_bonuses) <> 'array' THEN RETURN jsonb_build_object('success', false, 'message', 'p_bonuses musi byt JSON pole'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contests WHERE id = p_contest_id) THEN RETURN jsonb_build_object('success', false, 'message', 'Soutez s danym ID neexistuje'); END IF;
  SELECT COUNT(*) INTO v_invalid_count
  FROM jsonb_array_elements(p_bonuses) AS elem
  WHERE NULLIF(elem->>'ticket_position', '')::integer IS NULL
     OR NULLIF(elem->>'amount', '')::numeric IS NULL
     OR (elem->>'amount')::numeric <= 0;
  IF v_invalid_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'message', format('%s polozek v chunku ma chybejici nebo neplatne ticket_position / amount', v_invalid_count));
  END IF;
  INSERT INTO public.bonus_prizes (contest_id, description, ticket_position, amount, status)
  SELECT p_contest_id, (elem->>'amount') || ' MioCoin', (elem->>'ticket_position')::integer, (elem->>'amount')::numeric, 'pending'
  FROM jsonb_array_elements(p_bonuses) AS elem;
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'inserted_count', v_inserted_count);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$function$;

-- admin_finalize_miocoin_save(p_contest_id uuid, p_expected_count integer)  [secdef=t]
CREATE OR REPLACE FUNCTION public.admin_finalize_miocoin_save(p_contest_id uuid, p_expected_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id     uuid;
  v_real_count   integer;
  v_total_amount numeric;
BEGIN
  v_admin_id := auth.uid();
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_admin_id AND role IN ('admin', 'superadmin')) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pouze administratori mohou spravovat bonusove vyhry');
  END IF;
  IF p_contest_id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'p_contest_id nesmi byt null'); END IF;
  IF p_expected_count IS NULL OR p_expected_count <= 0 THEN RETURN jsonb_build_object('success', false, 'message', 'p_expected_count musi byt vetsi nez 0'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contests WHERE id = p_contest_id) THEN RETURN jsonb_build_object('success', false, 'message', 'Soutez s danym ID neexistuje'); END IF;
  SELECT COUNT(*), COALESCE(SUM(amount), 0) INTO v_real_count, v_total_amount
  FROM public.bonus_prizes WHERE contest_id = p_contest_id AND amount > 0;
  IF v_real_count <> p_expected_count THEN
    RETURN jsonb_build_object('success', false,
      'message', format('Pocet ulozenych MioCoin pozic (%s) neodpovida ocekavanemu (%s). Save nebyl dokoncen.', v_real_count, p_expected_count),
      'real_count', v_real_count, 'expected_count', p_expected_count);
  END IF;
  UPDATE public.contests SET total_miocoin_bonus = v_total_amount WHERE id = p_contest_id;
  INSERT INTO public.admin_actions (admin_id, action_type, target_table, target_id, notes, metadata)
  VALUES (v_admin_id, 'miocoin_bulk_create', 'bonus_prizes', p_contest_id,
    format('Chunked MioCoin save: %s pozic, celkem %s MioCoin', v_real_count, v_total_amount),
    jsonb_build_object('contest_id', p_contest_id, 'inserted_count', v_real_count, 'total_amount', v_total_amount, 'chunked', true));
  RETURN jsonb_build_object('success', true, 'inserted_count', v_real_count, 'total_amount', v_total_amount);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$function$;

-- get_admin_top_bar_stats()  [secdef=t]
CREATE OR REPLACE FUNCTION public.get_admin_top_bar_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id        uuid;
  v_today_start     timestamptz;
  v_games_today     integer;
  v_payments_today  integer;
  v_payment_amounts numeric[];
BEGIN
  v_admin_id := auth.uid();
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_admin_id AND role IN ('admin', 'superadmin')) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pouze administratori mohou cist admin top-bar staty');
  END IF;
  v_today_start := (date_trunc('day', now() AT TIME ZONE 'Europe/Prague')) AT TIME ZONE 'Europe/Prague';
  SELECT COUNT(*) INTO v_games_today FROM public.tickets WHERE created_at >= v_today_start;
  SELECT COUNT(*), COALESCE(array_agg(amount) FILTER (WHERE amount IS NOT NULL), ARRAY[]::numeric[])
  INTO v_payments_today, v_payment_amounts
  FROM public.payments WHERE created_at >= v_today_start AND status = 'completed';
  RETURN jsonb_build_object('success', true, 'games_today', v_games_today, 'payments_today', v_payments_today, 'payment_amounts', v_payment_amounts);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$function$;

-- admin_set_affiliate_commission_status(p_commission_id uuid, p_new_status text)  [secdef=t, gate is_admin()]
CREATE OR REPLACE FUNCTION public.admin_set_affiliate_commission_status(p_commission_id uuid, p_new_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_current text;
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('status', 'forbidden'); END IF;
  IF p_new_status IS NULL OR p_new_status NOT IN ('approved', 'paid') THEN RETURN jsonb_build_object('status', 'invalid_status'); END IF;
  SELECT status INTO v_current FROM public.affiliate_commissions WHERE id = p_commission_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF p_new_status = 'paid' THEN RETURN jsonb_build_object('status', 'invalid_transition', 'from', v_current, 'to', p_new_status); END IF;
  IF NOT (v_current = 'calculated' AND p_new_status = 'approved') THEN
    RETURN jsonb_build_object('status', 'invalid_transition', 'from', v_current, 'to', p_new_status);
  END IF;
  UPDATE public.affiliate_commissions SET status = 'approved', updated_at = now() WHERE id = p_commission_id;
  RETURN jsonb_build_object('status', 'updated', 'id', p_commission_id, 'from', v_current, 'to', p_new_status);
END;
$function$;

-- mark_affiliate_payout_batch_paid(p_batch_id uuid)  [secdef=t, gate is_admin()]
CREATE OR REPLACE FUNCTION public.mark_affiliate_payout_batch_paid(p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_admin_id uuid := auth.uid();
  v_batch public.affiliate_payout_batches%ROWTYPE;
  v_item_count integer;
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('status', 'forbidden'); END IF;
  SELECT * INTO v_batch FROM public.affiliate_payout_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF v_batch.status <> 'exported' THEN
    RETURN jsonb_build_object('status', 'invalid_batch_status', 'current_status', v_batch.status, 'required_status', 'exported');
  END IF;
  SELECT count(*) INTO v_item_count FROM public.affiliate_payout_batch_items WHERE batch_id = p_batch_id;
  IF v_item_count = 0 THEN RETURN jsonb_build_object('status', 'empty_batch'); END IF;
  IF EXISTS (
    SELECT 1 FROM public.affiliate_commissions c
    JOIN public.affiliate_payout_batch_items i ON i.commission_id = c.id
    WHERE i.batch_id = p_batch_id AND c.status <> 'in_payment_batch'
  ) THEN RETURN jsonb_build_object('status', 'invalid_commission_status'); END IF;
  UPDATE public.affiliate_payout_batches SET status = 'paid', marked_paid_by = v_admin_id, marked_paid_at = now() WHERE id = p_batch_id;
  UPDATE public.affiliate_commissions c
  SET status = 'paid', paid_at = now(), paid_by = v_admin_id, updated_at = now()
  FROM public.affiliate_payout_batch_items i
  WHERE i.batch_id = p_batch_id AND i.commission_id = c.id;
  RETURN jsonb_build_object('status', 'paid', 'batch_id', p_batch_id, 'item_count', v_item_count, 'total_amount_czk', v_batch.total_amount_czk);
END;
$function$;

-- update_affiliate_payout_batch_meta(p_batch_id uuid, p_payer_account text, p_payer_bank_code text, p_due_date date)  [secdef=t, gate is_admin()]
CREATE OR REPLACE FUNCTION public.update_affiliate_payout_batch_meta(p_batch_id uuid, p_payer_account text, p_payer_bank_code text, p_due_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_batch record;
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('success', false, 'status', 'forbidden'); END IF;
  SELECT id, status INTO v_batch FROM public.affiliate_payout_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'status', 'not_found'); END IF;
  IF v_batch.status <> 'created' THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid_batch_status', 'current_status', v_batch.status, 'required_status', 'created');
  END IF;
  IF p_payer_account IS NULL OR p_payer_account = '' THEN RETURN jsonb_build_object('success', false, 'status', 'missing_payer_account'); END IF;
  IF p_payer_account !~ '^[0-9]{1,6}-?[0-9]{1,10}$' THEN RETURN jsonb_build_object('success', false, 'status', 'invalid_payer_account'); END IF;
  IF p_payer_bank_code IS NULL OR p_payer_bank_code = '' THEN RETURN jsonb_build_object('success', false, 'status', 'missing_payer_bank_code'); END IF;
  IF p_payer_bank_code <> '3030' THEN RETURN jsonb_build_object('success', false, 'status', 'invalid_airbank_payer_bank_code'); END IF;
  IF p_due_date IS NULL THEN RETURN jsonb_build_object('success', false, 'status', 'missing_due_date'); END IF;
  IF p_due_date < current_date THEN RETURN jsonb_build_object('success', false, 'status', 'invalid_due_date_past'); END IF;
  IF p_due_date > current_date + 364 THEN RETURN jsonb_build_object('success', false, 'status', 'invalid_due_date_future'); END IF;
  UPDATE public.affiliate_payout_batches SET payer_account = p_payer_account, payer_bank_code = p_payer_bank_code, due_date = p_due_date WHERE id = p_batch_id;
  RETURN jsonb_build_object('success', true, 'status', 'updated', 'batch_id', p_batch_id);
END;
$function$;

-- create_affiliate_payout_batch(p_commission_ids uuid[])  [secdef=t, gate is_admin()]
-- Long body — captured verbatim from production. Reverse source for any Phase 1 gate change.
CREATE OR REPLACE FUNCTION public.create_affiliate_payout_batch(p_commission_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_admin_id       uuid    := auth.uid();
  v_ids            uuid[];
  v_requested_count integer;
  v_locked_count   integer;
  v_batch_id       uuid    := gen_random_uuid();
  v_batch_seq      bigint;
  v_batch_number   text;
  v_total          numeric(12,2);
  v_item_count     integer;
  v_invalid        record;
  v_payer_account  text;
  v_payer_bank_code text;
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('status', 'forbidden'); END IF;
  SELECT value INTO v_payer_account FROM public.settings WHERE key = 'affiliate_payout_payer_account';
  IF v_payer_account IS NULL THEN RETURN jsonb_build_object('status', 'missing_payer_account_setting'); END IF;
  SELECT value INTO v_payer_bank_code FROM public.settings WHERE key = 'affiliate_payout_payer_bank_code';
  v_payer_bank_code := coalesce(v_payer_bank_code, '3030');
  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(coalesce(p_commission_ids, ARRAY[]::uuid[])) AS x WHERE x IS NOT NULL;
  v_requested_count := coalesce(array_length(v_ids, 1), 0);
  IF v_requested_count = 0 THEN RETURN jsonb_build_object('status', 'empty_selection'); END IF;
  v_batch_seq := nextval('public.affiliate_payout_batch_seq');
  IF v_batch_seq > 999999 THEN RETURN jsonb_build_object('status', 'batch_sequence_exhausted'); END IF;
  v_batch_number := 'APB-' || to_char(now(), 'YYYY') || '-' || lpad(v_batch_seq::text, 6, '0');
  DROP TABLE IF EXISTS pg_temp.tmp_affiliate_payout_batch_selection;
  CREATE TEMP TABLE tmp_affiliate_payout_batch_selection (
    commission_id uuid PRIMARY KEY, affiliate_id uuid NOT NULL, amount_total_czk numeric(12,2),
    recipient_name text, recipient_account text, recipient_bank_code text, rn integer NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO tmp_affiliate_payout_batch_selection (commission_id, affiliate_id, amount_total_czk, recipient_name, recipient_account, recipient_bank_code, rn)
  WITH locked_commissions AS (
    SELECT c.id, c.affiliate_id, c.amount_total_czk, c.created_at,
      btrim(a.name) AS recipient_name, btrim(a.payout_account) AS recipient_account, btrim(a.payout_bank) AS recipient_bank_code
    FROM public.affiliate_commissions c JOIN public.affiliate_accounts a ON a.id = c.affiliate_id
    WHERE c.id = ANY(v_ids) FOR UPDATE OF c
  )
  SELECT id, affiliate_id, amount_total_czk, recipient_name, recipient_account, recipient_bank_code,
    row_number() OVER (ORDER BY created_at, id)::integer FROM locked_commissions;
  SELECT count(*) INTO v_locked_count FROM tmp_affiliate_payout_batch_selection;
  IF v_locked_count <> v_requested_count THEN
    RETURN jsonb_build_object('status', 'not_found', 'requested_count', v_requested_count, 'found_count', v_locked_count);
  END IF;
  SELECT c.id, c.status, c.payout_batch_id, c.amount_total_czk, t.recipient_name, t.recipient_account, t.recipient_bank_code
  INTO v_invalid
  FROM public.affiliate_commissions c JOIN tmp_affiliate_payout_batch_selection t ON t.commission_id = c.id
  WHERE c.status <> 'ready_to_pay' OR c.payout_batch_id IS NOT NULL OR c.amount_total_czk IS NULL OR c.amount_total_czk <= 0
     OR t.recipient_name IS NULL OR t.recipient_name = '' OR t.recipient_account IS NULL OR t.recipient_account = ''
     OR t.recipient_account !~ '^[0-9]{2,6}-?[0-9]{2,10}$' OR t.recipient_bank_code IS NULL OR t.recipient_bank_code = ''
     OR t.recipient_bank_code !~ '^[0-9]{4}$'
  ORDER BY c.created_at, c.id LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('status',
      CASE
        WHEN v_invalid.status <> 'ready_to_pay' THEN 'invalid_commission_status'
        WHEN v_invalid.payout_batch_id IS NOT NULL THEN 'already_in_batch'
        WHEN v_invalid.amount_total_czk IS NULL OR v_invalid.amount_total_czk <= 0 THEN 'invalid_amount'
        WHEN v_invalid.recipient_name IS NULL OR v_invalid.recipient_name = '' THEN 'missing_recipient_name'
        WHEN v_invalid.recipient_account IS NULL OR v_invalid.recipient_account = '' THEN 'missing_recipient_account'
        WHEN v_invalid.recipient_account !~ '^[0-9]{2,6}-?[0-9]{2,10}$' THEN 'invalid_recipient_account'
        WHEN v_invalid.recipient_bank_code IS NULL OR v_invalid.recipient_bank_code = '' THEN 'missing_recipient_bank_code'
        WHEN v_invalid.recipient_bank_code !~ '^[0-9]{4}$' THEN 'invalid_recipient_bank_code'
        ELSE 'invalid_commission'
      END,
      'commission_id', v_invalid.id, 'current_status', v_invalid.status);
  END IF;
  SELECT count(*), coalesce(sum(amount_total_czk), 0) INTO v_item_count, v_total FROM tmp_affiliate_payout_batch_selection;
  IF v_item_count > 9999 THEN RETURN jsonb_build_object('status', 'too_many_items', 'item_count', v_item_count); END IF;
  INSERT INTO public.affiliate_payout_batches (id, batch_number, status, bank, bank_export_format, bank_export_encoding, bank_export_line_endings, total_amount_czk, item_count, created_by, payer_account, payer_bank_code, due_date)
  VALUES (v_batch_id, v_batch_number, 'created', 'airbank', 'abo_kpc', 'windows-1250', 'crlf', v_total, v_item_count, v_admin_id, v_payer_account, v_payer_bank_code, current_date + 2);
  INSERT INTO public.affiliate_payout_batch_items (batch_id, commission_id, amount_czk, recipient_account, recipient_bank_code, recipient_name, variable_symbol, payment_message, constant_symbol)
  SELECT v_batch_id, t.commission_id, t.amount_total_czk, t.recipient_account, t.recipient_bank_code, t.recipient_name,
    lpad(((v_batch_seq - 1) * 10000 + t.rn)::text, 10, '0'), left('OneMil provize ' || v_batch_number, 35), '0000'
  FROM tmp_affiliate_payout_batch_selection t ORDER BY t.rn;
  UPDATE public.affiliate_commissions c SET status = 'in_payment_batch', payout_batch_id = v_batch_id, updated_at = now() WHERE c.id = ANY(v_ids);
  RETURN jsonb_build_object('status', 'created', 'batch_id', v_batch_id, 'batch_number', v_batch_number, 'item_count', v_item_count, 'total_amount_czk', v_total);
END;
$function$;

-- ============================================================================
-- END OF BASELINE. Captured read-only on 2026-06-22 from production
-- xkzhjldrojjlrkezorey. Use as reverse source ONLY. Verify the live definition
-- again immediately before any Phase 1 change in case production drifts further.
-- ============================================================================
