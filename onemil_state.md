# OneMil – aktuální stav projektu

> **Autoritativní aktuální stav. Aktualizováno 16. 8. 2026.**

## 0. Automatické uplatnění MioCoinů z e-mailu + Historie MioCoinů — HOTOVO NA VĚTVI, **NENASAZENO** (18. 8. 2026)

Větev `codex/miocoin-profile-wallet-history`, odvozená z aktuálního `origin/main`, připravuje související úpravu zákaznického profilu. **Není mergnutá, není publikovaná, žádná migrace ani Edge Function nebyla aplikována a produkční data, peněženky, MioCoin zůstatky i existující odměny zůstaly nedotčené.**

- E-mailový odkaz s existujícím parametrem `?miocoin_code=…` nyní na `/profile` automaticky zavolá výhradně kanonické `redeem_miocoin_code`. URL se po dokončeném pokusu vyčistí, takže refresh nevyvolá další klientský pokus; databázový `FOR UPDATE` + přechod kódu na `activated` zůstávají autoritou proti dvojímu připsání. Ruční formulář pro vložení kódu zůstává zachovaný.
- Neověřený zákazník se vrátí přes existující bezpečný `redirect` po přihlášení na stejnou URL profilu; stejný redirect se nyní předá také z přihlášení do registrace. E-mailová registrace jej předá autentizační vrstvě jako bezpečné `emailRedirectTo` pro případ povinného potvrzení e-mailu a po okamžité registraci naviguje na stejný cíl. OAuth už ho předával.
- „Historie převodů“ v peněžence je nahrazena „Historií MioCoinů“. Připravena je pouze **neaplikovaná** migrace `20260818120000_customer_miocoin_history.sql`: přidává read-only RPC `get_my_miocoin_history(integer)` bez parametru uživatele. Čte skutečný ledger `wallet_transactions`, doplňuje partnerský název/web/objednávku pouze z `partner_coin_activations` + `partner_reward_codes` + `partners` a přidává existující `bonus_transfer_history`. Každý zdroj filtruje `auth.uid()`; zákazník tak nemůže načíst cizí historii.
- Historie rozlišuje existující příchozí a odchozí typy (partnerské připsání, dobíjení, bonus, převod bonusu, soutěž, benefit, voucher, refundace a ruční úprava) pomocí zeleného `+` / červeného `−`; zobrazení používá sdílený formát MioCoinů s jedním desetinným místem.
- Regresní spec `136-miocoin-profile-wallet-history.spec.ts`: **9 passed**. `npm run build`: exit 0. `npx tsc -p tsconfig.app.json --noEmit` končí na **17 předexistujících chybách** v 11 nedotčených souborech; tato změna opravila dřívější nesoulad mezi čtyřargumentovým voláním `signUp` a jeho tříargumentovým typem. Žádná chyba není v nových souborech nebo v nově změněných řádcích.

---

## 0a. MioCoin — pravidlo 1 desetinného místa — STAGING OVĚŘENO, **PRODUKCE NENASAZENA** (18. 8. 2026)

Partner vereonika sro má konverzi `100 Kč = 3,7 MC`. Košík 660 Kč vychází na `24,42 MC`, ale
widget zákazníkovi ukazoval **24** — engine počítal správně a pak výsledek uřízl `floor()` na
celé číslo. Stejná chyba dělala z produktové odměny pod 1 MC nulu a badge úplně skryla.

Nově se zaokrouhluje **jednou, na 1 desetinné místo, až na součtu celé objednávky**:
`24,42 → 24,4`. Minimální vydatelná odměna je **0,5 MC**; pod ní se kód nevydá.

- Nové: 4 migrace (`20260818100000`–`20260818100300`), `src/lib/miocoin.ts`,
  spec `tests/e2e/130-miocoin-one-decimal.spec.ts` (51 testů).
  Upraveno: `compute_partner_reward`, `create_partner_order_reward`,
  `generate_partner_reward_code`, `update_partner_order_reward_status`,
  `partner-reward-preview`, `shoptet-widget.js`, `PartnerDashboard`, `AdminInvoices`,
  `AdminPartnersPortal`, `RedeemMioCoinCard`, invoice PDF, ISDOC, spec 125.
- **Coin sloupce `integer` → `numeric`** (+ CHECK na 1 desetinné místo):
  `partner_reward_codes.coins`, `partner_coin_activations.coins`,
  `partner_invoice_lines.coins`, `partner_invoices.coins_activated`.
- **Dropnut druhý reward engine** `activate_partner_coins_from_order` + wrapper
  `api_activate_partner_coins` (vlastní výpočet odměny, EXECUTE pro anon/authenticated/PUBLIC,
  0 řádků kdy vyprodukoval). Guard v migraci to odmítne provést, kdyby se objevil volající.
- **Nezměněno:** 1 MC = 1 Kč, `reward_mode` logika, Shoptet CSV parser, minutový import,
  idempotence, wallet balances, už vydané kódy. **Žádný UPDATE ani backfill.**

**Reálné staging ověření** (throwaway partner `100 Kč = 3,7 MC`, vše uklizeno):

| případ | očekáváno | výsledek |
|---|---|---|
| 660 Kč, whole_shop | 24,4 | **24,4** (raw 24,42) |
| 350 Kč, whole_shop | 13,0 | **13** (raw 12,95) |
| 10 Kč → 0,4 MC | nevydat | `issuable=false`, issuance `reward_amount_too_low` |
| selected_products, 3× SKU @1,3 | 3,9 | **3,9** |
| whole_shop_with_exceptions | 1,3 + 7,4 | **8,7** |
| sleva: 2× @75 Kč ratio 3,7/100 | 5,6 | **5,6** (raw 5,55) |
| preview vs. vydání (stejný košík) | shodné | **3,9 = 3,9** |
| aktivace → peněženka | 24,4 | wallet 24,40, tx 24,4, aktivace 24,4 |
| fakturace | 24,4 MC | net 24,40 Kč, DPH 5,12, gross 29,52 |
| `1,25` / `0,4` ručně | odmítnout | **odmítnuto** (CHECK i RPC) |
| existující integer kódy | beze změny | 3 / 5 / 6 / 11 nedotčeny |
| BOHEMIA 660 Kč @1 MC | 6,6 | **6,6** (dřív 6 — to je ta oprava) |

E-maily: **0**. Peněženka nezměněna (redemption testován v rollback transakci).
Testy: spec 130 **51 passed**, spec 125 **7 passed**, specy 123–129/132–134 **94 passed**
bez regrese. `npm run build` exit 0. `npx tsc -p tsconfig.app.json --noEmit` = **18 chyb =
nezměněná baseline**, žádná v dotčených souborech.

**⚠️ Mimo rozsah:** Stripe top-up / refundace / referral odměna
(`payments.amount` → `wallets.balance_coins`) je samostatná odměnová cesta a **nebyla měněna**.
`payments.amount` je dnes vždy celé číslo (`stripe-webhook` odmítne jinou než celou CZK částku).
Na staré větvi `claude/miocoin-decimal-unify` k tomu existuje připravená migrace
(`payment_credit_miocoin_one_decimal`) — **záměrně nepřevzata**, patří do samostatného rozhodnutí.

## 0a0. Shoptet delta import (`updateTimeFrom`) + cron 15 min → 1 min — STAGING OVĚŘENO, **PRODUKCE NENASAZENA** (17. 8. 2026)

Import běžel každých 15 minut, protože každý běh stahoval **celý** exportní soubor partnera.
Nově se posílá Shoptet parametr `updateTimeFrom`, takže se stahují jen objednávky vytvořené
nebo změněné od posledního bezpečně dokončeného importu → běh je malý → cron může jet 1×/min.

