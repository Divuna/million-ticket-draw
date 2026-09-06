# OneMil – aktuální stav projektu

> **Autoritativní aktuální stav. Poslední aktualizace 05. 9. 2026 podle `origin/main` (`f051e248`), GitHubu a read-only synchronizačního auditu GitHub × produkční Supabase (`xkzhjldrojjlrkezorey`) × staging (`dxmowysntemfqfnanxua`).**

## -1. Dávka bezpečnostních a funkčních oprav 02.–05. 09. 2026 — potvrzeno živé v produkci

Kompletní synchronizační audit (05. 09. 2026) porovnal GitHub `main`, produkční Supabase a
dokumentaci. Všechny body níže byly ověřeny přímým čtením produkčních definic funkcí/triggerů/
cronu — ne jen podle PR popisu.

**Legacy `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SECRET_KEYS` (PR #384, #387, #388):**
- Sdílený helper `_shared/supabaseSecretKey.ts` čte `SUPABASE_SECRET_KEYS["default"]`, bez
  fallbacku na starý secret. Kontraktní test `156-supabase-secret-key-migration-contract.spec.ts`
  hlídá, že žádná Edge Function v repu legacy secret nečte.
- Tři Meta broker funkce (`meta-read-broker`, `meta-storage-health`, `meta-oauth-callback`),
  dřív nasazené jen v produkci s fallbackem na legacy klíč, mají fallback odstraněný (schváleno
  Pavlem) a jejich aktuální zdroj je poprvé v GitHubu (v13/v13/v15, `verify_jwt=false`).
- `_invoke_forward_messages_to_sofinity()` (dřív natvrdo zapsaný Bearer token) čte token z Vaultu.
  Vypnutý cron job 23 (`process-event-queue`) má sanitizovaný `command` bez natvrdo zapsaného
  tokenu a **zůstává `active=false`**.
- **OPEN ISSUE:** `forward_messages_to_sofinity` (aktivně volaná cronem job 11 každou minutu),
  `from_sofinity_message` a `partner-invoice-cron` jsou aktivně používané v produkci, ale nemají
  zdroj v GitHubu. ~19 dalších produkčních funkcí bez zdroje v GitHubu jsou prokazatelně osiřelé
  (žádný cron/trigger je nevolá). Detailní seznam a invarianty viz `CLAUDE.md`.

**Soutěže, výhry, MioCoin peněženka — zpevnění (PR #379–#382, 02.–03. 09. 2026):** `pause_contest`/
`resume_contest` mají admin guard + `closed` je konečný stav; `claim_miocoin_bonus` už bonus
nepřipisuje dvakrát (atomický přesun `bonus_balance_coins → balance_coins`); nová RPC
`admin_update_winner_status` dělá stav výhry + historii + zprávu + audit + sync `bonus_prizes`
atomicky (nahrazuje tři nezávislé klientské zápisy v `/admin/winners`); `admin_manage_contest` má
guard nad kanonickou `user_roles`, bezpečné `NULL` defaulty (vynechaný parametr = „neměnit“, ne
„přepsat konstantou“) a `ticket_count` je po prvním vydaném tiketu neměnný i mimo RPC (DB trigger
`contests_guard_ticket_count`). Všechny čtyři potvrzeny živé v produkci. Detailní invarianty a
důvody v `CLAUDE.md`.

**Ověření věku — jen checkbox 18+ (PR #383, 03. 09. 2026):** `profiles.date_of_birth` se nesbírá a
nesmí být podmínkou ničeho. Dvě DB funkce (`trigger_guardian_message_on_winner`,
`create_guardian_notification_if_needed`) dřív z chybějícího data narození odvozovaly věk
(opačně špatně — jedna posílala zprávu úplně všem, druhá nikomu); teď rozhodují jen podle
`bonus_prizes.guardian_required`. Potvrzeno živé v produkci.

**PENDING (neaplikováno, čeká na schválení):** oprava `shoptet_import_row_log.message` (PR #387,
`failureMessage()`) je jen v GitHubu — produkční `import-shoptet-orders` zůstává na v58 bez ní.

### TODO #349 — Shoptet napojení pro jeden e-shop (06. 09. 2026)

Read-only audit skutečného flow ukázal, že **body 1 a 2 zadání byly už hotové a v provozu**:

- **Druhé ruční schválení** — partner odešle napojení přes EF `submit-shoptet-connection`,
  superadmin ho schválí/zamítne přes `approve-shoptet-connection`. Schválení partnerského účtu
  a schválení Shoptet napojení jsou dvě oddělené kontroly. Beze změny.
- **Sekce „Zobrazení MioCoinů v e-shopu"** v `/partner/dashboard` — hotový snippet s předvyplněným
  `data-onemil-partner`, tlačítko „Kopírovat kód", návod Vzhled a obsah → Editor HTML kódu,
  zobrazená jen při napojení ve stavu `approved`/`active`. Partner nikde nedoplňuje své ID a odměna
  ve widgetu není natvrdo. Hlídá spec 132. Beze změny.

**Chyběl jen bod 3 — kontrola duplicity e-shopu.** Doplněno: nová SECURITY DEFINER RPC
`shoptet_pending_url_conflict` (+ pomocná `shoptet_export_url_host`) a její volání v
`approve-shoptet-connection` **před** `promote_shoptet_pending_url`, v obou approve větvích
(`initial` i `url_change`). Konflikt → `409 eshop_already_connected` a nezapíše se nic — ani Vault,
ani `partners`, ani řádek žádosti.

Invariant „Shoptet URL žije jen ve Vaultu" zůstává: doména se **neukládá do žádného sloupce**,
porovnává se uvnitř Vault kontextu a ven jde jen identita kolidujícího partnera.

**⚠️ NENASAZENO NA PRODUKCI.** Migrace `20260906100000_shoptet_connection_duplicate_shop_guard.sql`
ani redeploy `approve-shoptet-connection` na produkci neproběhly — obojí vyžaduje samostatné
schválení Pavla. Na stagingu `dxmowysntemfqfnanxua` je migrace aplikovaná a ověřená.

**Mimo rozsah #349 (nedotčeno):** multi-shop (#348), reward engine, ceny MioCoinů, peněženky,
platby, soutěže, Partner Trial / New Customer Bonus, Sofinity.

**PENDING (neaplikováno, čeká na schválení) — `selected_products` bez vybraného produktu:**
V režimu `reward_mode='selected_products'` vrací `create_partner_order_reward` chybu
`reward_amount_too_low` i pro objednávku, která žádný vybraný produkt neobsahuje — obchodně jde
přitom o normální objednávku bez nároku na MioCoiny. Shoptet live import ji proto počítá do
`rows_failed` a každý běh končí jako `partial`. **Potvrzeno na produkci u BOHEMIA INFINITY
(05. 09. 2026)** — po přepojení na item-level export se chyba
`items_required_for_reward_mode` změnila na `reward_amount_too_low` a cron `shoptet_auto_import_1min`
hlásí `partial` každou minutu. Oprava je připravená v GitHubu (migrace
`20260906090000_partner_reward_no_eligible_products.sql` + `createOutcome.ts` + spec 139):
engine nově vrací `eligible_items`, issuance RPC vrací
`{success:true, skipped:true, reason:'no_eligible_products'}` bez vydání kódu a importer to
počítá mimo `rows_failed`. **Migrace NENÍ aplikovaná a Edge Function NENÍ přenasazená** —
obojí vyžaduje samostatné schválení Pavla. `reward_amount_too_low` zůstává beze změny pro případ,
kdy vybraný produkt existuje, ale odměna vyjde pod minimem.

### Partner Trial / New Customer Bonus — backend nasazený, produktově NEAKTIVNÍ (03. 09. 2026, zdroj dorovnán 05. 09. 2026)

**Backend je živý v produkci `xkzhjldrojjlrkezorey`** od 03. 09. 2026, ale do 05. 09. 2026 jeho
zdroj chyběl v GitHubu. Read-only audit to odhalil a zdroj byl doplněn beze změny produkce.

Živé a ověřené přímým čtením produkce (05. 09. 2026):

| Produkční verze | Co je živé |
|---|---|
| `20260903200832` | settings `partner_reward_validity_days=90`, funkce `partner_reward_validity_days()`, `expire_partner_reward_codes()`, trigger `trg_set_partner_reward_expiry` (v1) |
| `20260903200843` | sloupec `partner_reward_codes.issued_to_customer_at`, trigger přepsán na `auto_v2` — 90 dní běží od skutečného vydání zákazníkovi, ne od vzniku řádku |
| `20260903200856` | `partners.trial_started_at/trial_ends_at`, `trg_start_partner_trial` (30 dní od prvního vydání odměny), ochranný `trg_protect_partner_trial` |
| `20260903200935` | settings `partner_trial_free_mc_per_reward=2`, `partner_trial_free_mc()`, sloupce `coins_free`/`coins_billable`/`amount_net_before_discount`/`discount_net`/`discount_reason`, slevová logika ve všech třech fakturačních funkcích |
| `20260903200954` | `partners.public_ref_code`, tabulky `partner_pending_attributions` + `partner_customer_refs`, RPC `record_pending_partner_attribution_intent` a `record_partner_customer_ref` (bonus 15 MC) |
| `20260903201001` | cron `expire_partner_reward_codes_daily` (`30 3 * * *`, jobid 33, `active=true`) |

Dále je živá **Edge Function `generate-partner-invoice-pdf` v194** — zobrazuje slevu v PDF
a vrací `trial_discount_rendered`. Frontend (`src/pages/Register.tsx`,
`src/hooks/useApplyPendingPartnerRef.ts` s `PENDING_PARTNER_ATTRIBUTION_STORAGE_KEY`) už byl
v `main` dřív.

**⚠️ Funkce NENÍ produktově aktivní.** Produkce má k 05. 09. 2026:
`public_ref_code` = 0 partnerů · partneři v trialu = 0 · `partner_pending_attributions` = 0 ·
`partner_customer_refs` = 0 · reward kódy s `expired_at`/`issued_to_customer_at` = 0 ·
faktury se slevou = 0. Odkaz `/register?p=KOD` proto dnes **nikdo nemůže použít** a
**partnerské UI trialu není dokončené** (`PartnerDashboard.tsx` o trialu neví).

**OPEN ISSUE — dokončení funkce vyžaduje samostatné schválení Pavla:** vydání `public_ref_code`
partnerům a partnerské UI zahajovací akce. Dokud kódy neexistují, celá Fáze 4 spí.

**Dorovnání zdroje 05. 09. 2026 nic v produkci nezměnilo** — soubory vznikly doslovným
read-only exportem `supabase_migrations.schema_migrations.statements` a živé v194. Žádná
migrace nebyla znovu aplikována, žádná Edge Function nasazena.

**Ostatní mergnuté PR z tohoto období beze zvláštního dopadu na invarianty:** #372–#374 (CMS
soft-delete opravy pro `ContentPage`/`SlugContentPage`/influencer terms), #375 (`.env` odstraněn
z gitu, přidán do `.gitignore`), #385/#386 (redesign `/pro-eshopy` B2B stránky — čistě frontend/
vizuální, žádná DB ani bezpečnostní změna; detail níže).

