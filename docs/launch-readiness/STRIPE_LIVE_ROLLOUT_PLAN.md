# Stripe LIVE Rollout Plán

> **Stav (30. 06. 2026):** Produkční Stripe je stále v **TEST mode**. PAY01–PAY04 prošly na staging TEST mode (commit `f39de113`). Tento dokument je **plán** — nic není přepnuto. Live rollout je **samostatný vědomě schválený krok** a proběhne až po výslovném schválení Pavla.
>
> **Produkce:** `xkzhjldrojjlrkezorey` · doména `https://onemil.cz`

---

## ⚠️ Upozornění

**Po přepnutí na live jsou všechny platby reálné.** Reální zákazníci platí reálnými penězi reálnými kartami. Žádné `cs_test_` sessions — jen `cs_live_`. Každá chyba v tomto kroku má finanční dopad.

---

## 1. Live rollout checklist (pořadí kroků)

1. ⛔ **Výslovné schválení Pavla** (přesný text v sekci 7) — bez něj NIC nepřepínat.
2. Pavel v **Stripe Dashboard přepne na LIVE mode** a dokončí aktivaci účtu (business profil, bankovní účet, daně), pokud ještě není.
3. Pavel vytvoří **live webhook endpoint** (sekce 4) a zkopíruje jeho signing secret.
4. Aktualizovat **2 produkční Supabase secrets** (sekce 2) na live hodnoty.
5. EF se nemusí redeployovat (secrets se čtou za běhu), ale ověřit, že `create-stripe-checkout` a `stripe-webhook` jsou ACTIVE.
6. **První kontrolovaná live platba** nejnižším tierem 50 Kč reálnou kartou Pavla (sekce 5).
7. Read-only ověření: 1 `payments` completed + wallet credit + webhook 200 + 0 duplicit.
8. Pavel volitelně testovací live platbu **refunduje** ve Stripe Dashboardu.
9. Zápis do dokumentace (CLAUDE.md / onemil_state.md / onemil_history.md / LAUNCH_TODO.md) — že live běží.

---

## 2. Produkční secrets ke změně (jen názvy — hodnoty nikdy netisknout)

| Secret | Aktuální | Live cílový stav | Akce |
|--------|----------|------------------|------|
| `STRIPE_SECRET_KEY` | test (`sk_test_…`) | live (`sk_live_…`) | **změnit** |
| `STRIPE_WEBHOOK_SECRET` | test endpoint signing | live endpoint signing (`whsec_…`) | **změnit** |
| `PUBLIC_APP_URL` | `https://onemil.cz` | `https://onemil.cz` | **beze změny** ✅ |

- `SUPABASE_URL` a `SUPABASE_SERVICE_ROLE_KEY` se nemění (interní, nesouvisí se Stripe).
- Příkazový vzor (hodnoty nikdy netisknout):
  `supabase secrets set STRIPE_SECRET_KEY=… STRIPE_WEBHOOK_SECRET=… --project-ref xkzhjldrojjlrkezorey`
- **Před změnou** si zaznamenat, že současné TEST hodnoty existují a kam je vrátit (pro rollback — digest, ne hodnota).

---

## 3. PUBLIC_APP_URL

Produkční `PUBLIC_APP_URL` je již nastaven na **`https://onemil.cz`** — pro live je správný a **nemění se**. (Success redirect = `https://onemil.cz/payment-success`, cancel = `https://onemil.cz/payment-cancel`.)

---

## 4. Live webhook endpoint (Stripe Dashboard, LIVE mode)

- **URL:** `https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/stripe-webhook`
- **Event:** `checkout.session.completed` (jediný event, který webhook zpracovává)
- **API verze:** ponechat default Stripe účtu
- Po vytvoření → zkopírovat **Signing secret** (`whsec_…`) → vložit do `STRIPE_WEBHOOK_SECRET` (sekce 2)
- ⚠️ Live webhook je **samostatný endpoint** od TEST endpointu — TEST endpoint nechat být (používá ho staging).

---

## 5. První live platba bez rizika

1. Použít **nejnižší tier 50 Kč** (= 50 MioCoinů). Tiery: `50→50`, `300→310`, `500→525`, `1200→1280`.
2. Pavel se přihlásí jako **vlastní reálný účet** na `https://onemil.cz` a koupí 1× 50 Kč top-up **reálnou kartou**.
3. Read-only ověření na produkci po platbě:
   - `payments`: nový řádek `status='completed'`, `amount=50`, `method='stripe'`, session prefix `cs_live_`
   - wallet daného uživatele: **+50**
   - webhook log: `stripe-webhook` → **200**
   - **žádná duplicita** (unikátní `stripe_session_id`)
4. Pavel volitelně platbu **refunduje** ve Stripe Dashboardu (live refund). Pozn.: refund vrátí peníze na kartu, ale MioCoiny v peněžence zůstanou — pokud je třeba je odebrat, řeší se zvlášť guarded postupem (samostatné schválení).
5. Teprve po úspěšném ověření je live flow potvrzený pro reálné zákazníky.

---

## 6. Rollback plán

- **Okamžitý rollback:** vrátit `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` na **TEST hodnoty** → produkce zpět do bezpečného TEST mode.
- **Webhook:** live endpoint ve Stripe Dashboardu lze **disable** (ne nutně mazat).
- **PUBLIC_APP_URL:** žádný rollback (nemění se).
- **EF kód:** beze změny, žádný redeploy → není co rollbackovat na úrovni kódu.
- **Nechtěná live data:** guarded postup jako u cleanup 30.06. (wallet deduct + `status='refunded'`, audit trail, žádné mazání) — vyžaduje samostatné schválení.
- **Předpoklad:** TEST hodnoty obou secrets být dostupné před změnou.

---

## 7. Přesný schvalovací text pro Pavla

> **„Schvaluji Stripe LIVE rollout na produkci xkzhjldrojjlrkezorey: změnit produkční secrets STRIPE_SECRET_KEY a STRIPE_WEBHOOK_SECRET na live hodnoty, použít live webhook endpoint na https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/stripe-webhook s eventem checkout.session.completed. PUBLIC_APP_URL zůstává https://onemil.cz. Rozumím, že po přepnutí jsou platby reálné, první ověření proběhne jednou platbou 50 Kč mou kartou, a že rollback = vrácení obou secrets na TEST hodnoty.“**

---

## Reference

- Staging TEST ověření PAY01–PAY04: commit `f39de113`, sekce v `CLAUDE.md` / `onemil_state.md`.
- Root cause fix `update_wallet_after_payment` (balance_coins-only, sjednoceno staging↔produkce).
- Webhook idempotence: guard `existingPayment` na `stripe_session_id` ve `stripe-webhook`.
