-- ============================================================================
-- Winners as single source of truth for actually-won prize status.
-- ============================================================================
-- Applied to STAGING (dxmowysntemfqfnanxua) only as part of this change.
-- Production (xkzhjldrojjlrkezorey) requires a separate explicit approval
-- and apply step; this migration file is committed for that future review.
--
-- Scope:
--   1. winners.status DEFAULT changed from the historical Czech placeholder
--      text to 'pending' (a value admin_update_winner_status already
--      recognizes). This only changes what NEW rows get from now on -
--      no existing row is touched or updated by this migration.
--   2. New read-only view admin_physical_winners: one unified read model
--      over winners (main + bonus), joined to contests / bonus_prizes /
--      tickets, restricted to PHYSICAL prizes only. Main winners are always
--      physical. Bonus winners are physical when bonus_prizes.amount is
--      null/0 (the existing structured field, replacing the old text-based
--      heuristic). MioCoin bonus rows (amount > 0) are intentionally
--      excluded from this view - they are auto-credited and never need a
--      physical delivery workflow.
--      Completion is read from winners.delivered (boolean) - the one flag
--      both existing write RPCs (admin_update_winner_status and
--      update_bonus_prize_delivery_status) already set consistently on the
--      'delivered' transition. This view does not introduce any new
--      status vocabulary.
--      Orphaned bonus winners (prize_id set but the bonus_prizes row is
--      gone - see note below) are conservatively classified as physical /
--      needing review, so they stay visible to an admin rather than
--      silently disappearing.
--   3. admin_winner_delivery_stats rewritten to:
--      - use contests.title instead of the unreliable contests.name,
--      - count only physical winners (main + bonus with amount<=0),
--      - split by winners.delivered (not a text status comparison).
--      Column names and types are UNCHANGED (contest_id, contest_name,
--      total_winners bigint, delivered bigint, pending bigint) - Postgres'
--      CREATE OR REPLACE VIEW does not allow changing an existing column's
--      type, only contest_name's underlying value changes (now contests.title
--      instead of contests.name). The frontend defensively wraps every value
--      read from this view in Number(...) before summing, the same pattern
--      already used elsewhere in this codebase for PostgREST numeric-like
--      columns that may serialize as strings.
--
-- Explicitly NOT done here:
--   - No FK on winners.prize_id -> bonus_prizes.id.
--     Verified directly on staging before writing this migration:
--       - main-type winners: prize_id is NULL for all rows (100%) -
--         fully FK-compatible on that side.
--       - bonus-type winners: of the rows with prize_id set, the large
--         majority (360 of 365 on staging at the time of this migration)
--         point to a bonus_prizes row that no longer exists.
--     Root cause identified precisely, not guessed: admin_begin_miocoin_save()
--     runs `DELETE FROM bonus_prizes WHERE contest_id = ... AND amount > 0`
--     every time an admin re-saves a contest's MioCoin bonus positions. Any
--     winners row that had already won one of the deleted rows is orphaned
--     by that existing, currently-active admin flow - confirmed still
--     happening on staging up to the day of this migration, and confirmed
--     (for at least half the orphans) to correspond to real MioCoin wallet
--     credits via wallet_transactions.
--     A hard FK would fail to apply over this existing data, and a NOT VALID
--     FK would misrepresent a relationship the application does not actually
--     guarantee going forward (the same delete-and-regenerate flow can
--     orphan new rows at any time). This is a separate, pre-existing data
--     integrity gap in the MioCoin bonus-position regeneration flow, left
--     for its own explicitly-approved fix - not silently constrained here.
--   - No change to any existing winners or bonus_prizes row.
--   - No change to update_bonus_prize_delivery_status's SQL body. Its only
--     caller (the AdminPrizeDelivery edit/bulk-update UI) is removed on the
--     frontend in this same change, so the RPC becomes unused rather than
--     deleted - left in place for a future explicit cleanup decision.
--   - No change to wallets, wallet_transactions, buy_ticket_atomic,
--     assign_contest_ticket_atomic, or trg_bonus_to_wallet.
-- ============================================================================

