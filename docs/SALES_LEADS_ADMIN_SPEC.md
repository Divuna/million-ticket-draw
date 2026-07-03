# OneMil — Admin modul „Obchod / Leady" (SALES LEADS ADMIN SPEC)

**Status:** NÁVRH — neimplementováno, žádná migrace, žádný kód, produkce nedotčena
**Vlastník:** Pavel Diviš
**Datum návrhu:** 03. 07. 2026
**Route:** `/admin/sales-leads`
**Oprávnění:** `sales_leads.manage` (nový klíč v existujícím `admin_permissions` systému)

---

## 0. Účel a zásady

Modul „Obchod / Leady" je interní CRM vrstva pro akvizici partnerských firem
(e-shopy, restaurace, čerpací stanice, maloobchod, služby…). Slouží k evidenci
firem, přípravě personalizovaného oslovení (s pomocí AI), ručnímu schválení
a odeslání e-mailu přes Resend, a k evidenci celé historie kontaktu.

Nezaměňovat s existujícím `affiliate_company_leads` (B2B leady od obchodníků/
affiliate — pre-attribuční workflow). Tento modul je **interní outbound
akvizice OneMil**, samostatná tabulka `sales_leads`, žádná vazba na provize,
partnery ani attribution. Konverze leadu na partnera probíhá mimo tento modul
(standardní partner registrace / admin schválení) — modul si pouze zapíše
odkaz `converted_partner_id`.

**Neporušitelné zásady:**
- AI nikdy neodesílá e-maily sama — odeslání vždy potvrdí člověk s oprávněním
  `sales_leads.manage`.
- AI nesmí tvrdit neschválené partnerství ani slibovat neschválené ceny.
- Modul se NIKDY nedotýká: peněženek, plateb, soutěžní logiky, ticketů,
  výher, `buy_ticket_atomic`, RLS ostatních tabulek, produkčních dat mimo
  vlastní `sales_leads*` tabulky.
- Každá změna stavu leadu má auditní stopu.

**Model oprávnění (rozhodnutí Pavla, 03. 07. 2026):**
- `sales_leads.manage` = **plný přístup k celému modulu**. Kdo klíč má, může
  v modulu Obchod / Leady dělat vše: přidávat firmy, editovat, spouštět AI
  research, generovat návrh e-mailu, schvalovat **a odesílat** e-mail přes
  Resend, měnit stavy, spravovat suppression list.
- **Žádné druhé schvalování superadminem.** Uvnitř modulu není žádný krok,
  který by navíc vyžadoval superadmina.
- **Superadmin** má roli výhradně na úrovni oprávnění: v `/admin/admins`
  klíč `sales_leads.manage` přiděluje nebo odebírá (implicitně vidí vše).
- AI zůstává i pro držitele klíče jen asistent — nikdy nemá cestu k odeslání.

---

## 1. Stránka v adminu

- **Route:** `/admin/sales-leads`, uvnitř `AdminLayout`.
- **Guard:** `RequirePermission("sales_leads.manage")` (stejný vzor jako
  `/admin/partner-offers`). Superadmin implicitně projde; subadmin jen
  s grantnutým klíčem. Bez klíče: fallback „Tato část je dostupná pouze
  superadminovi nebo administrátorovi s oprávněním." Nav položka se bez
  klíče vůbec nezobrazí.
- **Nav:** položka „Obchod" v admin primární navigaci (ikona `Briefcase`),
  pro subadminy přes `SUBADMIN_ENTRY_ROUTES`. Volitelný červený badge
  s počtem leadů ve stavu `schvaleni_ceka` (návrhy e-mailů čekající na
  schválení člověkem) — stejný vzor jako badge u Partnerů.