Shoptet to sám dokumentuje jako povinnou cestu:
*„Pokud stahujete objednávky více než jednou za 15 minut, lze využít pouze tento způsob
stažení objednávek."* ([podpora.shoptet.cz/export-objednavek](https://podpora.shoptet.cz/export-objednavek/))

- Nové: `supabase/functions/import-shoptet-orders/delta.ts`,
  migrace `20260817120000_shoptet_auto_import_1min.sql`,
  spec `tests/e2e/135-shoptet-delta-import.spec.ts` (14 testů).
  Upraveno pouze: `supabase/functions/import-shoptet-orders/index.ts`.
- **Nezměněno:** parser (`csv.ts`), výpočet MioCoinů, reward engine,
  `run_shoptet_cron_imports()` včetně overlap guardu, partner nastavení, Vault flow.

**Závazná pravidla (neměnit):**
- Watermark = `started_at` posledního běhu s `mode='live'` **a** `status='ok'`.
  Nikdy `finished_at` (objednávka změněná během běhu by vypadla) a nikdy `partial`/`failed`/`dry_run`.
- Bezpečnostní překryv **15 minut** (`DELTA_OVERLAP_MINUTES`) — musí zůstat výrazně větší než perioda cronu.
- `updateTimeFrom` se posílá v **UTC**. Shoptet timezone nedokumentuje; při čtení jako
  lokální čas se okno posune do minulosti (načte se něco navíc = neškodné, idempotentní).
  Lokální čas by se při čtení jako UTC posunul do **budoucnosti** a objednávky by se ztratily.
- Parametr se lepí **řetězcově**, ne přes `URLSearchParams` — round-trip by přepsal `+`/`=`
  v `hash` permanentního odkazu.
- Partner **bez** úspěšného live běhu → parametr se neposílá → plný export (jako dosud).
- `dry_run` stahuje vždy plný export (admin kontroluje konfiguraci, ne posledních pár minut).

**Reálné staging ověření** (throwaway partner + řízený mock export, vše uklizeno):

| běh | `updateTimeFrom` | řádků z exportu | vytvořeno | duplicit | status update |
|---|---|---|---|---|---|
| 1 (bez historie) | *neposláno* | 2 | 2 | 0 | 2 |
| 2 (beze změn) | `21:06:52` = běh 1 − 15 min | **0** | 0 | 0 | 0 |
| 3 (1 změněná objednávka) | `21:07:28` = běh 2 − 15 min | **1** | **0** | **1** | **1** |

`hash=aB+cD...` dorazil neporušený. E-maily zákazníkům: **0**. Kódy: 2 = 2 unikátní objednávky.

**⚠️ Nelze ověřit na stagingu:** staging BOHEMIA export vrací **HTTP 404 od 23. 7. 2026**
(2397 po sobě jdoucích `failed` běhů, pre-existující problém — viz issue o 404 exportu).
Vereonika sro na stagingu neexistuje. Skutečnou serverovou interpretaci `updateTimeFrom`
(zejména timezone) proto **potvrdí až první běh proti živému Shoptet exportu**.

## 0a00. Změna Shoptet exportního odkazu — STAGING OVĚŘENO, **PRODUKCE NENASAZENA** (18. 8. 2026)

Partner s aktivním napojením může v `/partner/dashboard` poslat nový permanentní CSV odkaz
ke schválení. Do schválení běží napojení dál ze starého odkazu. Motivace: issue #352 —
po opravě exportní šablony partner potřebuje předat nový odkaz a dosud na to nebyla cesta.

- Nové: migrace `20260818090000_shoptet_export_url_change_requests.sql`
  (sloupec `request_kind`, rozdělení unikátních indexů), spec
  `tests/e2e/134-shoptet-export-url-change.spec.ts`.
  Upraveno: `submit-shoptet-connection`, `approve-shoptet-connection`,
  `src/pages/PartnerDashboard.tsx`, `src/pages/AdminPartners.tsx`,
  `src/integrations/supabase/types.ts`.
- **Žádná nová Vault RPC** — stávající trojice pokrývá i změnu.
- **Aplikováno POUZE na staging `dxmowysntemfqfnanxua`** (migrace + obě EF).
  **Produkce `xkzhjldrojjlrkezorey` NEDOTČENA.**

**Ověřeno reálným E2E na stagingu** (throwaway partner s živým Vault klíčem, vše uklizeno):

| krok | výsledek |
|---|---|
| partner podá změnu | `submitted`, nový odkaz jen v pending Vault klíči |
| během čekání | živý odkaz = **starý**, `import_enabled=true`, napojení `active` |
| druhá žádost | **409 `change_already_pending`**, ve Vaultu nic nezůstalo |
| admin schválí | živý odkaz = **nový**, pending klíč smazán |
| po schválení | `reward_trigger_status` zůstal `shipped`, delivery `onemil`, konverze i `reward_mode` beze změny |
| admin zamítne další změnu | živý odkaz **nezměněn**, pending smazán, partner beze změny |
| první onboarding (regrese) | funguje: `import_enabled=true`, delivery `onemil`, trigger z žádosti |
| `url_change` bez aktivního napojení | odmítnuto (`no_active_connection`) |
| únik URL do tabulky | **0** |

**Nález opravený mimochodem:** `admin.rpc(...).catch(...)` v obou EF shazoval handler na holé
500 (`PostgrestBuilder` nemá `.catch`). Byla to latentní chyba už v původním kódu — cleanup
větev se do teď nikdy nespustila. Přepsáno na `try/catch`.

**Provozní poznámka:** schvalování Shoptet žádostí je **superadmin-only** (admin dostane 403).

Testy: 92 passed (specy 124–129, 132–134). `npm run build` exit 0.
`npx tsc -p tsconfig.app.json --noEmit` = **18 chyb = nezměněná baseline**, žádná v dotčených
souborech.

---

## 0a0. Partnerské návody — HOTOVO NA VĚTVI, **NENASAZENO** (17. 8. 2026)

Partnerský portál má novou sekci **„Návody“** (`/partner/navody`) a v ní první návod
**„Jak propojit Shoptet s OneMil“** — 6 kroků, každý jako samostatná karta s číslem, krátkým
textem a screenshotem pod příslušnou částí. Obrázky jdou po kliknutí zvětšit. Na stránce je
tlačítko **„Stáhnout PDF návod“**.

- Nové: `src/content/partnerGuides/shoptetGuide.ts` (jediný zdroj obsahu),
  `src/pages/PartnerGuides.tsx`, `scripts/build-partner-guide-pdf.mjs`,
  `public/navody/shoptet/*.png` (11 snímků), `public/navody/OneMil-navod-Shoptet.pdf`,
  spec `tests/e2e/133-partner-guides-shoptet.spec.ts`. Upraveno: `src/App.tsx` (route + položka
  „Návody“ v partnerské hlavičce), `package.json` (`build:partner-guide-pdf`).
- **Web i PDF renderuje tentýž obsahový modul**, takže se nemohou rozejít; spec 133m navíc
  selže, když je PDF starší než obsah.
- Podklady pocházejí z balíčku `OneMil_Shoptet_navod_balicek.zip`. Screenshoty jsou použité
  tak, jak byly dodané — **už anonymizované** (rozmazaný permanentní odkaz exportu, rozmazaný
  widget snippet s partner UUID, skrytý název e-shopu). Ověřeno vizuálně u všech 11 snímků
  a strojově (PDF i PNG) — jediný nález byl interní název XObjectu v PDF, ne citlivý údaj.
