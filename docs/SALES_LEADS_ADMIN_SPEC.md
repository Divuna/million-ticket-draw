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

> **Pozn. k terminologii:** původní bod „Fáze 4 (AI)" výše popisoval AI
> research/draft, které byly nakonec dodány ve **Fázi 3B** (produkčně hotové).
> „**Fáze 4**" v §17 níže je **nová, samostatná** vrstva: automatické
> navrhování a třídění nových firemních leadů. Nepřečíslovávat hotové fáze.

---

## 17. Fáze 4 (NÁVRH) — automatické vyhledávání a třídění nových leadů

**Status: DOKUMENTAČNÍ NÁVRH. Neimplementováno. Žádná migrace, žádný kód,
žádný deploy.** Fáze 4 rozšiřuje modul o vrstvu, která umí **navrhnout** nové
firmy k oslovení, **zařadit je do skupin**, **dohledat veřejné kontakty** a
**připravit lead do kontroly člověkem**. Navazuje na hotové Fáze 1–3C.

### 17.0 Neporušitelný princip
- **AI smí pouze navrhnout** firmu, provést rešerši a připravit koncept.
- **AI NIKDY sama neposílá e-mail** a **NIKDY sama nepovyšuje** lead do
  oslovovacího stavu. Každý navržený lead prochází **ruční kontrolou a
  schválením člověkem** s `sales_leads.manage`, než se s ním dál pracuje.
- Odeslání e-mailu zůstává výhradně ruční přes člověka (Fáze 3C) — Fáze 4
  na tom nic nemění.

### 17.1 Nový stav a workflow napojení
- Nový vstupní stav **`navrzeny`** (AI/automat navrhl firmu, čeká na lidskou
  kontrolu). Zařadí se **před** stávající `novy`.
- Povolené přechody (rozšíření §4, vynucené v RPC `sales_lead_set_status`):
  - `navrzeny → novy` — člověk lead **schválil** k dalšímu zpracování.
  - `navrzeny → nekontaktovat` — člověk lead **zamítl** (blocklist, s důvodem).
  - `navrzeny → archivovan` — člověk lead **odložil** (nevhodný, ne blocklist).
- **Z `navrzeny` NELZE** přejít rovnou do `schvaleni_ceka`/`osloveno` —
  lidská kontrola je povinná brána. AI nemá přístup k `sales_lead_set_status`.

### 17.2 Skupiny leadů (kategorie / segmenty)
- Nový sloupec `sales_leads.lead_group text` (číselník, nezávislý na `industry`).
  `industry` zůstává detailní obor firmy; `lead_group` je hrubá marketingová
  skupina pro cílení a filtrování.
- Výchozí číselník skupin (rozšiřitelný, needitovat bez schválení):
  - `e-shopy` — internetové obchody obecně
  - `auto-moto` — autodíly, pneu, moto, autoservisy, příslušenství
  - `luxusni-zbozi` — hodinky, šperky, prémiová móda, doplňky
  - `sport` — sportovní vybavení, fitness, outdoor
  - `cestovani` — cestovky, ubytování, zážitky, doplňky na cesty
  - `gastronomie` — restaurace, kavárny, delikatesy, nápoje
  - `lokalni-sluzby` — kadeřnictví, wellness, řemesla, lokální provozovny
  - `jine` — mimo výše uvedené
- Skupina je **návrh AI**, ale **potvrzuje/mění ji člověk** při kontrole.
- UI: nová záložka/filtr „Skupina" na `/admin/sales-leads` a select v detailu.

### 17.3 Ukládané údaje o firmě (rozšíření §3)
Fáze 4 využívá stávající pole a přidává:
- `lead_group` — marketingová skupina (§17.2).
- `lead_quality` smallint — hodnocení kvality leadu 0–3 (§17.5).
- `discovery_source` text — odkud firma pochází (§17.6): např.
  `ai_navrh`, `verejny_rejstrik`, `shoptet_katalog`, `web_katalog`,
  `doporuceni`, `rucne`.
- `discovery_meta jsonb` — strukturovaný kontext nálezu (název zdroje, URL
  katalogu, timestamp, model, skóre), **bez** tajemství a **bez** neveřejných
  osobních dat.
- Kontakty (`contact_email`, `contact_phone`) plní člověk / AI research jen
  z **veřejně dostupných** zdrojů; **AI je nikdy nevyplní automaticky do
  odesílacích polí** — zůstávají „neověřené", dokud je člověk nepotvrdí
  (`email_verified_by_admin`, §3).
- Žádné nové osobní údaje nad rámec veřejného firemního kontaktu.

