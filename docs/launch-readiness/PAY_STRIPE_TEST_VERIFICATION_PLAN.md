# Stripe staging TEST verification plan — PAY01–PAY04

**Stav:** plán k provedení. **Pouze Stripe TEST mode na stagingu.** Nepřepínat na live.
**Cíl:** ověřit runtime Stripe pipeline (checkout → webhook → wallet credit → idempotence → success/cancel) end-to-end před launchem.
**Staging projekt:** `dxmowysntemfqfnanxua` (produkce `xkzhjldrojjlrkezorey` se NEDOTÝKÁ).
**Datum přípravy:** 29. 06. 2026

## Kontext z read-only auditu (hotovo v kódu)
- `create-stripe-checkout`: JWT povinné, MioCoiny odvozené ze serveru z CZK ceny (klientský `totalCoins` ignorován).
- `stripe-webhook`: ověřuje podpis (`STRIPE_WEBHOOK_SECRET`), na `checkout.session.completed` znovu dopočítá coiny z `amount_total`, INSERT do `payments`.
- Wallet credit = DB trigger `trg_update_wallet_after_payment` (AFTER INSERT) → `wallets.balance_coins += amount`.
- Idempotence = 2× unique index na `payments.stripe_session_id` (`payments_stripe_session_id_key` + partial `idx_payments_stripe_session_id_unique`); wallet trigger fire jen na INSERT.
- Routy `/payment-success` + `/payment-cancel` (+ aliasy `/payment/success`, `/payment/cancel`) existují; `PaymentSuccess.tsx` jen čte payments pro analytics, sám nepřipisuje.
- `verify_jwt`: `stripe-webhook = false` (správně), `create-stripe-checkout` default true (správně). Neměnit.

---

## A) Staging setup checklist

**Webhook URL (staging):** `https://dxmowysntemfqfnanxua.supabase.co/functions/v1/stripe-webhook`

**Stripe TEST secrets na staging Edge Functions** (Supabase → projekt `dxmowysntemfqfnanxua` → Edge Functions → Secrets) — vše TEST mode, hodnoty NIKDY netisknout do chatu/commitu:
1. `STRIPE_SECRET_KEY` = Stripe **test** secret key (`sk_test_...`).
2. `STRIPE_WEBHOOK_SECRET` = signing secret konkrétního staging webhook endpointu z kroku B (`whsec_...`).
3. `PUBLIC_APP_URL` (nebo `SITE_URL`) = veřejná staging app URL (https) pro `success_url`/`cancel_url`.
4. Ověřit, že existují (pro DB zápis z webhooku): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (staging hodnoty).

**Pre-test guard:** nasazené staging EF verze `create-stripe-checkout` + `stripe-webhook` musí odpovídat zdroji v repu (stejný `CZK_TO_COINS` v obou).

---

## B) Co musí Pavel udělat ručně ve Stripe dashboardu (TEST mode)
1. Stripe dashboard přepnout do **Test mode** (NE Live).
2. Developers → Webhooks → **Add endpoint**:
   - Endpoint URL = `https://dxmowysntemfqfnanxua.supabase.co/functions/v1/stripe-webhook`
   - Events: **`checkout.session.completed`** (stačí tento).
3. Zkopírovat **Signing secret** (`whsec_...`) endpointu a vložit jako `STRIPE_WEBHOOK_SECRET` do staging EF secrets (A2). Nikam jinam, neposílat do chatu.
4. Připravit Stripe test kartu `4242 4242 4242 4242`, libovolné budoucí datum, libovolné CVC/PSČ.
5. Pro idempotenci mít po ruce u `checkout.session.completed` eventu tlačítko **Resend**.

---

## C) Test checkout kroky (TEST mode, jeden průchod)
1. Přihlásit se na staging app jako testovací zákazník (ne admin), known wallet balance.
2. Spustit baseline SQL D-0 — zaznamenat `payments` count + wallet balance.
3. V appce zvolit balíček, např. **300 Kč** (očekávaný credit 310 MioCoinů), koupit → redirect na Stripe Checkout.
4. Zaplatit test kartou `4242 4242 4242 4242`.
5. Stripe redirect na `…/payment-success?session_id=...` → ověřit toast „MioCoiny byly připsány na tvůj účet".
6. Spustit SQL D-1, D-2.
7. **Replay:** ve Stripe u `checkout.session.completed` kliknout **Resend** → spustit D-3.
8. **Cancel:** nový checkout, na Stripe stránce zrušit → ověřit `…/payment-cancel` + žádný nový payments řádek.