- **Pořadí kroků v balíčku neodpovídalo zadání** (slučovalo zkopírování odkazu s odesláním
  do OneMilu a mělo vlastní krok 6). Web i nově generované PDF drží **zadané pořadí**:
  1) přístup k exportu → 2) export objednávek → 3) permanentní odkaz → 4) odeslání v OneMilu
  → 5) čekání na schválení → 6) zapnutí zobrazení MioCoinů + tři ukázky pro zákazníka.
- **Bez DB migrace, bez Edge Function, bez SQL.** Shoptet import, výpočet MioCoinů, widget,
  schvalování ani platby se nezměnily. Zákaznická a admin navigace nedotčeny.

Ověřeno v prohlížeči proti stagingu (dočasný partner + přihlášení, obojí smazáno): položka
„Návody“ v partnerské hlavičce, stránka se 6 kroky ve správném pořadí, všech 12 obrázků
načtených, zvětšení po kliknutí, PDF se servíruje jako `application/pdf` (`%PDF-`, 1 027 011 B),
mobil 375 px **bez horizontálního přetečení**. PDF zkontrolováno stránku po stránce v renderu.

Testy: 22 passed (specy 132 + 133) na čisté větvi z `main`. `npm run build` exit 0, assety jsou
v `dist/navody/`. `npx tsc -p tsconfig.app.json --noEmit` = **18 chyb = nezměněná baseline**,
žádná v dotčených souborech. **Nasazeno nikam — do produkce až Lovable Publishem.**

---

## 0a1. Snippet widgetu v partnerském dashboardu — HOTOVO NA VĚTVI, **NENASAZENO** (17. 8. 2026)

Partner se schváleným Shoptet napojením vidí v `/partner/dashboard` sekci **„Zobrazení MioCoinů
v e-shopu“**: instrukci (Vzhled a obsah → Editor HTML kódu), hotový `<script>` tag s vlastním
`partners.id`, tlačítko „Kopírovat kód“ a informaci, že se údaje zobrazí podle aktuálního
nastavení v OneMil. **Partner si své partner ID nikde nedohledává.**

- Nové: `src/lib/shoptetWidgetSnippet.ts` (`buildShoptetWidgetSnippet`, `getShoptetWidgetSrc`),
  sekce v `src/pages/PartnerDashboard.tsx`, spec `tests/e2e/132-partner-shoptet-widget-snippet.spec.ts`.
- `src/lib/publicAppUrl.ts`: `import.meta.env?.` (optional chaining) — modul je tím importovatelný
  i v Playwright runneru; chování ve Vite beze změny.
- **Bez DB migrace, bez Edge Function, bez SQL.** Odměny, widget, platby ani Shoptet import
  nezměněny. Druhé ruční schválení Shoptet napojení adminem zůstává; dashboard stav jen čte.

**Ověřeno v prohlížeči proti stagingu** (dočasný partner + přihlášení, obojí smazáno):
sekce se vykreslila, snippet obsahoval skutečné `partners.id` a **`https://onemil.cz`** i při
`VITE_APP_URL=http://localhost:5173`; tlačítko zkopírovalo přesně zobrazený kód
(„Kód byl zkopírován do schránky“); po přepnutí napojení na `submitted` sekce **zmizela**.
Zápis do schránky v automatizovaném prohlížeči blokuje oprávnění (`NotAllowedError`) — proto byl
úspěšný průchod ověřen se stubnutým `writeText`; chybová větev zobrazuje českou hlášku.

Testy: 136 passed (specy 124–132). `npm run build` exit 0.
`npx tsc -p tsconfig.app.json --noEmit` = **18 chyb = nezměněná baseline**, žádná v dotčených
souborech. **Nasazeno nikam — do produkce až Lovable Publishem.**

---

---

> Historický vývoj je v `onemil_history.md` a v Git historii. Pokud starší dokumentace odporuje tomuto souboru, pro současný provoz platí tento soubor a skutečný stav ověřený v GitHubu/Supabase.

## 0a. Partnerské produktové MioCoin odměny + Shoptet widget — HOTOVO A ŽIVĚ OVĚŘENO (16. 8. 2026)

**Celá funkce je dokončená a běží v produkci.** Backend je LIVE na `xkzhjldrojjlrkezorey`
(výslovné schválení Pavla), staging `dxmowysntemfqfnanxua` má totéž, a **Lovable Publish už
proběhl — frontend i widget jsou nasazené a na reálném Shoptetu funkční.**

Ověřeno 16. 8. 2026 přímo proti produkci: `https://onemil.cz/shoptet-widget.js` vrací 200 a je
**byte-identický s `main` (`f31d3937`)** (až na CRLF) — obsahuje finální text „Dárek od nás“,
outline ikonu dárku i logiku produktových karet; `https://onemil.cz/miocoin-icon.png` vrací 200
(5 725 B). Chování ověřeno na živém Shoptetu `809915.myshoptet.com`, desktop i mobil.

**Produkční main: `f31d3937`.**

### Co widget zobrazuje (vše ověřeno na reálném e-shopu)

1. **Produktové karty** ve výpisu kategorie / homepage — odměna je vidět **před rozkliknutím**.
2. **Detail produktu** — badge u názvu produktu.
3. **Košík a checkout** — informace o odměně za nákup.

### Finální vzhled v košíku/checkoutu (neměnit bez nového schválení)

```
[outline ikona dárku]  Dárek od nás: [MioCoin ikona] X MioCoinů do soutěží OneMil
```

- Jednoduchá **outline** ikona dárku (inline SVG, `fill="none"`, tenký tmavý tah, 26 px).
  Nekopíruje žádný Shoptet asset; inline SVG šetří request i druhý publikovaný soubor.
- **Originální** MioCoin ikona `public/miocoin-icon.png` (17 px) těsně před částkou.
  Nevytvářet nové MioCoin logo ani symbol.
- Zvýrazněný je **pouze počet MioCoinů** (`#BD6400`), tělo textu je tmavé (`#2E2E2E`).
- **Žádný box, rámeček ani gradient**, průhledné pozadí — žádný zásah do grafiky e-shopu.
- Umístění: **pod souhrnem ceny, nad tlačítkem POKRAČOVAT**.
- **Widget nikdy nesmí být uvnitř CTA** (`button`, `a`, `[role=button]`, `.btn`,
  `.next-step-forward`, `.next-step-back`). Hlídá spec 129 plus runtime guard v `render()`,
  který uzel odstraní, kdyby ho neznámá šablona přesto dostala dovnitř tlačítka.

### Klíčové widget commity

| commit | co přinesl |
|---|---|
| `cc44b02f` | MioCoin ikona + odměny na produktových kartách |
| `9ab78321` | checkout widget přesunut **mimo** CTA (dřív se vykresloval uvnitř tlačítka POKRAČOVAT) |
| `f31d3937` | finální vzhled „Dárek od nás“ |

### Produkční nasazení (16. 8. 2026)

**Migrace (v tomto pořadí):** `20260816100000` → `20260816110000` → `20260816120000`.
**Edge Functions:** `partner-reward-preview` (nová, `verify_jwt=false`), `import-shoptet-orders`,
`partner-activate`.

**Baseline před zásahem a po úklidu je identický:** 13 reward codes / 181 coins /
checksum `d0d4d588857649f771c203dd21069101`; wallets `138474.41`; 4 aktivace; 138 plateb.
Ověřovací data (throwaway partner) byla po testech odstraněna, žádné reziduum.

**Parita engine vs. původní vzorec ověřena na všech 8 reálných partnerech** (včetně BOHEMIA 100/5
a partnera s 99/10, i na necelé částce 317,50 Kč) — `floor(total/base*mc)` == engine, beze změny.

