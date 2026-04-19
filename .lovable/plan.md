

## Diagnóza

**Příčina:** Trigger `log_partner_coin_activation` na `UPDATE` tabulky `user_vouchers` se dotazuje na neexistující sloupec:

```sql
SELECT * FROM partner_reward_codes WHERE voucher_id = NEW.voucher_id
```

Tabulka `partner_reward_codes` ale sloupec `voucher_id` **neobsahuje** (má jen `code`, `partner_id`, `coins`, `external_order_id`, `customer_email`, …).

**Proč to selže jen z oblíbených:**
- Přímý nákup → RPC dělá `INSERT` → trigger neběží (je vázán jen na UPDATE) → OK.
- Nákup z oblíbených → existuje řádek `redeemed=false` → RPC dělá `UPDATE redeemed=true` → trigger se spustí → spadne na `column "voucher_id" does not exist` → celá transakce se rollbackne → frontend zobrazí „Nepodařilo se zakoupit voucher".

Potvrzeno v Postgres logu: `ERROR: column "voucher_id" does not exist` (dvakrát, v čase odpovídajícím tvým pokusům).

## Návrh opravy

Trigger spojuje partnerský reward s voucherem přes neexistující vztah. Tabulka `partner_reward_codes` má místo toho `code` (kód voucheru). Tabulka `vouchers` ale není přístupná (neviděl jsem zatím její sloupce v tomto kontextu) — proto navrhuji **bezpečnou minimální opravu**:

**Migrace** (`supabase/migrations/<timestamp>_fix_log_partner_coin_activation.sql`):

Přepsat funkci `log_partner_coin_activation()` tak, aby se napojila na partnerský reward přes existující vazbu:

1. Načíst z `vouchers` pole, které mapuje na partner reward (typicky `code` nebo `partner_reward_code_id`) — toto si při implementaci ověřím doplňkovým dotazem na schéma `vouchers`.
2. Pokud žádné takové pole neexistuje (= vouchery nejsou propojené s partnerskými kódy), trigger jen `RETURN NEW` bez dotazu — voucher se v klidu uplatní a partner accounting se nezasekne.

Tím se odblokuje uplatnění voucheru z oblíbených, aniž by se cokoliv změnilo v RPC `buy_voucher_atomic` ani v RLS.

## Co se NEmění

- `buy_voucher_atomic` RPC — beze změny
- RLS policies, schéma tabulek, ceny, peněženky
- Frontend (`Vouchers.tsx`, `useUserVouchers.ts`) — beze změny
- Logika nákupu, odečet MioCoinů, wallet transactions

## Implementační kroky (po schválení)

1. Dotázat se na schéma `vouchers` a `partner_reward_codes`, abych určil správné napojení.
2. Vytvořit migraci, která přepíše tělo `log_partner_coin_activation()`.
3. Otestovat: voucher do oblíbených → koupit → očekávaný úspěch + odečet 5 MC.