### 17.4 Kontrola duplicity (rozšíření §9)
- Automat/AI **před vytvořením** `navrzeny` leadu ověří dedup přes stávající
  unikátní indexy (`lower(contact_email)`, `ico`, `website_domain`, mimo
  `archivovan`) — shodu **nevytvoří znovu**, jen ji zaznamená do
  `discovery_meta` existujícího leadu (activity `field_updated`/nová activity
  `rediscovered`).
- Křížová kontrola proti `partners` (už je partner) a proti
  `sales_lead_email_suppression` (blocklist) — shoda ⇒ lead se **nenavrhne**.
- Dedup indexy záměrně nevynechávají `nekontaktovat` — jednou zamítnutá firma
  se znovu nenavrhne.

### 17.5 Kvalita leadu (`lead_quality`)
- Škála 0–3: `0` neohodnoceno · `1` nízká · `2` střední · `3` vysoká.
- **AI navrhne skóre** (heuristika: existuje veřejný e-shop, velikost/aktivita,
  soulad se skupinou, dostupnost veřejného kontaktu) → uloží do `lead_quality`
  a zdůvodnění do `discovery_meta`.
- **Člověk skóre potvrdí/přepíše** při kontrole. Skóre je jen pomůcka pro
  třídění a prioritizaci, nikdy neautomatizuje oslovení.
- UI: badge kvality v seznamu + filtr; řazení podle kvality.

### 17.6 Zdroj informace (`discovery_source` + `discovery_meta`)
- Každý navržený lead **musí** mít vyplněný `discovery_source` a co nejúplnější
  `discovery_meta` (odkud, kdy, čím) — kvůli auditovatelnosti a GDPR hygieně.
- Ukládají se jen **veřejné** zdroje. Žádné scraping-em získané neveřejné
  osobní údaje, žádné nakoupené databáze bez právního základu (rozhodne Pavel).
- Zdroj se zapisuje i do `sales_lead_activities` (nová activity `lead_discovered`).

### 17.7 Zabránění nechtěnému oslovování (rozšíření §10, §12)
- Automat/AI **nikdy** nevytvoří lead ve stavu, ze kterého by šlo odeslat
  e-mail — vždy jen `navrzeny`.
- Před návrhem se kontroluje **suppression list** i stav `nekontaktovat`/
  `odmitl`/existující partner ⇒ firma se nenavrhne.
- Limity návrhu (nové `settings`, konfiguruje Pavel): max počet nových návrhů
  za den, max na skupinu — proti zahlcení fronty ke kontrole.
- Cooldown/limit **odeslání** zůstává beze změny (Fáze 3, člověk).

### 17.8 Lidské schválení návrhu (povinná brána)
- Nová záložka **„Návrhy"** na `/admin/sales-leads` (leady ve stavu `navrzeny`).
- Člověk u návrhu: zkontroluje údaje, skupinu, kvalitu, zdroj a veřejný kontakt,
  pak **Schválit** (`navrzeny → novy`) / **Zamítnout** (`→ nekontaktovat`) /
  **Odložit** (`→ archivovan`). Vše přes existující `sales_lead_set_status`
  (rozšířené přechody) s auditem do `sales_lead_status_history`.
- Teprve schválený lead (`novy`+) může projít standardním flow Fáze 3
  (research → koncept → **ruční odeslání člověkem**).

#### 17.8.1 Fáze 5B — bezpečné dohledání kontaktu (implementováno jako soubory)
- **Neověřený návrh kontaktu je oddělený od odesílacího `contact_email`.**
  Sloupce na `sales_leads`: `proposed_contact_email`, `proposed_contact_source_url`
  (URL, odkud byl e-mail nalezen), `proposed_contact_at`, `proposed_contact_by`
  (`ai`/`admin`), `proposed_contact_status` (`neovereny`/`overeny`/`zamitnuty`).
- **EF `sales-lead-enrich-contact`** (auth `sales_leads.manage`): AI dohledá jen
  **veřejně uvedený** firemní e-mail + zdrojovou URL. Když si není jistá nebo
  chybí zdroj → `found:false`, NIC neuloží. **AI e-mail nikdy nevymýšlí.**
- **RPC `sales_lead_propose_contact`** (service_role): uloží návrh jako
  `neovereny`. **Nikdy** nemění `contact_email`/`email_verified_by_admin` ani
  stav leadu; loguje `contact_proposed`.
- **RPC `sales_lead_review_contact`** (guard `sales_leads.manage`): člověk
  **Schválí** → teprve TEĎ se vyplní `contact_email` + `email_verified_by_admin=true`
  (activity `contact_approved`), nebo **Zamítne** (`contact_rejected`,
  `contact_email` beze změny). Nikdy neodesílá e-mail, nikdy nemění stav leadu.
