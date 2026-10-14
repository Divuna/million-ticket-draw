# OneMil — Zahajovací akce partnera, expirace odměn a bonus 15 MC pro nové zákazníky

> ## ⚠️ AKTUÁLNÍ STAV K 05. 09. 2026 — PŘEBÍJÍ HLAVIČKU NÍŽE
>
> **Backend tohoto návrhu je NASAZENÝ v produkci `xkzhjldrojjlrkezorey`** (03. 09. 2026),
> migrace `20260903200832`, `20260903200843`, `20260903200856`, `20260903200935`,
> `20260903200954`, `20260903201001` + Edge Function `generate-partner-invoice-pdf` v194.
> Zdroj byl do GitHubu dorovnán 05. 09. 2026.
>
> **Funkce ale NENÍ produktově aktivní:** produkce má 0 partnerů s `public_ref_code`,
> 0 partnerů v trialu, 0 řádků v `partner_pending_attributions` / `partner_customer_refs`
> a 0 faktur se slevou. Odkaz `/register?p=KOD` dnes nikdo nemůže použít.
> Partnerské UI trialu není dokončené.
>
> Hlavička níže („Stav: NÁVRH") byla pravdivá v době vzniku dokumentu — ponechána
> jako historický záznam, nemazat.

**Stav: NÁVRH. Nic neaplikováno. Žádná migrace nespuštěna, žádná EF nenasazena, produkce nedotčena.**
Datum: 03. 09. 2026 · Autor: Claude Code · Schvaluje: Pavel Diviš

Pokrývá schválená business pravidla A (bonus 15 MC), C (3měsíční platnost odměny),
D (start trialu), E (co je zdarma), F (fakturace během trialu) ze zadání.

---

## 0. TL;DR — co je potřeba rozhodnout, než se začne psát kód

| # | Otevřená otázka | Doporučení |
|---|---|---|
| Q1 | Faktura na 0 Kč během trialu — vystavovat daňový doklad s číslem řady? | **Ne.** Vystavit „Přehled zahajovací akce" bez čísla faktury (`type='coin_trial_summary'`). Vyžaduje potvrzení účetní. |
| Q2 | Expirace u 24 existujících kódů v produkci | **Negrandfatherovat zpětně** — expirace platí jen pro kódy vydané po migraci. |
| Q3 | Může zákazník dostat 15 MC od partnera **i** 15 MC z osobního kódu kamaráda? | Rozhodnutí majitele. Doporučení: **ano, jde o jiný zdroj** — ale musí být vědomé. |
| Q4 | `reward_validity_days` globálně, nebo per partner? | **Globálně** v `settings`, per-partner override až kdyby bylo potřeba. |
| Q5 | Opakovaná registrace s novým e-mailem pro získání dalších 15 MC | Nelze plně zabránit bez KYC. Stejné reziduální riziko jako u stávajícího referral systému. **Přijmout a evidovat**, nebo doplnit limit na doménu/IP. |

---

## 1. AUDIT SOUČASNÉHO STAVU (bod H1–H5)

> Ověřeno kombinací repozitáře a **read-only dotazů na živou produkci** `xkzhjldrojjlrkezorey`.
> Žádný zápis do produkce neproběhl.

### 1.1 Kde vzniká partnerská odměna (H1)

```
EF partner-activate            ─┐
EF import-shoptet-orders       ─┴─►  RPC create_partner_order_reward(...)
(pg_cron job "shoptet_auto_import_15min", každých 15 min)
                                        │
                                        ▼
                            INSERT partner_reward_codes  (status = 'pending')
```

Živá signatura (drift proti repu — repo nezná `p_items`):

```
create_partner_order_reward(
  p_partner_id uuid, p_external_order_id text, p_order_total_czk numeric,
  p_customer_email citext, p_metadata jsonb DEFAULT '{}', p_items jsonb DEFAULT NULL
) RETURNS jsonb
```

- Počet coinů: `floor((order_total_czk / partners.reward_base_czk) * partners.reward_mc)`
- Idempotence: `pg_advisory_xact_lock` + unique index
  `idx_partner_reward_codes_order_api_idempotency (partner_id, external_order_id) WHERE metadata->>'source'='partner_order_api'`
- Guardy: partner musí být `approved`, konverzní nastavení > 0, jinak `reward_amount_too_low`.

Přechod `pending → issued` dělá `update_partner_order_reward_status(partner_id, external_order_id, order_status)`
pro `paid | delivered | completed`; `cancelled | returned | unpaid | not_picked_up` → `cancelled`.
Kód založený mimo Partner API vzniká rovnou jako `issued` (default sloupce `status`).

**Klíčový poznatek:** „partner skutečně vydal odměnu zákazníkovi" = **první přechod kódu do stavu `issued`**.
Toto je jediný správný hook point pro start trialu (D) i pro nastavení expirace (C).

### 1.2 Kde se odměna aktivuje (H2)

`public.redeem_miocoin_code(p_code text)` — SECURITY DEFINER, EXECUTE pro `authenticated`.

1. `SELECT ... FOR UPDATE` na `partner_reward_codes` (ochrana proti dvojímu uplatnění)
2. guardy: `activated` → `already_used`, `cancelled`, `expired`, `pending`, jinak `invalid_code`
3. **`IF v_row.expired_at IS NOT NULL AND v_row.expired_at < now() THEN RETURN 'expired'`** ← expirace je už dnes vynucená
4. e-mailová vazba: `issued_to_email` / `customer_email` musí sedět s `auth.users.email`
5. `ensure_wallet_exists` → `UPDATE wallets SET balance_coins = balance_coins + coins`
6. `INSERT wallet_transactions (type='miocoin_code_credit', source='redeem_miocoin_code')`
7. `UPDATE partner_reward_codes SET status='activated', activated_at=now(), activated_by_user_id=uid`

### 1.3 Kde vzniká fakturační položka (H3)

```
UPDATE partner_reward_codes SET activated_at = now()
        │
        ▼ trigger trg_log_partner_coin_activation_reward (AFTER, enabled 'O')
   log_partner_coin_activation_from_reward()
        │  guard: OLD.activated_at IS NULL AND NEW.activated_at IS NOT NULL
        │  guard: NOT EXISTS (SELECT 1 FROM partner_coin_activations WHERE code = NEW.code)
        ▼
   INSERT partner_coin_activations (partner_id, user_id, code, coins,
                                    external_order_id, activated_at, invoiced=false)
        │
        ▼ (týdně)
   partner_invoices + partner_invoice_lines (1 řádek = 1 aktivace) ; invoiced := true
```

**Důsledek pro C:** expirovaný kód se nikdy neaktivuje → nikdy nevznikne `partner_coin_activations`
→ **partnerovi se automaticky nic neúčtuje.** Pravidlo „po expiraci se partnerovi nic neúčtuje"
tedy nevyžaduje žádný zásah do fakturace.

### 1.4 Weekly invoice cron (H4) — ⚠️ ZÁSADNÍ DRIFT PROTI REPU

Živý řetězec v produkci:

```
pg_cron job 17  "weekly_partner_invoices"  schedule '0 2 * * 0'  active = true
   └─► SELECT public.run_partner_invoice_weekly_automation();
         └─► net.http_post( <edge_functions_url>/partner-invoice-auto-send,
                            header x-internal-token = vault:internal_function_token )
               └─► EF partner-invoice-auto-send  (v35 ACTIVE, verify_jwt=false)
                     1. RPC create_partner_invoices_for_last_week()  → TABLE(invoice_id uuid)
                     2. RPC is_partner_invoice_auto_send_enabled()
                     3. je-li ON: pro každou fakturu Z TOHOTO BĚHU
                        invoke send-partner-invoice-email → PDF + 1 e-mail + status 'issued'
```

Rozdíly oproti `supabase/migrations/*`, se kterými **musí** počítat každá nová migrace:

| Objekt | Repo | Živá produkce |
|---|---|---|
| `create_partner_invoices_for_last_week` | `RETURNS void`, volá `enqueue_partner_invoice_email` | `RETURNS TABLE(invoice_id uuid)`, `RETURN NEXT`, **žádné volání e-mailu**, částky `round(...,2)` |
| `partner-invoice-auto-send` | **neexistuje v repu** | EF v35 ACTIVE, řídí celý týdenní běh |
| `run_partner_invoice_weekly_automation` | **neexistuje v repu** | SECURITY DEFINER, pg_net + Vault |
| `claim_partner_invoice_for_auto_send`, `is_partner_invoice_auto_send_enabled` | **neexistují v repu** | existují |
| `partner_invoices.auto_email_sent_at` | není v `types.ts` | existuje |

> **PRAVIDLO PRO IMPLEMENTACI:** novou verzi `create_partner_invoices_for_last_week` psát
> **z živé definice** (`pg_get_functiondef`), NIKDY z repo migrace. Jinak se tiše rozbije
> auto-send pipeline (funkce by přestala vracet `invoice_id` a EF by neposlala nic).

Živý výpočet částek (zachovat!):

```sql
v_amount_net   := round(v_coins_total * v_partner.price_per_coin, 2);
v_vat_amount   := round(v_amount_net * v_partner.vat_rate, 2);   -- vat_rate je ZLOMEK 0.21
v_amount_gross := round(v_amount_net + v_vat_amount, 2);
```

Partner je z běhu vynechán (`CONTINUE`), pokud `coins_total = 0`.

### 1.5 Partner attribution při registraci uživatele (H5)

**NEEXISTUJE.** Ověřeno na živé produkci:

- `profiles` ani `users` nemají `partner_id` / `referred_by_partner_id`
- jediné tabulky se sloupcem `partner_id` mimo `partner*`: `affiliate_company_leads`,
  `affiliate_company_refs`, `shoptet_connection_requests`, `shoptet_import_runs`,
  `valid_partner_api_keys`, `voucher_distribution_*`, `vouchers` — žádná nevěže uživatele k partnerovi
- `referrals` je výhradně **user → user** (`referrer_user_id` / `referred_user_id`)
- jediná existující vazba partner ↔ zákazník je `partner_reward_codes.activated_by_user_id`
  resp. `partner_coin_activations.user_id`, a ta vzniká **až uplatněním kódu**, ne registrací

**Existuje ale prověřený vzor, který se dá zkopírovat 1:1** — affiliate first-touch atribuce:

```
/? ref link  →  sessionStorage[PENDING_AFFILIATE_REF_KEY]
             →  Register.tsx po úspěšném signUp
             →  RPC record_affiliate_customer_ref(p_ref_code)
             →  INSERT affiliate_customer_refs ... ON CONFLICT (user_id) DO NOTHING
```

`affiliate_customer_refs` má `UNIQUE(user_id)` → jeden zákazník = jedna atribuce na celý život.
**Přesně tento vzor použijeme pro partnera.**

### 1.6 Objem produkčních dat (rozsah rizika)

| Metrika | Hodnota |
|---|---|
| `partner_reward_codes` celkem | 24 |
| z toho `issued` / `activated` / `expired` | 8 / 4 / 0 |
| kódy s vyplněným `expired_at` | **0** |
| `partner_coin_activations` | 6 |
| `partner_invoices` typu `coin` | 6 |
| schválených partnerů | 8 |
| cron jobů obsahujících „expir" | **0** |

Malý dataset → nízké riziko migrace, ale i nulová historická data pro backfill.

### 1.7 Nález mimo zadání (hlásím, neopravuji)

Migrace `20260612125606_partner_invoice_line_snapshots.sql` u obou funkcí nahradila
`PERFORM partner_invoice_post_create(...)` za `enqueue_partner_invoice_email(...)`, resp. hook
úplně odstranila u `create_partner_invoices_for_period`. VAT fix `20260629180000` tento stav
převzal. V repu tedy auto-PDF hook z 12. 06. fakticky neexistuje. Živá produkce to řeší jinou
cestou (EF `partner-invoice-auto-send`), takže **provoz to dnes neohrožuje**, ale repo a produkce
se rozcházejí. Doporučuji samostatný úkol: doplnit do repu chybějící živé objekty
(`run_partner_invoice_weekly_automation`, `claim_partner_invoice_for_auto_send`,
`is_partner_invoice_auto_send_enabled`, EF `partner-invoice-auto-send`) jako „reconciliation" migraci.

---

## 2. NÁVRH — C: 3měsíční platnost partnerské odměny

### 2.1 Princip

Expirace se počítá **od vydání odměny zákazníkovi**, tedy od prvního přechodu kódu do `issued`
(ne od vytvoření objednávky, kdy je kód ještě `pending`).

Vynucení už v systému je (`redeem_miocoin_code` kontroluje `expired_at`), takže stačí:
1. `expired_at` při vydání **nastavit**,
2. prošlé kódy překlopit do auditovatelného stavu `expired`.

### 2.2 Schéma

```sql
-- 2.2.1 globální nastavení (Q4)
INSERT INTO public.settings (key, value)
VALUES ('partner_reward_validity_days', '90')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.partner_reward_validity_days()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE(NULLIF(regexp_replace(
           (SELECT value FROM public.settings WHERE key = 'partner_reward_validity_days'),
           '\D', '', 'g'), '')::integer, 90);
$$;
REVOKE ALL ON FUNCTION public.partner_reward_validity_days() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_reward_validity_days() TO authenticated, service_role;
```

### 2.3 Trigger nastavující expiraci

Trigger místo úpravy tří RPC — pokryje **všechny** cesty (Partner API, Shoptet import, admin,
přímý insert) a nezasáhne do žádné existující funkce.

```sql
CREATE OR REPLACE FUNCTION public.set_partner_reward_expiry()
RETURNS trigger LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN
  -- jen při PRVNÍM přechodu do 'issued' a jen pokud expirace ještě není nastavena
  IF NEW.status = 'issued'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'issued')
     AND NEW.expired_at IS NULL
  THEN
    NEW.expired_at := now() + make_interval(days => public.partner_reward_validity_days());
    -- marker pro rollback: víme přesně, které řádky jsme nastavili my
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
                    || jsonb_build_object('expiry_source', 'auto_v1');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_partner_reward_expiry
BEFORE INSERT OR UPDATE OF status ON public.partner_reward_codes
FOR EACH ROW EXECUTE FUNCTION public.set_partner_reward_expiry();
```

### 2.4 Cron překlápějící prošlé kódy (auditovatelnost)

```sql
CREATE OR REPLACE FUNCTION public.expire_partner_reward_codes()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.partner_reward_codes
     SET status   = 'expired',
         metadata = COALESCE(metadata, '{}'::jsonb)
                    || jsonb_build_object('expired_by', 'cron',
                                          'expired_run_at', now())
   WHERE status = 'issued'
     AND expired_at IS NOT NULL
     AND expired_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_partner_reward_codes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_partner_reward_codes() TO service_role;

SELECT cron.schedule('expire_partner_reward_codes_daily', '30 3 * * *',
                     $$SELECT public.expire_partner_reward_codes();$$);
```

Vlastnosti: nedotýká se `activated` ani `cancelled`; idempotentní (druhý běh = 0 řádků);
každý dotčený řádek nese `metadata.expired_by='cron'` → plně auditovatelné a reverzibilní.

### 2.5 Historická data (Q2)

**Nebackfillovat.** Všech 24 existujících kódů má `expired_at IS NULL` → zůstávají bez expirace
(grandfathering). Pravidlo platí jen pro kódy vydané po nasazení. Backfill by okamžitě
zneplatnil kódy, které partner už zákazníkům rozeslal.

### 2.6 Dopad na fakturaci

**Žádný.** Expirovaný kód se neaktivuje → nevznikne `partner_coin_activations` → nevznikne
`partner_invoice_lines`. Pravidlo „partnerovi se nic neúčtuje" je splněno automaticky.

### 2.7 Frontend

- `RedeemMioCoinCard` už dnes dostane `{success:false, error:'expired'}` — ověřit, že má českou
  hlášku; pokud ne, doplnit „Platnost tohoto kódu už vypršela."
- Zapnout `SHOW_REWARD_EXPIRY_CLAIM = true` v `src/pages/PartnerEshopLanding.tsx`.

---

## 3. NÁVRH — D: start 30denní zahajovací akce

### 3.1 Schéma

```sql
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz
    GENERATED ALWAYS AS (trial_started_at + interval '30 days') STORED;
```

`trial_ends_at` jako generovaný sloupec → **nemůže se rozejít** s `trial_started_at`.

### 3.2 Start trialu — stejný hook jako expirace

```sql
CREATE OR REPLACE FUNCTION public.start_partner_trial_on_first_issue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NEW.status = 'issued'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'issued')
  THEN
    -- IS NULL guard = trial se spustí právě jednou za život partnerského účtu
    UPDATE public.partners
       SET trial_started_at = now()
     WHERE id = NEW.partner_id
       AND trial_started_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_start_partner_trial
AFTER INSERT OR UPDATE OF status ON public.partner_reward_codes
FOR EACH ROW EXECUTE FUNCTION public.start_partner_trial_on_first_issue();
```

### 3.3 ⚠️ Ochrana proti dvojímu trialu — kritický nález

Produkční policy `partners_update_own` dovoluje partnerovi UPDATE **vlastního řádku**
(`auth_user_id = auth.uid()`). Bez ochrany by si partner mohl `trial_started_at` vynulovat
a trial spustit znovu. Postgres nemá column-level RLS → nutný guard trigger:

```sql
CREATE OR REPLACE FUNCTION public.protect_partner_trial_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NEW.trial_started_at IS DISTINCT FROM OLD.trial_started_at THEN
    -- povoleno jen adminovi nebo internímu SECURITY DEFINER kontextu (auth.uid() IS NULL)
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'trial_started_at is not user-modifiable'
        USING ERRCODE = '42501';
    END IF;
    -- ani admin nesmí trial nastavit dvakrát bez explicitního vynulování
    IF OLD.trial_started_at IS NOT NULL AND NEW.trial_started_at IS NOT NULL THEN
      RAISE EXCEPTION 'trial already started' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_partner_trial
BEFORE UPDATE OF trial_started_at ON public.partners
FOR EACH ROW EXECUTE FUNCTION public.protect_partner_trial_columns();
```

Vrstvy ochrany proti dvojímu trialu:
1. `trial_started_at IS NULL` guard v startovacím triggeru (idempotence)
2. guard trigger blokující změnu partnerem
3. guard trigger blokující přepis už nastaveného trialu i adminem
4. `trial_ends_at` je generovaný → nelze posunout samostatně

### 3.4 Zobrazení partnerovi

`PartnerDashboard.tsx` — read-only badge v kartě „Fakturace MioCoinů":
- `trial_started_at IS NULL` → „Zahajovací akce se spustí první vydanou odměnou."
- probíhá → „Zahajovací akce běží do {trial_ends_at}. Prvních 2 MC z každé aktivované odměny hradí OneMil."
- skončila → „Zahajovací akce skončila {trial_ends_at}. Vaše nastavení odměny zůstalo beze změny."

---

## 4. NÁVRH — E: co je během 30 dní zdarma

### 4.1 Pravidlo

Pro každou **aktivovanou** odměnu hradí OneMil `LEAST(coins, 2)` MioCoinu, pokud
`activated_at ∈ [trial_started_at, trial_ends_at)`.

| Nastavení partnera | Zákazník dostane | Zdarma | Partner platí |
|---|---|---|---|
| 0,5 MC | 0,5 MC | 0,5 | **0 MC** |
| 1 MC | 1 MC | 1 | **0 MC** |
| 2 MC | 2 MC | 2 | **0 MC** |
| 5 MC | 5 MC | 2 | **3 MC** |
| 10 MC | 10 MC | 2 | **8 MC** |

Sleva se počítá **až při aktivaci** (rozhoduje `activated_at`), ne při vydání kódu.
Neaktivovaná odměna se stejně jako dnes neúčtuje vůbec.

### 4.2 Schéma

```sql
ALTER TABLE public.partner_invoice_lines
  ADD COLUMN IF NOT EXISTS coins_free numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coins_billable numeric
    GENERATED ALWAYS AS (coins - coins_free) STORED;

ALTER TABLE public.partner_invoices
  ADD COLUMN IF NOT EXISTS coins_free_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_net_before_discount numeric,
  ADD COLUMN IF NOT EXISTS discount_net numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_reason text;
```

Vše aditivní s defaultem → **stávajících 6 faktur se nezmění** (`coins_free_total = 0`,
`discount_net = 0`) a stará i nová logika dávají pro ně identický výsledek.

### 4.3 Výpočet ve `create_partner_invoices_for_last_week` (psát z ŽIVÉ definice!)

Nahradí se pouze blok výpočtu částek a INSERT řádků:

```sql
-- coins celkem (beze změny)
SELECT COALESCE(SUM(a.coins), 0),
       COALESCE(SUM(
         CASE WHEN v_partner.trial_started_at IS NOT NULL
               AND a.activated_at >= v_partner.trial_started_at
               AND a.activated_at <  v_partner.trial_ends_at
              THEN LEAST(a.coins, 2)
              ELSE 0 END), 0)
  INTO v_coins_total, v_coins_free
  FROM public.partner_coin_activations a
 WHERE a.partner_id = v_partner.id
   AND a.invoiced = false
   AND a.activated_at >= v_period_start
   AND a.activated_at <  (v_period_end + 1);

IF v_coins_total = 0 THEN CONTINUE; END IF;

-- Zaokrouhlovací invariant: before − discount = net, net + vat = gross (vždy sedí)
v_amount_before := round(v_coins_total * v_partner.price_per_coin, 2);
v_discount_net  := round(v_coins_free  * v_partner.price_per_coin, 2);
v_amount_net    := v_amount_before - v_discount_net;
v_vat_amount    := round(v_amount_net * v_partner.vat_rate, 2);
v_amount_gross  := v_amount_net + v_vat_amount;
```

Řádky faktury dostanou `coins_free` per aktivace stejným `CASE` výrazem.

### 4.4 Konec trialu

Po `trial_ends_at` se `coins_free` počítá jako 0 → účtuje se standardně.
**Nic se nemění v `partners.reward_mc`** — nastavení partnera zůstává, jak si ho nastavil.
Toto je explicitní požadavek E a musí být pokryto testem.

---

## 5. NÁVRH — F: fakturace během trialu

### 5.1 Co musí faktura obsahovat

| Údaj | Zdroj |
|---|---|
| Počet aktivovaných odměn | `count(partner_invoice_lines)` |
| Celkový počet aktivovaných MioCoinů | `partner_invoices.coins_total` |
| Standardní cena před slevou | `amount_net_before_discount` |
| Počet MC pokrytých zahajovací akcí | `coins_free_total` |
| Výše slevy | `discount_net` |
| Částka po slevě | `amount_net` → `vat_amount` → `amount_gross` |

Textový řádek slevy (`discount_reason`):
`„Zahajovací akce OneMil – první 2 MioCoiny z každé aktivované odměny zdarma"`, sleva **100 %**
na tuto část.

### 5.2 Případ „po slevě 0 Kč" (Q1) — NEVYMÝŠLÍM DAŇOVÝ DOKLAD

Živá funkce dnes přeskočí partnera jen když `coins_total = 0`. S trialem nastane nový stav:
`coins_total > 0`, ale `amount_net = 0` (partner dává ≤ 2 MC). Musí se vědomě rozhodnout:

**Varianta 1 — doporučená.** Vytvořit řádek s `type = 'coin_trial_summary'`,
`invoice_number = NULL`, `variable_symbol = NULL`, `status = 'draft'`.
PDF šablona pro tento typ vykreslí hlavičku **„Přehled zahajovací akce"**, ne „Faktura".
- ✅ partner vidí reálnou hodnotu služby (cíl bodu F)
- ✅ nespotřebovává se číslo daňové řady
- ✅ nevzniká daňový doklad na 0 Kč
- ⚠️ vyžaduje potvrzení účetní + úpravu PDF EF

**Varianta 2.** Plnohodnotná faktura s číslem i při 0 Kč. Nejmenší kód, ale vytváří
nulové daňové doklady v číselné řadě.

**Varianta 3.** Nevystavovat nic. Odporuje bodu F.

> Do rozhodnutí Q1 **neimplementovat**. Varianta 1 je návrh, ne hotové řešení.

### 5.3 Dopad na auto-send pipeline

- `create_partner_invoices_for_last_week` musí **dál vracet `TABLE(invoice_id uuid)`** —
  jinak EF `partner-invoice-auto-send` nedostane žádné id a nic se neodešle.
- Vrací-li i „přehledy" (varianta 1), musí EF nebo `send-partner-invoice-email` rozlišit typ
  a použít jinou e-mailovou šablonu (předmět „Přehled zahajovací akce", ne „Faktura").
- `claim_partner_invoice_for_auto_send` a duplicate protection zůstávají beze změny.

### 5.4 Změny v `generate-partner-invoice-pdf`

Dnešní summary box má 4 položky (`Celkem coinů / Cena bez DPH / DPH 21 % / Cena s DPH`) — rozšířit:

```
Aktivované odměny │ Aktivované MC │ Cena před slevou │ Zdarma (akce) │ Sleva │ Bez DPH │ DPH │ S DPH
```

Tabulka „Položky faktury" získá sloupec **„z toho zdarma"**.
Pod tabulku řádek se `discount_reason` a „Sleva na tuto část: 100 %".
Když `coins_free_total = 0`, PDF vypadá **přesně jako dnes** (zpětná kompatibilita 6 existujících faktur).

---

## 6. NÁVRH — A: bonus 15 MC pro nového zákazníka

### 6.1 Nová atribuce (dnes neexistuje)

```sql
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS public_ref_code text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_public_ref_code
  ON public.partners (public_ref_code) WHERE public_ref_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.partner_customer_refs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id        uuid NOT NULL REFERENCES public.partners(id),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source            text NOT NULL DEFAULT 'partner_link',
  bonus_coins       numeric,
  bonus_granted_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_customer_refs_user_unique UNIQUE (user_id)   -- ← jádro ochrany
);
ALTER TABLE public.partner_customer_refs ENABLE ROW LEVEL SECURITY;

-- zákazník vidí svůj řádek; partner své; admin vše. Žádná write policy — jen SECURITY DEFINER.
CREATE POLICY partner_customer_refs_select ON public.partner_customer_refs
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR partner_id IN (SELECT id FROM public.partners WHERE auth_user_id = auth.uid())
    OR public.is_admin() OR public.is_superadmin()
  );
```

`UNIQUE (user_id)` = **jeden zákazník může být připsán právě jednomu partnerovi, navždy.**
Tím padá jak opakovaná registrace v rámci jednoho účtu, tak sbírání bonusu přes více partnerů.

### 6.2 RPC (vzor: `record_affiliate_customer_ref`)

```sql
CREATE OR REPLACE FUNCTION public.record_partner_customer_ref(p_ref_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_partner  public.partners%ROWTYPE;
  v_created  timestamptz;
  v_bonus    numeric := 15;
  v_wallet   uuid;
  v_balance  numeric;
  v_row_id   uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('status','unauthenticated'); END IF;
  IF p_ref_code IS NULL OR length(btrim(p_ref_code)) = 0 THEN
    RETURN jsonb_build_object('status','invalid_code'); END IF;

  SELECT * INTO v_partner FROM public.partners
   WHERE public_ref_code = btrim(p_ref_code) LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','invalid_code'); END IF;
  IF v_partner.status <> 'approved' THEN
    RETURN jsonb_build_object('status','not_eligible','reason','partner_not_approved'); END IF;
  IF v_partner.auth_user_id = v_uid THEN
    RETURN jsonb_build_object('status','self_referral'); END IF;

  -- už jednou připsán komukoli → konec (first-touch, celoživotně)
  IF EXISTS (SELECT 1 FROM public.partner_customer_refs WHERE user_id = v_uid) THEN
    RETURN jsonb_build_object('status','already_attributed'); END IF;

  -- "NOVÝ zákazník": účet musí být čerstvý, jinak atribuce ano, bonus ne
  SELECT created_at INTO v_created FROM auth.users WHERE id = v_uid;
  IF v_created < now() - interval '24 hours' THEN
    RETURN jsonb_build_object('status','not_new_customer'); END IF;

  INSERT INTO public.partner_customer_refs (partner_id, user_id, source)
  VALUES (v_partner.id, v_uid, 'partner_link')
  ON CONFLICT (user_id) DO NOTHING
  RETURNING id INTO v_row_id;

  IF v_row_id IS NULL THEN               -- souběžný běh vyhrál
    RETURN jsonb_build_object('status','already_attributed'); END IF;

  -- bonus právě jednou (řádek je zamčený vlastním INSERTem v této transakci)
  PERFORM public.ensure_wallet_exists(v_uid);
  UPDATE public.wallets SET balance_coins = balance_coins + v_bonus
   WHERE user_id = v_uid RETURNING id, balance_coins INTO v_wallet, v_balance;

  INSERT INTO public.wallet_transactions
    (user_id, wallet_id, amount, balance_after, type, source, metadata)
  VALUES (v_uid, v_wallet, v_bonus, v_balance,
          'partner_new_customer_bonus', 'record_partner_customer_ref',
          jsonb_build_object('partner_id', v_partner.id));

  UPDATE public.partner_customer_refs
     SET bonus_coins = v_bonus, bonus_granted_at = now()
   WHERE id = v_row_id;

  RETURN jsonb_build_object('status','recorded','partner_id',v_partner.id,'bonus_coins',v_bonus);
END;
$$;
REVOKE ALL ON FUNCTION public.record_partner_customer_ref(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_partner_customer_ref(text) TO authenticated;
```

### 6.3 Ochrana proti dvojímu bonusu — shrnutí vrstev

| Vrstva | Co blokuje |
|---|---|
| `UNIQUE (user_id)` | druhou atribuci téhož účtu — i k jinému partnerovi |
| `ON CONFLICT DO NOTHING` + `RETURNING IS NULL` | souběžné volání (race) — bonus dostane právě jeden běh |
| `bonus_granted_at` | opakované vyplacení k existující atribuci |
| kontrola stáří účtu (24 h) | existující zákazník, který si jen klikne na partnerský odkaz |
| `auth_user_id = v_uid` | partner sám sobě |
| `status = 'approved'` | neschválený / zamítnutý partner |

**Reziduální riziko (Q5):** stejný člověk s novým e-mailem = nový `auth.users.id` = nový bonus.
Bez KYC to nejde uzavřít; je to totožné riziko jako u stávajícího referral systému.
Doporučuji přijmout a monitorovat (denní přehled `partner_customer_refs` po partnerech).

### 6.4 Bonus NENÍ na účet partnera

`record_partner_customer_ref` **nesmí** vytvořit řádek v `partner_coin_activations`.
15 MC hradí OneMil jako akviziční náklad, ne partner. Musí být pokryto testem.

### 6.5 Vztah k uživatelskému referral bonusu (Q3)

`ONEMIL_BUSINESS_CONTEXT.md §11` má vlastních 15 MC za pozvání kamaráda
(`create_referral_reward_from_payment`, po první placené dobíječce). Jsou to **dva různé zdroje**:

| | Partnerský bonus (nový) | Uživatelský referral (existující) |
|---|---|---|
| Kdo přivedl | e-shop | jiný uživatel |
| Trigger | registrace přes partnerský odkaz | první placená dobíječka pozvaného |
| Tabulka | `partner_customer_refs` | `referrals` / `referral_rewards` |
| `wallet_transactions.type` | `partner_new_customer_bonus` | stávající |

Technicky se **nevylučují** — zákazník může teoreticky dostat oba. Vyžaduje rozhodnutí majitele.

### 6.6 Frontend

1. `src/lib/publicAppUrl.ts` — helper pro partnerský odkaz `https://onemil.cz/?p=CODE`
2. nový klíč `PENDING_PARTNER_REF_KEY = 'onemil_partner_ref'` (sessionStorage), stejný vzor
   jako `PENDING_AFFILIATE_REF_KEY`
3. `Homepage.tsx` / `PartnerEshopLanding.tsx` — zachytit `?p=` do sessionStorage
4. `Register.tsx` — po úspěšném `signUp`, hned vedle `record_affiliate_customer_ref`, zavolat
   `record_partner_customer_ref`; **plně non-blocking** (try/catch, chyba nikdy nesmí rozbít registraci)
5. `PartnerDashboard.tsx` — zobrazit partnerovi jeho odkaz + počet přivedených zákazníků
6. `useApplyPendingReferral.ts` — analogický hook pro OAuth návrat

---

## 7. TESTY

### 7.1 DB testy (staging, SQL, v transakci s ROLLBACK)

**C — expirace**
- vydání kódu → `expired_at = now() + 90 dní`, `metadata.expiry_source = 'auto_v1'`
- opakovaný UPDATE na `issued` → `expired_at` se nemění
- `pending` kód → `expired_at IS NULL`
- `redeem_miocoin_code` na prošlý kód → `{success:false, error:'expired'}`, wallet beze změny
- `expire_partner_reward_codes()` překlopí jen `issued` + prošlé; druhý běh vrátí 0
- prošlý kód → **0 řádků** v `partner_coin_activations`, 0 řádků na faktuře
- `activated` a `cancelled` kódy zůstanou nedotčené

**D — trial**
- první `issued` kód partnera → `trial_started_at` nastaveno, `trial_ends_at = +30 dní`
- druhý `issued` kód → `trial_started_at` **nezměněno**
- partner UPDATE vlastního `trial_started_at` → `42501`
- admin přepis už nastaveného trialu → `42501`
- partner bez odměn → `trial_started_at IS NULL`

**E — sleva** (parametrizované)
| coins | v trialu | očekáváno `coins_free` / `coins_billable` |
|---|---|---|
| 0.5 | ano | 0.5 / 0 |
| 1 | ano | 1 / 0 |
| 2 | ano | 2 / 0 |
| 5 | ano | 2 / 3 |
| 10 | ano | 2 / 8 |
| 5 | ne (po `trial_ends_at`) | 0 / 5 |
| 5 | partner bez trialu | 0 / 5 |
- invariant: `amount_net_before_discount - discount_net = amount_net`
- invariant: `amount_net + vat_amount = amount_gross`
- `partners.reward_mc` po skončení trialu **beze změny**

**F — fakturace**
- týden jen se zdarma aktivacemi → dokument dle zvolené varianty Q1
- smíšený týden (5 MC + 1 MC) → sleva 2 + 1 = 3 MC
- **regrese:** partner bez trialu → faktura bitově identická se současnou logikou
- `create_partner_invoices_for_last_week()` stále vrací `TABLE(invoice_id uuid)`

**A — bonus 15 MC**
- nová registrace přes `?p=` → `recorded`, wallet +15, `wallet_transactions` 1 řádek
- druhé volání týmž uživatelem → `already_attributed`, wallet beze změny
- jiný partner týž uživatel → `already_attributed`
- účet starší 24 h → `not_new_customer`, **žádný** bonus a žádná atribuce
- partner sám sobě → `self_referral`
- neschválený partner → `not_eligible`
- souběžné dvojí volání → právě 1 řádek, právě 1 kredit
- **0 řádků** v `partner_coin_activations` (bonus není na účet partnera)
- anon → `unauthenticated`

### 7.2 E2E (staging, Playwright)

Nový staging-only self-contained spec `tests/e2e/57-partner-trial-and-bonus.spec.ts`
(vzor: spec 43/44/47 — throwaway partner + zákazník přes service_role, cleanup v `afterAll`).

### 7.3 Regresní sada, která musí zůstat zelená

`43-partner-invoices`, `44-partner-invoice-pdf-email`, `45` (invoice tlačítka),
`47-partner-dashboard-smoke`, `50-miocoin-code-redeem-ui`, `53` (email_mismatch) + P0 smoke.

---

## 8. ROLLBACK

Fáze se vrací **v opačném pořadí**. Všechny nové sloupce jsou aditivní a nullable/defaultované,
takže jejich odstranění vrací přesně původní chování.

```sql
-- Fáze 4 (A)
DROP FUNCTION IF EXISTS public.record_partner_customer_ref(text);
DROP TABLE IF EXISTS public.partner_customer_refs;      -- POZOR: maže atribuce i historii bonusů
ALTER TABLE public.partners DROP COLUMN IF EXISTS public_ref_code;
-- už vyplacené bonusy ve wallets se NEODEBÍRAJÍ (byly to reálné kredity zákazníků)

-- Fáze 3 (E+F)  — obnovit ŽIVOU definici z pre-apply zálohy pg_get_functiondef
CREATE OR REPLACE FUNCTION public.create_partner_invoices_for_last_week() ... ; -- původní
ALTER TABLE public.partner_invoices
  DROP COLUMN IF EXISTS coins_free_total, DROP COLUMN IF EXISTS amount_net_before_discount,
  DROP COLUMN IF EXISTS discount_net,     DROP COLUMN IF EXISTS discount_reason;
ALTER TABLE public.partner_invoice_lines
  DROP COLUMN IF EXISTS coins_billable,   DROP COLUMN IF EXISTS coins_free;
-- + redeploy předchozí verze generate-partner-invoice-pdf / send-partner-invoice-email

-- Fáze 2 (D)
DROP TRIGGER IF EXISTS trg_protect_partner_trial ON public.partners;
DROP TRIGGER IF EXISTS trg_start_partner_trial   ON public.partner_reward_codes;
DROP FUNCTION IF EXISTS public.protect_partner_trial_columns();
DROP FUNCTION IF EXISTS public.start_partner_trial_on_first_issue();
ALTER TABLE public.partners DROP COLUMN IF EXISTS trial_ends_at, DROP COLUMN IF EXISTS trial_started_at;

-- Fáze 1 (C)
SELECT cron.unschedule('expire_partner_reward_codes_daily');
DROP TRIGGER IF EXISTS trg_set_partner_reward_expiry ON public.partner_reward_codes;
DROP FUNCTION IF EXISTS public.expire_partner_reward_codes();
DROP FUNCTION IF EXISTS public.set_partner_reward_expiry();
DROP FUNCTION IF EXISTS public.partner_reward_validity_days();
-- vrátit stavy, které překlopil cron (marker!)
UPDATE public.partner_reward_codes SET status = 'issued'
 WHERE status = 'expired' AND metadata->>'expired_by' = 'cron';
-- zrušit expirace, které nastavil náš trigger (marker!)
UPDATE public.partner_reward_codes SET expired_at = NULL
 WHERE metadata->>'expiry_source' = 'auto_v1';
DELETE FROM public.settings WHERE key = 'partner_reward_validity_days';
```

Markery `metadata.expired_by` a `metadata.expiry_source` jsou tam **právě proto**, aby rollback
nikdy nesáhl na řádky, které jsme nezpůsobili my.

**Před každou produkční fází:** manuální `pg_dump` (PITR je vypnutý) + uložení
`pg_get_functiondef()` všech měněných funkcí do rollback souboru.

---

## 9. POŘADÍ NASAZENÍ

| Fáze | Obsah | Závislost | Riziko |
|---|---|---|---|
| 1 | C — expirace (settings, trigger, cron) | žádná | nízké, izolované |
| 2 | D — trial sloupce + start + ochrana | žádná | nízké, zatím bez dopadu na peníze |
| 3 | E + F — sleva ve fakturaci, PDF, e-mail | 2, **Q1** | **vysoké — dotýká se peněz** |
| 4 | A — partner ref code, atribuce, bonus 15 MC | žádná | střední (kredituje peněženky) |
| 5 | Publikace landing page `/pro-eshopy` | **1–4 live** | žádné technické |

Každá fáze: staging → postcheck → výslovné schválení Pavla → produkce + postcheck.

> **Fáze 5 nesmí předběhnout 1–4.** Landing page dnes tvrdí věci
> (15 MC pro nové zákazníky, prvních 2 MC zdarma), které backend zatím neumí.
> Do té doby jsou v `src/pages/PartnerEshopLanding.tsx` řízené konstantami
> `SHOW_PARTNER_15MC_CARD`, `SHOW_TRIAL_CARD`, `SHOW_REWARD_EXPIRY_CLAIM`.

---

## 10. CO TENTO NÁVRH VĚDOMĚ NEŘEŠÍ

- **Minimální odměna** — bod B: ponecháno současné chování dashboardu (`min="0.1"`, `step="0.1"`).
  Reward systém se v tomto kroku nemění.
- Per-produktové odměny (`partners.reward_mode = 'whole_shop'`) — existuje, ale mimo rozsah.
- Reconciliation repo ↔ produkce u weekly invoice pipeline (viz 1.7) — samostatný úkol.
- Přesné znění e-mailové šablony pro „Přehled zahajovací akce" — až po rozhodnutí Q1.
- Daňové posouzení nulového dokladu — patří účetní, ne vývoji.