**Nález při dry-runu BOHEMIA (zlepšení, ne regrese):** reálný export BOHEMIA má 15 CSV řádků, ale
jen **5 objednávek** (DEMO000001–05, 3 položky na objednávku) — export je tedy už teď položkový.
Původní kód považoval každý řádek za samostatnou objednávku a volal RPC 15×; zachránil ho jen
idempotenční guard. Nový kód správně seskupí na 5. Výsledek obou běhů shodný: 0 created, 0 failed.

**Živý cron ověřen po nasazení:** běh 16. 8. 2026 09:15 UTC (job 26, `*/15 * * * *`) —
`trigger=cron, mode=live, status=ok`, 15 řádků → **5 objednávek**, 0 invalid, 0 created,
5 status_updated, 0 failed. Automatická produkční cesta funguje s novým importérem.
Baseline po tomto běhu stále 13 / 181 / `d0d4d588857649f771c203dd21069101`.

Cíl: partner může měnit globální konverzi za provozu, odměňovat celý e-shop / jen vybrané produkty /
celý e-shop s výjimkami, a zákazník vidí v Shoptetu (produkt + povinně košík) přesně tolik MioCoinů,
kolik mu OneMil po objednávce skutečně vydá.

### Checklist fází

- [x] **datový model** — `20260816100000_partner_product_reward_rules.sql`
- [x] **shared reward engine** — `20260816110000_compute_partner_reward_engine.sql`
- [x] **create_partner_order_reward integration** — `20260816120000_create_partner_order_reward_items.sql`
- [x] **Shoptet item CSV parser** — `import-shoptet-orders/csv.ts` + spec 124 (9 zelených)
- [x] **partner product UI** — režim + pravidla v `PartnerDashboard` (rozšíření stávající sekce konverze)
- [x] **Partner Order API items** — `partner-activate` přijímá volitelné `items[]`
- [x] **widget preview endpoint** — EF `partner-reward-preview` (produkce i staging ACTIVE, verify_jwt=false)
- [x] **Shoptet widget snippet** — `public/shoptet-widget.js` (badge u produktu + povinný košík)
- [x] **E2E** — specy 123–129, 51 zelených
- [x] **production validation** — 3 migrace + 3 Edge Functions nasazeny a ověřeny na produkci (16. 8. 2026, schválení Pavla)
- [x] **frontend Lovable Publish** — proběhl; produkce servíruje widget shodný s `f31d3937`
- [x] **widget na produktových kartách / detailu / v košíku** — ověřeno na `809915.myshoptet.com`

**Funkce je uzavřená.** Otevřený zůstává jen jeden nález — viz „Otevřený problém: idempotence“ níže.

### KRITICKÝ INVARIANT (neměnit)

Existuje **jediný** výpočet odměny: `public.compute_partner_reward(uuid, numeric, jsonb)`.
Volají ho `create_partner_order_reward` (skutečné vydání MC) i widget preview endpoint
`partner-reward-preview` (zobrazení zákazníkovi). **Widget nesmí počítat MioCoiny sám** a nikde
nesmí vzniknout druhý výpočet — ani v TypeScriptu, ani ve widget JS, ani v jiné RPC. Jinak se to,
co zákazník vidí v košíku, rozejde s tím, co skutečně dostane. Widget smí pouze sestavit vstup
(SKU, množství, cena po slevě, `order_total_czk`) a zobrazit vrácené číslo.

### ⚠️ OTEVŘENÝ PROBLÉM: idempotence je vázaná na partnera, ne na e-shop (nález 16. 8. 2026)

**Nic z toho zatím není opravené — jde o zaznamenaný požadavek, ne o provedenou změnu.**

Ochrana proti duplicitě objednávky dnes používá dvojici **`partner_id + external_order_id`**
(unikátní index `idx_partner_reward_codes_order_api_idempotency` + advisory lock v
`create_partner_order_reward`).

**Co se stalo:** nový Shoptet e-shop **téhož partnera** začal číslovat objednávky od začátku a
znovu použil číslo `2026000001`. OneMil ji podle dvojice `partner_id + external_order_id`
vyhodnotil jako **už existující objednávku**, vrátil `duplicate: true` a **novou MioCoin odměnu
nevytvořil**.

**Potvrzený produktový požadavek:** jedna partnerská firma může provozovat a připojit **více
samostatných e-shopů**. Čísla objednávek jsou proto unikátní jen v rámci jednoho e-shopu, ne
v rámci firmy.

**Cílový datový model** musí rozlišovat tři úrovně:

```
partner / firma  →  konkrétní e-shopové napojení  →  objednávka
```

Idempotence má být svázaná s **konkrétním e-shopovým napojením + `external_order_id`**, nikoli
s `partner_id + external_order_id`.

**Dotčená místa, až se to bude řešit** (dnes nezměněná): unikátní index na
`partner_reward_codes`, advisory lock a duplicate-check v `create_partner_order_reward`,
`shoptet_connection_requests` (dnes 1 napojení na partnera), `import-shoptet-orders`
(dispatch podle `partner_id`), `partner_seen_products` a `partner_product_reward_rules`
(dnes klíčované jen `partner_id`).

Změna se dotkne financí a existujících odměn, takže vyžaduje samostatný návrh, migraci
a výslovné schválení Pavla. **Neopravovat mimochodem.**

### Potvrzená pravidla zakódovaná v engine

- Množství násobí odměnu (SKU = 10 MC, 2 ks → 20 MC).
- Poměrová odměna používá **skutečnou cenu po slevě** (`unit_price_czk` z importu).
- **Zaokrouhlení právě jednou** na součtu celé objednávky, nikdy po položkách.
  Ověřeno: 3× 33 Kč při 100/5 → raw 4,95 → **4 MC** (po položkách by vyšlo 3).
- Párování produktu **výhradně podle kódu/SKU**, case-insensitive + trim; název je jen zobrazovací.
- `whole_shop` ignoruje položky úplně → bit-for-bit původní chování.
- `selected_products` **bez položek odmítne** (`items_required_for_reward_mode`) — tichý fallback na
  celou objednávku by vyplatil pravý opak toho, co partner nastavil.
- `whole_shop_with_exceptions` bez položek bezpečně degraduje na globální sazbu z ceny objednávky.

### Ověření kritického invariantu (16. 8. 2026, staging, uklizeno)

Skutečný end-to-end důkaz, že widget neklame zákazníka — stejný košík poslán do
veřejného preview endpointu i do reálné vydávací cesty:

| krok | widget preview | skutečně vydáno |
|---|---|---|
| ABC123 ×2 (pravidlo 10 MC) + XYZ999 300 Kč (globální 100/5) | **35 MC** | **35 MC** |
| po změně pravidla 10→25 MC a konverze 100/5→100/10 | **80 MC** | **80 MC** |

Starší kód z prvního kroku zůstal na 35 MC se snapshotem `5.0000` — změna nastavení
se zpětně nepromítla.

**Bezpečnost veřejného endpointu ověřena:** GET → 405, neplatné UUID → 400, neznámý
partner → 404, neschválený partner → `enabled:false`. Odpověď neobsahuje export URL,
Vault secret, API klíč ani zákaznická data (leak check prázdný). Endpoint jen čte
(`STABLE`, žádné zápisy, žádné vydávání kódů).

### ⚠️ Nález: `npx tsc --noEmit` je no-op (16. 8. 2026)

Kořenový `tsconfig.json` je solution-style (`"files": []` + `references`), takže
`npx tsc --noEmit` **nekontroluje vůbec nic** — ověřeno tím, že ani
`export const x: number = "není číslo"` v `src/` nevyvolá chybu.

**Správný příkaz je `npx tsc -p tsconfig.app.json --noEmit`.** Ten na `origin/main`
(a54cd022) hlásí **18 předexistujících chyb** (mj. `AddSalesLeadDialog.tsx`,
`LeadCrmPanel.tsx`), které dosud nikdo neviděl. Tato větev přidává **0 nových chyb**
(18 před i po, žádná v dotčených souborech).