- **UI (detail leadu):** sekce „Kontaktní e-mail" — „Dohledat e-mail", panel
  „Navržený e-mail" + zdroj + „Schválit e-mail"/„Zamítnout e-mail".

#### 17.8.2 Fáze 5C — automatický discovery vyžaduje veřejný e-mail (implementováno jako soubory)
- **Tvrdá bariéra:** tlačítko „Najít nové firmy" (EF `sales-lead-discover`)
  nesmí vytvořit lead bez veřejně dohledaného kontaktního e-mailu. AI v jednom
  volání vrátí i `email` + `email_source_url` + `email_confidence` per firma,
  dle stejných přísných pravidel jako `sales-lead-enrich-contact` (nikdy
  nevymýšlet, jen z veřejného webu/kontaktní stránky firmy).
- **Firma BEZ platného e-mailu + zdroje** (chybí, neplatný formát, nebo
  `email_confidence:"low"`): RPC se pro ni **vůbec nezavolá** — žádný lead
  nevznikne. Výsledek se zapíše jen do odpovědi EF jako
  `outcome:"skipped", reason:"missing_public_email"`.
- **Firma S veřejným e-mailem — ATOMICKÁ operace (oprava kritické chyby):**
  lead (`navrzeny`) i navržený e-mail se vytvoří **v jednom volání** RPC
  `sales_lead_propose_with_contact` (jeden INSERT se sloupci
  `proposed_contact_email`/`_source_url`/`proposed_contact_status='neovereny'`
  vyplněnými rovnou). **Původní návrh dvou oddělených kroků
  (`sales_lead_propose` → `sales_lead_propose_contact`) byl opraven** — kdyby
  druhý krok selhal, zůstal by lead bez navrženého e-mailu, což porušuje
  pravidlo „kontakty bez e-mailu se vůbec nemají ukládat". Nová RPC to
  vylučuje: pokud validace e-mailu selže, INSERT se vůbec neprovede a lead
  nevznikne; pokud projde, INSERT vloží lead i návrh e-mailu najednou.
  `contact_email` a `email_verified_by_admin` zůstávají beze změny (null/false).
  Zachovává dedup (IČO/doména), partner blokaci a suppression z Fáze 5A.
  Původní `sales_lead_propose` (bez kontaktu) a `sales_lead_propose_contact`
  (samostatné doplnění návrhu) zůstávají beze změny — jen `sales-lead-discover`
  je přepnutá na volání pouze nové atomické RPC.
- **Člověk musí i tak ručně kliknout „Schválit e-mail"** v detailu leadu
  (Fáze 5B) — automatický discovery e-mail nikdy sám neschvaluje ani
  nevyplňuje odesílací kontakt.
- **UI (`DiscoverLeadsDialog.tsx`):** text jasně říká „Uloží se jen firmy
  s dohledaným veřejným e-mailem."; výsledek běhu ukazuje počet vytvořených
  firem, celkový počet přeskočených a zvlášť počet přeskočených kvůli
  chybějícímu veřejnému e-mailu (`skipped_missing_email`).
- **Migrace `20260704160000_sales_leads_phase5c_propose_with_contact_rpc.sql`**
  přidává jen novou RPC `sales_lead_propose_with_contact` (EXECUTE jen
  `service_role`); nemění schéma tabulek ani stávající RPC z Fáze 5A/5B.

#### 17.8.3 Fáze 5D — tvrdé ověření zdrojové stránky (oprava mezery z Fáze 5C, implementováno jako soubory)
- **Problém, který Fáze 5D opravuje:** Fáze 5C vyžadovala, aby AI u každé
  firmy vrátila `email` + `email_source_url`, ale **jen důvěřovala tvrzení
  AI**, že e-mail na uvedené URL skutečně je. AI si mohla zdrojovou URL
  vymyslet nebo se v ní splést — lead by tak mohl vzniknout s e-mailem,
  který na uvedené stránce vůbec nebyl.
- **Řešení:** EF `sales-lead-discover` PŘED voláním RPC
  `sales_lead_propose_with_contact` sama STÁHNE `email_source_url` a ověří,
  že navržený e-mail se skutečně nachází v obsahu stránky. Teprve po
  úspěšném ověření se lead uloží.
- **Bezpečnost stahování (SSRF ochrana):** povoleny jen `http://`/`https://`;
  odmítnuty URL s přihlašovacími údaji; odmítnuty loopback/private/link-local
  adresy (`127.x`, `10.x`, `172.16–31.x`, `192.168.x`, `169.254.x`,
  `localhost`, `0.0.0.0`, IPv6 loopback/link-local); krátký timeout (8 s);
  limit velikosti stažené stránky (2 MB) proti zahlcení.