### B2B stránka `/pro-eshopy` — schválená verze v4 je živá (PR #385, #386, 04.–05. 09. 2026)

Doplnění k jednořádkové zmínce výše. Ověřeno přímo na živé stránce `https://www.onemil.cz/pro-eshopy`
(bundle `index-CsKuQT3q.js`), ne jen podle popisu PR.

- **Zdroj:** `src/pages/PartnerEshopLanding.tsx`, hero vizuál `src/assets/pro-eshopy-hero.jpg`
  (1800×1338, 299 kB). PR #385 = předchozí iterace sekce „Prémiové ceny", PR #386 = nasazení
  celé schválené verze v4 (merge `bec9fa84`).
- **Obě CTA vedou na existující partnerskou registraci `/partner/register`.** Žádný nový
  registrační tok, žádná nová tabulka ani RPC.
- **Kontakty v závěrečném CTA jsou klikací:** `mailto:b2b@onemil.cz` a `tel:+420731215816`
  (shodné s `COMPANY_CONTEXT.md` — není to nový obchodní údaj).
- **Stránka nepoužívá žádný externí CDN.** Produkční CSP v `index.html` externí CDN pro styly
  i skripty blokuje, takže původní statický prototyp (Tailwind CDN + FontAwesome) nelze nasadit
  tak, jak je — proto React port s vlastním Tailwind buildem a `lucide-react`. Viz invariant
  v `CLAUDE.md`.
- **Mimo rozsah a nezměněno:** backend, business logika, DB, Edge Functions, ostatní stránky.
- **Lokálně zůstávají nenasazené grafické prototypy** (`public/preview-assets/`,
  `src/pages/PreviewProEshopyV2.tsx`, `PreviewProEshopyV3.tsx` a dočasné routy `/preview/…`
  v `src/App.tsx`) — v žádné větvi ani v `main` nejsou a nasazovat se nemají.

## 0. Produkční hosting migrován na Vercel — apex i `www` běží, bezpečnostní hlavičky jsou živé (02. 09. 2026, VYŘEŠENO)

**Toto nahrazuje sekci níže („Doména `onemil.cz` odpojena od Lovable — VÝPADEK APEXU").** Cesta
z bodu 4 tehdejšího OPEN ISSUE („přenést hosting na Vercel/Netlify") byla realizována a je teď
produkční řešení. Sekce níže zůstává beze změny jako historický záznam epizody, která k tomuto
kroku vedla — jen je označená jako překonaná tam, kde už neplatí.

**Ověřený současný stav (potvrzeno Pavlem):**

- **Produkční frontend OneMil běží na Vercelu**, ne na Lovable.
- **`onemil.cz` i `www.onemil.cz` vedou na Vercel** — DNS cutover proběhl, apex i `www` jsou
  dostupné.
- **Deploy produkčního frontendu jde z GitHub `main` přes Vercel** (Vercel projekt sleduje `main`
  a nasazuje automaticky po merge).
- **Lovable se může dál používat jako editor kódu** (git sync do GitHubu), ale **už není produkční
  hosting** — „Lovable Publish" už neurčuje, co běží na `onemil.cz`.
- `vercel.json` v repu teď **skutečně řídí produkční HTTP hlavičky** (na rozdíl od dřívějšího stavu
  pod Lovable, kdy to šlo jen přes `<meta>` tag v `index.html`):
  - `Content-Security-Policy: frame-ancestors 'none'`
  - `X-Frame-Options: DENY`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - Zachován social-preview rewrite (`/share/ticket/:id` → Supabase Edge Function
    `og-ticket-share`) a SPA fallback rewrite pro přímé otevření/refresh libovolné React routy.
  - **Clickjacking nález z epizody níže je tímto vyřešený** — `frame-ancestors`/`X-Frame-Options`
    se teď doručují jako skutečná HTTP hlavička, ne přes nefunkční Cloudflare Transform Rule.
- **Mergnuto do `main`:** PR #367 (SPA fallback + hlavičky ve `vercel.json`, odstranění
  nepoužívaného `api/og-ticket.ts`), #368 (oprava chybného `functions` bloku, který první deploy
  na Vercelu shazoval), #369 (doplnění `X-Content-Type-Options` + `Referrer-Policy`), #370 (oprava
  dvou Edge Functions, viz níže).