Historické zápisy „tsc --noEmit 0 chyb" v dokumentaci jsou proto bezcenné.
Oprava příkazu + 18 chyb je mimo rozsah této větve.

### Staging ověřeno (16. 8. 2026, throwaway partner, uklizeno)

Legacy 5-arg volání RPC dál funguje beze změny (Edge Functions se nemusely měnit); item cesta,
idempotence (`partner_id + external_order_id`, duplicitní volání vrátí stejný kód i coins),
audit snapshot v `metadata` (`reward_mode`, `reward_computed_from`, `reward_items`, `reward_raw_total_mc`),
plnění `partner_seen_products` pro produktový picker.

**Změna konverze za provozu ověřena:** po přepnutí 100/5 → 100/10 a pravidla 10 → 20 MC dostala nová
objednávka 40 MC, zatímco starší kódy zůstaly na 20 a 25 MC s původním snapshotem `5.0000`.
Existující reward codes se **nikdy zpětně nepřepočítávají**.

## 0b. Paperclip marketingový tým OneMil (ověřeno 13. 8. 2026)

Živý Paperclip stav marketingového týmu:

- Hierarchie: Pavel → Provozní ředitel OneMil → Martin – vedoucí marketingu OneMil → Content & Community Planner OneMil / Performance Analyst OneMil.
- **Martin – vedoucí marketingu OneMil** (`be26a7d0-bb12-4720-b535-a1c656f355ae`): `idle`, model `gpt-5.5`, reportsTo Provozní ředitel OneMil, `canCreateAgents=false`, `canCreateSkills=false`, `heartbeat.enabled=false`, budget `0 Kč`. Řídí oba marketingové specialisty a připravuje jeden konsolidovaný marketingový výstup pro Provozního ředitele. OneMil Brand Kit / Brand Manual je závazný zdroj.
- **Content & Community Planner OneMil** (`2c257400-e694-4286-be4a-b015d23221f9`): `idle`, model `gpt-5.5`, reportsTo Martin – vedoucí marketingu OneMil, `canCreateAgents=false`, `canCreateSkills=false`, `heartbeat.enabled=false`, budget `0 Kč`. Připravuje content plány, copy, captiony, CTA, scénáře krátkých videí/Reels/TikTok, kreativní briefy a community návrhy.
- **Performance Analyst OneMil** (`16844c6f-8960-43a8-a71c-f599e33c3ee2`): `idle`, model `gpt-5.5`, reportsTo Martin – vedoucí marketingu OneMil, `canCreateAgents=false`, `canCreateSkills=false`, `heartbeat.enabled=false`, budget `0 Kč`. Řeší KPI, reporting a vyhodnocení výkonu obsahu; dokud nemá skutečná data, nemá zbytečně běhat pravidelně.
- Marketingoví agenti jsou přesně 3, žádná duplicita. Nemají social secrets, publishing práva, ads práva ani možnost utrácet. `ICO-53` už není v permanentních agent instructions; jednorázové úkoly patří do Paperclip issues.
- Magin a Synchronizátor zůstali nedotčeni: jejich modely, permissions, heartbeat, secrets a rutiny nebyly změněny. Žádná nová marketingová rutina nebyla aktivována. Board approval nebyl potřeba, protože nevznikal nový agent.

## 0. Denní e-mailové dávky a propojení pro externího agenta (ověřeno 11. 8. 2026)

Read-only ověřeno přímo na produkci `xkzhjldrojjlrkezorey`:

- **Automatika je zapnutá** (`enabled = true`), pásmo `Europe/Prague`, okno `08:30–16:30`.
- **Denní limit je 90.** Starší dokumentace uvádějící 20 je neplatná; 20 je hodnota stagingu.
- **Worker běží každých 5 minut.** pg_cron job 30 `sales_lead_email_batch_worker_every_5_min`
  (`*/5 * * * *`, aktivní) volá `run_sales_lead_email_batch_worker_cron()`, ta si vezme token a URL
  z Vaultu, ověří, že URL míří na produkční projekt, a zavolá Edge Function
  `process-sales-lead-email-batch` (ACTIVE v10). Za 24 h 288 běhů, všechny `succeeded`.
- **Kapacita okna je těsná.** Worker zpracuje nejvýš jednu položku na běh → v okně 08:30–16:30
  je ~96 slotů. Při cílových 90 e-mailech denně to je ~94 % kapacity, prakticky bez rezervy.
  Sledovat od 17. 8. 2026 (70 e-mailů) výš.
- **Edge Function `sales-lead-daily-batch-agent` je nasazená na produkci** (v1 ACTIVE,
  `verify_jwt=false`, autorizace vlastním secretem `SALES_LEAD_BATCH_AGENT_SECRET`).
  Produkční secret je jiná hodnota než stagingový.
- RPC `sales_lead_email_batch_agent_run(date, integer)`: `SECURITY DEFINER`, `search_path = ''`,
  EXECUTE **pouze `service_role`** (`anon = false`, `authenticated = false`).
- **Bezpečnostní kontroly na produkci prošly** (bez vytvoření dávky): bez secretu → 401,
  špatný secret → 401, GET → 405, nepovolené pole `lead_group` → 400 `unexpected_field`,
  neplatné datum → 400 `invalid_target_date`.
- Po nasazení **nevznikla žádná nová dávka, neodešel žádný e-mail** a pozastavená dávka z 6. 8.
  zůstala pozastavená. Checksum stavů dávek byl před i po nasazení `b42bb7f7…`.
- **Agent Magin je vytvořený a naplánovaný** (Paperclip 2026.722.0, firma `iCONIC POINT s.r.o.`).
  Agent id `3ef09c71-d9a0-43f3-8ce8-c5e9938dae64`, adaptér `codex_local`, search OFF,
  `canCreateAgents=false`, `canCreateSkills=false`, `budgetMonthlyCents=0` (firemní výchozí),
  nadřízený `Provozní ředitel OneMil`. Routine `Denní dávka prvních obchodních e-mailů`
  (`a3ac40b2-7d58-4207-9c5d-1ffc52ee8c8c`, `active`, `catchUpPolicy=skip_missed`,
  `concurrencyPolicy=skip_if_active`) s cron triggerem `30 7 * * 1-5`, `timezone=Europe/Prague`.
  **První ostrý běh 12. 8. 2026 v 7:30 Praha** (`nextRunAt = 2026-08-12T05:30:00Z`), počet 40.
- **Credential je hotový.** `SALES_LEAD_BATCH_AGENT_SECRET` je bezpečně uložený v Paperclip
  credential store (`local_encrypted`, `paperclip_managed`, stav `active`) a **stejná nová hodnota
  je nastavená v produkčním Supabase**. Hodnota vznikla jen v paměti a **není nikde zveřejněná ani
  uložená** — v dokumentaci, gitu, promptu, instrukcích agenta, issue ani logu; Paperclip API ji
  nevrací. Shodu obou uložených hodnot **definitivně potvrdí až první ostrý běh 12. 8. 2026**,
  protože každé úspěšné volání funkce zakládá dávku, a proto se novou hodnotou vědomě nevolalo.
- **Paperclip nepodporuje vlastní profilový obrázek agenta.** Pole `icon` je pevný výčet 41
  vestavěných ikon; `iconAssetId` ani `avatarAssetId` neexistuje (nahrávání obrázků je jen pro
  logo firmy). Magin má proto vestavěnou ikonu `mail` a schválená postavička je uložená jako
  cesta v jeho `metadata.approvedAvatarPath`.
