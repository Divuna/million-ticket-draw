# OneMil — Owner/Legal Decision Sheet (non-Stripe)

> Konsolidovaný seznam zbývajících **non-Stripe** rozhodnutí před ostrým veřejným spuštěním.
> Účel: Pavel (owner) + právník odškrtají vše najednou. Pouze dokumentace — žádný kód, SQL, CMS, deploy.
> Vytvořeno: 16. 06. 2026. Zdroj stavu: [LAUNCH_TODO.md](./LAUNCH_TODO.md).

---

## 1. Shrnutí stavu

- **OneMil je veřejně dostupný na adrese, ale ZATÍM NENÍ veřejně spuštěný pro zákazníky.**
- **Projekt je v testovací fázi** — platby, účty, MioCoiny, soutěže, doklady a Stripe záznamy jsou testovací/smyšlená data.
- **Technická E2E část je prakticky kompletně zelená** (poslední staging Full E2E run `27597509314`: 153 passed / 0 failed / 28 skipped).
- **Stripe PAY01–PAY04 se řeší až na konec** (samostatně, viz [PAY01_PAYMENTS_TEST_MODE_NOTE.md](./PAY01_PAYMENTS_TEST_MODE_NOTE.md)) — NENÍ součástí tohoto listu.
- Položky níže jsou **owner/legal rozhodnutí** — ne technické blockery, které by šlo vyřešit kódem.

---

## 2. Checklist rozhodnutí

### L01 — `/vop` (Obchodní podmínky) — finální právní review před live
- **Stav teď:** Route technicky sjednocena (kanonická `/vop`, CMS-editovatelná přes `/admin/content`). Owner-accepted pro testovací fázi (Pavel, 15.06.). Text dočasně přijatelný.
- **Proč rozhodnutí:** Před live musí právník potvrdit/doplnit: identifikaci firmy, reklamační řád, detailnější znění. Bez toho nelze označit jako `prošlo` pro ostrý provoz.
- **Doporučené rozhodnutí:** Před veřejným spuštěním zadat finální legal review VOP; do té doby ponechat owner-accepted.
- `[ ] schváleno` / `[ ] odložit`

### L03 — `/gdpr` (GDPR / Privacy) — finální právní review před live
- **Stav teď:** Route sjednocena (kanonická `/gdpr`; `/privacy`, `/legal/ochrana-osobnich-udaju` redirect). Owner-accepted pro testovací fázi (15.06.).
- **Proč rozhodnutí:** Před live doplnit Supabase jako zpracovatele (bod 5) a nechat právní review.
- **Doporučené rozhodnutí:** Před veřejným spuštěním legal review + doplnit Supabase do zpracovatelů.
- `[ ] schváleno` / `[ ] odložit`

### L04 — `/legal/cookies` (Cookies policy) — finální právní review před live
- **Stav teď:** Technický mismatch banneru opraven (odkaz → `/legal/cookies`; noscript fallback odstraněn). Owner-accepted pro testovací fázi (15.06.).
- **Proč rozhodnutí:** Před live opravit text proti reálným nástrojům: „Platební brána" → Stripe; doplnit OneSignal a GTM; opravit nepřesnost cookies vs. localStorage.
- **Doporučené rozhodnutí:** Před veřejným spuštěním legal review + sladit text s reálnými nástroji.
- `[ ] schváleno` / `[ ] odložit`

### A13 — CMS obsah (VOP/GDPR/pravidla/cookies) — potvrdit před live
- **Stav teď:** CMS stránky `vop`, `gdpr`, `pravidla-souteze`, `cookies` existují v `content_pages` a jsou dostupné přes routy. Technická část funkční. Owner-accepted (15.06.).
- **Proč rozhodnutí:** Právní kvalita/aktuálnost obsahu je owner/legal odpovědnost — váže se na L01/L03/L04.
- **Doporučené rozhodnutí:** Potvrdit obsah společně s L01/L03/L04 při finálním legal review.
- `[ ] schváleno` / `[ ] odložit`

### L02a — `/pravidla-souteze` (obecná CMS stránka) — uklidit placeholdery
- **Stav teď (re-verify 16.06.):** Obecná CMS stránka (`content_pages` slug `pravidla-souteze`, section `legal`, 1025 znaků), NE závazný právní zdroj konkrétní soutěže. **Stále obsahuje placeholdery** (`has_placeholder=true`).
- **Návrh dispozice:** owner-accepted pro testovací fázi (stejně jako L01/L03/L04) — projekt není live pro zákazníky; pre-live owner upraví obsah.
- **Proč rozhodnutí:** Veřejně viditelná stránka s placeholdery působí nedodělaně; obsah je owner/legal.
- **✅ ROZHODNUTO (16.06., Pavel):** owner-accepted pro testovací fázi (jako L01/L03/L04). **Cleanup placeholderů se odkládá před live.** NE blocker per-soutěžních pravidel.
- `[x] schváleno (owner-accepted, cleanup pre-live)` / `[ ] odložit`

### L02b — per-contest rules PDF — ověřit u každé soutěže před aktivací
- **Stav teď (re-verify 16.06.):** Závazná pravidla jsou per-soutěžní (`contests.rules` + `contests.rules_pdf_url`; admin nahrává PDF do bucketu `contest-rules`). Produkce: **0 aktivních soutěží z 127, 0 aktivních bez PDF** → teď nic živého neblokuje.
- **Pre-live checklist (před `status='active'` u každé soutěže):** (1) `rules_pdf_url` vyplněn a PDF dostupné; (2) PDF bez placeholderů, správný název/datum/výhry/hodnota; (3) volitelně `rules` text konzistentní; (4) ContestDetail zobrazuje správné PDF dané soutěže.
- **Proč rozhodnutí:** Procesní pravidlo — každá soutěž musí mít zkontrolované rules PDF těsně před spuštěním.
- **Doporučené rozhodnutí:** Přijmout jako trvalý pre-launch krok u každé soutěže (QA `rules_pdf_url` bez placeholderů před `status='active'`).
- `[ ] schváleno` / `[ ] odložit`

