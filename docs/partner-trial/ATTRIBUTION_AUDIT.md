# OneMil — Audit atribucí registrace (read-only)

**FÁZE 4, krok 1. Pouze audit. Nic neimplementováno, nic v DB nezměněno.**
Datum: 03. 09. 2026 · Zdroj: kód v repu + read-only dotazy na produkci `xkzhjldrojjlrkezorey`

---

## 1. Souhrnná tabulka

| Zdroj | Jak zákazník přijde | Co dostane zákazník | Co dostane zdroj | Jak dlouho vazba platí | DB vazba |
|---|---|---|---|---|---|
| **Partner / e-shop** | ❌ **dnes neexistuje žádný registrační odkaz** | za registraci **nic**; za nákup u partnera MioCoiny dle `partners.reward_base_czk` / `reward_mc` | **nic** — partner naopak **platí** za aktivované MC (týdenní faktura) | vazba vzniká až uplatněním kódu, pak trvale | žádná vazba user→partner; jen `partner_reward_codes.activated_by_user_id` a `partner_coin_activations.user_id` (až při aktivaci) |
| **Affiliate — zákazník** | `/?ref=KOD` | **nic** | **5 % z každé dokončené platby** toho zákazníka, **měsíčně, trvale**, v **Kč** (+21 % DPH u plátce) | **neomezeně**, bez stropu | `affiliate_customer_refs` — `UNIQUE(user_id)`, first-touch, needitovatelné |
| **Affiliate — firma** | `/partner/register?via=KOD` | (jde o firmu, ne zákazníka) | **5 % z každé ZAPLACENÉ partnerské faktury**, tj. i týdně, **trvale**, v Kč | **neomezeně** | `partners.referred_by_affiliate_id` + `affiliate_company_refs` |
| **Osobní doporučení** | `/register?ref=KOD`, nebo ručně v profilu | **nic** | **5 % z každé dokončené platby** doporučeného, v **MioCoinech**, do `referral_rewards` — ⚠️ **nikdy se nepřipíše do peněženky** | **neomezeně**, bez stropu | `referrals` — jednorázové (`already_has_referrer`), nelze změnit |

Produkční sazby: `commission_rate_customer = 5,00 %`, `commission_rate_company = 5,00 %` u všech affiliate účtů.

---

## 2. Detail zdrojů

### 2.1 Partner / e-shop

| | |
|---|---|
| URL parametr | **žádný** |
| Úložiště před registrací | **žádné** |
| Při registraci | **nic se nestane** |
| DB tabulka atribuce | **neexistuje** |
| Jednorázová / měnitelná | n/a |

Ověřeno na produkci: `profiles` ani `users` nemají `partner_id`; sloupec `partner_id` mimo `partner*` tabulky mají jen `affiliate_company_leads`, `affiliate_company_refs`, `shoptet_connection_requests`, `shoptet_import_runs`, `valid_partner_api_keys`, `voucher_distribution_*`, `vouchers` — žádná z nich neváže **zákazníka** k partnerovi.

Jediné spojení partner ↔ zákazník dnes vzniká **až uplatněním kódu**:
`partner_reward_codes.activated_by_user_id` → `partner_coin_activations.user_id`.

**Peněžní tok je opačný než u affiliate:** partner OneMilu platí, nedostává provizi.

### 2.2 Affiliate / influencer

| | |
|---|---|
| URL parametr | `?ref=KOD` (zákazník) · `?via=KOD` (firma) |
| Úložiště | `sessionStorage['onemil_affiliate_ref']` — zapisuje se **pouze na `/register`** |
| Při registraci | po `signUp` → RPC `record_affiliate_customer_ref(p_ref_code)`, plně non-blocking |
| DB tabulka | `affiliate_customer_refs (affiliate_id, user_id, source)` |
| Jednorázová | **ano** — `UNIQUE(user_id)`, first-touch; druhý pokus vrátí `already_attributed` |

Guardy v RPC: affiliate musí být `approved`, musí mít mód `influencer`, zákaznická self-atribuce blokována (`auth_user_id = auth.uid()`).

**Provize (`calculate_affiliate_commissions_for_month`, pg_cron job 25, 2. den v měsíci):**

```
customer_payments = SUM(payments.amount) toho zákazníka za měsíc × commission_rate_customer
  filtr: status='completed', amount>0, method NOT IN ('bonus','partner','api')
```

→ **rekurentní, měsíční, bez časového omezení a bez stropu.** Partnerem přidělené MioCoiny (`method='partner'`) se do základu **nepočítají** — affiliate dostává podíl jen z reálných dobití.

```
company_invoice = partner_invoices.amount_ex_vat × commission_rate_company
  pro každou fakturu se status='paid'
```

→ **rekurentní, per zaplacená faktura, bez konce.**

Status flow: `calculated → approved → payout_document_created → ready_to_pay → in_payment_batch → paid`.

