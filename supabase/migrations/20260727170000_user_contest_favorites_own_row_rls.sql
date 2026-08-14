-- Oblíbené soutěže: partner-own RLS pro `public.user_contest_favorites`.
--
-- Proč tahle migrace existuje
-- ---------------------------
-- Tabulka měla RLS zapnuté, ale na některých prostředích NULA policies, což je
-- deny-all: přihlášený zákazník z ní nepřečetl ani vlastní řádky a stránka
-- „Oblíbené" zůstávala trvale prázdná. Produkce `xkzhjldrojjlrkezorey` tři
-- policies měla, staging `dxmowysntemfqfnanxua` ne. Migrace ten rozdíl uzavírá
-- a zajišťuje, že nově vytvářená prostředí dostanou tentýž stav.
--
-- Co dělá
-- -------
--   * doplní JEN chybějící policies (SELECT / INSERT / DELETE, vždy own-row),
--   * odebere roli `anon` veškerá oprávnění k této tabulce.
--
-- Co záměrně NEDĚLÁ
-- -----------------
--   * nevytváří UPDATE policy — klient smí oblíbenou soutěž jen přidat
--     a odebrat, nikdy měnit cizí ani vlastní řádek na jiný,
--   * nezapíná ani nevypíná RLS,
--   * nic nedropuje: existující policy se nepřepisuje, takže opakované
--     spuštění je no-op,
--   * nesahá na žádnou jinou tabulku, policy ani grant.
--
-- Na produkci i stagingu (stav k 27. 07. 2026) skončí bez jakékoli změny —
-- policies tam už jsou a `anon` nemá co odebírat.

do $$
begin
  if to_regclass('public.user_contest_favorites') is null then
    raise exception
      'public.user_contest_favorites is missing — this migration locks that table down and must not run without it';
  end if;

  -- Pojistka: RLS se tu nikdy nepřepíná, jen se ověří, že je zapnuté.
  if not (select relrowsecurity
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public'
             and c.relname = 'user_contest_favorites') then
    raise exception
      'RLS is disabled on public.user_contest_favorites — refusing to add policies to an unprotected table';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'user_contest_favorites'
       and policyname = 'user_contest_favorites_select_own'
  ) then
    create policy user_contest_favorites_select_own
      on public.user_contest_favorites
      as permissive for select to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'user_contest_favorites'
       and policyname = 'user_contest_favorites_insert_own'
  ) then
    create policy user_contest_favorites_insert_own
      on public.user_contest_favorites
      as permissive for insert to authenticated
      with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'user_contest_favorites'
       and policyname = 'user_contest_favorites_delete_own'
  ) then
    create policy user_contest_favorites_delete_own
      on public.user_contest_favorites
      as permissive for delete to authenticated
      using (user_id = auth.uid());
  end if;
end
$$;

-- Oblíbené soutěže jsou osobní data — anonymní role k nim nemá co mít.
-- Bez grantu je odepřen dřív, než se vůbec vyhodnotí RLS.
revoke all privileges on table public.user_contest_favorites from anon;
