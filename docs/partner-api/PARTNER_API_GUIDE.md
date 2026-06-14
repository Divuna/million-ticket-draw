# OneMil Partner API — průvodce (v1, připraveno pro PR #114)

> **STAV: PŘIPRAVENO, ZATÍM NE V PRODUKCI.**
> Tento průvodce popisuje Partner API order-event model zavedený v PR #114.
> Stane se živým partnerským návodem **až po produkčním rolloutu PR #114**
> (merge + migrace `20260613200202`/`20260613200849` + deploy Edge Function
> `partner-activate`), který vyžaduje výslovné písemné schválení.
> Do té doby **neuvádět partnerům jako platný** a **neukládat do
> `settings.partner_api_documentation`**. Aktuální živá hodnota v nastavení
> stále popisuje starý endpoint a musí být nahrazena až při rolloutu.

---

## 1. Princip: posíláte události objednávky, ne hotovou odměnu
Integrace OneMilu je postavená na **událostech objednávky** (order events). Váš e-shop
v průběhu života objednávky posílá OneMilu na pozadí jednoduché události a OneMil podle
nich spravuje odměnu zákazníka v MioCoinech.

Tři druhy událostí:
1. **Objednávka vytvořena** → OneMil vytvoří **čekající odměnu** (kód + odkaz).
2. **Zaplaceno / doručeno / dokončeno** → odměna se **aktivuje** (stane se aktivní odměnou).
3. **Zrušeno / vráceno / nezaplaceno / nevyzvednuto** → odměna se **zruší**.

> **Neposíláte konečný počet MioCoinů.** Počet vždy spočítá OneMil z vašeho nastavení
> v Partner portálu (kolik Kč = 1 MioCoin). Vy posíláte jen částku objednávky.

## 2. Zlaté pravidlo: checkout nikdy nečeká na OneMil
Dokončení objednávky zákazníka **nesmí nikdy záviset** na odpovědi OneMilu.
- Volání OneMilu provádějte **na pozadí (asynchronně)**, až po dokončení objednávky.
- Pokud je OneMil nedostupný nebo volání selže, **checkout proběhne normálně dál**.
- Selhané události **zopakujte později** se stejným `external_order_id` (viz bod 9).

## 3. Co potřebujete
- Schválený partnerský účet v OneMilu.
- API klíč (Partner portál → API klíče).
- Odesílání HTTP požadavků **ze serveru** (ne z prohlížeče zákazníka).

> API klíč nikdy nevkládejte do frontendu ani ho nezveřejňujte.

## 4. Autentizace a endpoint
```
POST https://<onemil-api>/functions/v1/partner-activate
Authorization: Bearer VÁŠ_API_KLÍČ
Content-Type: application/json
```

---

## 5. Událost: Objednávka vytvořena → čekající odměna

Pošlete hned po vytvoření objednávky (na pozadí):
```json
{
  "external_order_id": "OBJ-123456",
  "order_total_czk": 250,
  "customer_email": "zakaznik@email.cz"
}
```
- `external_order_id` (povinné) — vaše číslo objednávky (přijímá se i `order_id`).
- `order_total_czk` (povinné) — částka objednávky v Kč.
- `customer_email` (povinné) — e-mail zákazníka; na něj bude kód vázán.

> Neposílejte `coins`, `miocoins` ani jiný konečný počet odměny — API to odmítne.

**Odpověď:**
```json
{
  "status": "pending",
  "code": "HI06EJ6KFUEU",
  "link": "https://onemil.cz/profile?miocoin_code=HI06EJ6KFUEU",
  "coins": 2,
  "external_order_id": "OBJ-123456",
  "customer_email": "zakaznik@email.cz",
  "duplicate": false
}
```
**Příklad výpočtu:** nastavení „100 Kč = 1 MioCoin", objednávka 250 Kč → **2 MioCoiny**.

