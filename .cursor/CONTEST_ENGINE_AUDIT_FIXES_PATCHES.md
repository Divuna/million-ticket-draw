# Contest engine audit – proposed patches (no automatic code changes)

Apply these patches manually. All SQL goes in **new** migration(s); do not modify existing migration files.

---

## 1. One main winner per contest (DB constraint)

**Purpose:** Enforce at most one main winner per contest at the database level.

**New migration file:** `supabase/migrations/20260315160000_contest_engine_safety.sql` (or next timestamp).

If you already have duplicate main winners, fix them first (keep one per contest), then add the index:

```sql
-- Optional: remove duplicate main winners (keep one per contest, e.g. earliest)
-- Run only if you have duplicates; adjust to match your policy (e.g. keep min(id)).
/*
DELETE FROM public.winners a
USING public.winners b
WHERE a.contest_id = b.contest_id
  AND a.type = 'main'
  AND b.type = 'main'
  AND a.id > b.id;
*/

-- Enforce at most one main winner per contest
CREATE UNIQUE INDEX IF NOT EXISTS idx_winners_one_main_per_contest
  ON public.winners (contest_id)
  WHERE type = 'main';
```

---

## 2. close_contest race condition fix

**Purpose:** Re-check contest status and existing main winner **after** acquiring the row lock, so concurrent callers cannot insert a second main winner.

**In the same new migration**, replace `close_contest` with this version (full function body):

```sql
CREATE OR REPLACE FUNCTION public.close_contest(p_contest_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ticket record;
  v_status text;
begin
  -- Acquire lock first, then re-read status and check for existing main winner
  select status
  into v_status
  from contests
  where id = p_contest_id
  for update;

  if not found then
    return;  -- contest not found
  end if;

  if v_status = 'closed' then
    return;
  end if;

  -- Prevent duplicate main winner even if another caller already inserted
  if exists (
    select 1 from winners
    where contest_id = p_contest_id and type = 'main'
  ) then
    update contests set status = 'closed' where id = p_contest_id;
    return;
  end if;

  select *
  into v_ticket
  from tickets
  where contest_id = p_contest_id
  order by random()
  limit 1;

  if v_ticket is null then
    update contests
    set status = 'closed'
    where id = p_contest_id;
    return;
  end if;

  insert into winners (
    contest_id,
    user_id,
    ticket_id,
    type,
    created_at
  )
  values (
    p_contest_id,
    v_ticket.user_id,
    v_ticket.id,
    'main',
    now()
  );

  update contests
  set status = 'closed'
  where id = p_contest_id;
end;
$function$;
```

**Changes vs current:** Status is read **inside** `SELECT ... FOR UPDATE` (so under lock). After the lock, we check `EXISTS (SELECT 1 FROM winners WHERE contest_id = p_contest_id AND type = 'main')` and return (after syncing contest status to `closed` if needed) instead of inserting again.

---

## 3. redeem_miocoin – credit wallets.balance_coins

**Purpose:** When a user redeems a MioCoin bonus (amount > 0), add that amount to their wallet. Credit only on first redeem (when status was `pending`) to avoid double-credit.

**In the same new migration**, replace `redeem_miocoin` with this version:

```sql
CREATE OR REPLACE FUNCTION public.redeem_miocoin(p_user_id uuid, p_contest_id uuid, p_ticket_position integer)
 RETURNS TABLE(success boolean, message text, new_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_bonus_id uuid;
    current_status text;
    v_winner_user_id uuid;
    v_amount numeric;
BEGIN
    IF p_user_id IS DISTINCT FROM auth.uid() THEN
        success := false;
        message := 'Unauthorized';
        new_status := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    SELECT id, status, COALESCE(amount, 0) INTO v_bonus_id, current_status, v_amount
    FROM bonus_prizes
    WHERE contest_id = p_contest_id
      AND ticket_position = p_ticket_position
    LIMIT 1;

    IF v_bonus_id IS NULL THEN
        success := false;
        message := 'Bonus nebyl nalezen';
        new_status := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    SELECT user_id INTO v_winner_user_id
    FROM winners
    WHERE contest_id = p_contest_id
      AND prize_id = v_bonus_id
      AND type = 'bonus'
    LIMIT 1;

    IF v_winner_user_id IS NULL OR v_winner_user_id <> p_user_id THEN
        success := false;
        message := 'Tento bonus vám nepatří';
        new_status := current_status;
        RETURN NEXT;
        RETURN;
    END IF;

    IF current_status = 'pending' OR current_status = 'won' OR current_status = 'delivered' THEN
        -- Credit wallet only on first redeem (pending -> won) when bonus has MioCoin amount
        IF current_status = 'pending' AND v_amount > 0 THEN
            UPDATE wallets
            SET balance_coins = balance_coins + v_amount
            WHERE user_id = p_user_id;
        END IF;

        UPDATE bonus_prizes
        SET status = 'won'
        WHERE id = v_bonus_id;

        success := true;
        message := 'Miocoin byl úspěšně uplatněn';
        new_status := 'won';
        RETURN NEXT;
    ELSE
        success := false;
        message := 'Nelze uplatnit bonus s tímto statusem';
        new_status := current_status;
        RETURN NEXT;
    END IF;
END;
$function$;
```

