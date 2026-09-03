-- Contest control hardening: pause_contest / resume_contest
-- ---------------------------------------------------------------------------
-- Kontext (audit A05, docs/ONEMIL_MASTER_AUDIT_RESULTS.md):
--
-- 1) ADMIN GUARD — již existuje, tato migrace ho pouze znovu potvrzuje.
--    Původní definice `20260316120000_contest_control_rpcs.sql` guard neměla
--    vůbec. Migrace `20260718163000_security_rpc_hardening.sql` obě funkce
--    přepsala a guard `has_role(auth.uid(),'admin'|'superadmin')` doplnila.
--    Auditní report citoval starší soubor, proto uváděl guard jako chybějící.
--    Tato migrace guard idempotentně znovu deklaruje, aby byl stav v migracích
--    jednoznačný a nešel omylem přepsat starší definicí.
--
-- 2) CLOSED JE KONEČNÝ STAV — SKUTEČNÁ OPRAVA této migrace.
--    Podle pravidla projektu (CLAUDE.md, „Contest admin – uzamčená pravidla“)
--    je `closed` finální: uzavřená soutěž se nesmí vrátit do žádného jiného
--    stavu. Dosud to vynucovalo pouze admin UI (disabled Select + guard
--    v `handleStatusChange`), takže přímé RPC volání mimo UI mohlo uzavřenou
--    soutěž znovu aktivovat. Nově je pravidlo vynuceno v databázi.
--
-- Rozsah: pouze tělo dvou funkcí + jejich EXECUTE granty.
-- NEMĚNÍ se: close_contest, trigger_contest_draw, buy_ticket_atomic, winners,
-- bonus_prizes, wallets, payments, RLS politiky, constraint contests_status_check
-- ani jakákoli data. Žádný řádek v `contests` není touto migrací změněn.
--
-- Rollback: obnovit definice z 20260718163000_security_rpc_hardening.sql
-- (identické funkce bez kontroly `closed`) — granty zůstávají stejné.

-- ─────────────────────────────────────────────────────────────────────────────
-- pause_contest
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pause_contest(contest_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
BEGIN
  -- Admin guard: kanonická tabulka public.user_roles přes public.has_role().
  -- NIKDY nepoužívat legacy public.users.role — produkce má doložený drift
  -- (účet s user_roles.role='admin' a users.role='user').
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT status INTO v_status
  FROM public.contests
  WHERE id = contest_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- `closed` je konečný stav — uzavřenou soutěž nelze převést zpět.
  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'Uzavřenou soutěž nelze pozastavit.';
  END IF;

  UPDATE public.contests
  SET status = 'paused'
  WHERE id = contest_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pause_contest(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pause_contest(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.pause_contest(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pause_contest(uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- resume_contest
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resume_contest(contest_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
BEGIN
  -- Admin guard: kanonická tabulka public.user_roles přes public.has_role().
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT status INTO v_status
  FROM public.contests
  WHERE id = contest_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- `closed` je konečný stav — uzavřenou soutěž nelze znovu aktivovat.
  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'Uzavřenou soutěž nelze znovu aktivovat.';
  END IF;

  UPDATE public.contests
  SET status = 'active'
  WHERE id = contest_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resume_contest(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resume_contest(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.resume_contest(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_contest(uuid) TO service_role;