- **Edge Functions `send-marketing-consent-notification` a `send-test-notification` jsou nasazené
  do produkčního Supabase** (`xkzhjldrojjlrkezorey`) s kódem z `main` po PR #370 — `web_url` v obou
  teď vede na `https://onemil.cz` (resp. `https://onemil.cz/profile`), ne na
  `https://onemil.lovable.app`.
- **Žádný aktivní uživatelský odkaz už neposílá na `onemil.lovable.app`** — ověřeno read-only
  auditem celého `origin/main` (výskyt `onemil.lovable.app` je po PR #370 nulový; zbylé
  `.lovable.app`/`lovableproject.com` zmínky jsou buď bezpečnostní guardy, které mají zůstat
  (`src/lib/publicAppUrl.ts`, guardy v `partner-activate`/`create-affiliate-company-lead`), nebo
  čistě historická dokumentace).

**Nedotčeno / mimo rozsah tohoto zápisu:** `LOVABLE_API_KEY` a volání `ai.gateway.lovable.dev`
v `supabase/functions/generate-contest-description/index.ts` zůstává živá závislost na Lovable's
AI Gateway (generování popisu soutěže) — nesouvisí s hostingem a nebylo touto migrací dotčeno.

**Otevřené (vědomě neřešeno v rámci tohoto kroku):** `README.md` a komentář v `index.html`
u `<meta http-equiv="Content-Security-Policy">` pořád popisují starý stav („produkční web běží na
Lovable", „vercel.json se na produkci nepoužívá") — jde jen o zastaralý text/komentář v kódu, ne
o funkční problém, ale stojí za aktualizaci v samostatném kroku. `bun.lock`/`bun.lockb`/`deno.lock`
a `playwright-fixture.ts` zůstávají neuklizené (viz předchozí read-only audit Lovable závislostí) —
bezpečné k odstranění, ale mimo rozsah tohoto dokumentačního zápisu.

---

## 0a. Doména `onemil.cz` odpojena od Lovable — VÝPADEK APEXU (27. 8. 2026, PŮVODNÍ ZÁZNAM — ⚠️ PŘEKONÁNO, viz sekce 0 výše)

**⚠️ PŘEKONÁNO (02. 09. 2026):** apex i `www` jsou teď dostupné přes Vercel, viz sekci 0 výše.
Tato sekce zůstává jako historický záznam epizody. Konkrétně už neplatí: „bezpečnostní hlavičky
NEFUNGUJÍ" (nyní fungují, doručuje je Vercel), „clickjacking zůstává neopravený" (nyní opraveno),
a bod OPEN ISSUE č. 4 (Vercel/Netlify alternativa) — ten byl realizován.

**⚠️ AKTIVNÍ PROBLÉM. Apex `onemil.cz` je nedostupný. `www.onemil.cz` funguje.**