**Changes vs current:** (1) Select `COALESCE(amount, 0)` into `v_amount`. (2) When `current_status = 'pending'` and `v_amount > 0`, run `UPDATE wallets SET balance_coins = balance_coins + v_amount WHERE user_id = p_user_id` before setting bonus status to `'won'`. No application code changes required if the RPC is already called the same way.

---

## 4. wallets.balance_coins non-negative (validate constraint)

**Purpose:** Ensure the existing CHECK constraint is enforced on all rows (including existing ones). Fix any negative balances first, then validate.

**In the same new migration** (or a separate one):

```sql
-- Fix any existing negative balances (optional but recommended before validate)
UPDATE public.wallets
SET balance_coins = 0
WHERE balance_coins < 0;

-- Enforce CHECK on existing rows (constraint was added with NOT VALID in 20260315140000)
ALTER TABLE public.wallets
  VALIDATE CONSTRAINT wallets_balance_coins_non_negative;
```

If the constraint name differs in your DB, use the actual name. If the constraint does not exist, add it then validate:

```sql
-- Only if the constraint was never added:
ALTER TABLE public.wallets
  ADD CONSTRAINT wallets_balance_coins_non_negative
  CHECK (balance_coins >= 0) NOT VALID;
UPDATE public.wallets SET balance_coins = 0 WHERE balance_coins < 0;
ALTER TABLE public.wallets VALIDATE CONSTRAINT wallets_balance_coins_non_negative;
```

---

## 5. Compatibility and ordering

- **Tables:** No new columns or renames; only new index, function replacements, and constraint validation.
- **Migrations:** Use a single new migration (e.g. `20260315160000_contest_engine_safety.sql`) that includes:
  1. Optional cleanup of duplicate main winners (commented or conditional).
  2. `CREATE UNIQUE INDEX ... idx_winners_one_main_per_contest`.
  3. `CREATE OR REPLACE FUNCTION public.close_contest ...`.
  4. `CREATE OR REPLACE FUNCTION public.redeem_miocoin ...`.
  5. `UPDATE wallets ... WHERE balance_coins < 0` and `ALTER TABLE ... VALIDATE CONSTRAINT ...`.
- **Edge case (audit §5):** `close_contest` with zero tickets still sets contest to `closed` and returns without inserting a winner. No code change required; callers/UI should handle “closed with no main winner” if they assume every closed contest has a main winner.

---

## 6. No application code changes

- `supabase/functions/close-contest/index.ts`: No change needed; it just calls `close_contest` RPC. The fix is entirely in the DB.
- Frontend/other callers of `redeem_miocoin`: No change needed; wallet is credited inside the function.

---

## Summary

| Requirement                         | Patch                                                                 |
|------------------------------------|-----------------------------------------------------------------------|
| Only one main winner per contest   | Partial unique index on `winners(contest_id) WHERE type = 'main'`     |
| close_contest race fix             | Read status under `FOR UPDATE`; check `EXISTS` main winner after lock |
| redeem_miocoin credits wallet      | When `current_status = 'pending'` and `v_amount > 0`, add to `balance_coins` |
| balance_coins non-negative         | Fix negatives, then `VALIDATE CONSTRAINT wallets_balance_coins_non_negative` |
| Compatibility                      | New migration only; no table/column drops or renames                  |