### 2.3 Osobní doporučení uživatele

| | |
|---|---|
| URL parametr | `?ref=KOD` |
| Úložiště | `sessionStorage['onemil_referral_ref']` — zapisuje se **pouze na `/register`** |
| Při registraci | `set_my_referrer_by_code(p_code, 'signup')`; navíc lze **kdykoliv později** ručně v profilu (`p_source='manual'`) |
| DB tabulka | `referrals (referred_user_id, referrer_user_id, code_used, source, status)` |
| Jednorázová | **ano** — `rejected:already_has_referrer`, nelze přepsat |

Guardy: e-mail musí být ověřený, self-referral přes `is_self_referral()` (device / IP hash / fingerprint), blocklist `referral_blocked_users`, každý pokus se loguje do `referral_attempts`.

**Odměna (`create_referral_reward_from_payment`, trigger na `payments`):**
5 % z každé dokončené platby doporučeného → řádek v `referral_rewards` (v MioCoinech, `status='earned'`), idempotentně `ON CONFLICT (payment_id)`. Reverzní trigger při změně stavu platby.

⚠️ **Nikde se nepřipisuje do peněženky.** V `wallet_transactions` neexistuje žádný typ pro referral odměnu; jediný trigger na `referral_rewards` je notifikace. Produkce: **16 řádků `earned`, 1 `blocked`, 0 vyplaceno.**

⚠️ **Jednorázový bonus 15 MC** z `ONEMIL_BUSINESS_CONTEXT.md` §11 **není implementovaný** — `referral_rewards` je čistě payment-linked, žádná funkce ho nevytváří.

---

## 3. Konfliktní scénáře — co nastane DNES

> Připomínka: partnerská registrační atribuce dnes **vůbec neexistuje**, takže ve všech scénářích, kde vystupuje, se partnerská část jednoduše nestane.

### 3.1 Partner + osobní doporučení
Uloží se a uplatní **pouze osobní doporučení**. Partnerská atribuce nevznikne, 15 MC se nevyplatí (neexistuje). Žádný konflikt.

### 3.2 Partner + affiliate
Uloží se a uplatní **pouze affiliate** (a to jen pokud uživatel přišel přímo na `/register?ref=`). Žádný konflikt.

### 3.3 Affiliate + osobní doporučení — ⚠️ jediný reálný konflikt
`Register.tsx` zapisuje **tentýž `?ref=` řetězec do OBOU sessionStorage klíčů** a po registraci volá **obě** RPC za sebou:

```
sessionStorage['onemil_referral_ref']  = ref   →  set_my_referrer_by_code(ref,'signup')
sessionStorage['onemil_affiliate_ref'] = ref   →  record_affiliate_customer_ref(ref)
```

Kód se hledá ve dvou různých tabulkách — `referral_codes.code` (uživatelské) vs `affiliate_accounts.ref_code` (affiliate). Dnes se **nepřekrývají** (0 kolizí), takže prakticky uspěje vždy jen jedna z nich a druhá vrátí `invalid_code`.

**Ale kolize není ničím vynucená:** neexistuje cross-table unique constraint, uživatelské kódy mají 10 znaků a jeden affiliate kód má rovněž 10 znaků. Kdyby kolize nastala, **uspěly by obě** a ze stejné platby by se platilo dvakrát: affiliate 5 % v Kč + doporučitel 5 % v MioCoinech.

### 3.4 Partner + affiliate + osobní doporučení
Chová se jako 3.3 — partnerská část se nestane.

---

## 4. Tři nálezy mimo zadání (hlásím, neopravuji)

**N1 — Affiliate zákaznický odkaz dnes prakticky nefunguje.**
Dashboard generuje `https://onemil.cz/?ref=KOD`, ale `?ref=` se ukládá **jen v `Register.tsx`**. Odkaz míří na homepage, odkud se na `/register` jde přes prostý `<Link to="/register">` bez query stringu → **kód se ztratí**.
Potvrzeno daty: **`affiliate_customer_refs` = 0 řádků** v produkci, `customer_payments` provize = 0. Osobní doporučení tím netrpí, protože má ruční zadání kódu v profilu.

**N2 — Referral odměny se nikdy nevyplácejí.** 16 řádků `earned`, žádný mechanismus připsání do peněženky.

**N3 — Kódy referral vs affiliate sdílí jmenný prostor bez unikátnosti napříč tabulkami** (viz 3.3).

---

## 5. Partnerská atribuce: `partner_id` vs `partner_id + connection_id`

**Dnes v systému neexistuje ŽÁDNÁ identita konkrétního e-shopu v reward řetězci:**

| Objekt | Vazba |
|---|---|
| `partner_reward_codes` | `partner_id` |
| `partner_coin_activations` | `partner_id` |
| `partner_invoices` / `_lines` | `partner_id` |
| `shoptet_import_runs` | `partner_id` — **bez connection_id** |
| `partner_reward_codes.metadata` | `source='partner_order_api'`, `source_detail='shoptet_import'`, `shoptet_import_run_id` |