| Oblast | Stav |
|---|---|
| `https://onemil.cz/` | 🔴 **403** — Cloudflare chybová stránka „DNS points to prohibited IP" (Error 1000). Před odpojením vracel **421 „Project not found"** od Lovable. |
| `https://www.onemil.cz/` | ✅ **200**, servíruje OneMil, v Lovable stav **Live** |
| Lovable → Domains | `onemil.cz` = **Not connected** (dříve `Offline` / interně „drifted") |
| DNS | ✅ **správné a ověřené** — není co opravovat |
| Pošta | ✅ **nedotčená** |
| DNSSEC | ✅ funguje, DS v `.cz` sedí |

### Ověřený stav DNS (referenční snímek 27. 8. 2026 21:26)

```
A     onemil.cz              → 185.158.133.1        (DNS only)
TXT   _lovable.onemil.cz     → lovable_verify=9128160c44be9dff7100644767a2f5341230664eb3b512a6d719e5e316e930d4
A     www.onemil.cz          → 188.114.96.9 / 188.114.97.9   (Proxied)
TXT   _lovable.www.onemil.cz → lovable_verify=f77a1ad444032947bbbc355ee93af980f13df2e477841126162abdb83d5a03f9
MX    onemil.cz              → 10 mx10.active24.cz / 100 mx20.active24.cz
TXT   onemil.cz              → v=spf1 a mx include:_spf.websupport.cz -all      (právě jeden SPF)
TXT   _dmarc.onemil.cz       → v=DMARC1; p=quarantine
TXT   send.onemil.cz         → v=spf1 include:amazonses.com ~all
MX    send.onemil.cz         → 10 feedback-smtp.eu-west-1.amazonses.com
TXT   resend._domainkey      → p=MIGfMA0GCSqG… (DKIM)
```

**DNS odpovídá přesně tomu, co Lovable v UI požaduje** (`A @ → 185.158.133.1` + `TXT _lovable`).
Potvrdil to i **Lovable sám**: „žádná chyba v DNS tam teď není", stav domény označil jako
**„drifted"**. Chyba tedy **není v DNS ani v repu**.

### Nejpravděpodobnější příčina — PLACENÝ PLÁN (hypotéza, neověřeno)

Po odpojení domény vrací **„Connect domain" dialog: „Upgrade to Pro — You need to be on a pro
plan to connect a domain. €25 due today."**

**Vlastní domény jsou u Lovable funkce plánu Pro.** Sedí to na všechny pozorované příznaky:

- `www.onemil.cz` je Live → **Pro musel být aktivní dříve**;
- když předplatné vyprší nebo se sníží, Lovable doménu označí jako „drifted"/Offline;
- **`Recover` přes Entri selhal 4× za sebou** („Sorry! This link has expired") — včetně
  anonymního okna a s vypnutým Google Translate. Pro-gated akce by se takto chovala.

**Není to potvrzeno** — stav fakturace v Lovable nebyl ověřen. **Je to nejsilnější hypotéza, ne fakt.**

### ⚠️ Bezpečnostní hlavičky NEFUNGUJÍ ani na `www` (ověřený fakt)

V Cloudflare je vytvořené a **Active** pravidlo **Transform Rule „OneMil Security Headers"**
(`Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`,
`Permissions-Policy: camera=(), microphone=(), geolocation=()`).

**Neprojevuje se ani na apexu, ani na `www`** — přestože `www` má v Cloudflare **oranžový mrak
(Proxied)**. Měřeno opakovaně; odpověď nese jen HSTS / Referrer-Policy / X-Content-Type-Options,
které posílá Lovable.

**Důkaz, že provoz nejde přes zákaznickou Cloudflare zónu:** certifikát doručený přes
`188.114.96.9` má **identické sériové číslo** (`11F61A3B02ECF9B10E41EA07F754EB96`) jako certifikát
z Lovable originu `185.158.133.1`. Proxied zóna by předkládala vlastní edge certifikát.
Ty IP tedy patří **Cloudflare Lovable (Cloudflare for SaaS)**, ne vaší zóně.

**Důsledek: dokud tohle platí, nelze přes Cloudflare nasadit ŽÁDNOU bezpečnostní hlavičku.**
⚠️ **PŘEKONÁNO (02. 09. 2026):** po migraci hostingu na Vercel se hlavičky nastavují přímo
z `vercel.json`, ne přes Cloudflare — viz sekci 0 výše.

### Co bylo v této epizodě ověřeno jako NEPRAVDA nebo nepodstatné

- **`/.well-known/security.txt` existuje** a vrací 200 (nález z externího testu byl nepravdivý).
- **CSP existuje** jako `<meta http-equiv>` v `index.html`; chybí jen jako HTTP hlavička.
- **SRI** — u `gtag.js`, `fbevents.js` a OneSignal SDK technicky nemožné; není to reálný nález.
- **CORP** — `same-origin` by **rozbilo Shoptet widget** u všech partnerů (načítá se cross-origin
  z partnerských e-shopů); jediná bezpečná hodnota `cross-origin` nic nepřináší.
- **AAAA** — není bezpečnostní nález a není proveditelný (Lovable pro apex IPv6 nepublikuje).

### OPEN ISSUE — co zbývá udělat

1. **Ověřit stav plánu v Lovable** (Settings → Plans / Billing) a zjistit, zda a odkdy je účet
   mimo Pro. Teprve to hypotézu potvrdí nebo vyvrátí.
2. **Rozhodnout o platbě Pro (€25/měsíc)** — bez ní **apex `onemil.cz` znovu připojit nelze**.
   **Rozhodnutí je na Pavlovi; nikdo ho nemá činit za něj.**
3. **Zvážit riziko u `www`** — pokud jsou vlastní domény Pro-gated, může Lovable časem odpojit
   i `www.onemil.cz`.
4. **Alternativa k zvážení:** přenést hosting na Vercel/Netlify, kde jsou vlastní domény zdarma
   a **bezpečnostní hlavičky se nastaví přímo z repa** (`vercel.json` → `headers`, resp. `_headers`).
   Řešilo by to obojí naráz. Git sync do GitHubu už existuje a Lovable export výslovně povoluje.
   ⚠️ **PROVEDENO (02. 09. 2026)** — viz sekci 0 výše.
5. **Clickjacking zůstává neopravený** — apex i `www` lze vložit do cizího iframu.
   ⚠️ **PŘEKONÁNO (02. 09. 2026):** `X-Frame-Options: DENY` a `frame-ancestors 'none'` se teď
   doručují jako skutečná HTTP hlavička z Vercelu — viz sekci 0 výše.
6. **CAA záznam stále chybí** (dnes vydává Google Trust Services / WE1). Přidat lze kdykoli
   v Cloudflare DNS, **musí být široké** (`pki.goog`, `letsencrypt.org`, `digicert.com`,
   `ssl.com`, `comodoca.com`), jinak zablokuje obnovu SSL i na poštovních subdoménách.

---

## 0. Rekonciliace peněženek a zaseknutý fakturační e-mail (F7) — stav k 26. 8. 2026 (uzavřeno bez změny)

**F7 byl prověřen READ-ONLY a UZAVŘEN jako nález, který NENÍ aktuální funkční chybou.**
**Neproběhla žádná změna kódu, SQL, DB, dat ani UI** — nic se nemazalo, nepřepočítávalo
a neodesílalo, v produkci ani na stagingu.

### Peněženky vs. ledger

| Oblast | Aktuální stav |
|---|---|
| Rozsah nálezu | Audit uváděl **2** nesouhlasící peněženky. Rekonciliace všech 781 produkčních peněženek našla **111**. Rozdíly jsou ale systematické a beze zbytku vysvětlené. |
| Klíčový kontext | **`wallet_transactions` začíná 16. 3. 2026**, zatímco peněženky a platby existují od 14. 9. 2025. **25 peněženek je starších než ledger** — jejich počáteční zůstatek v něm z principu být nemůže. |
| Kdo je dotčen | 102 syntetických CI účtů `@onemiltest.dev` · 4 interní vývojové `@opravo.cz` · 2 interní OneMil (`e2e@`, `pepca@`) · 2 účty vlastníka · 1 známý testovací zákazník. **Reálný externí zákazník: 0.** |
| Tvar rozdílů | **101 peněženek má rozdíl přesně +10,00**, všechny založené 16. 3. 2026 (jednorázový seed při zavedení ledgeru), všechny na `onemiltest.dev`. Zbytek: +50, +165, +785,50, +1 255, +1 287, +1 300, +1 497, +9 162,92, +12 259, +100 552. Všechny rozdíly jsou kladné. |
| Největší rozdíl | **+100 552** na `e2e@onemil.cz` — vysvětlen testovací Stripe platbou **100 000** z 5. 5. 2026 (`cs_test_a1xZ`), která nezaložila ledger řádek. |
| Platby bez ledger řádku | 7 dokončených plateb po zavedení ledgeru nemá ledger řádek — **všechny `cs_test_*` a všechny na interních účtech**. |
| Účetní dopad | **Nulový.** Produkce má **0 živých Stripe plateb** (`cs_live_` = 0 ze 138); metody jsou `stripe_test`, `test`, `test_crud`. Reálné peníze systémem nikdy neprošly. |
| Dopad na nákupy a výhry | Zůstatek je autoritativní pro utrácení, takže nafouknutý zůstatek umožní víc nákupů — ale **jen testovacím účtům**, což je jejich účel. Výherce určuje pozice tiketu, ne zůstatek. |

**⚠️ Past pro budoucí práci:** rekonciliace ve tvaru „zůstatek = součet ledgeru" **není platný
test** pro účty starší než 16. 3. 2026. Plošný přepočet zůstatků podle ledgeru by srazil zůstatky
testovacích účtů (rozbil CI) a u starších účtů smazal legitimní počáteční zůstatky.

### Jediný pending fakturační e-mail

| Údaj | Hodnota |
|---|---|
| ID | `51467a9d-9074-4451-b384-6f6dadc66890` |
| Vznik | **12. 7. 2026 02:00** — přesně slot cronu 17 `weekly_partner_invoices` |
| Příjemce | `eshop@onemil.cz` — **interní** OneMil adresa (kontakt partnera BOHEMIA) |
| Předmět | „OneMil – faktura OMA-20260003 připravena" |
| Částka | 3,63 Kč vč. DPH, období 29. 6. – 5. 7. 2026 |
| Příloha | **žádná** (`attachment_url` i `attachment_storage_path` = NULL, `attachment_required=false`) |

- **Není zaseknutý — je zadržený záměrně.** `process-email-queue/index.ts` má ve výběru
  podmínku `.or("subject.not.ilike.%faktura%,attachment_url.not.is.null,attachment_storage_path.not.is.null")`,
  která **nedovolí odeslat fakturační e-mail bez přílohy**. Tento řádek má v předmětu „faktura“
  a obě přílohové kolonky prázdné → je z odesílání trvale vyloučen. **Je to funkční pojistka, ne chyba.**
- **Proč chybí příloha:** e-mail byl zařazen 12. 7. v 02:00, ale **PDF export vznikl až 17. 7. v 19:18**,
  o pět dní později; řádek fronty už nikdo zpětně nedoplnil (`partner_invoice_post_create` zařadí
  e-mail a PDF řeší best-effort).
- **Partner fakturu dostal jinou cestou.** Cron zakládá faktury jako `draft`; jediná cesta
  `draft → issued` je **úspěšné odeslání přes `send-partner-invoice-email`**.
  `OMA-20260003` je `issued` → EF ji odeslala. Odeslané fakturační e-maily mají navíc jiný předmět
  („OneMil – faktura připravena“), což potvrzuje dva různé odesílatele. **Zadržený řádek je
  redundantní duplikát již doručeného oznámení.**
- **Fronta je zdravá:** cron 16 aktivní (`*/10 * * * *`), poslední běhy `succeeded`, po 12. 7.
  odesláno **112** e-mailů, poslední 26. 8. 2026 08:10. **Pending mimo faktury: 0.**
- **Nemá se ručně odesílat ani mazat.** Odeslání = duplicitní oznámení partnerovi;
  smazání = ztráta auditní stopy.

**OPEN ISSUE — pre-launch krok (vědomě neprovedeno):** po resetu testovacích dat a **před
přepnutím Stripe do live režimu** znovu ověřit rekonciliaci wallet/ledger. Do té doby nemá
plošný přepočet smysl; po resetu musí platit, že nové zůstatky odpovídají ledgeru.

**OPEN ISSUE — drobné zlepšení, vědomě neprovedeno:** `partner_invoice_post_create` by měl e-mail
zařadit **až po** vzniku PDF, nebo přílohu doplnit zpětně. Dnes to nic nerozbíjí (fakturu odešle EF).

---

## 0. Cena voucheru pro zákazníka (F6) — stav k 26. 8. 2026 (uzavřeno bez změny)

**F6 byl prověřen a UZAVŘEN jako nález, který NENÍ aktuální funkční chybou.** Rozhodnutí Pavla:
varianta 2. **Neproběhla žádná změna kódu, DB, dat ani UI** — jde čistě o dokumentační uzávěr.

| Oblast | Aktuální stav |
|---|---|
| Zákaznická cena voucheru | **Pevně 5 MioCoinů.** `buy_voucher_atomic` strhává `v_price := 5` z `balance_coins`. |
| Konzistence napříč vrstvami | **Bez rozporu pro zákazníka** — RPC účtuje 5, tlačítko i toast říkají 5, admin zobrazuje read-only badge „Cena v detailu: 5 MioCoinů". |
| Produkční realita | 33 voucherů, **26 reálných nákupů, všechny přesně za 5** (19. 4. – 8. 7. 2026). |
| `vouchers.redeem_price_vouchers` | **DEPRECATED — historický pozůstatek, není zdrojem ceny.** Přidán 15. 3. 2026 pro funkci `redeem_voucher` s cenou v `wallets.balance_vouchers`; **obojí dnes neexistuje**. Na produkci má **všech 33 voucherů default `1`** — nikdo hodnotu nikdy nenastavil. |
| `get_available_vouchers(uuid)` | **Mrtvá RPC** — jediný zbylý čtenář sloupce, nula volajících v `src/`. Katalog používá `get_public_available_vouchers()`, která cenu nevrací. |
| Formulace nálezu F6 | Audit tvrdil, že RPC „ignoruje" `redeem_price_vouchers`, což implikuje regresi. **Historie ukazuje opak:** konstanta 5 je v `buy_voucher_atomic` od první definice (8. 3. 2026), tedy **týden PŘED** vznikem sloupce. Nikdy nebyly propojené. |

**⚠️ Past pro budoucí práci:** napojení sloupce do `buy_voucher_atomic` bez datové migrace by
**tiše srazilo cenu celého katalogu z 5 na 1 MioCoin** (všechny produkční vouchery mají default 1),
zatímco UI by dál hlásilo „Koupit za 5 MioCoinů". Případný fallback musí být `coalesce(..., 5)`.

**OPEN ISSUE — samostatný budoucí cleanup (vědomě neprovedeno):** fyzické odstranění sloupce
`vouchers.redeem_price_vouchers` a mrtvé RPC `get_available_vouchers(uuid)`. Sloupec je
`numeric NOT NULL DEFAULT 1`, drop je nevratný → vlastní schválený krok. Do té doby sloupec
zůstává, ale je **deprecated a nikdo ho nesmí začít používat**.

**Nezaměňovat s B2B cenami:** `voucher_versions`, `voucher_distribution_price_rules`,
`voucher_distribution_orders`, `voucher_issuances` a `superadmin_set_voucher_distribution_price`
řeší, co platí **partner OneMilu** za distribuci voucheru — jiná osa, tímto nedotčená.

**Nález F7 je rovněž uzavřen** — viz sekce výše.

---

## 0. Anon-volatelné zapisovací a interní RPC (F5) — stav k 26. 8. 2026 (nasazeno do produkce)

Tato sekce je nejnovější a přebíjí vše níže v oblasti grantů RPC.

| Oblast | Aktuální stav |
|---|---|
| Skupina A — 9 funkcí / 10 signatur (audit F5, kritické) | **Opraveno a nasazeno.** `SECURITY DEFINER` funkce obcházející RLS, které zapisovaly interní stav a měly `anon EXECUTE` bez guardu. Reprodukováno na stagingu jako `anon`: přepsání anti-fraud signálů cizího uživatele, posun `last_played_at`, přepsání `billing_mode`/`price_per_activation` partnera, confused deputy v `approve_affiliate_company_lead_txn`, spuštění cronu `process_referral_inactivity`, zápis telemetrie s libovolným `partner_id`, čtení role kohokoli přes `get_user_role`. |
| Nové granty skupiny A | `anon`, `PUBLIC` i `authenticated` odebráno; zůstává **jen `service_role`**. ACL přesně `postgres=X/postgres \| service_role=X/postgres`. Těla **byte-identická** (md5 ověřeno) — žádná změna business logiky. |
| Skupina B — 12 interních/testovacích RPC | **Uzavřeno.** `run_deep_sofinity_test_suite` a `validate_sofinity_events` mají nově guard `assert_admin_validation_rpc_allowed()` a `anon` odebráno (obě `+56` znaků = jen guard). Ostatních 10 je **service_role only**. `test_sofinity_performance` zapisuje do `event_logs` i `users`, `edge_cases` do `event_logs`, a `run_deep_sofinity_test_suite` volá obě — anon přes ni mohl hnát produkční zápisy. |
| Zbytková plocha | **0** anon-volatelných nezaguardovaných `SECURITY DEFINER` zapisovačů (před opravou 10). |
| Citlivé tabulky | Ověřeno: **každá** funkce zapisující do `wallets`/`payments`/`winners`/`contests`/`user_roles`/`tickets` dosažitelná pro `anon`/`authenticated` má guard. Jediná výjimka `generate_winner` je INVOKER a měřením nezapsala nic. |
| Referral flow | **Beze změny.** `set_my_referrer_by_code` vrací `accepted`, interní volání `upsert_user_security_signals` zapisuje (běží pod vlastníkem). |
| Produkční data | **Nezměněna.** Migrace mění pouze granty a u dvou funkcí vkládají guard; `event_logs` 691 → 691, žádný zápis. |

**Aplikované produkční migrace (26. 8. 2026, schválení Pavla):**
`20260826143959_lock_down_writable_rpcs_group_a`, `20260826144054_lock_down_internal_test_rpcs_group_b`.
`main` = `ae49bd5a`. **Lovable Publish není potřeba — frontend se nemění.**

**OPEN ISSUE — staging security drift (samostatný bezpečnostní úkol, vědomě neopraveno):** staging má
~34 anon-volatelných `SECURITY DEFINER` zapisovačů, které produkce nemá — mj. `try_credit_wallet_mc`,
`deduct_wallet_for_refund`, `transfer_bonus_to_main`, `claim_miocoin_bonus`, `prepare_stripe_refund`,
`generate_partner_api_key`, `fn_close_contest`. Produkce je má zahardenované, takže to **není produkční
riziko**, ale staging je slabší cíl a bezpečnostní testy tam mohou dávat falešně optimistický obraz.

**Otevřené zůstávají nálezy F6 a F7** ze zákaznického auditu.

---

## 0. Partner Offer reminders (F4) — stav k 26. 8. 2026 (nasazeno do produkce)

Tato sekce je nejnovější a přebíjí vše níže v oblasti reminder RPC.

| Oblast | Aktuální stav |
|---|---|
| Anon-volatelná `get_due_offer_reminder_rows()` (audit F4, kritický) | **Opraveno a nasazeno.** Funkce je `SECURITY DEFINER`, byla `anon`-volatelná a vrací zákaznické e-maily (`JOIN auth.users` → `au.email AS user_email`). Jako `SECURITY DEFINER` obchází RLS, takže jediné, co stálo před daty, byl EXECUTE grant. Na stagingu jako `anon` vrátila **582 řádků / 6 unikátních zákaznických e-mailů**. |
| Nový stav grantů | `anon`, `PUBLIC` i `authenticated` odebráno; zůstává **jen `service_role`**. ACL je přesně `postgres=X/postgres \| service_role=X/postgres`. Admin ani superadmin přímý EXECUTE nemají — nepotřebují ho. |
| Tělo funkce | **Byte-identické** (md5 `c7f5dab5…`, 1124 znaků). Způsobilost, výběr uživatelů, okna 24 h / 7 dní i obsah e-mailu jsou nezměněné. |
| Interní cesta | Nedotčená: `cron 24 (0 8 * * *)` → `run_send_offer_reminders_cron()` → EF `send-offer-reminders` (`x-internal-token`) → klient se `SUPABASE_SERVICE_ROLE_KEY` → RPC. `service_role` ověřeně funguje a vrací správný 10sloupcový tvar. |
| Reálný provoz reminderů | **Živý, ne nečinný.** Běh 26. 8. 2026 v 08:00 UTC: `{"success":true,"emails_queued":8,"offers_touched":44}`. Že RPC vrací teď 0 řádků, znamená jen to, že je ranní běh spotřeboval. Při příštím běhu vyjde ~3 řádky / 2 uživatelé. |
| Produkční data | **Nezměněna.** Migrace mění pouze granty; žádný e-mail neodeslán, `email_queue` ani `user_partner_offers` nedotčeny. |

**Aplikovaná produkční migrace (26. 8. 2026, schválení Pavla):**
`20260826111549_offer_reminder_rows_internal_only`. `main` = `9509f9b3`.
**Lovable Publish není potřeba — frontend se nemění.** Žádná Edge Function se nenasazovala.

**Poznámka k testování (důležitá pro budoucí práci):** reminder flow existuje **pouze na produkci** —
na stagingu není nasazená EF `send-offer-reminders` ani žádný offer cron job. Staging ověření se proto
dělá replayem DB kroků EF pod `service_role` v transakci s ROLLBACK, nikdy skutečným voláním EF.

**OPEN ISSUE (vědomě neopraveno):** `notify_referral_reward_multi()` je `anon`-grantovaná a čte
`auth.users`, ale `RETURNS trigger` — PostgREST ji jako RPC volat neumí, grant je inertní.
**Otevřené zůstávají nálezy F5–F7** ze zákaznického auditu.

---

## 0. Admin audit RPC (F3) — stav k 26. 8. 2026 (nasazeno do produkce)

Tato sekce je nejnovější a přebíjí vše níže v oblasti admin audit RPC.

| Oblast | Aktuální stav |
|---|---|
| Neguardovaná `get_admin_actions_summary` (audit F3, kritický) | **Opraveno a nasazeno.** Funkce byla `SECURITY DEFINER` bez admin guardu a s `EXECUTE` pro `anon`; joinuje `admin_actions` na `users` a přes `STRING_AGG` sype `u.email` do výstupu. Anonymní volající tak získal reálné admin identity i to, co dělaly a kdy. Reprodukováno na stagingu jako role `anon`. |
| Nový stav | Guard `IF NOT public.is_admin() THEN RAISE 'forbidden' (42501)`, `anon` i `PUBLIC` EXECUTE odebráno, `authenticated` ponecháno. Tělo beze změny (`+100` znaků = jen guard). |
| `get_admin_summary_dashboard` | **Uzavřena stejná díra** (schváleno Pavlem nad rámec F3). Anon-volatelná, bez guardu, čte `payments`/`notifications` joined na `users.email` a `admin_actions`. **Dnes neúnikala jen proto, že padá na pre-existujícím bugu `42803`.** Guard přidán, `anon` odebráno. **Bug `42803` vědomě NEOPRAVEN** — to je změna chování, ne bezpečnostní oprava. |
| Volající v aplikaci | `get_admin_actions_summary` má **nula volajících** (žádné `.rpc()`, EF, DB funkce ani view); `/admin/audit-logs` čte `event_logs`/`users` napřímo. `get_admin_summary_dashboard` má jediného volajícího `src/tests/AdminValidationWorkflows.tsx` (admin-only), který na `42803` selhává už dřív. |
| Drift admin | **Funguje.** Guard `is_admin()` jde přes kanonické `user_roles`, takže produkční drift účet `bc116802-…` (`user_roles.role='admin'`, `users.role='user'`) data dál dostane — ověřeno přímo na produkci. |
| Produkční data | **Nezměněna.** Migrace mění jen definice funkcí a granty; `admin_actions` 37 694 řádků, admin role 3, žádný nový audit řádek. |

**Aplikovaná produkční migrace (26. 8. 2026, schválení Pavla):**
`20260826090136_admin_actions_summary_admin_guard`. `main` = `b6039fcf`.
**Lovable Publish není potřeba — frontend se nemění.** Žádná Edge Function se nenasazovala.

**OPEN ISSUE (vědomě neopraveno):** `test_admin_security_rls()` a `test_audit_logging()` jsou
anon-volatelné a čtou `admin_actions`, ale vydají jen počty (žádné e-maily, žádné detaily akcí).
**OPEN ISSUE (vědomě neopraveno):** `get_due_offer_reminder_rows()` je anon-volatelná a sahá na
e-maily; patří do cron cesty `send-offer-reminders`, ne do admin auditu. Je to poslední zbývající
anon-volatelná nezaguardovaná funkce sahající na e-maily.
**Otevřené zůstávají nálezy F4–F7** ze zákaznického auditu.

---

## 0. Referral kódy (F2) — stav k 26. 8. 2026 (nasazeno do produkce)

Tato sekce je nejnovější a přebíjí vše níže v oblasti `ensure_referral_code`.

| Oblast | Aktuální stav |
|---|---|
| Neguardovaná `ensure_referral_code` (audit F2, kritický) | **Opraveno a nasazeno.** Funkce byla `SECURITY DEFINER` bez ověření volajícího a s `EXECUTE` pro `anon`. Nepřihlášený volající získal referral kód libovolného uživatele podle `user_id` a **vytvořil řádek pro zcela smyšlené UUID**. Obojí reprodukováno na stagingu jako role `anon`. |
| Nový stav funkce | `ensure_referral_code(uuid)` je **guardovaný wrapper** — `auth.uid()` povinné, `p_user_id` mu musí být rovno, jinak `42501`. `anon` EXECUTE odebráno. Signatura **beze změny**, takže frontend se nemění. |
| Zápisová logika | Přesunuta beze změny do `ensure_referral_code_for(uuid)` — **nevolatelná pro `anon` ani `authenticated`**, jen `service_role` a `SECURITY DEFINER` volající (běží pod vlastníkem). |
| `set_my_referrer_by_code` | **Přesměrována na `ensure_referral_code_for`.** Volá ji s `v_referrer` (doporučitel, nikdy `auth.uid()`), takže s guardovaným wrapperem by vyhodila výjimku, kterou závěrečné `EXCEPTION WHEN OTHERS` **tiše spolkne** → `'error'` a rozbitá atribuce. Doloženo kontra-experimentem. Tělo je jinak byte-identické (délka +4 znaky = `_for`). |
| Referral odměny a atribuce | **Beze změny.** `create_referral_reward_from_payment`, `is_self_referral`, `referral_attempts`, RLS i granty `referral_codes` nedotčeny. |
| `/r/:refCode`, `/register?ref=` | **Beze změny** — čistě klientské přesměrování, nevolá žádnou RPC. |
| Produkční data | **Nezměněna.** Před i po: 70 kódů / 2 referrals / 17 rewards, checksum `df195110db420af37dd3d125ab3ee5e2`, 0 orphanů, 0 duplicit. |

**Aplikovaná produkční migrace (26. 8. 2026, schválení Pavla):**
`20260826081556_ensure_referral_code_owner_guard`. `main` = `704c1627`.
**Lovable Publish není potřeba — frontend se nemění.** Žádná Edge Function se nenasazovala.

**OPEN ISSUE (vědomě neopraveno):** `referral_codes.user_id` nemá FK na `auth.users(id)`. S guardem
je FK obrana do hloubky, ne hlavní opatření. Produkce je čistá (0 orphanů) a FK by přijala; **staging
má 643 orphanů z 645** (E2E throwaway účty mazané bez kaskády) a vyžadoval by cleanup.
**OPEN ISSUE (vědomě neopraveno):** `referral_codes` má pro `authenticated` tabulkové granty
`INSERT/UPDATE/DELETE/TRUNCATE`; dnes neškodné (RLS nemá write policy), ale zbytečně široké.
**Otevřené zůstávají nálezy F3–F7** ze zákaznického auditu.

---

## 0. Budoucí výherní pozice — stav k 25. 8. 2026 (nasazeno do produkce)

Tato sekce je nejnovější a přebíjí vše níže v oblasti čtení `bonus_prizes`.

| Oblast | Aktuální stav |
|---|---|
| Únik budoucích výherních pozic (audit F1, kritický) | **Opraveno a nasazeno.** `public.bonus_prizes` už nemá plošné `USING (true)` SELECT policy. Zákazník vidí jen vyřešené ceny (`bonus_prizes_select_resolved`), admin/superadmin vše (`bonus_prizes_select_admin`). Před opravou bylo na produkci odhaleno **165 289** nezískaných pozic ve 2 aktivních soutěžích a soutěž byla deterministicky farmovatelná. |
| Veřejný výpis cen na stránce soutěže | **Přepnuto na `get_contest_bonus_catalogue(uuid)`** — vrací jen *co* lze vyhrát (seskupené kusy + agregáty MioCoinů), nikdy pozici. |
| Výkonová regrese způsobená F1 | **Opraveno a nasazeno.** Nová `is_admin_for_rls()` (SECURITY DEFINER) + policy ve tvaru `USING ((SELECT ...))` → planner vyhodnotí admin větev jako **InitPlan** jednou za statement místo na každý řádek. Agregát nad soutěží se 126 327 řádky: **26 630 ms → 39 ms**. |
| `ContestDetail` a `get_contest_miocoin_bonus` | Stránka RPC už **nevolá**; `miocoin_total` bere z katalogového RPC načteného ve stejném průchodu. Funkce zůstává (jediný volající v repu byl `ContestDetail`, nula DB závislostí) a je nově `SECURITY DEFINER`, takže případný budoucí volající nespadne na timeout ani na `42501`. |
| Vyhodnocení výher, peněženka, ledger | **Beze změny.** `buy_ticket_atomic` i `assign_contest_ticket_atomic` čtou `bonus_prizes` jako SECURITY DEFINER vlastník; zápisové policy, wallets ani ledger se nedotkly. |
| Produkční data | **Nezměněna.** Obě migrace mění pouze policy a definice funkcí; žádný UPDATE/DELETE, žádný backfill. |

**Aplikované produkční migrace (25. 8. 2026, schválení Pavla):**
`20260825141826_bonus_prizes_hide_future_winning_positions`, `20260825150755_bonus_prizes_rls_perf_initplan`.
`main` = `8770817f`. Žádná Edge Function se nenasazovala.

**⏳ Lovable Publish k datu zápisu NEPROBĚHL.** Frontend je připravený a publish je bezpečný v libovolném
pořadí: starý živý build dál volá `get_contest_miocoin_bonus`, která po migraci funguje (definer).

**OPEN ISSUE (vědomě neopraveno):** `buy_ticket_atomic` dál vrací `next_bonus_position` a
`distance_to_next_bonus`, tedy vzdálenost k další výhře. Je to produktové rozhodnutí, ne technická
překážka. Rovněž otevřené zůstávají nálezy **F2–F7** ze zákaznického auditu.

---

## 0a. Provizní systém — stav k 23. 8. 2026 (nasazeno do produkce)

Tato sekce je novější než přehled níže a přebíjí ho v oblasti provizí.

| Oblast | Aktuální stav |
|---|---|
| Influencer provize ze zákaznických plateb | **Opraveno a nasazeno.** Zákaznická větev `calculate_affiliate_commissions_for_month` počítá z `payments.status='completed'` (skutečný stav, který zapisuje `stripe-webhook`). Dřívější filtr `'paid'` neexistoval v datech, takže provize nemohla nikdy vzniknout. Refundace zůstávají vyloučené. |
| Partnerská faktura `issued → paid` | **Doplněno a nasazeno.** Nová RPC `admin_mark_partner_invoice_paid(uuid)` — guard `is_admin()`, `FOR UPDATE`, pouze `issued → paid`, serverový `paid_at=now()`, idempotentní, bez `anon` EXECUTE. Pouze eviduje přijatou platbu; neposílá peníze a nevytváří provizi. |
| Obchodnická provize a opožděná úhrada | **Opraveno a nasazeno.** B2B větev se řídí `pi.paid_at` s kumulativním oknem `<= v_month`, takže pokryje i fakturu uhrazenou po běhu cronu i vynechaný běh. Idempotenci drží `uq_affiliate_commissions_invoice` + `ON CONFLICT DO NOTHING`. |
| Tlačítko „Označit jako zaplaceno" v `/admin/invoices` | **V `main`, ale ZATÍM NENÍ V ŽIVÉM UI** — Lovable Publish neproběhl. Do publishe je nová RPC nasazená, ale nikdo ji nevolá. |
| Produkční data | **Nezměněna.** Checksumy `affiliate_commissions`, `partner_invoices` i provizních sazeb sedí před i po nasazení. Dry-run potvrdil 0 retroaktivních provizí. |
| Sazby, DPH, first-touch, výplatní řetězec | **Beze změny.** Změna se dotkla pouze dvou funkcí; atribuční RPC a celá výplatní vrstva nedotčeny. |

**Aplikované produkční migrace (23. 8. 2026, schválení Pavla):**
`20260823145341_admin_mark_partner_invoice_paid`, `20260823145409_affiliate_commissions_real_payment_state_and_late_invoices`.
Žádná Edge Function se nenasazovala.

**Zbývá k dokončení:** Lovable Publish (zpřístupní tlačítko „Označit jako zaplaceno"). Teprve poté je řetězec
`faktura → uhrazena → obchodnická provize` průchozí i pro reálný provoz.

**OPEN ISSUE (vědomě neopraveno):** staging má na `calculate_affiliate_commissions_for_month`
`anon EXECUTE = true`, produkce správně `false`. Pre-existující drift stagingu (`CREATE OR REPLACE`
granty nemění). Oprava = `REVOKE ALL ON FUNCTION ... FROM anon` pouze na stagingu.


> **Autoritativní aktuální stav. Synchronizováno 18. 8. 2026 podle `origin/main`, GitHubu a read-only produkční kontroly Supabase.**

## 0. Aktuální ověřený provozní stav (18. 8. 2026)

| Oblast | Aktuální stav |
|---|---|
| Desetinné partnerské MioCoiny | **PRODUKCE NASAZENA.** Produkční reward engine používá nejvýše jedno desetinné místo a minimální vydatelnou odměnu 0,5 MC. |
| Shoptet import | **PRODUKCE AKTIVNÍ.** `import-shoptet-orders` je ACTIVE a cron `shoptet_auto_import_1min` běží každou minutu. Import rozlišuje lifecycle a platební osu; `paid` je skutečný platební signál. |
| Zákaznický MioCoin e-mail | **HOTOVO V PRODUKCI.** PR #361 je mergnutý a produkční migrace `partner_reward_customer_email_czech` je evidována. Nové zákaznické e-maily používají českou diakritiku. |
| Automatické uplatnění + Historie MioCoinů | **HOTOVO V PRODUKCI.** PR #362 je mergnutý; produkce má `public.get_my_miocoin_history(integer)` jako `SECURITY DEFINER` s EXECUTE pouze pro `authenticated` a `service_role`. |
| Shoptet partnerský návod | **ZVEŘEJNĚNO V PRODUKCI.** PR #363 je mergnutý; veřejné PDF `public/navody/OneMil-navod-Shoptet.pdf` je dostupné na `https://onemil.cz/navody/OneMil-navod-Shoptet.pdf`, odpovídá souboru na `main` a obsahuje KROK 2.1. |
| Produkční e-mailová fronta | **AKTIVNÍ, SAMOSTATNÝ PROCES.** Cron `process_email_queue_every_10_min` běží každých 10 minut a volá `run_process_email_queue_cron()`; není to Shoptet import. |

### 0.1 Automatické uplatnění MioCoinů z e-mailu + Historie MioCoinů — PRODUKCE NASAZENA

PR #362 (`2f85a026`) je mergnutý do `main` a produkční migrace `customer_miocoin_history` je aplikovaná. E-mailový odkaz s `?miocoin_code=…` na `/profile` automaticky použije jen kanonické `redeem_miocoin_code`, po dokončení vyčistí URL a ruční vložení kódu zůstává funkční. Databázový `FOR UPDATE` a přechod kódu na `activated` zůstávají autoritou proti druhému připsání.

„Historie převodů“ je nahrazena „Historií MioCoinů“. Produkční `get_my_miocoin_history(integer)` čte ledger `wallet_transactions` a historii bonusových převodů; partnerský název, web a číslo objednávky doplňuje jen z partner activation/reward dat. Každý zdroj filtruje `auth.uid()`. Příjmy jsou zelené s `+`, výdaje červené s `−` a hodnoty používají formát s nejvýše jedním desetinným místem.

**OPEN ISSUE — pouze omezení stagingového testu, ne produkční chyba:** poslední scénář „nový zákazník → registrace → potvrzovací e-mail → návrat s MioCoin kódem“ nelze dokončit, dokud staging Supabase Auth vrací `429 over_email_send_rate_limit` (vestavěný SMTP limit 2 e-maily/h). Ostatní relevantní průchody včetně login redirectu, ručního vložení, URL cleanupu, refresh ochrany, izolace historie a desetinných hodnot prošly. Při dřívějším chybně konfigurovaném lokálním testu vznikl produkční Auth účet `49873513-56dc-4eed-8be1-8e122fe34c67`; read-only kontrola 18. 8. potvrzuje, že je stále neověřený. **Nemaže se bez samostatného schválení.**

---

## 0a. MioCoin — pravidlo 1 desetinného místa — PRODUKCE NASAZENA (18. 8. 2026)

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

## 0a0. Shoptet delta import (`updateTimeFrom`) + cron 15 min → 1 min — PRODUKCE NASAZENA (18. 8. 2026)

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
- **Produkční postcheck (18. 8.):** migrace `shoptet_auto_import_1min_prod` je evidována, Edge Function `import-shoptet-orders` je ACTIVE a cron `shoptet_auto_import_1min` má aktivní plán `* * * * *`.
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

## 0a00. Změna Shoptet exportního odkazu — PRODUKČNÍ MIGRACE A MAIN AKTUÁLNÍ (18. 8. 2026)

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
- Produkční historie migrací nyní obsahuje `shoptet_export_url_change_requests`; odpovídající změna je součástí aktuálního `main`. Detailní produkční průchod změny URL nebyl v tomto dokumentačním auditu znovu spouštěn, protože by vyžadoval zápis do Vaultu.

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

## 0a0. Partnerské návody — PRODUKCE ZVEŘEJNĚNA (18. 8. 2026)

Partnerský portál má novou sekci **„Návody“** (`/partner/navody`) a v ní první návod
**„Jak propojit Shoptet s OneMil“** — 6 kroků, každý jako samostatná karta s číslem, krátkým
textem a screenshotem pod příslušnou částí. Obrázky jdou po kliknutí zvětšit. Na stránce je
tlačítko **„Stáhnout PDF návod“**.

- Nové: `src/content/partnerGuides/shoptetGuide.ts` (jediný zdroj obsahu),
  `src/pages/PartnerGuides.tsx`, `scripts/build-partner-guide-pdf.mjs`,
  `public/navody/shoptet/*.png`, `public/navody/OneMil-navod-Shoptet.pdf`,
  spec `tests/e2e/133-partner-guides-shoptet.spec.ts`. Upraveno: `src/App.tsx` (route + položka
  „Návody“ v partnerské hlavičce), `package.json` (`build:partner-guide-pdf`).
- PR #363 přidal KROK 2.1 „Přidejte potřebná pole do exportu“, screenshot dialogu a přesné mapování skupin/polí do hodnot `Exportovat jako` včetně `paid`. Veřejné produkční PDF se shoduje s artefaktem na `main` a tento krok obsahuje.
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
žádná v dotčených souborech. **Zveřejněno v produkci:** veřejné PDF na `onemil.cz` je dostupné jako `application/pdf`, jeho SHA-256 je shodný se souborem na aktuálním `main` a text obsahuje KROK 2.1.

---

## 0a1. Snippet widgetu v partnerském dashboardu — MERGNUTO DO MAIN, PUBLIKOVÁNÍ NAVÁZÁNO NA AKTUÁLNÍ FRONTEND (18. 8. 2026)

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
souborech. Změna je součástí aktuálního `main`; tento audit samostatně neprováděl zápisový partnerský UI průchod.

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