- **Layout stránky (shora dolů):**
  1. Hlavička: nadpis „Obchod / Leady", tlačítko `+ Přidat firmu`,
     tlačítko `Import CSV` (volitelná fáze 2).
  2. Souhrnné karty: Celkem leadů · K oslovení · Čeká na schválení e-mailu ·
     Osloveno · Odpovědělo · Konvertováno · Nekontaktovat.
  3. Záložky (viz §2) + vyhledávání (název, IČO, e-mail, doména) + filtry
     (stav, obor, zdroj, přiřazený admin, datum posledního kontaktu).
  4. Tabulka leadů: Název firmy · Obor · Město · Stav (badge) · Poslední
     aktivita · Přiřazeno · Akce (Detail).
  5. Klik na řádek → detail firmy (drawer/samostatná podstránka
     `/admin/sales-leads/:id`).

---

## 2. Záložky

| Záložka | Filtr | Obsah |
|---|---|---|
| **Vše** | bez filtru | kompletní seznam |
| **Nové** | `novy` | čerstvě přidané, bez přípravy |
| **Příprava** | `priprava`, `schvaleni_ceka` | probíhá research / návrh e-mailu čeká na schválení |
| **Osloveno** | `osloveno`, `follow_up` | e-mail odeslán, čeká se na reakci |
| **Jednání** | `odpovedel`, `jednani` | firma reagovala, probíhá komunikace |
| **Konvertováno** | `konvertovan` | firma se stala partnerem |
| **Nekontaktovat** | `nekontaktovat`, `odmitl` | blocklist + odmítnutí |
| **Archiv** | `archivovan` | neaktivní / mrtvé leady |

---

## 3. Pole leadu (tabulka `sales_leads`)