`metadata.source_detail` je konstantní řetězec, ne identita obchodu. Přes `shoptet_import_run_id` se lze dostat jen na `shoptet_import_runs.partner_id`, tedy zase jen na partnera.

Connection entita **existuje** — `shoptet_connection_requests (id, partner_id, shop_name, …)` — a jeden produkční partner (`2f707490…`) jich má **4**. Ale nic z ní se do reward/billing řetězce nepropisuje.

**Doporučení: A + B.**
- `partner_id` = povinné, nese billing, trial i nárok na 15 MC (fakturace běží na partnerovi, jak už víme).
- `connection_id` (nullable, FK na `shoptet_connection_requests`) + `source_detail` = **jen analytika**. Žádná finanční logika ho nikdy nesmí číst.

Je to levné (nullable sloupec na nové atribuční tabulce, nic nerozbije) a je to jediný okamžik, kdy tu informaci lze zachytit — u registrace. Zpětně už ji nedopočítáme. Pokud jednu firmu tvoří čtyři e-shopy, bez `connection_id` se nikdy nedozvíme, který z nich registrace přivedl.

---

## 6. Doporučení priorit (k rozhodnutí, neimplementováno)

### 6.1 Tři atribuce plní tři různé účely — nemazat se navzájem

| | Účel | Měna | Komu |
|---|---|---|---|
| Partner | akvizice zákazníka pro e-shop + billing partnera | MioCoiny (zákazníkovi) / Kč (partner platí) | zákazník |
| Affiliate | obchodní provize za přivedený obrat | **Kč** | affiliate |
| Osobní doporučení | uživatelská loajalita | **MioCoiny** | doporučitel |

Partner a affiliate **si nekonkurují** — jdou z opačných směrů peněžního toku a jinému příjemci. Doporučuji je nechat **koexistovat**.

### 6.2 Navrhovaná pravidla

1. **15 MC vázat výhradně na partnerskou atribuci**, nezávisle na ostatních. Ochrana = `UNIQUE(user_id)` v nové tabulce + `bonus_granted_at`. Partner nedostává za registraci nic, takže tu nevzniká dvojí náklad.
2. **Partnerská atribuce nesmí přepsat ani zablokovat** existující `referrals` ani `affiliate_customer_refs` — jsou to jiné tabulky s jiným účelem.
3. **Jediné místo, kde je priorita opravdu potřeba:** affiliate `customer_payments` (5 % v Kč) vs osobní doporučení (5 % v MC) — obojí ze **stejné platby stejného zákazníka**. Tady se rozhoduje, jestli chceš platit 5 % Kč + 5 % MC současně. Návrh: **affiliate má přednost** (je to smluvní peněžní závazek), osobní doporučení se u affiliate-atribuovaného zákazníka nevyplácí. **Dnes k tomu prakticky nedochází** (0 customer refs), takže rozhodnutí lze udělat bez migrace historických dat.
4. **Před spuštěním 15 MC opravit N3** — zavést oddělený prefix/namespace partnerských kódů, aby `?p=` nemohl kolidovat s `?ref=`.

### 6.3 Dopad navrženého řešení

| Oblast | Dopad |
|---|---|
| **15 MC bonus** | nová tabulka + RPC; max 1× na `user_id` navždy; nezávislé na affiliate i referral; náklad nese OneMil, ne partner |
| **Partner provize** | **žádný** — partner provizi nedostává, platí za aktivované MC; 15 MC se mu **neúčtuje** |
| **Affiliate provize** | **žádná změna**, pokud partnerská atribuce nesmí mazat `affiliate_customer_refs`. Pozor: samotné zavedení `?p=` odkazu nesmí přepsat `onemil_affiliate_ref` v sessionStorage |
| **Referral bonus** | **žádná změna**, pokud se nesáhne na `referrals`. Otevřené zůstává, že se odměny nevyplácejí (N2) |
| **Analytika** | s `connection_id` získáme poprvé odpověď „který e-shop přivedl registraci"; bez něj je to nevratně ztracené |

---

## 7. Co je potřeba rozhodnout, než začne implementace

1. Může zákazník mít současně partnerskou i affiliate atribuci? *(doporučení: ano)*
2. Může mít současně partnerskou i osobní referral atribuci? *(doporučení: ano)*
3. Affiliate 5 % Kč **a zároveň** referral 5 % MC ze stejné platby — platit obojí, nebo dát přednost affiliate? *(doporučení: přednost affiliate)*
4. Ukládat `connection_id` pro analytiku? *(doporučení: ano, nullable, mimo finanční logiku)*
5. Řešit N1 (ztracený `?ref=` z homepage) v rámci Fáze 4, nebo samostatně? *(doporučení: samostatně, je to existující bug)*