Co s odpovědí:
- Uložte `code` a `link` k objednávce.
- Můžete je uvést v potvrzovacím e-mailu objednávky jako **čekající odměnu**
  („Po zaplacení získáte 2 MioCoiny").
- Stav čekající odměny znamená, že odměna **zatím není aktivní** a nelze ji uplatnit.

---

## 6. Událost: Změna stavu objednávky

Když se změní stav objednávky, pošlete událost se stavem:
```json
{
  "external_order_id": "OBJ-123456",
  "order_status": "paid"
}
```
(`status` se přijímá jako alias pro `order_status`.)

Co která událost udělá s odměnou:
- `paid` / `delivered` / `completed` → odměna se **aktivuje** (stane se **aktivní odměnou**).
- `cancelled` / `returned` / `unpaid` / `not_picked_up` → odměna se **zruší**.

**Odpověď (aktivní odměna):**
```json
{
  "status": "issued",
  "code": "HI06EJ6KFUEU",
  "link": "https://onemil.cz/profile?miocoin_code=HI06EJ6KFUEU",
  "coins": 2,
  "external_order_id": "OBJ-123456",
  "customer_email": "zakaznik@email.cz"
}
```
> V JSON odpovědi je aktivní odměna označena jako `"status": "issued"` — znamená to,
> že odměna je **aktivní a připravená k uplatnění** zákazníkem.

**Odpověď (zrušeno):**
```json
{
  "status": "cancelled",
  "code": "HI06EJ6KFUEU",
  "coins": 2,
  "external_order_id": "OBJ-123456"
}
```

---

## 7. Životní cyklus odměny (přehled)
```
Objednávka vytvořena          →  čekající odměna
paid / delivered / completed  →  aktivní odměna
zákazník uplatní kód          →  uplatněno  →  MioCoiny v peněžence
cancelled / returned /
unpaid / not_picked_up        →  zrušená odměna (nelze uplatnit)
```

## 8. MioCoiny dostane zákazník až uplatněním
Zákazník otevře `link` (nebo zadá `code` v OneMilu v sekci Profil), přihlásí se
e-mailem, na který je kód vázán, a kód uplatní. **Teprve uplatněním aktivní odměny**
se MioCoiny připíšou do jeho peněženky. Čekající ani zrušenou odměnu uplatnit nelze.

## 9. Spolehlivost: opakování a idempotence
- **Opakování při výpadku:** když OneMil neodpoví nebo vrátí chybu, **pošlete tutéž
  událost znovu později** se **stejným `external_order_id`**. Doporučeno: fronta událostí
  s odstupem mezi pokusy.
- **Idempotence:** opakovaná událost „objednávka vytvořena" se stejným
  `external_order_id` vrátí **stejný kód** (`"duplicate": true`) — OneMil nikdy
  nevytvoří druhou odměnu pro tutéž objednávku.
- Opakované události změny stavu jsou rovněž bezpečné: pokud už zákazník odměnu uplatnil,
  OneMil odpoví příznakem `"already_redeemed": true` a stav odměny nezmění.

## 10. Co se při vytvoření objednávky NEDĚJE
Při události „objednávka vytvořena" (čekající odměna):
- **nevzniká žádná faktura**,
- **OneMil neposílá žádný e-mail**,
- **negeneruje se žádné PDF**,
- **neprobíhá žádná platba**,
- **nepřipisují se žádné MioCoiny do peněženky**.
Připsání MioCoinů proběhne až uplatněním aktivní odměny zákazníkem. Fakturace za
aktivované MioCoiny probíhá automaticky a souhrnně později.

## 11. Chybové odpovědi
Chyby mají tvar `{ "status": "error", "error": "<kód>" }` s odpovídajícím HTTP kódem.

| HTTP | error | Význam |
|------|-------|--------|
| 401 | `Missing Authorization header` | Chybí hlavička s API klíčem |
| 401 | `Invalid or expired API key` | Neplatný / zneplatněný API klíč |
| 400 | `Missing order_id or external_order_id` | Chybí číslo objednávky |
| 400 | `Invalid order_total_czk` | Chybí/neplatná částka objednávky |
| 400 | `Missing customer_email` | Chybí e-mail zákazníka |
| 400 | `Do not send coins, miocoins, or final reward amount...` | Poslali jste konečný počet odměny |
| 400 | `invalid_partner_conversion_settings` | Partner nemá nastavený přepočet Kč → MioCoin |
| 400 | `reward_amount_too_low` | Z částky vychází méně než 1 MioCoin |
| 400 | `partner_not_approved` | Partnerský účet není schválen |
| 400 | `unsupported_order_status` | Neznámý stav objednávky |

**Příklad chyby:**
```json
{ "status": "error", "error": "Invalid or expired API key" }
```

> Při chybě 401 / `invalid...` ověřte API klíč. Při dočasné chybě (5xx, timeout)
> událost **zopakujte později** se stejným `external_order_id`.

---

## Co je třeba doplnit před zveřejněním tohoto průvodce partnerům
1. **Produkční rollout PR #114** (merge + migrace + deploy `partner-activate`) — vyžaduje
   výslovné písemné schválení.
2. **Nahradit živou hodnotu** `settings.partner_api_documentation` tímto textem (přes
   admin editor) — až po rolloutu. Současná živá hodnota popisuje starý endpoint.
3. **Doplnit reálný základ URL** za `<onemil-api>`
   (`https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/partner-activate`, případně
   přátelštější doména).
4. **Potvrdit přepočet** (`reward_base_czk` / `reward_mc`) u každého reálného partnera.

## Podpora
📧 podpora@onemil.cz
