# PAY01 — Poznámka k testovacímu režimu plateb (15. 06. 2026)

## Stav projektu

OneMil je technicky dostupný na veřejné adrese, ale zatím nejde o veřejné spuštění pro zákazníky. Projekt je stále v testovací fázi a Pavel na něm průběžně ověřuje funkce, platby, soutěže, MioCoiny, účty a doklady.

Dosavadní data nejsou reálný veřejný provoz. Platby, účty, MioCoiny, soutěže, doklady, Stripe záznamy a související transakce jsou testovací nebo smyšlená data. Web zatím není určený pro běžné uživatele ani reálné zákaznické platby.

Produkční prostředí může být používáno k testování, ale Stripe běží na testovacích klíčích. Před ostrým spuštěním musí Pavel vědomě potvrdit přepnutí Stripe na live režim, live webhook a finální produkční nastavení.

## Technický stav PAY01–04 (15. 06. 2026)

| Test | Status | Poznámka |
|------|--------|----------|
| PAY01 — Stripe checkout se vytvoří | ⏳ neověřeno E2E | Kód OK; automatický test neexistuje |
| PAY02 — Webhook zpracuje platbu | ⏳ neověřeno E2E | Kód OK (idempotentní, signature-verified) |
| PAY03 — MioCoiny se připíší do peněženky | ⏳ neověřeno E2E | Kód OK (DB trigger); manuálně ověřeno v prod |
| PAY04 — Refund flow | ⏳ neověřeno E2E | Kód OK (admin EF + deduct_wallet_for_refund RPC) |

## Staging Stripe konfigurace (15. 06. 2026)

- `create-stripe-checkout` — nasazena na staging `dxmowysntemfqfnanxua` ✅ (v1, 15. 06. 2026)
- `stripe-webhook` — nasazena na staging `dxmowysntemfqfnanxua` ✅ (v1, 15. 06. 2026)
- `STRIPE_SECRET_KEY` — **chybí** v staging secrets; Pavel musí nastavit ručně (`sk_test_...`)
- `STRIPE_WEBHOOK_SECRET` — **chybí** v staging secrets; Pavel musí nastavit ručně (`whsec_...`)
- `PUBLIC_APP_URL` — **chybí** v staging secrets; Pavel musí rozhodnout URL (viz níže)

## Co musí Pavel udělat před testovací platbou na stagingu

1. **Stripe Dashboard (test mode)** → `https://dashboard.stripe.com/test/apikeys`
   → zkopírovat Secret key (`sk_test_...`)

2. **Stripe Dashboard (test mode)** → `https://dashboard.stripe.com/test/webhooks` → Add endpoint
   - URL: `https://dxmowysntemfqfnanxua.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`
   → po vytvoření zkopírovat Signing secret (`whsec_...`)

3. **Supabase Dashboard** → `https://supabase.com/dashboard/project/dxmowysntemfqfnanxua/settings/functions`
   → přidat secrets:
   - `STRIPE_SECRET_KEY` = hodnota z kroku 1
   - `STRIPE_WEBHOOK_SECRET` = hodnota z kroku 2
   - `PUBLIC_APP_URL` = `https://onemil.cz` (nebo jiná staging URL, pokud existuje)

4. Potvrdit mně — ověřím existenci secrets přes `supabase secrets list` a pokračujeme k testovací platbě.

## Před ostrým spuštěním (live mode)

- Přepnout `STRIPE_SECRET_KEY` na `sk_live_...` (live klíč ze Stripe Dashboard)
- Vytvořit live webhook endpoint v Stripe a nastavit nový `STRIPE_WEBHOOK_SECRET`
- Pavel musí tuto změnu výslovně schválit — nikdy nepřepínat na live bez potvrzení