- Schválený profilový obrázek Magina je na cestě
  `C:\Users\divis\Downloads\ChatGPT Image 11. 8. 2026 11_37_39.png` (3D postavička s headsetem).
  **Obrázek MioCoinu se pro Magina nesmí použít**, ani když se automaticky přiloží do konverzace.

## 0c. Paperclip — finální ověřený stav k 11. 8. 2026

Zdroj pravdy pro Paperclip je `PAPERCLIP_SETUP_CONTEXT.md`; tohle je jen shrnutí.

- **Synchronizátor Paperclip OneMil je funkční end-to-end.** Ingest vrátil **HTTP 200**, úkol
  `ICO-41` skončil `done` a ve stagingu vznikl snapshot
  **`7be66d9c-e984-42d3-9d1e-1e5e4001260a`** (`captured_at 17:26:45`, 43 kB).
- **API Access na `PAPERCLIP_BRIDGE_SECRET` funguje** — načtení přes run-bound agent JWT je
  doložené v access-events.
- **Synchronizátor odesílá přes Node fetch, nikdy PowerShell ani `curl.exe`.** Ve Windows sandboxu
  oba selhávají (`curl` vrací `000`, PowerShell hlásí „Nadřízené připojení bylo uzavřeno"),
  přestože síť funguje.
- **Payload kontrakt je `snake_case`** — `source_instance`, **`captured_at`**, `payload`.
  `capturedAt` v camelCase vrací `HTTP 400`.
- **Magin má funkční API Access na `SALES_LEAD_BATCH_AGENT_SECRET`**
  (`access.SALES_LEAD_BATCH_AGENT_SECRET` vázaný na jeho agent id).
- **Magin má funkční API Access na STAGING lead-supply adapter**
  (`access.SALES_LEAD_MAGIN_SUPPLY_AGENT_SECRET` vázaný na jeho agent id). Hodnota secretu není
  v dokumentaci, gitu, promptu, issue ani logu.
- **Maginova rutina používá Node fetch a přesný kontrakt** `sales-lead-daily-batch-agent`:
  `{"schema_version":1,"target_date":"YYYY-MM-DD","requested_count":<počet>}` — jakýkoli klíč navíc
  vrací `400 unexpected_field`; `target_date` je pražské datum.
- **Magin před denní dávkou zajišťuje i zásobu leadů**, ale pouze přes existující OneMil lead-supply
  adapter a existující OneMil discovery systém. Schvaluje jen backendově ověřené návrhy `navrzeny`,
  které adapter dovolí schválit; pokud zásoba nestačí a neběží aktivní discovery job, spustí přes
  adapter discovery job. Segment je pevně `e-shopy` a Magin ho nesmí měnit.
- **Magin je připravený na první ostrý běh 12. 8. 2026 v 7:30 Europe/Prague** (40 e-mailů).
  Skutečným během ověřen **není** a nemůže být — každé úspěšné volání zakládá reálnou dávku.
- **Průzkumník obchodních leadů OneMil byl z Paperclipu odstraněn** 11. 8. 2026. Jeho zastaralý
  paralelní lead-research úkol `ICO-17` byl zrušen/skryt a pending potvrzení odmítnuta.
- **Provozní ředitel OneMil má funkční nouzové upozornění přes Telegram bota `@OneMilDirectorBot`.**
  Používá ho pouze pro chyby, blokace a důležité eskalace podřízených agentů; neposílá běžné statusy,
  marketing ani zprávy leadům. Bot token a `chat_id` jsou uložené pouze v Paperclip `local_encrypted`
  secrets a oba mají **API Access → Bound to latest** pouze pro Provozního ředitele. Testovací zpráva
  byla úspěšně doručena.

## 1. Obchod / Leady – první automatické e-maily jsou produkčně funkční

Automatické dávkové odesílání prvního obchodního e-mailu je na produkci **hotové a ověřené end-to-end**.

Aktuální produkční stav `xkzhjldrojjlrkezorey`:
- `sales_lead_email_automation_settings.enabled = true`.
- Časové pásmo `Europe/Prague`.
- Odesílací okno `08:30–16:30`.
- Automatické/dávkové první e-maily mají globální limit **20 `batch_initial` za den**.
- Ruční první e-maily (`manual_initial`) jsou **bez tohoto limitu** a nesnižují automatickou kapacitu 20.
- Worker cron je aktivní a zpracovává naplánované dávky po jednotlivých položkách.
- Produkčně jsou evidovány úspěšné `batch_initial` deliveries ve stavu `committed`; skutečný test z 9. 8. 2026 proběhl úspěšně.

### Potvrzený produkční E2E test 9. 8. 2026

Dávka `31251e38-e770-455e-aa49-769f614ed7d6` byla naplánovaná pro `eshop@onemil.cz` na 14:54 Praha. Worker ji zpracoval při nejbližším běhu v 14:55.

Výsledek:
- batch `completed`,
- item `sent`,
- `attempt_count = 1`,
- delivery `batch_initial / committed`,
- provider zprávu přijal,
- `provider_accepted_at` i `committed_at` jsou zapsané,
- žádný duplicitní pokus.

Tím je reálně potvrzen celý tok: **příprava → ruční aktivace dávky → cron worker → provider → commit → dokončená dávka**.

## 2. Příprava a aktivace dávky

Aktuální pravidlo:

1. Admin vybere leady, šablonu a datum.
2. `sales_lead_email_batch_prepare_paused(...)` **vždy připraví novou dávku jako `paused`**, a to i když je globální automatika zapnutá.
3. Samotná příprava nikdy nesmí odeslat e-mail.
4. Dávka začne být způsobilá pro worker teprve po výslovném kliknutí **„Spustit dávku“**.
5. Aktivace používá admin RPC `sales_lead_email_batch_activate_admin(...)`.
6. Přímá klientská cesta `sales_lead_email_batch_create(...)` je pro `authenticated` odebraná; klient používá bezpečný wrapper.

Oprava tohoto toku je v PR #334, merge commit `8f1dfa0e7ad9525d6c54dfae42b83255d5873f16`. Migrace `20260809170000_sales_lead_prepare_paused_when_automation_on.sql` je aplikovaná na stagingu i produkci.

## 3. Přepínač automatiky v administraci

Frontend obsahuje stavový panel:
- `Automatika zapnutá` / `Automatika vypnutá`,
- tlačítko pro zapnutí/vypnutí vidí pouze superadmin,
- používá existující `sales_lead_email_automation_set_enabled(boolean)`,
- stav se po změně znovu načte z DB,
- přepínač sám nevytváří, neaktivuje ani neodesílá dávku.

PR #333 je mergnutý. Produkční frontend byl publikován a ovládání je viditelné v administraci.

**Důležité:** backend RPC pro změnu `enabled` je záměrně **superadmin-only**. Nerozšiřovat na běžného admina bez samostatného schválení.

## 4. Denní limit dávkového odesílání

Produkční `sales_lead_email_batch_claim_next()` obsahuje skutečný claim-time limit:
- max. **20 dávkových e-mailů denně**,
- limit je napříč všemi dávkami daného dne,
- rozhoduje `Europe/Prague`,
- po dosažení limitu vrací `noop / daily_limit_reached`, položka zůstává `pending` a nic se neodešle.

Do spotřeby se počítá dávkový tok:
- item `processing`,
- delivery `batch_initial` ve stavu `sending`, `provider_accepted`, `committed`, `uncertain`.

Do limitu se nezapočítává:
- `prepared`,
- `provider_rejected`,
- `manual_initial`.

Ruční odesílání prvního e-mailu zůstává bez limitu.

Produkční migrace byly aplikovány v pořadí:
1. `20260809120000_sales_lead_daily_send_cap.sql`
2. `20260809140000_sales_lead_daily_cap_batch_only.sql`

Race ochrana zůstává přes `FOR UPDATE`; kill-switch se kontroluje před denním limitem i před claimem položky.

## 5. Bezpečnost prvního e-mailu

Před skutečným dávkovým odesláním se znovu kontroluje zejména:
- automatika je zapnutá,
- dávka je `scheduled`,
- položka je ve svém dni a časovém okně,
- lead stále existuje a je v povoleném stavu,
- `do_not_contact` / suppression,
- lead už není partner,
- e-mail se od vytvoření snapshotu nezměnil,
- e-mail je ověřený,
- první e-mail už nebyl odeslán ani bezpečně claimnut,
- lead není v jiné aktivní dávce,
- duplicitní ochrany.

Delivery tok je dvoufázový a idempotentní. Stavy zahrnují `prepared`, `sending`, `provider_accepted`, `committed`, `provider_rejected`, `uncertain`. `uncertain` se automaticky neopakuje. Pokud provider přijal zprávu a DB commit se nedokončil, další běh provádí pouze `commit_only` a provider se znovu nevolá.

## 6. CTA reakce a inbound odpovědi

První obchodní e-mail používá dvě reakce:
- **Mám zájem**,
- **Nemám zájem**.

`Mám zájem` zapisuje reakci, prioritu a posune lead do odpovědního toku. `Nemám zájem` nastaví `do_not_contact`, `nekontaktovat` a suppression, takže další obchodní e-mail nesmí odejít.

Administrace má přehled `Kontaktovat` a `Nekontaktovat` včetně nepřečtených reakcí.

Běžné odpovědi e-mailem jsou přijímány přes Resend Receiving a `sales-lead-inbound`, párují se k leadu a zapisují `reply_received`. Nepřiřazené zprávy se uchovávají v `sales_lead_unassigned_emails`.

## 7. Stav existujících dávek po testech

K poslední kontrole 9. 8. 2026:
- produkce neměla žádnou čekající `scheduled` dávku po dokončení E2E testu,
- existuje jedna stará `paused` dávka s 19 historickými pending položkami; sama se nikdy neaktivuje,
- dřívější testovací dávka `a3b9fda8-a6f9-4bbe-8442-8aec7e555e45` byla cíleně zrušena (`cancelled`, její položka `cancelled`, `pending=0`),
- nová testovací dávka `31251e38-e770-455e-aa49-769f614ed7d6` byla úspěšně dokončena.

Starou paused dávku neměnit/aktivovat bez výslovného rozhodnutí.

## 8. Discovery nových firem

Discovery infrastruktura je postavená, ale kandidátní vyhledávání je aktuálně blokované OpenAI účtem pro staging:
- diagnostika ukázala `openai_http_status = 429`,
- nejde o neplatný klíč (není 401), ale o kvótu/limit/kredit,
- DuckDuckGo fallback z candidate discovery byl odstraněn, protože z Edge runtime vracel anti-bot odpověď a jako pojistka nebyl použitelný,
- OpenAI je nyní jediný candidate source.

**Klíče nyní nerotovat.** Uživatel chce rotaci secretů/klíčů řešit souhrnně až před produkčním spuštěním. Po doplnění/obnovení OpenAI kvóty je potřeba pouze znovu ověřit discovery job a návazný tok; nestavět nový discovery systém.

Paperclip tok pro doplňování zásoby leadů je nyní soustředěný do Magina. Magin nevytváří vlastní
vyhledávání ani databázi; používá jen úzký STAGING adapter `sales-lead-magin-supply-agent`, který
deleguje na existující OneMil mechanismy. Schvalování návrhů jde přes existující schvalovací cestu
po backendové kontrole bezpečně ověřeného veřejného firemního e-mailu; zakládání discovery jobu jde
přes existující OneMil discovery systém a pouze pro segment `e-shopy`. Stávající denní e-mailová
rutina `sales-lead-daily-batch-agent` zůstává beze změny.

## 9. Co ještě chybí k úplnému dokončení automatického obchodního e-mailového procesu

První automatické oslovení je hotové. Zbývají navazující části:

1. **Automatický follow-up** – dnes existuje ruční follow-up cesta, ale není automatické pravidlo/fronta typu „po N dnech bez odpovědi pošli další e-mail“.
2. **Žádná odpověď** – po posledním follow-upu není automatické pravidlo, které lead uzavře/přesune, takže může zůstat `osloveno` dlouhodobě.
3. **Admin řešení `failed / uncertain`** – bezpečnostní stav existuje, ale chybí jasné UI/workflow, kde člověk rozhodne, co s takovou položkou udělat.
4. **Discovery po obnovení OpenAI kvóty** – ověřit, že automatické hledání firem opět vrací kandidáty a navazuje na ověření firemního webu/e-mailu.
5. **Finální celý obchodní E2E** – po dokončení follow-up části otestovat: discovery → ověření kontaktu → první e-mail → reakce / bez odpovědi → follow-up → finální stav leadu.

### Doporučené pořadí další práce

**Nejbližší další modul: automatické follow-upy.**

Před jeho implementací nový chat musí nejdřív read-only ověřit existující:
- `send-sales-lead-follow-up`,
- dostupné typy šablon a jejich aktuální produkční data,
- stavy leadu `osloveno` / `follow_up` / `odpovedel` / `nekontaktovat`,
- `next_action_at` a existující plánované CRM aktivity,
- suppression/do-not-contact ochrany,
- aby se nevytvářel druhý paralelní systém.

## 10. Známý testovací dluh mimo funkční provoz

P0 Smoke E2E měl historicky červené admin specy 29/31/32 kvůli chybějícímu `E2E_SUPERADMIN_*` seedu v `playwright-staging-p0.yml`. Tento problém je testovací infrastruktura, ne chyba dávkového e-mailového systému. Pozdější Smoke pro PR #334 byl zelený.

## 11. Další důležité aktuální části projektu

- Stripe sandbox tok dobití a refundace je otestovaný a funkční; ochrana proti refundaci již utracených MioCoinů je nasazená.
- Android Capacitor aplikace je v `main`, Application ID `cz.onemil.app`; nativní aplikace skrývá Stripe dobíjení podle store pravidel.
- CSP je aktivní; P2 iframe ochrana a P3 `Cross-Origin-Resource-Policy` jsou vědomě odložené, Cloudflare se nyní nezavádí.
- SPF/DKIM/DMARC stav OneMil byl opraven a apex `onemil.cz` má mít právě jeden SPF; SES/Resend patří na `send.onemil.cz`.
- Live Stripe webhook refundních událostí byl dříve evidován jako samostatný otevřený rollout; před změnou vždy ověřit skutečný aktuální Stripe stav, nic nepředpokládat.
- Shoptet samoobslužné napojení zůstává samostatná oblast; při další práci vždy nejdřív ověřit aktuální GitHub stav.

## 12. Pravidlo pro nový chat / nového agenta

Nový chat nesmí znovu stavět již hotový e-mailový systém. Má vycházet z toho, že **produkční první automatické e-maily jsou hotové a reálně fungují**.

Při pokračování:
1. načíst tento `onemil_state.md`, `onemil_history.md`, `CLAUDE.md` a relevantní `docs/SALES_LEADS_ADMIN_SPEC.md`,
2. ověřit aktuální runtime stav přes GitHub/Supabase,
3. pokračovat pouze v otevřených bodech z §9,
4. vždy řešit jeden krok,
5. nevytvářet paralelní e-mailový/discovery systém,
6. destruktivní produkční změny, peníze, RLS a produkční migrace vyžadují výslovné schválení.

> Doplněno z historického auditu (14. 8. 2026): následující 4 sekce z 17.–18. 07. 2026 chyběly v aktuálním stavu, ale nejsou v rozporu s ničím výše — jde o nejstarší dochovaný záznam v tomto souboru.

## PARTNERSKÉ FAKTURY — CRON AUTH FIX (email-queue + offer-reminders) LIVE (18. 07. 2026)

**PR #241 (`fix/cron-internal-token-auth`) je nasazený a ověřený na produkci `xkzhjldrojjlrkezorey`.** Opravuje opakované HTTP 401 dvou nedělně/denně/10min plánovaných automatů, jejichž kořenová příčina byl drift Edge secretu `INTERNAL_FUNCTION_TOKEN` proti Vault secretu `internal_function_token` (cron posílá Vault hodnotu, funkce porovnávaly jen s Edge hodnotou).

- **Migrace `20260718120000_fix_cron_internal_token_vault_auth.sql` aplikována na produkci.** Přidána `verify_internal_function_token(text)` (SECURITY DEFINER, ověřuje token proti Vaultu, EXECUTE jen `service_role`; vzor `verify_shoptet_cron_token`) a Vault dispatcher `run_process_email_queue_cron()`. Cron `process_email_queue_every_10_min` (jobid 16) přepojen na `SELECT public.run_process_email_queue_cron();` — schedule `*/10 * * * *` zachován, žádný nový/duplicitní cron, token není v textu cronu ani v repu.
- **Edge Functions na produkci:** `process-email-queue` **v154** a `send-offer-reminders` **v61** (obě ACTIVE, `verify_jwt=false`) nově přijmou `x-internal-token` ověřený proti Vaultu (stávající env-token / service-role / admin-JWT cesty zachovány). Do `config.toml` doplněn chybějící `[functions.send-offer-reminders] verify_jwt = false`.
- **Ověřeno na produkci:** job 16 v 12:40 UTC vrátil **HTTP 200** `{"success":true,"processed":1,"sent":1,"failed":0}`; fronta `email_queue` pending **2 → 1** (odeslán referral e-mail; zbylý 1 je „faktura …připravena“ bez přílohy, kterou fronta záměrně vynechává pre-existujícím filtrem — mimo tuto opravu). `send-offer-reminders` (denní 08:00 UTC) vrátí 200 při dalším plánovaném běhu; nespouštěno ručně (42 čekajících připomínek). Pravidla připomínek (první po 24 h, další po 7 dnech, pak vždy po 7 dnech, stop po otevření/skrytí) jsou v DB funkci `get_due_offer_reminder_rows()` — beze změny.
- **Pravidlo (neměnit):** funkce ani cron token nehardcodovat; token držet ve Vaultu (`internal_function_token`) a ověřovat přes `verify_internal_function_token`. Cron 16 nepřidávat druhý; schedule `*/10` neměnit.

## SOFINITY `process_event_queue_worker` — NEPOUŽÍVANÁ INTEGRACE, CRON PONECHÁN (18. 07. 2026, jen prošetřeno)

`process_event_queue_worker` **zůstává nezměněný**; jeho cron `process-event-queue` (jobid 23, `* * * * *`) je **stále aktivní a každou minutu vrací HTTP 401** `Unauthorized worker call` (stejný token drift). Read-only audit: `event_queue` má 2577 pending, 20 MB (0,8 % DB), jen 2 nové události za 7 dní (backlog neroste), **0 FK potomků**, jediní konzumenti jsou worker + `sofinity-chat-callback` → čistě (aktivně nepoužívaná) Sofinity integrace bez reálného dopadu na soutěže/peněženky/platby/faktury. **Otevřený bod (neprovedeno):** cron 23 lze bezpečně vypnout (`SELECT cron.unschedule('process-event-queue');`) pro odstranění log šumu; data nemazat, funkci ani token neopravovat. Cron 23 nebyl bez výslovného pokynu měněn.

## PARTNERSKÉ FAKTURY — AUTO-VYSTAVENÍ PŘEPÍNAČ: PRODUKČNÍ BACKEND ROLLOUT (18. 07. 2026)

**PR #240 backend je nasazený na produkci `xkzhjldrojjlrkezorey`.** Superadmin přepínač automatického vystavení + odeslání partnerských faktur.

- **Nastavení:** klíč `settings.partner_invoice_auto_send_enabled`, **výchozí `false` (VYPNUTO)**. Čtení i zápis řídí RLS `settings` (jen superadmin). Přepínač je v `/admin/partners-portal` v záložce Faktury (jen superadmin) — aktivace UI vyžaduje ruční Lovable Publish.
- **Omezení oprávnění:** `is_partner_invoice_auto_send_enabled()` má EXECUTE jen `service_role` (revoke authenticated/anon); `claim_partner_invoice_for_auto_send`, `release_partner_invoice_auto_send_claim`, `run_partner_invoice_weekly_automation` a `create_partner_invoices_for_last_week` — EXECUTE jen `service_role` (anon/authenticated = false).
- **Edge Functions na produkci:** `send-partner-invoice-email` **v149**, `partner-invoice-auto-send` **v2** (obě ACTIVE, `verify_jwt=false`).
- **Cron:** `weekly_partner_invoices` (jobid 17, `0 2 * * 0` zachováno) přepojen na `SELECT public.run_partner_invoice_weekly_automation();` (jediný job).
- **Chování:** VYPNUTO → nedělní automat vytvoří jen `draft` (bez PDF, bez e-mailu). ZAPNUTO → po vytvoření PDF + právě jeden e-mail + stav `issued` **až po úspěchu** (chyba → zůstává `draft`). DB-side dedup: sdílená atomická rezervace `auto_email_sent_at` (ruční „Odeslat e-mailem“ i automat sdílí stejný claim → nikdy dva e-maily); `create_partner_invoices_for_last_week()` vrací ID faktur vytvořených v aktuálním běhu → zpracují se jen ty, staré drafty zůstávají k ručnímu schválení; poslední PDF export se reusuje (žádné duplicitní PDF); `draft → issued` ověřuje přesně 1 změněný řádek. Ruční „Znovu odeslat“ zůstává samostatná superadmin akce. Migrace byla aplikována na produkci dříve; flag zůstává `false`.

## BEZPEČNOSTNÍ OPRAVY ZÁKAZNICKÝCH FLOW (17. 07. 2026)

- **PR #239 — `wallets` přímý INSERT jen s nulovým zůstatkem: LIVE na produkci.** RLS INSERT policy `Users can insert own wallet` nově vyžaduje `auth.uid() = user_id AND balance_coins = 0 AND bonus_balance_coins = 0`; přímý klientský INSERT tak nemůže vytvořit peněženku s nenulovým zůstatkem. Migrace aplikována na produkci (merge `25199f9ca7`); vytváření peněženek jde dál přes `ensure_wallet_exists` (0/0), admin/superadmin a nákupní RPC nedotčeny.
- **PR #237 — soukromí výherců + vlastní tikety: DB část LIVE na produkci.** Na produkci: `get_latest_winners(integer)` odebrán anon/authenticated EXECUTE; nový `get_latest_winners_public(integer)` (anon-callable, sanitizovaný — bez interních UUID, e-mailu, telefonu, poznámek a avatarové cesty s UUID); `tickets`/`winners` mají partner/own-row RLS. Frontend (přepnutí na `get_latest_winners_public`) vyžaduje ruční Lovable Publish; do publishe volá live bundle ještě starou funkci → veřejný feed výherců je do publishe prázdný (viz onemil_history).
- **PR #236 (`buy_ticket_atomic` vždy `auth.uid()` + zápis `wallet_transactions`) a PR #238 (`user_vouchers` INSERT jen pro oblíbené):** mergnuté do `main`, **ověřené na stagingu**; produkční apply migrací v tomto dokumentačním auditu nepotvrzen (zaznamenat jako otevřené před produkčním nasazením).