-- Discovered while testing this change: staging (dxmowysntemfqfnanxua) is
-- missing admin_update_winner_status entirely (only production had it -
-- confirmed live and already audited there in the prior session). Without
-- it, /admin/winners on staging cannot write a status change at all today.
-- Re-created here byte-for-byte from the confirmed production definition so
-- staging can actually be used to test this change - no new business logic
-- introduced, purely closing a staging/production gap that predates this
-- migration.
create or replace function public.admin_update_winner_status(p_winner_id uuid, p_new_status text, p_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id     uuid := auth.uid();
  v_winner       public.winners%rowtype;
  v_old_status   text;
  v_delivered    boolean;
  v_message      text;
  v_prize_synced boolean := false;
BEGIN
  IF NOT (
    public.has_role(v_admin_id, 'admin'::public.app_role)
    OR public.has_role(v_admin_id, 'superadmin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_new_status IS NULL OR p_new_status NOT IN (
    'pending', 'připraveno k odeslání', 'shipped', 'delivered'
  ) THEN
    RAISE EXCEPTION 'Neplatný stav výhry: %', COALESCE(p_new_status, '(null)');
  END IF;

  SELECT * INTO v_winner
  FROM public.winners
  WHERE id = p_winner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Výhra nenalezena';
  END IF;

  v_old_status := COALESCE(v_winner.status, 'pending');
  v_delivered  := (p_new_status = 'delivered');

  UPDATE public.winners
  SET
    status    = p_new_status,
    delivered = CASE WHEN v_delivered THEN true ELSE delivered END
  WHERE id = p_winner_id;

  INSERT INTO public.winner_status_history (winner_id, old_status, new_status, changed_by)
  VALUES (p_winner_id, v_old_status, p_new_status, v_admin_id);

  v_message := COALESCE(
    NULLIF(btrim(p_message), ''),
    'Stav vaší výhry byl aktualizován na: ' || p_new_status || '.'
  );

  INSERT INTO public.messages (user_id, sender, content, read, topic, event, payload)
  VALUES (
    v_winner.user_id,
    'admin',
    v_message,
    false,
    'prize_status',
    'prize_status_change',
    jsonb_build_object(
      'winner_id',  p_winner_id,
      'new_status', p_new_status,
      'old_status', v_old_status
    )
  );

  IF v_winner.prize_id IS NOT NULL AND v_delivered THEN
    UPDATE public.bonus_prizes
    SET status = 'delivered'
    WHERE id = v_winner.prize_id
      AND status IS DISTINCT FROM 'delivered';
    v_prize_synced := FOUND;
  END IF;

  INSERT INTO public.admin_actions (
    admin_id, action_type, target_table, target_id, notes, metadata
  ) VALUES (
    v_admin_id,
    'winner_status_updated',
    'winners',
    p_winner_id,
    CONCAT('Stav výhry změněn: ', v_old_status, ' → ', p_new_status),
    jsonb_build_object(
      'old_status',        v_old_status,
      'new_status',        p_new_status,
      'delivered',         v_delivered,
      'prize_id',          v_winner.prize_id,
      'contest_id',        v_winner.contest_id,
      'bonus_prize_synced', v_prize_synced
    )
  );

  RETURN jsonb_build_object(
    'success',            true,
    'winner_id',          p_winner_id,
    'old_status',         v_old_status,
    'new_status',         p_new_status,
    'delivered',          v_delivered,
    'bonus_prize_synced', v_prize_synced,
    'user_notified',      true
  );
END;
$function$;

revoke all on function public.admin_update_winner_status(uuid, text, text) from public, anon;
grant execute on function public.admin_update_winner_status(uuid, text, text) to authenticated;

alter table public.winners
  alter column status set default 'pending';

create or replace view public.admin_physical_winners
with (security_invoker = on)
as
select
  w.id as winner_id,
  w.contest_id,
  c.title as contest_title,
  w.type,
  w.status,
  w.delivered,
  w.notes as admin_notes,
  w.created_at,
  w.user_id,
  w.ticket_id,
  w.prize_id,
  case
    when w.type = 'main' then coalesce(nullif(btrim(c.main_prize), ''), 'Hlavní výhra')
    else coalesce(bp.description, 'Bonusová výhra (detail ceny už v soutěži neexistuje)')
  end as description,
  case
    when w.type = 'main' then coalesce(c.main_prize_secondary_image, c.main_image)
    else bp.image_url
  end as image_url,
  case
    when w.type = 'bonus' then bp.ticket_position
    else t.number
  end as ticket_position,
  case when w.type = 'bonus' then bp.amount else null end as amount,
  case when w.type = 'bonus' then bp.guardian_required else null end as guardian_required
from public.winners w
join public.contests c on c.id = w.contest_id
left join public.bonus_prizes bp on bp.id = w.prize_id and w.type = 'bonus'
left join public.tickets t on t.id = w.ticket_id and w.type = 'main'
where w.type = 'main' or coalesce(bp.amount, 0) = 0;

comment on view public.admin_physical_winners is
  'Unified admin read model over winners for physical prizes only (main always physical; bonus physical when bonus_prizes.amount is null/0). MioCoin bonus winners (amount > 0) are excluded. delivered (boolean, from winners) is the single authoritative completion flag - Sprava vyher filters delivered = false, Predani vyher filters delivered = true. No rows are copied or moved; this is a read-only view over winners.';

revoke all on public.admin_physical_winners from public, anon;
grant select on public.admin_physical_winners to authenticated;

create or replace view public.admin_winner_delivery_stats
with (security_invoker = on)
as
select
  c.id as contest_id,
  c.title as contest_name,
  count(w.id) filter (where w.type = 'main' or coalesce(bp.amount, 0) = 0) as total_winners,
  count(w.id) filter (where (w.type = 'main' or coalesce(bp.amount, 0) = 0) and w.delivered) as delivered,
  count(w.id) filter (where (w.type = 'main' or coalesce(bp.amount, 0) = 0) and not w.delivered) as pending
from public.contests c
left join public.winners w on w.contest_id = c.id
left join public.bonus_prizes bp on bp.id = w.prize_id and w.type = 'bonus'
group by c.id, c.title;

comment on view public.admin_winner_delivery_stats is
  'Per-contest physical-winner delivery stats (main + bonus, MioCoin excluded). contest_name carries contests.title. delivered/pending are counted from winners.delivered, the single authoritative completion flag.';

revoke all on public.admin_winner_delivery_stats from public, anon;
grant select on public.admin_winner_delivery_stats to authenticated;
