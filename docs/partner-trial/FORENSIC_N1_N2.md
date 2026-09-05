# Forenzní audit N1 / N2 (read-only)

**Nic neopraveno, nic nezměněno, nic necommitnuto. Referral/affiliate systém nebyl přestavěn.**
Datum: 03. 09. 2026

---

## 0. Meta-nález: můj předchozí audit běžel na dva měsíce starém checkoutu

| | |
|---|---|
| HEAD tohoto worktree | `cb954b57` — **2026-07-03** |
| `origin/main` | **2026-09-03** (dnes) |
| Rozdíl v migracích | **139 migrací** navíc v `origin/main` |

Celá srpnová práce na atribuci (`/i/:refCode`, `/a/:refCode`, `/r/:refCode`, oprava Header.tsx,
globální hook) v mém checkoutu **není**. Nálezy N1 a N2 z předchozího auditu byly proto
udělané proti zastaralému stavu frontendu. Produkční DB, kterou jsem dotazoval, aktuální byla —
proto se nálezy tvářily konzistentně.

---

## N1 — „affiliate `?ref=` se ztrácí"

**STATUS: UZAVŘENO 03.09.2026 — historická chyba, již opravená v `origin/main` (commit `924de0e1`, 23.08.2026). Žádná další akce potřeba.**

### A) Původně implementováno
- Dlouhé odkazy `/?ref=KOD` (zákazník) a `/partner/register?via=KOD` (firma)
- Zachycení do `sessionStorage` v `Register.tsx` (`onemil_referral_ref` + `onemil_affiliate_ref`)
- Volání `record_affiliate_customer_ref` uvnitř e-mail/heslo větve `Register.tsx`
- **2026-08-23** (`d0c2b89d`, `0e9032f8`): krátké veřejné odkazy `/i/:refCode` a `/a/:refCode`
- **2026-08-24** (`b5d59be1`): krátký odkaz `/r/:refCode` pro osobní doporučení

### B) Původně otestováno
Commit `924de0e1` (2026-08-23) uvádí:
- **spec 139** — lokální, bez secrets: zachování `ref` v Header.tsx + zachycení do sessionStorage
- **spec 140** — staging DB E2E: globální hook aplikuje ref u opožděné session přes `/login`,
  ověřen first-touch proti `affiliate_customer_refs`
- **spec 141** — staging DB E2E: `/a/:refCode` → registrace → schválení v `/admin/partners`
  → vznikne `affiliate_company_refs` + `partners.referred_by_affiliate_id`, first-touch drží
- **spec 22** upraven tak, aby vstupoval reálným krátkým odkazem `/a/:refCode`

### C) Aktuální produkční stav (`origin/main`)
```
src/components/Header.tsx:280   <Link to={buildRegisterUrl(location.search)}>
src/lib/loginRedirect.ts:32     buildRegisterUrl() — whitelist, propouští POUZE ?ref
src/App.tsx:262                 useApplyPendingReferral(user?.id)
src/App.tsx:266                 useApplyPendingAffiliateRef(user?.id)   ← globální, nezávislý na způsobu signupu
src/App.tsx:547/549/551         /a/:refCode  /i/:refCode  /r/:refCode
```