### L06 — reklamace / support wording — potvrdit text
- **Stav teď (re-verify 16.06.):** Technická cesta funkční — `/kontakt` s `mailto:podpora@onemil.cz`; `/messages` support handoff (`invokeSupportHandoff` + `SUPPORT_REQUEST_MARKER` + sender role `support`). Žádné samostatné `/support/*` routy. **Technickou část lze uzavřít.**
- **Návrh dispozice:** technická support cesta = uzavřeno pro testovací fázi; reklamační řád / přesný reklamační wording = pre-live legal follow-up.
- **Proč rozhodnutí:** Přesný reklamační řád / reklamační wording je obsah/legal, ne technika.
- **✅ ROZHODNUTO (16.06., Pavel):** technická support cesta je **dostatečná pro testovací fázi** (uzavřeno). **Finální reklamační wording / reklamační text se odkládá před live s právníkem.**
- `[x] schváleno (tech cesta dostatečná; wording pre-live)` / `[ ] odložit`

### AF05 — affiliate scope — patří affiliate do prvního veřejného testu?
- **Stav teď:** Affiliate program technicky hotový (AF01/AF02/AF03 prošlo; AF04 ověřeno staging + live prod). Čistě scope rozhodnutí — žádný technický blocker.
- **Proč rozhodnutí:** Určuje rozsah 1. veřejného testu; pokud affiliate NE → označit out-of-scope a nezdržovat launch.
- **✅ ROZHODNUTO (16.06., Pavel): VARIANTA B — affiliate ODLOŽEN mimo první veřejný test.** Affiliate není blocker; zůstává live v kódu, neonboarduje se. Veřejné odkazy `/influencer`/`/affiliate/login` se nemažou — skrytí = volitelný follow-up se samostatným schválením. Payouty + Air Bank export až ve fázi zapnutí affiliate. Detail v [AF05_AFFILIATE_SCOPE_DECISION.md](./AF05_AFFILIATE_SCOPE_DECISION.md).
- `[x] schváleno (B — odložit)` / `[ ] odložit`

### CI04 — mrtvý kód — smazat `InfluencerDashboard` a `TestLogin`?
- **Stav teď (re-verify 16.06.):** Potvrzeno mrtvé: `InfluencerDashboard` importován jen v `App.tsx:76`, BEZ Route a bez jiného použití; `src/pages/TestLogin.tsx` nikde neimportován.
- **Riziko ponechání:** minimální — nepoužitý import (drobný bundle/lint noise); není routováno → nedosažitelné; bez funkčního/bezpečnostního dopadu.
- **Riziko smazání:** minimální (build ověřit po smazání); = mazání souborů → vyžaduje výslovné schválení (CLAUDE.md).
- **Doporučené rozhodnutí:** Schválit smazání obou souborů + nepoužitého importu (úklid).
- `[ ] schváleno (smazat)` / `[ ] odložit (ponechat)`

### CI05 — dokumentace — vytvořit `onemil_spec.md`, nebo potvrdit stávající zdroje?
- **Stav teď (re-verify 16.06.):** `onemil_spec.md` chybí. Existují a jsou aktivně udržované: `onemil_state.md`, `onemil_history.md`, `CLAUDE.md`, `.cursor/SYSTEM_MAP.md`, `.cursor/PROJECT_CONTEXT.md` → dostatečné source-of-truth.
- **Proč rozhodnutí:** Buď je potřeba dedikovaný spec, nebo stávající zdroje stačí — vyžaduje owner potvrzení.
- **✅ ROZHODNUTO (16.06., Pavel):** `onemil_spec.md` **NEvytvářet**. Jako source-of-truth stačí `onemil_state.md`, `onemil_history.md`, `CLAUDE.md`, `.cursor/SYSTEM_MAP.md`, `.cursor/PROJECT_CONTEXT.md` a launch docs.
- `[x] schváleno (nevytvářet; stávající zdroje stačí)` / `[ ] odložit`

---

## 3. Co je blocked-by-Stripe a NEŘEŠÍ se v tomto listu

Následující položky čekají na zapnutí Stripe (test secrets na stagingu / live mode před launchem) a nejsou předmětem tohoto owner/legal listu:

- **PAY01** — Stripe checkout (top-up redirect na Stripe).
- **PAY02** — Stripe webhook (platba dokončena → wallet credit, idempotence).
- **PAY03** — Success/Cancel routy (návrat z plateb).
- **PAY04** — Webhook fail (500 → retry, žádný dvojí credit).
- **C23 wallet credit** — invite reward (MioCoiny za doporučení) vzniká výhradně z `create_referral_reward_from_payment` (trigger na `payment_status='completed'`) → vyžaduje reálnou Stripe platbu přes webhook.
- **Plný partner invoice flow z reálných plateb (P13)** — draft faktura z reálně aktivovaných coinů vyžaduje reálnou partner paid aktivitu; řetězec (cron 17 + funkce) je strukturálně ověřený, jen netriggerovatelný uměle bez reálných dat.

Detaily a postup zapnutí: [PAY01_PAYMENTS_TEST_MODE_NOTE.md](./PAY01_PAYMENTS_TEST_MODE_NOTE.md).