**Identifikace firmy:**
- `id` uuid PK
- `company_name` text NOT NULL
- `ico` text nullable (8 číslic, validace)
- `dic` text nullable
- `website` text nullable (https:// only)
- `website_domain` text — generovaný/normalizovaný sloupec z `website` (dedup)
- `industry` text nullable (číselník: e-shop, restaurace, čerpací stanice,
  maloobchod, služby, jiné)
- `city` text nullable
- `company_size` text nullable (mikro/malá/střední/velká — odhad)

**Kontakt:**
- `contact_person` text nullable
- `contact_role` text nullable (jednatel, marketing, e-commerce manager…)
- `contact_email` text nullable — **normalizovaný lowercase**, unikátní index
  (viz §9)
- `contact_phone` text nullable
- `email_source` text nullable (odkud e-mail pochází: web firmy, veřejný
  rejstřík, AI research, ručně) — povinné před odesláním
- `email_verified_by_admin` boolean default false — admin potvrdil, že
  e-mail je veřejně dostupný firemní kontakt (GDPR hygiena)

**Workflow:**
- `status` text NOT NULL default `'novy'` (CHECK constraint, viz §4)
- `assigned_admin_id` uuid nullable → auth.users
- `priority` smallint default 0 (0 běžná, 1 vysoká)
- `next_action_at` timestamptz nullable (plánovaný follow-up)
- `do_not_contact` boolean default false + `do_not_contact_reason` text
- `converted_partner_id` uuid nullable → partners(id), ON DELETE SET NULL

**AI / e-mail příprava:**
- `ai_research_summary` text nullable (výstup AI researche, viz §6)
- `ai_research_at` timestamptz nullable
- `draft_email_subject` text nullable
- `draft_email_body` text nullable
- `draft_prepared_by` text nullable (`'ai'` | `'admin'`)
- `draft_approved_by` uuid nullable, `draft_approved_at` timestamptz nullable

**Meta:**
- `source` text (ručně, CSV import, AI vyhledávání, doporučení)
- `notes` text nullable (interní poznámky)
- `created_by` uuid NOT NULL, `created_at`, `updated_at`

**Doplňkové tabulky:**
- `sales_lead_activities` — historie kontaktu (viz §11): `id, lead_id FK,
  activity_type, direction, subject, body_snapshot, email_message_id,
  performed_by, created_at, metadata jsonb`
- `sales_lead_status_history` — audit stavů: `id, lead_id, old_status,
  new_status, changed_by, reason, created_at`
- `sales_lead_email_suppression` — globální blocklist e-mailů/domén
  (viz §12)

---

## 4. Stavy leadu

```
novy → priprava → schvaleni_ceka → osloveno → follow_up → odpovedel → jednani → konvertovan
                        ↓ (zamítnuto adminem)                  ↓
                     priprava                              odmitl
kterýkoli stav → nekontaktovat (jednosměrné, jen superadmin může vrátit)
kterýkoli stav (mimo konvertovan) → archivovan
```

| Stav | Význam |
|---|---|
| `novy` | přidán, žádná akce |
| `priprava` | probíhá research / píše se návrh e-mailu |
| `schvaleni_ceka` | AI/admin návrh e-mailu čeká na ruční schválení člověkem |
| `osloveno` | první e-mail odeslán |
| `follow_up` | odeslán navazující e-mail / naplánován |
| `odpovedel` | firma reagovala |
| `jednani` | aktivní obchodní komunikace |
| `konvertovan` | firma je partner (finální, needitovatelný mimo poznámky) |
| `odmitl` | firma odmítla (finální; reaktivace jen vědomě, min. po 6 měsících) |
| `nekontaktovat` | blocklist — žádné další oslovení (viz §12) |
| `archivovan` | neaktivní |

**Pravidla přechodů:** vynucená v UI i v SECURITY DEFINER RPC
`sales_lead_set_status(p_lead_id, p_new_status, p_reason)` — guard na
povolené přechody + interní check `has_admin_permission('sales_leads.manage')
OR is_superadmin()` + zápis do `sales_lead_status_history`. Přímý UPDATE
`status` klientem RLS nepovolí (write jen přes RPC — stejný vzor jako partner
reward tabulky: SELECT policy ano, write přes RPC/service_role).

---

## 5. Detail firmy

Podstránka `/admin/sales-leads/:id` (nebo široký drawer), sekce:

1. **Hlavička:** název, stav badge, priorita, přiřazený admin, tlačítka
   akcí podle stavu (Připravit e-mail / Schválit a odeslat / Označit
   odpověď / Nekontaktovat / Archivovat).
2. **Firma:** všechna identifikační pole, editovatelná inline (audit do
   activities jako `field_updated`).
3. **Kontakt:** kontaktní osoba, e-mail (+ badge zdroje a `ověřeno`),
   telefon. E-mail bez `email_source` a `email_verified_by_admin=true`
   blokuje odeslání.
4. **AI research:** panel s `ai_research_summary` + tlačítko
   `Spustit AI research` (viz §6). Zobrazuje datum a disclaimer
   „Výstup AI — ověřte před použitím."
5. **Návrh e-mailu:** editor subject + body, badge `Připravil: AI/admin`,
   tlačítka `Vygenerovat návrh (AI)`, `Uložit koncept`,
   `Odeslat ke schválení`. Po schválení read-only snapshot.
6. **Historie kontaktu:** chronologická timeline z `sales_lead_activities`
   (e-maily odeslané/přijaté, změny stavu, poznámky, AI research runy).
7. **Poznámky:** volný text + rychlé přidání poznámky do timeline.
8. **Nebezpečná zóna:** `Označit Nekontaktovat` (s povinným důvodem),
   `Archivovat`. Žádné mazání leadů — jen archivace (audit trail).

---

## 6. AI vyhledávání kontaktů (research)

**Princip: AI je jen asistent pro rešerši, nikdy nejedná navenek.**

- Tlačítko `Spustit AI research` volá novou Edge Function
  `sales-lead-research` (admin JWT guard + server-side check
  `has_admin_permission('sales_leads.manage')`; superadmin projde vždy).
- EF vezme `company_name`, `website`, `ico` a přes AI (stejný OpenAI klíč
  jako `ai-chat`, ale samostatný prompt) + veřejné zdroje připraví:
  - shrnutí firmy (co dělá, velikost, sortiment),
  - návrh, proč by pro ni OneMil dával smysl (personalizační háček),
  - kandidátní veřejné kontakty (e-mail/telefon z webu firmy) — vždy
    označené jako **neověřené**.
- Výstup se uloží do `ai_research_summary` + activity `ai_research`.
  **Nikdy se automaticky nepropíše do `contact_email`** — admin musí
  kontakt ručně převzít, vyplnit `email_source` a zaškrtnout
  `email_verified_by_admin`.
- Systémový prompt EF obsahuje tvrdé zákazy: nevymýšlet kontakty,
  neuvádět partnerství, nezmiňovat ceny mimo schválený ceník (1 Kč bez
  DPH / využitý MioCoin dle knowledge base — jediná povolená cenová
  informace), žádné casino/hazard/loterie wording.
- Rate limit: max N research runů / lead / den (např. 3) — guard v EF.

## 7. Příprava e-mailu

- Tlačítko `Vygenerovat návrh (AI)` volá EF `sales-lead-draft-email`
  (stejný guard jako research). Vstup: data leadu + `ai_research_summary`
  + **schválená e-mailová šablona** (uložená v `settings` nebo v kódu EF,
  spravuje ji Pavel).
- AI smí pouze personalizovat schválenou kostru: oslovení, odstavec
  „proč OneMil pro vaši firmu", podpis. **Nesmí** měnit: cenový model,
  právní tvrzení, odkazy, odesílatele.
- Návrh se uloží do `draft_email_subject/body`, `draft_prepared_by='ai'`,
  stav → `schvaleni_ceka`. Admin může návrh libovolně editovat
  (`draft_prepared_by='admin'` po editaci).
- Povinné prvky každého e-mailu (validace před odesláním):
  odesílatel `b2b@onemil.cz` (obchodní kontakt dle COMPANY_CONTEXT),
  identifikace OneMil / Iconic Point s.r.o., odhlašovací věta
  („Pokud si nepřejete být kontaktováni, odpovězte NEKONTAKTOVAT…"),
  žádné zakázané wording (casino/hazard/loterie/jackpot…) — kontrola
  jednoduchým denylistem v EF i UI.

## 8. Schvalování a odeslání (jednoúrovňové, člověkem)

**Rozhodnutí Pavla: žádné druhé schvalování superadminem. Odeslání potvrdí
kdokoli s oprávněním `sales_leads.manage`.**

- Odeslat lze **jen** ze stavu `schvaleni_ceka` a jen tlačítkem
  `Schválit a odeslat` v detailu.
- Schvalovací dialog (pojistka proti omylu, ne druhá role) zobrazí:
  finální subject + body (read-only preview), příjemce, odesílatele,
  checklist: ☑ e-mail je veřejný firemní kontakt, ☑ obsah netvrdí
  partnerství, ☑ ceny odpovídají schválenému ceníku. Všechny checkboxy
  povinné.
- Potvrzení zavolá EF `send-sales-lead-email`:
  1. server-side re-check oprávnění (`has_admin_permission('sales_leads.
     manage') OR is_superadmin()`),
  2. re-check stavu `schvaleni_ceka`,
  3. re-check `do_not_contact=false` + suppression list (§12),
  4. re-check cooldownu a limitů (§10),
  5. zápis `draft_approved_by/at` (= člověk, který odeslal),
  6. enqueue do existující `email_queue` (viz §13),
  7. stav → `osloveno`, activity `email_sent` se snapshotem obsahu.
- **AI nemá žádnou cestu k tomuto tlačítku ani k EF `send-sales-lead-email`
  bez lidského kliknutí a čerstvého admin JWT.** EF `sales-lead-research`
  a `sales-lead-draft-email` nikdy neenqueují do `email_queue`.

## 9. Zabránění duplicitám

- **DB unikátní indexy (case-insensitive, partial, mimo archiv):**
  - `lower(contact_email)` WHERE contact_email IS NOT NULL AND status
    <> 'archivovan'
  - `ico` WHERE ico IS NOT NULL AND status <> 'archivovan'
  - `website_domain` WHERE website_domain IS NOT NULL AND status
    <> 'archivovan'
- **UI kontrola při přidání firmy:** live lookup podle IČO / e-mailu /
  domény; při shodě zobrazit existující lead s odkazem místo vytvoření.
- **Křížová kontrola proti `partners`:** při přidání i před odesláním
  e-mailu check, zda doména/IČO/e-mail už nepatří existujícímu partnerovi
  → warning „Firma už je partner" a blokace oslovení.
- CSV import (fáze 2): dedup report — kolik řádků přeskočeno a proč.

## 10. Zabránění spamu

- **Cooldown per lead:** další e-mail stejnému leadu nejdřív X dní po
  posledním odeslání (návrh: 14 dní, `settings.sales_leads_email_cooldown_days`).
  Vynuceno v EF, ne jen v UI.
- **Denní limit:** max Y odeslaných obchodních e-mailů / den celkem
  (návrh: 20; `settings.sales_leads_daily_send_limit`). EF počítá
  z activities `email_sent` za posledních 24 h.
- **Max počet oslovení per lead:** návrh 3 (první + 2 follow-upy); poté
  automaticky `archivovan`, další kontakt jen vědomou reaktivací.
- **Žádné hromadné odesílání:** UI záměrně nemá „Odeslat všem" — vždy
  1 lead = 1 lidské schválení = 1 e-mail.
- Odpověď „NEKONTAKTOVAT" → admin ručně nastaví `nekontaktovat` +
  suppression (§12). (Automatické zpracování příchozích odpovědí je mimo
  rozsah v1.)

## 11. Historie kontaktu

- Vše v `sales_lead_activities` (append-only; RLS: SELECT pro držitele
  oprávnění + superadmina, INSERT jen přes RPC/EF, žádný UPDATE/DELETE).
- Typy: `lead_created`, `field_updated`, `ai_research`, `draft_created`,
  `draft_edited`, `draft_approved`, `email_sent`, `email_failed`,
  `reply_received` (ručně zaznamenaná odpověď), `call_logged`,
  `note_added`, `status_changed`, `do_not_contact_set`, `converted`.
- `email_sent` ukládá plný snapshot subject+body+recipient a
  `email_queue` id — i kdyby se šablona později změnila, historie ukazuje,
  co přesně firma dostala.
- Timeline v detailu; export historie leadu do CSV (fáze 2).

## 12. Firmy, které nechceme kontaktovat

- Stav `nekontaktovat` + povinný důvod (`do_not_contact_reason`),
  jednosměrný — vrátit smí jen superadmin (auditovaná akce).
- Globální **suppression list** `sales_lead_email_suppression`
  (`email_pattern` — přesný e-mail nebo `@domena.cz`, `reason`,
  `created_by`, `created_at`): blokuje odeslání i pro budoucí nové leady
  se stejným e-mailem/doménou. Kontrola v EF `send-sales-lead-email`
  je **poslední bariéra** — i schválený e-mail na suppressed adresu se
  neodešle a zapíše `email_failed (suppressed)`.
- Leady se nemažou — `nekontaktovat` musí zůstat viditelné, aby firma
  nebyla omylem přidána a oslovena znovu (dedup index záměrně
  nevynechává `nekontaktovat`).

## 13. Napojení na Resend

- **Žádná přímá integrace Resend v tomto modulu.** Použije se existující
  ověřená pipeline: EF `send-sales-lead-email` vloží řádek do
  `email_queue` → pg_cron job 16 `process_email_queue_every_10_min` →
  EF `process-email-queue` → Resend. Modul tedy nedrží žádný Resend klíč.
- Odesílatel: `b2b@onemil.cz` (obchodní), reply-to `b2b@onemil.cz`.
- Stav doručení: `email_queue.status` (pending/sent/failed) se zrcadlí
  do activity v UI přes read lookup; žádný nový webhook v v1.
- `process-email-queue` se NEMĚNÍ (invariant `verify_jwt=false` kvůli
  cron jobu zůstává).

## 14. Nové oprávnění pro adminy

- Nový klíč **`sales_leads.manage`**, label **„Obchodní leady"**.
- **Model přístupu (rozhodnutí Pavla):** jediná úroveň. Kdo klíč má, dělá
  v modulu vše (příprava + schválení + odeslání). Bez klíče modul nevidí.
  Superadmin implicitně vše; jinak jen přiděluje/odebírá klíč. Žádné
  druhé schvalování superadminem uvnitř modulu.
- Frontend změny (vzor Phase 4 Slice A, vše aditivní):
  - `useAdminPermissions.ts`: přidat do `ADMIN_PERMISSION_KEYS`,
    `ADMIN_PERMISSION_LABELS`, `ADMIN_ROUTE_PERMISSION
    ['/admin/sales-leads']`, `SUBADMIN_ENTRY_ROUTES` (label „Obchod").
  - `App.tsx`: route `/admin/sales-leads` (+ `/:id`) přes
    `RequirePermission("sales_leads.manage")`.
  - `AdminPrimaryNav.tsx`: ikona `Briefcase`.
  - Grant UI v `/admin/admins` se objeví automaticky (iteruje
    `ADMIN_PERMISSION_KEYS`) — grant/revoke se audituje přes existující
    `log_admin_action` (`admin_permission_granted/revoked`).
- Backend vynucení (defense-in-depth, nejen UI):
  - RLS na `sales_leads*`: SELECT
    `has_admin_permission('sales_leads.manage') OR is_superadmin()`;
    write pouze přes SECURITY DEFINER RPC se stejným interním guardem.
  - Edge Functions (`sales-lead-research`, `sales-lead-draft-email`,
    `send-sales-lead-email`): JWT → `auth.getUser` →
    `has_admin_permission('sales_leads.manage')` / superadmin. Jinak 403.
- Subadmin s klíčem: plný přístup k modulu (vidí, edituje, připravuje,
  schvaluje, **odesílá** — v rámci limitů §10). Bez klíče: nevidí nav,
  route fallback, RLS vrátí 0 řádků, EF vrátí 403.

---

## 15. Bezpečnostní shrnutí

1. E-mail odejde výhradně: lidský klik `Schválit a odeslat` → schvalovací
   checklist → EF server-side re-check (oprávnění, stav, suppression,
   cooldown, limit) → `email_queue`. AI nemá žádnou cestu k odeslání.
2. AI výstupy jsou vždy jen návrh uložený do DB; obsahová bariéra =
   schválená šablona + denylist zakázaných tvrzení (partnerství, ceny,
   hazard wording) v EF promptu i validaci.
3. Audit: `sales_lead_status_history` (stavy), `sales_lead_activities`
   (vše ostatní, append-only), `log_admin_action` (granty oprávnění).
4. Izolace: modul čte/píše jen `sales_leads*` tabulky + `email_queue`
   insert přes EF. Žádný dotyk wallets/payments/tickets/contests/winners
   /RLS ostatních tabulek.
5. Žádné mazání dat — jen archivace a suppression.
6. Oprávnění jednoúrovňové: `sales_leads.manage` = plný modul; superadmin
   jen přiděluje/odebírá klíč.

## 16. Fázování implementace (návrh)

- **Fáze 1 (DB, staging only):** tabulky `sales_leads`,
  `sales_lead_activities`, `sales_lead_status_history`,
  `sales_lead_email_suppression` + RLS + RPC `sales_lead_set_status` +
  dedup indexy. Migrace jako soubor, aplikace jen po schválení Pavla.
- **Fáze 2 (frontend):** stránka, záložky, detail, ruční workflow (bez AI),
  oprávnění `sales_leads.manage`.
- **Fáze 3 (e-mail):** EF `send-sales-lead-email` + schvalovací flow +
  suppression + limity; testovací příjemce výhradně `eshop@onemil.cz`.
- **Fáze 4 (AI):** EF `sales-lead-research` + `sales-lead-draft-email`.
- Každá fáze: staging-first, E2E spec, produkce jen s výslovným
  schválením Pavla + backup.
