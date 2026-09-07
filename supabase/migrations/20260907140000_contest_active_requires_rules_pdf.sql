-- Soutěž nesmí být `active` bez nahraných pravidel (PDF).
--
-- Řešená mezera: `AdminContestManagement.tsx` PDF ve formuláři vyžaduje, ale
-- databáze ani `create-contest` to nevynucovaly. Admin flow navíc soutěž nejdřív
-- vytvořil (klidně rovnou jako `active`) a PDF nahrál až potom — mezi tím byla
-- soutěž veřejně aktivní bez závazných pravidel.
--
-- ── Proč trigger, a ne CHECK constraint ────────────────────────────────────────
-- CHECK se vyhodnocuje při KAŽDÉM UPDATE dotčeného řádku, i kdyby s pravidly
-- nesouvisel — a `NOT VALID` to nezmění, ten jen přeskočí úvodní sken tabulky.
-- Staging má dnes 100 `active` soutěží BEZ PDF (historická testovací data).
-- S CHECK constraintem by u nich přestal procházet i `next_ticket_number`,
-- který inkrementuje `buy_ticket_atomic` — tedy by se rozbil nákup tiketu.
-- Produkce takový řádek nemá (obě aktivní soutěže PDF mají), takže tam je
-- invariant od začátku úplný.
--
-- Trigger proto hlídá PŘECHODY do vadného stavu, ne klidový stav:
--   * INSERT `active` bez PDF                      → zamítnuto
--   * UPDATE cokoli → `active` bez PDF             → zamítnuto
--   * UPDATE aktivní soutěže, který PDF odstraní   → zamítnuto
--   * UPDATE historicky vadného řádku, který se
--     nedotýká statusu ani PDF (prodej tiketu)     → projde
--
-- Do vadného stavu se tedy nelze dostat žádnou cestou; existující vadné řádky
-- se jen nesmí zhoršit. Nic se nepřepisuje ani nemigruje.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_contest_active_requires_rules_pdf()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_new_has_pdf boolean := nullif(btrim(coalesce(NEW.rules_pdf_url, '')), '') is not null;
  v_old_has_pdf boolean;
  v_old_active  boolean;
begin
  -- Řádek, který nekončí jako `active`, tenhle invariant neřeší.
  if NEW.status is distinct from 'active' then
    return NEW;
  end if;

  if v_new_has_pdf then
    return NEW;
  end if;

  -- Odsud dál: výsledek by byl `active` BEZ pravidel.

  if TG_OP = 'INSERT' then
    raise exception
      'Soutěž nelze aktivovat bez nahraných pravidel (PDF). Nahrajte pravidla a aktivujte ji až potom.'
      using errcode = 'check_violation';
  end if;

  v_old_active  := OLD.status is not distinct from 'active';
  v_old_has_pdf := nullif(btrim(coalesce(OLD.rules_pdf_url, '')), '') is not null;

  -- Aktivace soutěže, která pravidla nemá.
  if not v_old_active then
    raise exception
      'Soutěž nelze aktivovat bez nahraných pravidel (PDF). Nahrajte pravidla a aktivujte ji až potom.'
      using errcode = 'check_violation';
  end if;

  -- Odebrání pravidel aktivní soutěži.
  if v_old_has_pdf then
    raise exception
      'Aktivní soutěži nelze odebrat pravidla (PDF). Nejdřív ji deaktivujte.'
      using errcode = 'check_violation';
  end if;

  -- Zbývá jediný případ: řádek byl `active` bez PDF už předtím a tenhle UPDATE
  -- to nemění (typicky prodej tiketu). Vědomě se propouští — viz komentář výše.
  return NEW;
end $function$;

COMMENT ON FUNCTION public.enforce_contest_active_requires_rules_pdf() IS
  'Brání vzniku soutěže ve stavu active bez rules_pdf_url. Hlídá přechody, ne klidový stav, '
  'aby historicky vadné řádky mohly dál prodávat tikety (buy_ticket_atomic aktualizuje next_ticket_number).';

DROP TRIGGER IF EXISTS trg_contest_active_requires_rules_pdf ON public.contests;
CREATE TRIGGER trg_contest_active_requires_rules_pdf
  BEFORE INSERT OR UPDATE ON public.contests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_contest_active_requires_rules_pdf();

COMMIT;