- **Porovnání e-mailu:** case-insensitive; HTML entity (`&amp;`, `&#64;`,
  `&#46;`, `&nbsp;`) a HTML tagy se před porovnáním odstraní/normalizují,
  aby prošel i běžně formátovaný text — ale e-mail nesmí být uhodnutý,
  jen skutečně nalezený v obsahu stránky.
- **Nové výsledky (bez vytvoření leadu):**
  - `outcome:"skipped", reason:"invalid_email_source_url"` — URL není
    bezpečná/platná (nedodrží `http/https`, míří na lokální/privátní adresu,
    nebo je nesyntakticky validní).
  - `outcome:"skipped", reason:"email_not_found_on_source_page"` — stažení
    stránky selhalo (timeout, síť, non-2xx) NEBO e-mail v obsahu stránky
    není.
  - `outcome:"skipped", reason:"missing_public_email"` zůstává beze změny
    pro případ, že AI e-mail/zdroj vůbec nevrátila (Fáze 5C).
- **Beze změny:** žádný auto-send, žádný Resend, žádný zápis do
  `email_queue`, žádné auto-schválení; `contact_email` zůstává NULL,
  `email_verified_by_admin=false`; ukládá se jen `proposed_contact_email` +
  `proposed_contact_source_url` jako neověřený návrh; člověk musí i tak
  ručně kliknout „Schválit e-mail" (Fáze 5B). Žádná nová DB migrace — jen
  úprava EF `sales-lead-discover`.

### 17.9 Rozdělení odpovědnosti AI vs. člověk (shrnutí)
| Krok | AI smí | Člověk |
|---|---|---|
| Navrhnout firmu (`navrzeny`) | ✅ | kontroluje |
| Zařadit do skupiny / skóre kvality | ✅ návrh | potvrzuje/mění |
| Dohledat veřejný kontakt (research) | ✅ návrh | ověřuje |
| Připravit koncept e-mailu | ✅ návrh | upravuje |
| Schválit lead k oslovení | ❌ | ✅ jediný |
| **Odeslat e-mail** | ❌ **nikdy** | ✅ jen ručně po dialogu |

### 17.10 Navržené technické jednotky (NEIMPLEMENTOVAT bez schválení)
- **DB (migrace jako soubor):** sloupce `lead_group`, `lead_quality`,
  `discovery_source`, `discovery_meta` na `sales_leads`; nový stav `navrzeny`
  do CHECK + do `sales_lead_set_status` přechodů; nové activity typy
  `lead_discovered`, `rediscovered`; volitelně číselník skupin v `settings`.
- **RPC (SECURITY DEFINER, guard `sales_leads.manage`/service_role):**
  `sales_lead_propose(...)` — vytvoří `navrzeny` lead s dedup + suppression
  guardem; nikdy nevytvoří odesílatelný stav.
- **Edge Function `sales-lead-discover` (návrh):** automat/cron nebo ruční
  spuštění člověkem; hledá veřejné firmy dle skupiny, dedupuje, volá
  `sales_lead_propose`. **Nikdy neposílá e-mail, nikdy nemění stav mimo
  `navrzeny`, nikdy nevyplňuje odesílací kontakt jako ověřený.**
- **Frontend:** záložka „Návrhy", filtry skupina/kvalita, schvalovací akce
  v detailu (reuse `sales_lead_set_status`).
- Znovupoužít Fázi 3B research/draft a Fázi 3C ruční odeslání beze změny.

### 17.11 Otevřená rozhodnutí pro Pavla (před implementací)
1. Zdroje dat pro `sales-lead-discover` (které veřejné katalogy/rejstříky;
   právní základ; žádné nakoupené DB bez souhlasu).
2. Denní limity návrhů celkem i na skupinu.
3. Finální číselník skupin (potvrdit/rozšířit §17.2).
4. Zda `sales-lead-discover` běží na cron, nebo jen na ruční spuštění člověkem.
5. GDPR rámec pro ukládání veřejných kontaktů + `discovery_meta`
   (konzultace s právníkem v rámci pre-launch legal review).

**Fázování Fáze 4:** F4-DB (sloupce + stav + RPC, migrace jako soubor) →
F4-UI (záložka Návrhy + schvalování) → F4-Discover (EF, nejdřív ruční
spuštění, staging-first). Každý krok samostatné schválení Pavla, staging-first,
produkce až po backupu. **Odeslání e-mailu se nemění — vždy jen člověk.**