### D) Rozdíl / regrese
Chyba, kterou jsem popsal, **byla reálná** — a byla nalezena a opravena **23. 8. 2026**,
tedy před mým auditem, prakticky totožnou analýzou (commit `924de0e1`, bod 1 zprávy:
*„Header.tsx »Registrovat« link dropped ?ref= entirely"*).
Já jsem četl stav z 3. 7. 2026, který opravu ještě neobsahuje.
**Žádná regrese — aktuální kód opravu obsahuje.**

Commit navíc opravil dvě věci, které jsem vůbec neviděl:
- `record_affiliate_customer_ref` se nevolal u OAuth signupů → vyřešeno globálním hookem
- `AdminPartners.tsx` po schválení partnera nevolal `record_affiliate_company_ref`
  → firemní atribuce a tím i firemní provize tiše nevznikaly

### E) Je N1 skutečně chyba: **NE**
Byla, je opravená a otestovaná. Můj nález byl artefakt zastaralého checkoutu.

**Důležitá výhrada k datům:** `affiliate_customer_refs = 0 řádků` v produkci **není důkaz
současné chyby**. Je to historický reziduál období, kdy chyba existovala (od zavedení
zákaznického odkazu do 23. 8. 2026). Po opravě zatím žádná nová zákaznická registrace přes
affiliate odkaz neproběhla — což je očekávatelné, protože produkce nemá živý provoz.

---

## N2 — „referral odměny se nepřipisují do peněženky"

**STATUS: OTEVŘENO — zapsáno jako trvalé pre-launch TODO `PAY05` v `docs/launch-readiness/LAUNCH_TODO.md` (Platby a fakturace). Není regrese. Neopravovat v rámci současné partnerské práce. Musí být vyřešeno před zapnutím live Stripe.**

### A) Původně implementováno
Původní návrh **připisoval okamžitě**. Dvě funkce, obě dnes v produkci:

```sql
-- try_credit_wallet_mc(p_user_id, p_amount, p_reason DEFAULT 'topup')
UPDATE wallets SET balance_coins = balance_coins + p_amount ...;
-- referral odměny (SPRÁVNÝ bod v pipeline)
PERFORM public.create_referral_reward_from_wallet_credit(p_user_id, p_amount);
```

```sql
-- create_referral_reward_from_wallet_credit(p_user_id, p_amount)
INSERT INTO referral_rewards (..., status, ...) VALUES (..., 'earned', ...);
-- okamžité připsání do peněženky
PERFORM public.try_credit_wallet_mc(v_referrer, v_reward, 'referral_commission');
```

**Závěr k otázce „co znamená `earned`":** `earned` **nikdy neznamenalo „čeká na výplatu"**.
V původním návrhu znamenalo *„odměna vznikla a už byla připsána"*. Potvrzuje to i
`admin_update_referral_reward` (migrace `20260207163050_.sql`), která povoluje pouze stavy
`earned` / `reversed` / `blocked` — **žádný stav `paid` ani `payout` v datovém modelu neexistuje**,
takže žádný navazující výplatní krok nebyl nikdy navržen.

⚠️ `try_credit_wallet_mc` píše přímo do `wallets` a **nezakládá řádek `wallet_transactions`**.
Absence referral řádků v ledgeru proto **není** důkazem, že se nepřipisovalo.

### B) Původně otestováno
**Wallet credit nebyl nikdy otestován.** Hlavička spec 55 (`55-invite-referral-c23.spec.ts`):

> „Co je BLOCKED-BY-PAY01–PAY03: Samotný wallet credit za doporučení vzniká VÝHRADNĚ přes
> `create_referral_reward_from_payment` — trigger na payment_status='completed'."
> „Read-only (55a/55b/55c/55d) — žádné platby, žádné wallet credit."

Testy 55a–55d pokrývají jen viditelnost sekce, zobrazení kódu a RLS izolaci.
Reverzní větev byla poprvé reálně otestována až v srpnu 2026 (rollback-only test u PR #309) —
a právě tím se odhalilo, že reverzní volání padalo na `42725` a nikdy neproběhlo.

### C) Aktuální produkční stav
Živý řetězec po vložení platby:
```
payments (status='completed')
 ├─ trg_update_wallet_after_payment → update_wallet_after_payment()
 │     připíše ZÁKAZNÍKOVI + zapíše wallet_transactions   ← try_credit_wallet_mc NEVOLÁ
 └─ trg_payments_referral_reward → create_referral_reward_from_payment()
       INSERT referral_rewards (earned)                    ← peněženku NEPŘIPISUJE
```
`try_credit_wallet_mc` dnes volá **pouze**:
`create_referral_reward_from_wallet_credit` (osiřelá), `reverse_referral_reward_on_payment_status_change`,
`reverse_failed_stripe_refund`. Žádná Edge Function ani frontend ji nevolá
(v `origin/main` se vyskytuje jen v generovaném `types.ts`).

ACL: `anon` = false, `authenticated` = false, `service_role` = true (REVOKE z 13. 06. 2026 drží).
Data: **16 `earned`, 0 `reversed`, 130 dokončených plateb.**

### D) Rozdíl / regrese
**Asymetrie je reálná a doložená:**
- reverzní trigger peněženku doporučiteli **odečítá** (`try_credit_wallet_mc(-reward)`)
- `reverse_failed_stripe_refund` ji při selhané refundaci **vrací zpět** (viz `onemil_history.md` ř. 1108)
- dopředná cesta ji **nikdy nepřipíše**
- `tests/wallet-integrity-queries.sql` ř. 65 dokumentuje jako zdroj kreditu:
  *„(c) Referral bonuses → via create_referral_reward_from_payment trigger"* — ta funkce ale nepřipisuje
- `CLAUDE.md` ř. 1774 tvrdí totéž

**Nejde ale o regresi, kterou lze přišpendlit na konkrétní commit.** Prověřil jsem všechny
verze `update_wallet_after_payment` v migracích (`20250914043049`, `20250921033810`,
`20260315200000_wallet_hardening`, `20260802120000_restore_wallet_payment_ledger`) —
**žádná z nich `try_credit_wallet_mc` nikdy nevolala.** Nikdy tedy neexistovala migrace, která by
připisovací větev postavila na platební cestu.

Nejpřesnější popis: **dva paralelní návrhy, které se nikdy nepotkaly.**
- Návrh A (`try_credit_wallet_mc` → `create_referral_reward_from_wallet_credit`): připisuje. Nikdy nebyl na živé platební cestě.
- Návrh B (`update_wallet_after_payment` + `create_referral_reward_from_payment`): živý. Odměnu jen eviduje.
- Reverzní logika a `reverse_failed_stripe_refund` byly postavené na předpokladu návrhu A.

REVOKE z 13. 06. 2026 tohle **nezpůsobil** — odebral jen `anon`/`authenticated` EXECUTE,
interní SECURITY DEFINER volání by fungovalo dál.

**Co doložit nelze:** jestli se v období před 16. 3. 2026 (start ledgeru) nepřipisovalo přes
jinou, dnes už neexistující verzi funkcí. `try_credit_wallet_mc` nezanechává stopu v ledgeru
a nález F7 (`e55635a9`) navíc stanovil jako invariant, že *„balance = sum(ledger)" není platný
test pro účty starší než ledger*. Rozdíly zůstatků u obou doporučitelů (+755,50 a +9 156,92 MC)
F7 vysvětluje jako pre-ledger zůstatky a CI seedy, ne jako referral kredity — ani jeden rozdíl
neodpovídá součtu odměn (551,75 resp. 50 MC).

### F) Je N2 skutečně chyba: **ANO — ale s výhradami**
- **ANO**: asymetrie mezi dopřednou a reverzní cestou je reálná a je v rozporu s vlastní
  dokumentací projektu (wallet-integrity-queries ř. 65, CLAUDE.md ř. 1774).
- **NENÍ to regrese** — nelze ji přiřadit konkrétnímu commitu; připisovací větev nikdy nebyla
  na živé platební cestě.
- **Nebylo to nikdy otestováno** — spec 55 wallet credit vědomě vynechal jako blocked-by-Stripe.
- **Praktický dopad je dnes nulový**: produkce nemá jedinou živou Stripe platbu
  (`cs_live_` = 0 ze 138, viz F7), takže žádnému reálnému zákazníkovi nic nedluží.
- **Riziko je budoucí**: v okamžiku přepnutí Stripe do live režimu začnou vznikat `earned`
  odměny, které nikdo nedostane — a případná reverzace by odečetla MioCoiny, které nikdy
  nebyly připsány (mohla by srazit zůstatek doporučitele pod jeho skutečný nárok).

---

## Doporučené další kroky (neimplementovat bez rozhodnutí)

1. **Rozhodnout, který návrh platí** — dopředné připisování (návrh A) vs. evidence + samostatný
   výplatní krok (nový stav `paid`). Datový model dnes výplatní krok nezná.
2. Do rozhodnutí **neopravovat** — reverzní větev by se musela měnit současně, jinak vznikne
   opačná asymetrie.
3. Uvést do souladu dokumentaci (`wallet-integrity-queries.sql` ř. 65, `CLAUDE.md` ř. 1774),
   ať už padne jakékoli rozhodnutí.
4. Zařadit před přepnutí Stripe na live — je to jediný okamžik, kdy se to stane reálným problémem.

---

## Dopad na moji dosavadní práci (Fáze 1–3)

| | |
|---|---|
| Názvy objektů Fáze 1–3 | ✅ v `origin/main` **volné**, žádná kolize |
| `supabase/functions/generate-partner-invoice-pdf/index.ts` | ⚠️ v `origin/main` novější (721 ř.). Funkčně jsem nic nepřepsal — moje verze vychází z živého stagingu, který je s `origin/main` v souladu, a přidává jen +42 řádků slevy. Rozdíly jsou jen v komentářích. |
| `src/App.tsx` | ⚠️ v `origin/main` výrazně jiný — moje úpravy (routa `/pro-eshopy`, guardy) jsou proti zastaralé verzi a **při rebase budou konfliktovat** |
| Migrace Fáze 1–3 | ⚠️ psané proti živé DB (správně), ale repo kolem nich je 139 migrací pozadu |

**Doporučení:** před jakýmkoli commitem tuto práci přenést na aktuální `origin/main`
a `src/App.tsx` i landing page znovu odvodit z aktuální verze.