---

## D) Read-only SQL checks (staging `dxmowysntemfqfnanxua`)
Nahradit `:uid` (UUID testovacího uživatele) a `:sid` (Stripe session id z payment-success URL). Vše SELECT-only.

**D-0 — baseline před platbou:**
```sql
SELECT (SELECT balance_coins FROM public.wallets WHERE user_id = ':uid') AS wallet_before,
       (SELECT COUNT(*) FROM public.payments WHERE user_id = ':uid') AS payments_before;
```

**D-1 — právě jeden payments řádek:**
```sql
SELECT COUNT(*) AS rows_for_session, MAX(amount) AS amount,
       MAX(status) AS status, MAX(method) AS method
FROM public.payments
WHERE stripe_session_id = ':sid';
-- očekávání: rows_for_session = 1, amount = 310, status = 'completed', method = 'stripe'
```

**D-2 — wallet připsán právě jednou:**
```sql
SELECT balance_coins FROM public.wallets WHERE user_id = ':uid';
-- očekávání: wallet_before + 310
```

**D-3 — po Resend webhooku (idempotence):**
```sql
SELECT
  (SELECT COUNT(*) FROM public.payments WHERE stripe_session_id = ':sid') AS rows_for_session,
  (SELECT balance_coins FROM public.wallets WHERE user_id = ':uid') AS wallet_after_replay;
-- očekávání: rows_for_session STÁLE = 1; wallet beze změny
```

**D-4 — žádná duplicitní session:**
```sql
SELECT stripe_session_id, COUNT(*)
FROM public.payments
WHERE user_id = ':uid'
GROUP BY stripe_session_id
HAVING COUNT(*) > 1;
-- očekávání: 0 řádků
```

---

## E) Expected results (gate — vše musí platit)
- D-1: `rows_for_session = 1`, `amount = 310`, `status = 'completed'`, `method = 'stripe'`.
- D-2: wallet = baseline + 310.
- D-3: `rows_for_session = 1` (beze změny), wallet beze změny po Resend → idempotence potvrzena unique indexem.
- D-4: 0 duplicit.
- Stripe dashboard: první event `200`; Resend taky `200`, tělo „Payment already processed".

---

## F) Success / cancel routing check
- **Success:** URL `/payment-success?session_id=...`, stránka se vykreslí, toast „MioCoiny byly připsány na tvůj účet". `PaymentSuccess.tsx` jen čte payments (nepřipisuje).
- **Cancel:** zrušení na Stripe → `/payment-cancel`, vykreslí se bez chyby, žádný nový `payments` řádek (D-0 count beze změny).
- Ověřit i aliasy `/payment/success`, `/payment/cancel`.

---

## G) Jak zapsat důkaz do LAUNCH_TODO
Po zeleném průchodu v `docs/launch-readiness/LAUNCH_TODO.md` sekce „Platby a fakturace (E)", řádky PAY01–PAY04:
- **Skutečný výsledek:** stručně (PAY01 checkout redirect OK; PAY02 1 payments řádek + wallet +310; PAY03 success/cancel routy OK; PAY04 Resend → žádný druhý credit).
- **Důkaz:** datum + „Stripe test mode, staging dxmowysntemfqfnanxua" (NEvypisovat reálné session id ani secrety).
- **Stav:** `prošlo (staging test mode)`.
- **Poznámka:** TEST mode only; live přepnutí = samostatný schválený krok.

---

## Live přepnutí — samostatný schválený krok (NE součástí tohoto plánu)
Přepnutí na Stripe live vyžaduje **samostatné výslovné schválení Pavla** a zahrnuje: live `STRIPE_SECRET_KEY`, live `STRIPE_WEBHOOK_SECRET`, registraci **live** webhook endpointu na produkční `stripe-webhook`, `PUBLIC_APP_URL`/`SITE_URL` na produkční doméně (`https://onemil.cz`), a vlastní postcheck. Tento dokument pokrývá pouze staging TEST ověření.
