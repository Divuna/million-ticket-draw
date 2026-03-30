# Historie projektu OneMil

- **2025-09-15**: Inicializace projektu, vytvořena základní struktura souborů (`project.json`, `state.md`, `onemil_spec.md`, `onemil_history.md`, `prompt_rules.md`, `cross_project_feed.md`).
# OneMil – Historie projektu (kompletní detailní timeline)

*Aktualizace: 17. 11. 2025*

---

## 2025-09-15 – Zahájení projektu

* Vytvořena základní struktura projektu OneMil.
* Založeny soubory: `project.json`, `state.md`, `onemil_spec.md`, `onemil_history.md`, `prompt_rules.md`, `cross_project_feed.md`.
* Definován základní model: soutěže, vouchery, coiny, hlavní cena, bonusové ceny.

---

## 2025-09–10 – První verze UI

* První verze homepage (bannery, soutěžní boxy, video).
* Vytvořeny komponenty: `Header`, `BottomNavigation`, `AdminMenu`, partnerský carousel.
* Hooky: `useHomepageBanners`, `usePartners`, `useMegajackpotBanners`.

---

## 2025-10 – Kompletní datový model v Supabase

* Založeny tabulky: `users`, `wallets`, `vouchers`, `payments`, `contests`, `bonus_prizes`, `tickets`, `winners`, `audit_logs`.
* Inicializovány RLS politiky.

---

## 2025-10 – Stripe integrace

* Nastaven Stripe checkout.
* Založen systém `payments`.
* Otestován tok: uživatel → Stripe → návrat → přidání voucherů a coinů.

---

## 2025-10 – První integrace se Sofinity

* Přidány eventy: `user_registered`, `voucher_purchased`, `coin_redeemed`, `contest_closed`, `prize_won`.
* Nasazena edge function `forward_event_to_sofinity`.
* Založen `event_queue` a `event_forward_log`.

---

## 2025-10-31 – Problém s Authorization u Sofinity

* `process_event_queue_trigger()` neposílal Authorization Bearer.
* Sofinity vracelo 401.
* Vytvořen úkol doplnit hlavičku.

---

## 2025-11-02 – Push Notifications – první verze

* Založena tabulka `user_devices`.
* Synchronizace OneSignal player_id.
* Pipeline: `NotificationQueue → PushLog → OneSignal`.

---

## 2025-11-07 – Oprava kritické chyby registrace

* Funkce `handle_new_auth_user()` způsobovala 500.
* Opraveno – nyní vrací `NEW`.
* Registrace opět funkční.

---

## 2025-11-09 – OneMil → Sofinity propojení dokončeno

* Sofinity přijímá eventy.
* Test event uložen v `eventlogs`.
* Autorizace plně funkční.

---

## 2025-11-14 – Nefunkční admin login

* Problém v `useUserRole()`.
* Adminům padalo "Access denied".
* Chyby: špatné importy, starý Supabase klient, invalidní dotazy.

---

## 2025-11-15 – Diagnostika messaging systému

* Zprávy se nenačítaly, neodesílaly, realtime nefungoval.
* Hlavní problém: tři různé Supabase klienty.
* Další problémy: nefunkční realtime, neoznačené read zprávy, špatné payloady.

---

## 2025-11-15 – Sjednocení Supabase klienta

* Zaveden jediný klient: `/src/integrations/supabase/client.ts`.
* Odstraněny duplikáty.
* Opraven AuthProvider (zrušen SupabaseProvider).
* Messages page začala znovu načítat zprávy.

---

## 2025-11-16 – Velký rework messaging systému

### Opraveno:

* `useMessages`, `useAdminMessages`, `useAdminMessageThread`.
* Realtime subscription.
* Označování read.
* ORDER BY u SELECT.
* Jednotný payload zpráv.

### Přidáno:

* Admin odpovědi.
* Hromadné zprávy.
* Uživatelské odeslané/přijaté zprávy.
* Správné řazení konverzací.

---

## 2025-11-17 – Oprava admin loginu dokončena

* Role se správně načítá z `public.user_roles`.
* `useUserRole()` přepsán.
* Opraveny chyby způsobující "blank screen".
* Admin pages fungují (Messages, Payments, Vouchers).

---

# Shrnutí

OneMil se posunul z prototypu do stabilní verze:

* funkční integrace Stripe + Sofinity + OneSignal,
* kompletní messaging systém,
* stabilní registrace a přihlášení,
* plná pipeline eventů,
* připraveno pro finalizaci homepage a redesign admin zpráv.
# # Sofinity & OneMil – History Log (17. 11. 2025)

## 📌 17. 11. 2025 – Messages Pipeline Audit

### 🔸 Co se udělalo

* Proveden kompletní test realtime pipeline pro tabulku `messages`.
* Ověřeno:

  * INSERT → trigger → `event_forward_log` (status: pending) → broadcast.
  * Supabase WebSocket připojení OK.
  * Žádné chyby v Realtime logu.
* Provedeno bezpečnostní opatření:

  * `REVOKE EXECUTE ON FUNCTION public.forward_message_event() FROM PUBLIC`.

### 🔸 Co bylo zjištěno

* Realtime backend funguje **bez problémů**.
* Problém byl **ve frontendu**:

  * Nepoužíval správné hooky (`useMessages`, `useAdminMessages`).
  * Stránky Messages a AdminMessages vůbec nenaslouchaly realtime.
  * Proto se nové zprávy zobrazovaly až po reloadu.

### 🔸 Co je připraveno

* Dvě hotové finální stránky:

  * `MessagesPage.tsx`
  * `AdminMessagesPage.tsx`
* Stránky jsou připravené **1:1 k vložení**.
* Neobsahují žádný duplictní Supabase klient.
* Neobsahují žádnou logiku navíc.
* Používají tvoje hooky beze změny.

### 🔸 Stav po úpravách

* Projekt je plně připraven na vložení nových stránek.
* Po vložení musí realtime začít fungovat okamžitě.

### 🔸 Navazující krok

**„Vložit hotové MessagesPage.tsx a AdminMessagesPage.tsx a otestovat realtime (bez reloadu).“**

---

Tento záznam je navázán na aktuální stav v `state.md` a připraven pro další chat.
# OneMil – Historie prací  
**Aktualizováno:** 21. 11. 2025 – 19:32 CET

---

## 🟦 21. 11. 2025
### ✔️ Provedeno:
- OneMil ZIP byl analyzován celý.
- Messaging admin ↔ user opraven na 100 %.
- Opraveny komponenty:
  - Messages.tsx (user)
  - AdminMessages
  - AdminMessageThread
  - Input bar (fixed)
  - BottomNavigation badge
- Opraven realtime subscription.
- Opraveno označování přečtených zpráv.
- Aktualizováno grafické rozhraní (chat bubliny).
- Zajištěno: jeden fixní input, správné scrollování.
- Opraveny chyby: “Rendered fewer hooks than expected”, error #310.
- Messaging pipeline OneMil funkční a stabilní.

---

## 🧭 Poslední úkol
„Čeká se na Sofinity API (send-message), aby messaging mohl běžet i opačným směrem.“

---
ONEMIL_HISTORY.MD — ZÁZNAM (20. 11. 2025, 22:47 CET)
Událost: Stabilizace messaging pipeline OneMil
Datum: 20. 11. 2025
Čas: 22:47 CET

Stav:

Funkční user zprávy.

Funkční realtime.

Triggery posílají eventy.

Admin UI potřebuje předělání.

Příprava pro napojení na Sofinity dle požadavků.

Další krok:

Čeká se na ZIP exporty projektů.
## [2025-11-26] Přidání veřejného zobrazení voucherů (is_public)

- Přidán nový sloupec `is_public` (boolean) do tabulky `vouchers`
- Zavedena logika pro veřejné zobrazení voucherů nepřihlášeným uživatelům
- Upraveno klientské zobrazení: sekce „Dostupné vouchery“ na homepage zobrazuje pouze vouchery s `is_public = true`
- V administračním přehledu voucherů přidán nový sloupec „Zveřejnit“ (checkbox)
- Admin může jednoduše spravovat, které vouchery se zobrazí na homepage
- Změna okamžitě zapisována do databáze přes UI
2025-11-26 – Právní posouzení systému MioCoin

Do systému OneMil byl navržen nový modul pro kreditní balíčky „MioCoin“.

Bylo provedeno detailní právní posouzení, zda změna (dobíjení kreditu, nákup balíčků, používání MioCoin místo přímého nákupu voucherů) spadá do hazardní hry dle zákona č. 186/2016 Sb.

Závěr: MioCoin systém při dodržení stanovených podmínek zůstává spotřebitelskou soutěží a nespadá pod režim hazardních her. Neobsahuje „vklad“, okamžité výhry, peněžní odměny ani náhodné losování mimo soutěž. Kredit je nesměnitelný zpět na peníze a má charakter digitální měny pro interní použití.

Viz detailní rozbor → docs/legal_miocoin_analysis_2025-11-26.md (doporučuje se tento soubor vytvořit).
HISTORY.MD – Chronologický průběh změn
🔹 Krok 1: Úprava bannerů

Vytvořena tabulka coming_soon_banners.

Správně nastavena pravidla RLS.

Přidány 3 upload sloty do adminu.

Opravena chyba „Chyba při nahrávání banneru“ (nesprávné RLS).

🔹 Krok 2: Přidání oblíbených soutěží

Přidána tabulka user_contest_favorites.

Přidána logika uložení oblíbené soutěže ze srdíčka.

Přidána stránka /favorite-games a propojena s menu.

Přidána logika pro automatické přidání odehrané soutěže.

🔹 Krok 3: Aktualizace UI soutěží

Přidán horní blok s tlačítkem „Oblíbené soutěže“.

Přidána srdíčka ke každé hře.

Přidána tlačítka „Zpět“.

U tlačítka pro uplatnění miocoinů připraven upgrade – rozdělení.

🔹 Krok 4: Carousel pro vouchery

Implementována logika auto-scrollu.

Přidána reverzní rotace oproti soutěžím.

Aktuálně nefunguje → čeká na fix.

🔹 Krok 5: Opravy práv a SQL

Opraveny chyby v RLS.

Opraveny reference na tabulku users.

U všech tabulek nastaveno správné čtení a správa pro adminy.

🟢 Další krok

Připraveno pokračovat opravou:

automatického scrollování voucher carouselu.

rozdělení tlačítka „Uplatnit X miocoinů“.

doplnění funkcionality výher.

Záznam byl kompletně uložen do state.md a history.md.
Záznam pro history.md

Proběhla analýza platebního procesu OneMil.

Identifikována kritická chyba redirect URL po platbě → 404.

Úspěšně potvrzeno, že profil + peněženka fungují a data se načítají.

Zapsány konkrétní kroky k opravě na backendu, front‑endu i ve Stripe.

Připraven plán pro generování kompletních souborů podle projektu.

Očekává se potvrzení správného route pro profil.
### Auditní příprava výherního systému – záznam

Popis problému:
- Výherní systém se chová nesjednoceně: některé výhry se vytváří, ale logika není jasná.
- Uplatnění posledního pole (bonusová výhra) se občas nezobrazí správně.
- Moje výhry zobrazují správně seznam, ale tlačítko „Zpět“ vede do špatné sekce.
- Favority u soutěží nyní fungují, ale bylo nutné upravit RLS.
- Uživatelská peněženka někdy nepřebírá automatické výhry.
- Admin má dvě sekce pro tvorbu soutěže – je potřeba sjednotit.

Co se již udělalo:
- Opraveny oblíbené soutěže (toggle, zobrazení, návrat).
- Přidána samostatná záložka „Výhry“ do spodního menu.
- Moje výhry nyní načítají data přímo z tabulky `winners`.
- Plánováno přidání modálního okna pro detail výhry a filtrů.

Dohodnutý další postup:
1. Další krok NEBUDE žádná úprava.
2. Nejdřív se provede AUDIT celého výherního systému (SQL SELECT dotazy).
3. Audit ověří:
   - stav soutěží
   - stav bonusů
   - jak se generují výhry (funkce/triggery)
   - jak se přičítají MioCoiny
   - jak admin panel načítá výhry
4. Teprve po auditu se vytvoří plán oprav.
5. Cílem je mít:
   - automatické výhry pro MioCoiny
   - manuální schvalování pro fyzické ceny a hodnotné bonusy
   - jednotnou logiku pro celý systém
   - napojení na peněženku a admin panel

Chat je nyní připraven pro zahájení AUDITU v dalším vlákně.
Záznam posledních kroků (03. 12. 2025)
🔧 Provedené úpravy

Sjednocení ContestCard

Všechny tři stránky (Homepage, Games, FavoriteGames) nyní používají stejnou komponentu ContestCard.

Všechny karty mají identický vzhled a chování.

Úprava FavoriteGames

Layout a struktura sjednoceny s Games.

Zůstává rozdílný jen header (má tlačítko Zpět), ale karty jsou plně identické.

AI Generování bannerů v adminu

V administraci přidáno tlačítko „Vygenerovat pomocí AI“.

Volá Supabase Edge Function generate-contest-banner.

Úspěšně se odesílají parametry: title, description, prize, ticket_count, price, bonus_summary.

Zatím ale nefunguje kvůli chybě OpenAI: 403 – Organization must be verified.

❗ Problémy

OpenAI vrátilo chybu 403 — Organizace není ověřená.

Proběhlo ověření identity přes Persona, ale ověření organizace zatím není plně dokončeno.

Do vyřešení nebude fungovat generování bannerů přes gpt-image-1.

🎯 Další krok (Krok B – pokračování)

Vytvořit komponent ContestBannerLarge.

Umístit jej do detailu soutěže /contest/[id].

Připravit celý UI a strukturu pro pozdější napojení AI.

Zachovat Lovable pravidla: žádné nové tabulky, žádné změny existujících struktur.

📌 Následující chat musí začít pokračováním: Krok B – vytvoření velkého banneru v detailu soutěže.

# OneMil – Historie (02.12.2025)

## Dnešní průběh
- Zahájeno přepracování modalu „Vytvořit novou soutěž“ v AdminContestManagement.tsx.
- Lovable provedlo vlastní sloučení tabů do jedné řádky (nebylo požadováno).
- Uživatelem označeno jako špatně → rollback do předchozího funkčního stavu.
- Potvrzeno: dnešní kódová změna se NEPOUŽÍVÁ, projekt je v předchozí verzi.

## Co bylo dnes odsouhlaseno (definitivní specifikace)
- Pořadí tabů musí být:
  1. Základní údaje
  2. Bonusy – MioCoins
  3. Popis hlavní výhry
  4. Bonusy – věcné
  5. Grafika – detail
  6. Grafika – banner
  7. Vytvořit soutěž

- Vytvořit/Založit soutěž  
  → pouze v posledním tabu  
  → deaktivované, dokud nejsou vyplněna všechna povinná políčka

- Obrázky:
  → hlavní obrázek musí mít LIVE náhled  
  → sekundární obrázek = pravý box v detailu  
  → banner = obrázek nahoře přes celou šířku detailu

- Detail soutěže má odpovídat náhledu, který uživatel dodal
  (OneMil text, auto, MioCoin box vlevo, hlavní výhra box vpravo, bonusy dolů).

- Nic z backendu se NEMĚNÍ.

## Stav po rollbacku
- Modal je v původním stavu.
- Tab list není upraven.
- Žádné nové workflow není aktivní.

## Co se bude dělat příště
- V dalším chatu se provede přesná implementace workflow podle specifikace.
- Bude se postupovat krok za krokem bez improvizací.
# 🧾 Sofinity / OneMil – Projektový stav
# Datum: 4. 12. 2025, 12:55

## 🔥 INCIDENT: Rozbití stránky ContestDetail
Při úpravě souboru `ContestDetail.tsx` došlo k odstranění nebo přepsání `default export`, což způsobilo:
- Kompletní pád stránky `/contest/:id`
- Zobrazení chyby: "The requested module does not provide a default export"
- Lovable nedokázal stránku načíst → černá obrazovka + error hlášky

## 🛠️ Pokus o nápravu
- Proběhl pokus vytvořit novou zjednodušenou verzi `ContestDetail`, ale:
  - UI vypadá velmi špatně (rozpadlé styly)
  - Sekce jsou nekompletní
  - Chybí grafický styl OneMil
  - Zmizela struktura, která byla předtím správná
- TicketMap byla úspěšně odstraněna (správně – způsobovala extrémní lagy)

## 🎯 Aktuální očekávaná funkcionalita (nutné zachovat)
### Co MUSÍ v detailu soutěže být:
1. **Hlavní obrázek soutěže (banner)**  
2. **Název soutěže + popis**  
3. **Cesta k hlavní výhře (progress bar)**  
4. **Bonusové věcné výhry (jen fyzické, bez MioCoinů)**  
   - Výherní ticket  
   - Popis  
   - Obrázek (image_url)  
5. **Moje výhry**  
6. **Tlačítko Uplatnit 1 MioCoin**  
7. **Zůstatek peněženky**

### Co SE NESMÍ znovu objevit:
- ❌ Bonusové výhry typu „1 MioCoin“  
- ❌ Zobrazení 1M čtverečků (TicketMap)  
- ❌ Zobrazení interních dat, ticket_position seznamů  
- ❌ Jakékoli animace nebo masivní výpočty → způsobovalo lagy

---

## 🧩 Stav backend dat
- Tabulka `bonus_prizes` nyní obsahuje pole `image_url`  
- Načítání bonusových výher funguje správně:
  - description  
  - ticket_position  
  - status  
  - amount  
  - image_url  
- Je potřeba pouze správně vykreslit UI

---

## 📌 Stav frontendu
### Opraveno:
- Skryta TicketMap
- Správně filtrovány MioCoin bonusy

### Rozbité / Chybějící:
- UI design ContestDetail
- Chybí default export
- Bonusové výhry se zobrazují neesteticky
- Chybí formát karet a vizuální styl brandu OneMil

---

## 🧭 Co má nový chat udělat jako první (instrukce pro pokračování)
1. **Obnovit ContestDetail do profesionální, pohledové verze**  
   - Použít fyzické bonusové výhry (včetně obrázků)  
   - Udržet brand OneMil  
   - Zachovat strukturu uvedenou výše  
2. Nepřidávat TicketMap zpět.  
3. Nezasahovat do generování tiketů ani backend logiky.  
4. UI musí být konzistentní s designem OneMil (tmavý background, elegantní panely, ikonky, rámečky).  
5. Zachovat plnou responzivitu pro mobilní zařízení.

---

## 🏁 Stav projektu po incidentu
Projekt je funkční:
- Soutěže lze otevřít
- Přihlášení funguje
- Uplatnění MioCoin funguje
- Backend je v pořádku

Neplně funkční:
- UI detailu soutěže (rozbité)
- Nezobrazuje obrázky bonusových výher
- Chybí původní grafické uspořádání

---

## 🚀 Další krok
**Je potřeba vytvořit kompletní nový vizuál `ContestDetail.tsx` podle poslední funkční verze + přidané obrázky bonusů.**

Chat by měl vyžádat:
1. Výběr finálního stylu (A nebo B)
2. Komponentu v celku → žádné částečné diffs
3. Zachovat očekávanou strukturu UI

ÚPLNÝ AUDIT Z CELÉHO CHATTU (8. 12. 2025)
1️⃣ Zjištěné problémy při volání Grok API

Grok API vracelo chybu:

{"code":"400","error":"Argument not supported: size"}


Chyba se opakovala ve všech invokacích edge funkce:

generate-contest-banner/index.ts

před opravou se request odesílal s parametrem size: "1024x1024"

Grok API tento parametr neakceptuje (dle dokumentace xAI)

V logu Supabase Edge Functions:

Grok API error: {"code":"400","error":"Argument not supported: size"}


Chyba byla konzistentně spojena pouze s parametrem size.

2️⃣ Diagnostika: Modelová specifikace

Nalezené problémy:

A) Nepodporovaný parametr

⬇️ Odesílalo se:

{
  model: "grok-2-image-1212",
  prompt: "...",
  size: "1024x1024",
  response_format: "b64_json"
}


❌ size → nepodporovaný argument
❌ grok-2-image-1212 → model existuje, ale nemá podporu parametrů OpenAI stylu

Správný formát podle xAI dokumentace:

POST https://api.x.ai/v1/images/generations
{
  "model": "grok-2-image",
  "prompt": "...",
  "response_format": "b64_json"
}

3️⃣ Diagnostika: Chybějící / chybné API Keys

Ve funkci se načítalo: Deno.env.get("GROK_API_KEY")

V Supabase → Secrets nebyl klíč správně uložen

Po opravě a vytvoření platného Grok API Key (xai-…) se generování okamžitě rozběhlo

Tím se potvrdilo, že původní GROK_API_KEY byl neplatný / starý / přepsaný.

4️⃣ Implementovaná oprava Edge funkce

Z kódu se odstranilo:

size: "1024x1024"


Opraveno na:

model: "grok-2-image",
prompt: prompt,
response_format: "b64_json"


Změny provedly:

korektní request

platný response s data[].b64_json

úspěšný upload obrázku → Supabase Storage bucket contest-banners

5️⃣ Potvrzení plné funkčnosti generování bannerů

Po opravě:

✔ Grok API vrací base64 PNG
✔ Edge funkce úspěšně ukládá do Supabase
✔ Frontend přijímá URL a zobrazuje banner
✔ Chyby Argument not supported: size zmizely

6️⃣ Nový problém – Detail soutěže

Po opravě banner generátoru se ukázalo:

❌ Bonusové výhry nemají obrázky
❌ Layout se roztáhl přes celou šířku
❌ Nefunguje správně „Cesta k hlavní výhře“
❌ Pravděpodobná chyba v query nebo v props předávaných do detailu

Možné příčiny:

Frontend:

změněné názvy polí (např. bonus_prize_image vs image_url)

chybějící field v supabase SELECT

Backend:

změna v dotazu .select()

změna RLS policies po deployi

Data:

bonusy založené špatně nebo bez obrázků

pole se nepřiřazuje při insertu

7️⃣ Navržený postup pro příští chat

KROK 1: Vytáhnout z Supabase aktuální strukturu tabulek:

contests

bonus_prizes

bonus_images

prize_images (pokud existuje)

contest_bonus_prizes (pokud existuje many-to-many)

KROK 2: Projít frontend:

/app/(tabs)/contests/[id]/ContestDetail.tsx

/components/contest/BonusPrizeCard.tsx

KROK 3: Porovnání dat → UI → rendering → fallback → obrázky

KROK 4: Opravit layout (pravděpodobně chybí container nebo width:100%).

🔥 ZÁVĚR

GROK API → OK, funkční

Banner Generator → OK

Detail soutěže → ROZBITÝ → opraví se v dalším chatu 
2025-12-09 — AI GENERATOR INCIDENT LOG

Zahájen pokus o přechod na nový AI pipeline pro generování bannerů soutěží.

Testovány modely: Lovable AI, Grok 2, Grok Vision, Grok Image → všechny selhaly.

Gemini API bylo testováno, ale ukázalo se, že neumí image output.

Model „nano-banana-pro“ se ukázal být neexistující interní preset, Google API jej nezná.

Uživatel opakovaně ověřil API chybou 404 → nepotvrzený model.

Potvrzeno: OneMil potřebuje IMAGE-TO-IMAGE → to umí jen Vertex AI – Imagen 3 capability.

Navržen finální postup B1 → automatická maska + background replace.

Vysvětleno, že Lovable NEMŮŽE nastavit backend, tedy:

neuloží service-account JSON

nevytvoří JWT

nezavolá Vertex endpoint

Připraven návod pro vývojáře s heslem pavel.

Čeká se na přístup vývojáře → dokončení integrace.
Chronological Attempt Log – Vertex Integration & Supabase CLI
1. Supabase CLI

Multiple attempts to deploy function resulted in 401 Unauthorized.

Reinstallation attempts were performed; however, stale authentication state persisted.

CLI login did not request token, indicating a corrupted or overwritten profile state.

User attempted direct token input which the CLI interpreted as a PowerShell command, failing.

2. Supabase Secrets & Service Account

Full Google service account JSON was provided and validated.

Secret GOOGLE_VERTEX_SERVICE_ACCOUNT stored, but potential formatting issues remain.

GOOGLE_VERTEX_PROJECT_ID exists and appears correct.

Missing: correct GOOGLE_VERTEX_API_KEY usage inside function.

3. Edge Function vertex-generate-image

Function code uploaded manually into UI.

Function uses incorrect endpoint key (private_key_id) instead of actual Gemini API key.

Logs confirm function receives requests but fails image generation.

Errors persist even when proper apikey and Authorization headers were sent.

4. Testing Attempts

Multiple Invoke-RestMethod POST calls returned 500.

cURL tests failed as PowerShell misinterpreted arguments.

Function log viewer confirmed no successful image generation.

5. Current System Status

Deployment is blocked (CLI cannot authenticate).

Function is deployed in broken state (500 error).

Secrets likely misconfigured or incomplete.

Vertex AI integration is non-functional.

Next Required Steps (not executed yet)

Fix Supabase CLI login.

Redeploy corrected Edge Function with proper API key.

Validate JSON formatting in Supabase secrets.

Run test generation once function is stable.
2025-12-12 – Stabilizace soutěží & bonusových výher
Co se řešilo

Nezobrazoval se správný počet bonusových výher u soutěže

Vytvořeno např. 4 bonusy, UI zobrazovalo jen 2

Podezření na:

SQL chyby ❌

špatné contest_id ❌

RLS ❌

Zjištění

Data v tabulce bonus_prizes byla správná

SQL dotazy vracely všechny řádky

Problém byl výhradně ve frontendové logice

Filtr v ContestDetail.tsx skrytě vyřazoval MioCoin bonusy

Provedené změny

Odstraněna filtrace:

!b.amount || b.amount === 0


Nahrazeno zobrazením všech záznamů:

setBonusPrizes(typedBonus);

Strategické rozhodnutí

AI generování grafiky (Vertex / Docker / Cloud Run):

pozastaveno

nebude blokovat vývoj core systému

Soutěže poběží plně manuálně

AI se doplní později

Stav po úpravách

Bonusové výhry se zobrazují 1:1 podle DB

UI odpovídá skutečnému počtu výher

Systém je čitelný a stabilní

Připraveno na další iteraci

🔜 Navázání v dalším chatu

Další chat začne:

rozdělením bonusů v UI (věcné vs MioCoins)

případně refaktorem ContestDetail.tsx

bez návratu k Docker / Vertex / AI 
## 🕓 Historie projektu – 17. 12. 2025

### Den intenzivních úprav UI, RLS a výherních toků

---

### 🔐 RLS & bezpečnost

* Vyřešen problém se zobrazováním avatarů v admin přehledech
* Přidána politika pro admin/superadmin SELECT nad `profiles`

---

### 🎯 Detail soutěže

* Odstraněna sekce „Moje výhry“ z detailu soutěže
* Přesun logiky výher výhradně na stránku „Moje výhry"

---

### 🎨 UX / UI redesign

* Kompletní přeuspořádání sekcí detailu soutěže
* Zavedeny dva nové informační boxy (stav MioCoinů / bonusové MioCoiny)
* Přidány jemné fade-in animace

---

### 💰 Bonusové MioCoiny – klíčové rozhodnutí

📌 **Zásadní rozhodnutí:**

Bonusové MioCoiny zobrazené zákazníkovi:

* nejsou zůstatek
* nejsou odpočet
* nejsou dynamická hodnota

👉 Jsou **statická marketingová informace** převzatá z:

`contests.total_miocoin_bonus`

Toto pole:

* se nastavuje při vytváření soutěže
* zůstává neměnné po celou dobu soutěže

---

### 🎉 Výhry – efekty a interakce

* Přidány různé confetti a zvuky podle typu výhry
* Vylepšen WinDetailModal

---

### 🏆 Stránka Moje výhry

* Přidány filtry (stav, typ)
* Přidáno řazení
* UX sjednoceno s adminem

---

### 🧭 Stav na konci dne

Projekt je:

* funkční
* konzistentní
* připravený na další rozšiřování

Další práce se má striktně opírat o tento záznam.
# Projekt OneMil – historie změn

## 2025-12-22 – Analýza problému s MioCoin bonusy

### Kontext
Při vytváření soutěží s větším počtem MioCoin bonusů (např. 50 000) docházelo k:
- neúplnému generování (např. 2902 místo 50 000),
- timeoutům,
- nekonzistentnímu chování UI.

### Co bylo testováno
- Sekvenční inserty (`for...of`) → příliš pomalé, timeout
- Paralelní inserty (`Promise.all`) → špatné součty kvůli triggerům
- Batch inserty (250 / 500 / 100) → stále naráží na timeouty
- Edge function s batch + retry + service role → technicky správná, ale složitá

### Důležité zjištění
Původní logika:
- UI implicitně generovalo MioCoin bonusy při uložení soutěže

Současná logika:
- UI pouze nastaví `total_miocoin_bonus`
- Generování bonusů je oddělený proces
- UI s tím ale stále implicitně počítá

➡️ To je hlavní zdroj problému.

### Stav databáze
Ověřeno, že:
- `contests.total_miocoin_bonus` == `SUM(bonus_prizes.amount)`
- Neexistují „rozbitá“ data
- Problém je výhradně v aplikačním workflow

### Rozhodnutí
- Další experimenty STOP
- Stav vrácen zpět
- Architektura bude dořešena v dalším chatu:
  - oddělení vytvoření soutěže
  - explicitní generování MioCoin bonusů přes edge funkci
  - žádné další automatické side-effecty v UI

### Poznámka
Cílem je:
- stabilita
- možnost generovat 50 000+ MioCoin bonusů
- kontrolovatelný a opakovatelný proces bez timeoutů
# OneMil – PROJECT HISTORY

## 2025-12-22 – Bonus MioCoin Wallet Debugging

### What was tested
- Multiple ticket purchases with MioCoin bonus wins
- Bonus wallet UI rendering
- Manual SQL inserts and RPC calls
- Winners + bonus_prizes linking

---

### Key findings

1. Bonus MioCoins were sometimes:
   - Auto-credited to main wallet
   - Or not visible anywhere

2. `claim_miocoin_bonus` RPC originally failed due to:
   - Wrong column name (`balance` vs `balance_coins`)
   - This was FIXED

3. Status handling was clarified:
   - `pending` = waiting in bonus wallet
   - `delivered` = already transferred

---

### What was fixed

✅ `claim_miocoin_bonus` RPC  
- Now deterministic and user-controlled
- Uses `balance_coins`
- Validates ownership via `winners`
- Marks bonus as delivered correctly

---

### What is still broken

❌ `purchase-ticket`
- Still credits MioCoins automatically
- Breaks bonus wallet concept
- Causes missing bonus_prizes records

This is the MAIN blocker.

---

### Final decision (confirmed by owner)

- Bonus MioCoins MUST NEVER auto-credit
- Bonus wallet is mandatory
- User explicitly transfers bonuses

---

### Next planned work

1. Fix `purchase-ticket` Edge Function
2. Remove wallet updates for bonus prizes
3. Enforce pending → delivered lifecycle
4. Retest full flow:
   ticket → bonus wallet → manual transfer

---

## CONTINUE FROM HERE IN NEXT CHAT
Focus ONLY on `purchase-ticket`
# OneMil – historie vývoje

## 2025-12-24 – Stabilní snapshot
- Projekt uveden do stabilního funkčního stavu
- Dokončeno:
  - generování a sdílení grafické karty ticketu
  - bezpečný upload přes Edge Function
- Zjištěn problém s HTTPS na onemil.cz
  - sdílení na FB/X dočasně nefunkční
  - rozhodnuto ODDĚLIT a řešit později
- Footer vyčištěn:
  - odstraněna Kariéra a Tiskové zprávy
- Rozhodnutí:
  - CMS/Admin pro texty bude řešen později
  - nyní se pokračuje v jiných částech projektu

Tento zápis slouží jako návratový bod v případě rozbití projektu.
# OneMil – history.md

## 2025-12-26 (Europe/Prague) – Rekapitulace celého chatu (MioCoin bonusy + automatizace)

### 1) Start: SQL chyby a UUID
- Uživatel narazil na SQL chybu: `invalid input syntax for type uuid: "UUID_SOUTEZE"` (použit placeholder místo reálného UUID).
- Uživatel poskytl seznam reálných contest IDs (STRING_AGG styl výpisu) a postupně přikládal výsledky dotazů.

### 2) Zjištění: `contests.total_miocoin_bonus` vs skutečný součet z `bonus_prizes`
- Byly nalezeny soutěže, kde:
  - `contests.total_miocoin_bonus = 0`,
  - ale `SUM(bonus_prizes.amount WHERE amount>0)` je vysoké (např. 50050).
- Pokus o přímý update `contests.total_miocoin_bonus` selhal:
  - `Direct update of total_miocoin_bonus is not allowed. Use bonus_prizes table instead.`
  - Trigger/funkce: `prevent_manual_total_miocoin_update()`.

### 3) Část FE (ContestDetail.tsx) – vznikly rozbité verze
- Lovable se pokusilo upravit `ContestDetail.tsx`, ale došlo k:
  - nechtěným zásahům do layoutu,
  - rozbitým template stringům (`${...}` bez backticků),
  - TS erroru u `TicketResultModal` (`distance_to_next_bonus` required vs optional),
  - uživatel opakovaně vracel soubor na funkční stav.
- Uživatel požadoval:
  - „vždy celý soubor, nikdy části“,
  - a pouze minimální změny (jen číslo MioCoinů).

### 4) Trigger audit v DB
- Potvrzeny triggery:
  - `trg_prevent_manual_total_miocoin_update` (contests)
  - `trg_sync_total_miocoin_bonus` (bonus_prizes AFTER INSERT)
- Na contests existují i další event triggery:
  - `tr_contest_sofinity_events` → `handle_contest_sofinity_event()`
  - `trg_contest_update` → `fn_send_event_to_sofinity()`
  - další pomocné triggery (`updated_at`, `default status`, `on_contest_closed`)

### 5) Kritický blocker: admin_actions NOT NULL
- Při update contestů se opakovaně objevila chyba:
  - `null value in column "admin_id" of relation "admin_actions" violates not-null constraint`
  - Context: `handle_contest_sofinity_event()` vkládá do `admin_actions` záznam s `admin_id = NULL`
- Závěr: dokud se tohle nevyřeší, může to blokovat různé update scénáře a dělat chaos při úpravách soutěží.

### 6) “Plan” na opravu generování MioCoin bonusů přes edge funkci (neuzavřeno)
- Lovable identifikovalo, že admin generuje velké množství řádků (1 MC = 1 row), což může timeoutnout → pak v DB zůstane třeba jen 1000.
- Návrh:
  - posílat `amount_per_unit` dle “step value” (např. 10/100),
  - mapovat distribution `even -> step_interval`,
  - přidat ověření createdCount vs expectedCount.
- Praktický test ale ukázal, že i tak vzniklo `60000 × 1` a systém se dál choval špatně.
- Tento chat nedokončil robustní řešení generátoru bonusů.

### 7) Přepnutí na “nejjednodušší řešení”
- Uživatel rozhodl:
  - MioCoin bonusy se budou generovat dál,
  - ale UI má zobrazit jen jedno číslo:
    - to, co je zadané/uložené v `contests.total_miocoin_bonus`.
- Lovable navrhlo “zjednodušit ContestDetail.tsx”:
  - odstranit computed sum z `bonus_prizes`,
  - zobrazovat `(contest.total_miocoin_bonus ?? 0)`.
- Uživatel to zkoušel, ale zároveň nechtěl další rozbíjení souboru.

### 8) Pokus o automatickou tvorbu soutěží/obrázků (NEPOUŽITO / revert)
- Lovable navrhlo edge funkci `generate-complete-contests` pro 10 soutěží + 220 obrázků.
- Uživatel krok vrátil zpět (zůstaly “nedodělané hry”), následně ručně upraveno.
- Rozhodnutí: místo 10 soutěží se udělá 1 kvalitní (luxusní značky Dior/LV/Gucci).

### 9) SQL pro “Svět luxusních ikon” (contest + 20 bonus prizes)
- Byl navržen SQL skript:
  - INSERT do `contests` (včetně `total_miocoin_bonus=60000`)
  - DO $$ blok, který vloží 20 fyzických bonusových cen do `bonus_prizes` (amount=0, ticket_position 1–20)
- Uživatel nahlásil:
  - “nevytvořilo to MioCoiny” (logicky – skript vkládá pouze fyzické bonusy)
  - “nejsou ani obrázky” (pravděpodobně storage/RLS/bucket problém, neověřeno)

### 10) Storage bucket/policies pro obrázky (odmítnuto schválit)
- Lovable navrhlo SQL:
  - vytvořit/označit bucket `contest-banners` jako public,
  - policy SELECT pro veřejné čtení,
  - policy INSERT pro authenticated,
  - policy UPDATE/DELETE pro adminy.
- Uživatel odmítl dál schvalovat/zkoušet (riziko rozbití).

---

## Výsledek chatu
- Byl vytvořen detailní audit problému: proč UI často ukazuje “1000” (nejčastěji partial generation + limity + edge/batching).
- Byla odhalena kritická DB chyba, která blokuje update contests: `admin_actions.admin_id` NOT NULL.
- Automatizace generování soutěží/obrázků byla označena jako riziková a byla revertována.
- Další postup: příští chat udělá čistě a bezpečně:
  1) opravu `handle_contest_sofinity_event()` / `admin_actions`,
  2) stabilní generaci MioCoin bonusů (ne 60k řádků po 1),
  3) až potom storage/policies pro obrázky.

---
27. 12. 2025 – Audit a stabilizace MioCoin bonusů

Problém:

Opakovaně se objevoval údaj null_title_rows

Podezření na chybu v generování MioCoinů

Průběh zjištění:

Proveden detailní SQL audit bonus_prizes

Ověřeno:

MioCoiny mají vždy title = 'MioCoin' a amount > 0

Záznamy s title IS NULL odpovídají věcným výhrám

Potvrzeno Lovable auditem:

Neexistuje žádný chybný MioCoin záznam

Edge Function distribute-bonus-prizes je opravená a funkční

Klíčové zjištění:

null_title_rows ≠ chyba

null_title_rows = počet fyzických bonusů (věcných výher)

Rozhodnutí:

UI pojmenování se zatím nemění

Bonusový systém se považuje za stabilní a uzavřený

Staré soutěže lze bez obav mazat

Nové soutěže se chovají korektně

Výsledek:
✅ MioCoin generování funguje
✅ Data jsou konzistentní
✅ Žádný další zásah není nutný 
29. 12. 2025 – průběh

zahájen audit výher (purchase → winners)

během testování zjištěno:

chybějící badge

nechodící oznámení

odbočení:

oprava messages

sender logic

realtime

zvuky

tyto části byly úspěšně dokončeny

hlavní audit výher nebyl dokončen

Stav na konci chatu

systém stabilní

UX výrazně lepší

hlavní logická kontrola výher čeká

🧭 INSTRUKCE PRO DALŠÍ CHAT (DŮLEŽITÉ)

👉 V dalším chatu říct:

„Navazujeme bodem 2 – audit winners, vrať se k původnímu plánu, ignoruj zprávy a badge (ty jsou hotové).“
# Projekt OneMil – historie

## 30. 12. 2025 – návrat k bodu „pavel“

Během vývoje admin části OneMil došlo k výraznému odbočení směrem k:
- realtime zvukovým notifikacím
- online uživatelům (Supabase Presence)
- Stripe platbám
- horní admin liště a statistikám

Tyto části byly:
- částečně dokončeny
- částečně stabilizovány
- ale **rozbily kontinuitu původního úkolu**

Uživatel se rozhodl:
👉 **vrátit se k původnímu cíli pod heslem „pavel“**

---

### Původní cíl (pavel)
Zlepšení a dokončení:
**Admin – Přehled předání výher podle soutěží**

---

### Co bylo opraveno před návratem
- SQL funkce `get_prizes_delivery_summary`:
  - správně počítá jen skutečné výhry
  - opravena logika pending / won / delivered
- Admin statistiky přestaly zdvojovat hodnoty
- Klikání na výhry technicky funguje

---

### Identifikovaný problém
Admin UX je:
- nejednoznačné
- mate přesměrováním na jiné stránky
- neříká jasně:
  - co má admin dělat
  - v jakém pořadí
  - co znamenají jednotlivé položky

---

### Rozhodnutí
- všechny vedlejší feature (zvuk, online, platby) **pozastavit**
- vytvořit **čistý návratový bod**
- pokračovat v novém chatu **pouze nad admin správou výher**

---

### Stav při ukončení chatu
Projekt je stabilní.  
Žádná kritická chyba.  
Další práce bude pokračovat od bodu **„pavel“**.

CHRONOLOGICKÝ ZÁZNAM
30. 12. 2025 – Dokončení modulu „Správa výher“

Vyřešena logika výher:

automatické MioCoin připsání

manuální správa fyzických výher

Opraveny chyby:

nesprávné přepínání stavů

špatné filtrování MioCoin vs fyzické

Zjednodušen „Popis ceny“:

odstraněny duplicity textů

jednotné zobrazení Ticket #X

Přidána a otestována:

historie změn

click-outside zavírání

CSV exporty

Modul Správa výher uzavřen jako stabilní

🔁 TEXT PRO NAVÁZÁNÍ V DALŠÍM CHATU (VELMI DŮLEŽITÉ)

👉 Tento text zkopíruj jako první zprávu v novém chatu:

Navazujeme na projekt OneMil.
Modul „Správa výher“ je hotový a stabilní (viz state.md a history.md k 30. 12. 2025).

Shrnutí:
- MioCoin výhry = automaticky připsané, read-only
- Fyzické výhry = manuální stavy + audit historie
- Popis ceny obsahuje jen název výhry + Ticket #X
- Filtry, historie, CSV exporty fungují

V tomto chatu:
❗ NEVRACET se ke Správě výher
❗ NIC zde už nepředělávat

Navrhni další logický krok projektu (další modul OneMil / testovací checklist / produkční příprava).
# 📜 Projekt OneMil – HISTORY

## 02. 01. 2026 – Stabilizace produkce, auth a Meta

### Kontext

Projekt OneMil byl přesunut do ostré produkce na vlastní doménu **onemil.cz**. Během této fáze se řešila kombinace:

* Meta (Facebook) App Review a ověření domény
* Přidání povinných právních údajů
* Kritická chyba v Google přihlášení po přechodu na produkční doménu

---

### 🔧 Provedené kroky

#### 1️⃣ Doména & publikace

* Doména `onemil.cz` aktivována a napojena na Lovable projekt.
* Produkční build nasazen.

#### 2️⃣ Právní compliance (Meta / App Store readiness)

* Přidány povinné údaje o provozovateli:

  * iCONIC POINT s.r.o.
  * IČO, sídlo, jednatel, e-mail, telefon
* Údaje sjednoceny v:

  * Patičce
  * `/kontakt`
  * `/terms`
  * `/privacy`
  * `/delete-account`

#### 3️⃣ Facebook domain verification

* Meta požadovala ověření domény `onemil.cz`.
* Zvolen způsob: **HTML meta tag**.
* Meta tag vložen **staticky do `index.html` (HEAD)**:

  ```html
  <meta name="facebook-domain-verification" content="gxkf1jmavmy2zhzwmslyan4fc92az" />
  ```
* Ověření zatím **neprošlo** – očekává se zpoždění na straně Meta (cache, scraping).
* Stav označen jako **čekající**.

#### 4️⃣ Kritická chyba – Google přihlášení

* Projev:

  * Po úspěšném Google OAuth se zobrazila chyba:
    `Invalid token: signature is invalid`
* Analýza:

  * Supabase auth fungoval, ale Google token byl odmítnut.
  * Chyběly povolené domény v **Google Cloud OAuth Client**.
* Oprava:

  * Přidány autorizované domény:

    * `https://onemil.cz`
  * Supabase nastavení:

    * Site URL → `https://onemil.cz`
    * Redirect URLs → `https://onemil.cz/**`
    * Callback URL ponechána beze změny
* Výsledek:

  * Google Sign-In **plně funkční** na produkci.

---

### ✅ Výsledek této fáze

* Produkční web stabilní
* Google login funkční
* Právní a kontaktní údaje splněny
* Facebook ověření domény rozpracované (čeká se)

---

### 🔜 Doporučené navázání v dalším chatu

1. Zkontrolovat stav **Facebook Domain Verification** (po 24–48 h)
2. V případě neúspěchu:

   * Použít Meta Sharing Debugger
   * Případně přepnout na DNS TXT ověření
3. Pokračovat v **Meta App Review** (email, public_profile)
4. Připravit FB login / marketing integrace
HISTORIE A ROZHODNUTÍ
3. 1. 2026 – HERO BANNER & UI DESIGN ROZHODNUTÍ

potvrzen finální rozměr hero banneru: 1920 × 480 px

potvrzeno, že problém nebyl v grafice, ale v:

špatném použití object-contain

rozbití poměru stran

rozhodnuto:

vždy generovat grafiku přesně na 4:1

v kódu používat object-cover + pevný kontejner

zafixovány výšky hlavních boxů na homepage

sjednocen luxusní vizuální styl (gold / champagne / silver)

vytvořen referenční hero banner (Corvette + luxusní produkty)

Další krok pro nový chat:

držet se rozměru 1920×480 px

případně připravit:

mobile-safe overlay

další varianty hero bannerů (rotace)

animovaný hero (parallax / light sweep)
### 04.01.2026 – UI Poslední výherci

Vyřešeno:
- napojení admin banneru „Vzhled – karta výher“
- oprava Homepage.tsx (chybějící placement + prop)
- oprava URL obrázků výher (relativní → absolutní)

Zrušeno:
- banner nad sekcí Poslední výherci
- jakékoliv redesigny layoutu

Rozpracováno:
- finální grafika karty výher (PNG, transparentní)

Navázání v dalším chatu:
👉 vytvoření čisté grafiky karty výher a její nahrání do adminu
6.1.2025
history.md – HISTORIE A ROZHODNUTÍ
✔ Dokončeno

sjednocení barev napříč homepage

odstranění nekonzistentních akcentů

sjednocení typografie

vytvoření reusable Footer komponenty

potvrzeno, že globální footer nepředstavuje riziko

❌ Problémy, které se objevily

Lovable má tendenci:

přidávat vlastní panely

rozbíjet hierarchii

„vylepšovat“ design bez explicitního zákazu

Původní pokusy o redesign ContestCard:

příliš mnoho vrstev

glass efekty

oddělené CTA

vizuálně horší než cílový referenční obrázek

🧠 Zásadní rozhodnutí

Design ContestCard se musí řešit izolovaně

Nejprve:

1 karta → 100 % správně

Teprve poté:

uzamknout komponentu

aplikovat ji na celý web

📌 Poslední známý stav (checkpoint)

Uživatel poskytl referenční obrázek cílové karty

Bylo potvrzeno, že:

Lovable technicky zvládne tento design

ale pouze s velmi striktním promptem

Připraven tvrdý prompt zakazující:

glass

nested boxy

improvizaci

🧭 NAVÁZÁNÍ PRO DALŠÍ CHAT (VELMI DŮLEŽITÉ)
Až začne nový chat, MUSÍ:

Vědět, že:

homepage není hotová, dokud není hotová ContestCard

Pokračovat:

výhradně úpravou ContestCard

Neměnit:

data

logiku

názvy komponent

Cíl:

dosáhnout Apple-style „kapkové“ karty podle referenčního obrázku

Až bude karta schválena:

uzamknout ji

aplikovat ji všude 
FÁZE: UX + DETAIL SOUTĚŽE

Redesign ContestCard

Odstranění hlavní výhry z karet (zůstává jen název soutěže)

Sjednocení CTA napříč:

ContestCard

ContestDetail

MyContestDetail

Zaveden modal detailu bonusové výhry

Rozšíření admin formuláře o detailní popis bonusové výhry

Databázová změna: bonus_prizes.detailed_description

FÁZE: SCROLL & NAVIGACE

Detekován bug scrollu na ContestDetail

Provedena cílená safe-area oprava

Rozhodnutí: neaplikovat globálně, pouze tam, kde je problém

FÁZE: BEZPEČNOST & PARTNEŘI

Definován bezpečný model:

virtuální měna

žádné výběry

dobrovolná aktivace

Definován partnerský API model pro Shoptet / další platformy

🧭 NÁVRH POKRAČOVÁNÍ (DALŠÍ LOGICKÉ KROKY)
🔜 KROK 1 – DOLADĚNÍ DETAILU SOUTĚŽE

zkontrolovat a opravit klikatelnost bonusových karet (onClick + modal)

drobný UX polish:

hover indikátor

„Klikni pro detail“

🔜 KROK 2 – PARTNERSKÉ API (KONKRÉTNĚ)

navrhnout:

/award

/activate

/billing

struktura API klíčů

audit log tabulka

🔜 KROK 3 – ADMIN & REPORTY

přehled:

kolik MioCoinů rozdáno

kolik aktivováno

kolik fakturováno

CSV / PDF export pro partnery

🔜 KROK 4 – SECURITY CHECKLIST (PRAKTICKY)

projít:

RLS

RPC

wallet flow

základní AI + manuální audit 
2026-01-19 – Strategické rozhodnutí

Ujasněno, že Iconic Point není agentura.

OneMil potvrzen jako vlastní produkt, ne zakázkový vývoj.

Firemní web má vysvětlovat firmu + produkt, ne být čistě OneMil landing.

2026-01-19 – Partnerský systém

Rozhodnuto vybudovat centrální partnerské rozhraní.

Priorita: masová adopce bez API (kódy).

Shoptet a jiné platformy až v další fázi.

Schválen postup: Lovable → ověření modelu → SQL.

Poznámka

Tento záznam obsahuje kompletní kontext celého chatu a je určen jako výchozí bod pro nový chat, který bude řešit návrh a realizaci partnerského systému OneMil.
# Projekt OneMil – historie změn (history.md)

## 19. 1. 2026 – Partner registrace & email confirmation incident

### Kontext

Při testování partnerské registrace došlo k situaci, kdy:

* e‑mail **[eshop@onemil.cz](mailto:eshop@onemil.cz)** nebylo možné zaregistrovat
* Supabase vracel chybu:

  * `Email address "eshop@onemil.cz" is invalid`
* Chyba se objevovala:

  * při signup
  * při resend confirmation email
  * i po smazání uživatele

### Průběh řešení

1. Ověřeno:

   * email neexistuje v `auth.users`
   * frontend validace OK
   * HTML `type=email` OK
2. Provedeny pokusy:

   * mazání auth usera
   * nové signupy
   * resend confirmation email
3. Supabase Auth logy potvrdily:

   * `error_code: email_address_invalid`
4. Identifikováno:

   * problém je **serverová validace Supabase**
   * souvisí s **email confirmation / SMTP**

### Rozhodnutí

* **Dočasně vypnout Confirm Email** v Supabase Auth

### Výsledek

* Registrace `eshop@onemil.cz` → ✅ OK
* Přihlášení do partner portálu → ✅ OK
* Partner dashboard funkční

### Důležité závěry

* ❌ NENÍ chyba v kódu
* ❌ NENÍ chyba v regexu ani UI
* ✅ JE to Supabase Auth + email config

---

## Stav po zásahu

* Confirm email: **VYPNUTO (dočasně)**
* SMTP: **NEKONFIGUROVÁNO / NEFUNKČNÍ**
* Partner flow:

  * funkční
  * admin approval zachováno
  * logo approval zachováno

---

## Varování pro další chat

❗ Další asistent NESMÍ:

* zapínat confirm email bez SMTP
* měnit registrační flow
* měnit auth logiku
* znovu mazat auth uživatele

❗ Další práce MUSÍ navazovat:

* na tento stav
* se zapnutým partner portálem
* s přihlášeným partnerem `eshop@onemil.cz`

---

## Další plán (navazující práce)

1. Otestovat partnerské funkce (dashboard, statistiky)
2. Otestovat upload loga → pending → approve
3. Teprve poté:

   * vyřešit SMTP
   * nastavit sender
   * znovu zapnout email confirmation
Chronologie

Původní AdminPartners.tsx:

plná správa partnerů

pending registrace

schvalování log

detail partnera

API klíče (list + generace)

Přechod z RPC → Edge Function rotate-partner-api-key

Edge Function:

opraveno

otestováno

potvrzeno funkční

Lovable zásahy:

❌ rozbití UI

❌ odstranění JSX

❌ nahrazení souboru skeletonem

❌ nefunkční API key generace v UI

Ruční test:

PowerShell → OK

Frontend → FAIL

Aktuální závěr

Backend je v pořádku.
Problém je výhradně ve frontendu (AdminPartners.tsx + Lovable workflow).

🧭 PŘÍPRAVA PRO NOVÝ CHAT (VELMI DŮLEŽITÉ)
Co MUSÍ nový chat udělat jako první

Vyžádat si ZIP z GitHubu

kompletní projekt

hlavně:

src/pages/AdminPartners.tsx

AdminPartnersPortal.tsx

Supabase client (integrations/supabase/client.ts)

Najít POSLEDNÍ FUNKČNÍ VERZI AdminPartners.tsx

Obnovit soubor 1:1

žádné refaktory

žádné zjednodušování

žádné „clean up“

Zkontrolovat POUZE tyto body:

supabase.functions.invoke():

je tam Authorization header?

je tam správný client?

kdy se volá generování klíče (po session load?)

Lovable používat pouze s RESTORE promptem

žádné generování „from scratch“

🔍 CHECKLIST PRO NOVÝ CHAT

Nový chat si MUSÍ odpovědět na tyto otázky:

 Odkud pochází poslední funkční AdminPartners.tsx?

 Je Supabase client importovaný z jednoho místa?

 Posílá se Authorization: Bearer při invoke?

 Nevolá se Edge Function dřív než getSession()?

 Nepoužívá se omylem anon client bez headers?

 Nesnaží se Lovable „zjednodušovat“ JSX?

❗ DŮLEŽITÉ VAROVÁNÍ PRO DALŠÍ PRÁCI

❌ Nepoužívat Lovable bez přesného RESTORE promptu
❌ Nedělat další změny backendu
❌ Nedělat refaktor
✅ Obnovit → stabilizovat → teprve pak vylepšovat 
Poslední práce – Uzavření fáze: Partnerský portál & API security

Shrnutí:

Kompletně navržen a dokončen partnerský portál

Striktní oddělení partner × zákazník

UX hotové, čekací stavy vysvětlené

Admin workflow jasně definovaný

API bezpečnost uzamčena na backendu (SQL guard)

Projekt připraven na externí partnery

Důležitý závěr:

OneMil je v tomto bodě technicky připraven na reálné B2B použití.

## Historie – OneMil / partnerské odměny

### 26. 1. 2026 – Partnerské API, ruční aktivace, bezpečnost

**Cíl chatu:**

* Ověřit a dokončit partnerskou logiku pro připsání odměn (MioCoiny) a API klíče.

**Průběh a zásadní kroky:**

1. Odhaleny chyby v SQL funkcích:

   * chybějící `pgcrypto`,
   * špatné volání `digest`,
   * závislost na `auth.uid()` v kontextu bez JWT.
2. Aktivována a použita `pgcrypto` (schema `extensions`).
3. Opraveno hashování API klíče (`extensions.digest(convert_to(text, 'UTF8'), 'sha256')`).
4. Byla **dropnuta a znovu vytvořena** funkce `activate_partner_reward_sql(text, text, uuid)` kvůli změně návratového typu.
5. Ověřeno, že SQL funkce:

   * správně validuje API klíč,
   * vrací úspěšnou odpověď,
   * funguje při přímém SQL volání.
6. Napojení do UI (PartnerDashboard) přes Lovable:

   * modal + tlačítko „Aktivovat odměnu“,
   * maskovaný API klíč,
   * české toasty.
7. Ujasněna business logika:

   * ruční aktivace **není** hlavní flow pro e-shopy,
   * e-shopy mají používat **plně automatické API**.
8. UI bylo omezeno pouze pro adminy (`isAdmin`).

**Výsledek:**

* Stabilní backendový základ pro partnerské API.
* Admin / support nástroj připraven.
* Jasně definovaný další směr vývoje.

**Navazující práce (doporučení):**

* Implementovat hlavní API endpoint pro e-shopy (automatické připsání MioCoinů).
* Napojit email notifikace pro zákazníky.
* Zavést rate limiting a auditní logy.
---

# 📄 history.md (DETAILNÍ PRŮBĚH A KONTEXT)

```md
# OneMil – historie řešení Partner API Keys

📅 19.–25. 1. 2026
📍 Oblast: Admin / Partneři / API klíče

## Výchozí problém
Admin UI při kliknutí na „Vygenerovat / Rotovat API klíč“:
- hlásilo `Edge Function returned non-2xx status code`
- nebo `Failed to send a request to the Edge Function`
- API klíč se v UI tvářil jako „zrušený“ nebo neexistující

## Co se postupně zjišťovalo (chronologicky)

### 1️⃣ Frontend není problém
- `partner_id` se posílal správně
- problém nebyl v Lovable / React
- ruční přidání `apikey` headeru způsobovalo konflikty → odstraněno

### 2️⃣ Edge Function nebyla hlavní problém
- funkce se spouštěla
- OPTIONS requesty vracely 200
- POST requesty padaly až **uvnitř RPC**

### 3️⃣ Skutečné chyby byly v DB
Postupně odhalené chyby:
- `function gen_random_bytes(integer) does not exist`
  → chyběl `pgcrypto`
- `column created_by does not exist`
- `column description does not exist`
- `Could not find function generate_partner_api_key(...)`
  → signatura neodpovídala
- `cannot change return type of existing function`
  → nutný DROP
- `function already exists`
  → cache + konflikt

### 4️⃣ Důležité zjištění
Tabulka `partner_api_keys` má schéma:
- id (uuid)
- partner_id (uuid, FK)
- key_prefix (text)
- key_hash (bytea)
- created_at
- revoked_at

❌ Neobsahuje:
- created_by
- description

RPC ale tyto sloupce používala → každé volání selhalo.

---

## Výsledek práce
- Navržen **finální správný design**:
  - generování klíče řeší RPC
  - admin oprávnění řeší Edge Function
  - DB operace běží přes service role
- Edge Function byla **kompletně přepsána a nasazena správně**
- Frontend byl očištěn a je připravený

❗️Práce byla záměrně **zastavena před destruktivní DB operací**, aby pokračování proběhlo v novém chatu s plným kontextem.

---

## Co musí udělat další chat
1. Zapnout `pgcrypto`
2. DROP starou RPC
3. Vytvořit novou RPC (schválený kód)
4. Otestovat RPC
5. Otestovat Edge Function
6. Ověřit Admin UI tok

➡️ Jakmile RPC začne fungovat, celý systém se **okamžitě rozběhne**, žádné další refactory nejsou potřeba.

# 🕓 HISTORY – Partner účet (OneMil)

## 📅 Rekapitulace dokončeného chatu

V tomto chatu byl **kompletně dokončen partner účet z technického hlediska**.

---

## Průběh prací

### 1️⃣ API klíče

* Návrh a implementace bezpečného ukládání API klíčů (hash + prefix)
* Oprava validace klíče
* Testy s reálným klíčem
* Implementace rotace klíče partnerem

### 2️⃣ Bezpečnost a guard

* Zavedení jednotného API guardu
* Přidání rate‑limitu
* Ověření chybových stavů (`INVALID_API_KEY`, `RATE_LIMIT_EXCEEDED`)

### 3️⃣ Audit a logování

* Logování všech API volání
* Vytvoření tabulky + view pro API aktivitu
* Nastavení RLS politik
* Ověření, že partner vidí pouze své záznamy

### 4️⃣ Partner Dashboard

* API klíče – pouze prefix, bez zobrazení hodnoty
* Self‑service rotace klíče s potvrzením hesla
* Přidání sekce „API aktivita“
* Napojení na `partner_api_activity`

### 5️⃣ Testování

* End‑to‑end test: klíč → guard → endpoint → audit
* Ověření RLS
* Ověření rate‑limitu

---

## 🔕 Vědomě odložené věci

* Notifikace (email / push)
* Webhooky
* Statistiky
* Fakturace
* Granulární API oprávnění

---

## 🔜 Navržené další kroky (do budoucna)

* Jednoduchá API dokumentace pro partnery
* Ukázkový endpoint pro test integrace
* Případné notifikace

---

## 🏁 Závěr

Partner účet je **uzavřen jako hotový modul**.

Další práce jsou pouze rozšiřující, nikoli nutné pro spuštění.
# OneMil – historie změn (chat 1. 2. 2026)

## CMS & routing
- Ověřeno, že všechny CMS stránky běží přes `/:section/:slug`
- Potvrzeno, že footer odkazy jsou historicky hardcoded
- Identifikována nutnost přechodu na CMS jako single source of truth

## Podpora – formulář
- Vytvořen formulář „Nahlásit problém“
- Napojen na Resend (e-mail na podpora@onemil.cz)
- Vyřešen problém se slugem a diakritikou
- Formulář je viditelný pouze na správné CMS stránce
- Ověřeno, že e-mail skutečně dorazí

## Design CMS stránek
- Upraveno renderování dlouhých textů (VOP, Pravidla soutěží, FAQ)
- Přidáno automatické formátování odstavců
- Zjištěno, že některé CMS stránky mají jiný vizuální styl

## Kontakt
- Zjištěno, že Kontakt tahá data z jiných zdrojů než CMS
- Navržen refaktor: Kontakt = CMS (`info / kontakt`)
- Refaktor otestován, ale následně vrácen o krok zpět
- Rozhodnuto: dokončit až v dalším chatu systematicky

## Stav na konci chatu
- Projekt vrácen do stabilního bodu
- Žádné rozbité routy
- Formulář podpory funkční
- Design nesjednocen (záměrně ponecháno na další chat)

# OneMil – historie vývoje

## Partner sekce & API – uzavření fáze

### Co bylo dokončeno
- Kompletní partner portál
- API klíče (vytváření, rotace)
- API dokumentace spravovaná centrálně administrátorem
- Zobrazení dokumentace partnerům (read-only)
- API aktivita + logování
- Správná detekce aktivní integrace (reálná data, ne testy)
- Dashboard statistiky (kódy, konverze, status)

### API dokumentace
- Přepsána do jednotného Markdown formátu
- Opraveno číslování sekcí (1–13)
- Opraveny code blocky a tabulky
- Styling sjednocen a zjemněn
- Příliš agresivní grafika byla revertována
- Aktuální verze je považována za finální pro v1

### Rozhodnutí
- MioCoin je **věrnostní bod**, ne měna
- API funguje bez nutnosti dalších zásahů
- Partner sekce je považována za stabilní základ

### Odložené téma (záměrně)
- Nastavení konverzního poměru (útrata → MioCoiny)
- Plynulé (desetinné) MioCoiny
- Řešit samostatně v dalším chatu

---

## Stav na konci této fáze
✅ Partner sekce hotová  
✅ API hotové  
✅ Dokumentace hotová  
⏸ Další rozvoj odložen záměrně

Další kroky budou řešeny v novém chatu.
## 📄 `history.md`

```md
# OneMil – historie změn

## 2026-02-02 – Fakturace & email pipeline
- Nasazena edge function `generate-isdoc`
  - generuje ISDOC faktury
  - ukládá do Storage (`partner-invoices`)
  - zapisuje do `partner_invoice_exports`

- Vyřešeny problémy se Storage:
  - chybějící bucket
  - RLS policy blokující upload
  - špatná upload cesta (root → povinná složka)

- Ověřeno:
  - ISDOC se fyzicky ukládá
  - veřejná URL funguje

- Email systém:
  - `email_queue` zavedena a otestována
  - `process-email-queue` odesílá emaily s ISDOC přílohou
  - staré pending emaily bez přílohy označeny jako `failed`
  - úspěšně odeslán testovací email (`sent`)

- Cron:
  - pokus o přechod z měsíční na týdenní fakturaci
  - chyba: neexistující job `partner_invoices_monthly_auto`
  - zjištěno, že je nutné pracovat s reálným `jobid`

## Stav na konci chatu
- Celá pipeline ISDOC + email je funkční
- Chybí jen:
  - vyčištění starých cron jobů
  - nastavení finální týdenní automatiky (neděle)
Dnešní záznam 7.2.2026

Téma: Příprava referral / affiliate systému + Shoptet integrace

✔️ Provedeno

Dokončeno a odesláno Shoptet schvalování doplňku

Ujasněn business model:

e-shop nic neplatí předem

účtování až při využití MioCoinů

Aktualizovány texty „Jak OneMil funguje“

Navržen referral model pro sociální sítě

Ověřeno, že model:

není hazard

je právně bezpečný

je technicky jednoduchý

📌 Klíčová rozhodnutí

Referral odměna pouze z dobití MioCoinů

Minimální provize: 5 %

Žádná odměna za registraci

Referral sekce bude součástí profilu uživatele

🔜 Navazující úkol (NOVÝ CHAT)

Vytvořit referral / affiliate funkci v OneMil

návrh DB (referral_code, referred_by, reward_log)

logika připisování 5 % z dobití

UI: „Pozvi přátele“ v profilu

záznamy do historie / peněženky 
7. 2. 2026 – Referral & Email audit

Dokončen a otestován referral systém:

procentní provize + jednorázový bonus

správné připisování do peněženky

Ověřeno na reálných uživatelích:

referral vazba

opakovaná dobití

první dobití bonus

Potvrzeno:

referral provize se NEUKLÁDAJÍ do bonus wallet

nejsou potřeba převody

Email worker:

referral emaily odesílány korektně

fakturační emaily bez přílohy zablokovány

Rozhodnutí:

faktury zatím bez PDF

generování dokumentů odloženo na samostatný krok

🔜 Další logický krok (až později)

Návrh a implementace fakturačního modulu (PDF / ISDOC)

Napojení na email s přílohou

Samostatný audit faktur 
📘 OneMil – historie změn (fakturační modul)

🕓 2026-02-08 (neděle)

### Shrnutí

V tomto chatu byl dokončen a stabilizován celý fakturační proces OneMil.

### Provedené kroky

* Detailní audit generování faktur (cron, manuál, single-partner)
* Oprava chybného období a duplicitních faktur
* Normalizace fakturačního týdne na **pondělí–neděle**
* Zavedení striktní idempotence (žádné 2 faktury za stejný týden)
* Doplnění číslování faktur a variabilních symbolů
* Implementace a oprava PDF generátoru (Unicode / CZ diakritika)
* Napojení PDF na Storage + možnost stažení
* Oprava emailového workflow (odesílání jen z `draft`, přechod na `issued`)
* Přidání sekce **Faktury** do partnerské administrace
* Umožněna editace fakturačních údajů partnera

### Test

* Připraven testovací partner BOHEMIA INFINITY s.r.o.
* Vloženy testovací aktivace MioCoinů
* Ověřeno, že jsou připraveny k pondělní fakturaci

### Další krok

* Ověřit pondělní automatický běh (vytvoření faktury + email)
* Následně vyčistit stará testovací data
* Doladit texty emailu a PDF (finální polish)

Stav: ✅ fakturační modul připraven k produkčnímu ověření
📅 2026-02-08
🧩 Influencer Affiliate – uzavření V1

Shrnutí:
Během tohoto chatu byl kompletně navržen, implementován a stabilizován influencer affiliate modul v rámci projektu OneMil.

Klíčové kroky:
- Rozhodnutí nepoužívat samostatnou influencer tabulku
- Využití existující tabulky `partners` s rozlišením přes `notes`
- Oprava login redirect logiky (partner vs influencer)
- Oddělení admin view a influencer view
- Implementace influencer dashboardu s reálnými daty
- Oprava výpočtů:
  - konverze = unikátní platící uživatelé
  - výdělek = pouze paid
- Implementace výplatního flow:
  - přidány sloupce payout_* do partners
  - influencer vyplňuje účet
  - admin vidí účet
- Vyřešen kritický UX bug se ztrátou focusu v inputech
- Dolaďeno UX pro české účty (číslo účtu / kód banky)

Výsledek:
Influencer modul je stabilní, testovatelný a připravený pro interní QA.

Doporučený další krok:
Spustit **samostatný testovací chat**, ve kterém se provede:
- kompletní manuální test všech influencer scénářů
- test admin → influencer → payout flow
- ověření edge-cases (neschválený influencer, chybějící účet, žádné provize)

Stav modulu:
UZAVŘENO – Influencer Affiliate V1
Influencer systém – kompletní audit & testování

Opraveny RLS politiky

Opraven výpočet provizí

Nastaven produkční cron

Otestován reálný tok plateb → provize

Opraven admin routing (login loop)

Oddělen onboarding od admin/influencer sekcí

Opraven flow Podmínky spolupráce:

přidáno potvrzení

přidán návrat zpět

Přidán sloupec partners.terms_accepted_at

Napojeno na existující potvrzovací logiku

Přidán refetch, aby se stav hned propsal do UI

Právní ověření

Hráč:

souhlas uložen v user_legal_acceptances

Partner / Influencer:

souhlas uložen v partners.terms_accepted_at

Potvrzeno SQL testy, že se data NEMÍCHAJÍ

Výsledek

🎯 Influencer systém je připravený pro produkci
🎯 Právně auditovatelný
🎯 Bez technického dluhu v core logice
## 📘 OneMil – Historie změn

### 2026-02-10 – Uzavření Influencer modulu

**Shrnutí:**
Během tohoto chatu byl kompletně dokončen, ověřen a zabezpečen influencer systém v OneMil.

### Provedené kroky

* Ověřen **DB stav influencer systému** (RLS, tabulky, provize, cron, souhlasy)
* Opraven a ověřen **tracking `?ref=`**
* Doplněn **Admin ↔ Influencer audit**
* Implementována **správa provizí v Admin UI**
* UX doladění stavů influencera (pending / rejected / approved)
* Implementován **antifraud na registraci** (soft – bez limitů)
* Implementován **antifraud na první dobití**:

  * minimální první platba ≥ 50 Kč
  * provize až po splnění této podmínky
* Prokázáno, že:

  * registrace sama o sobě negeneruje provizi
  * platby < 50 Kč negenerují provizi

### Klíčový závěr

Influencer systém je **ekonomicky bezpečný**, férový vůči influencerům a připravený na produkční provoz.

### Navazující práce (pro další chat)

* Manuální test **Admin ↔ Influencer**:

  * kontrola všech zobrazovaných dat
  * shoda Admin UI ↔ DB
  * shoda Influencer UI ↔ DB

**Stav modulu:** DONE ✅
# OneMil – Historie úprav (Partner Portal)

## 18. 02. 2026 – Design sjednocení Partner Portal

### Provedeno:
- Úprava messaging systému (jméno, email, telefon v hlavičce)
- Badge rozlišení influencer / partner
- Řazení zpráv podle data
- Zlepšení čitelnosti nepřečtených zpráv
- Test exportu XML pro Air Bank
- Oprava fallback jména v AdminMessages (partners.name / contact_email)
- Hromadný export výplat XML

### Pokus o redesign Partner Dashboard
Lovable aplikoval částečné změny:
- úpravy wrapperu
- whitespace změny
- částečné gold akcenty
- žádná změna logiky

Výsledek:
Design není plně sjednocen.
Luxusní styl je aplikován nekonzistentně.
Potřebné je systematické sjednocení podle Influencer patternu.

---

# DALŠÍ KROK – STRATEGICKÝ PLÁN

## FÁZE 1 – Sjednocení layout systému (BEZ změny logiky)

1. Identifikovat Influencer layout pattern:
   - Wrapper: container mx-auto px-4 py-8 space-y-8
   - Card: border-border/50
   - CardHeader + CardTitle + CardDescription pattern
   - Stats card styl
   - Icon + heading spacing

2. Aplikovat identický pattern na:
   - PartnerDashboard
   - PartnerMessages
   - PartnerInvoices
   - PartnerBillingForm
   - API sekce

⚠️ Bez:
- přejmenování souborů
- přidávání nových komponent
- změny tabulek
- změny routing
- změny Supabase logiky

---

## FÁZE 2 – B2B vizuální styl (NE luxury)

Cíl:
Čistý modern SaaS B2B vzhled

Barevný směr:
- Navy background
- Slate cards
- Blue accent
- Jemné border opacity
- Žádné gold efekty
- Žádné glow
- Žádné gradient hero

---

## FÁZE 3 – UX vylepšení

- Konzistentní výška sekcí
- Lepší spacing mezi sekcemi
- Shodné stats cards napříč rolemi
- Lepší vizuální hierarchie nadpisů
- Lepší mobile padding

---

## FÁZE 4 – Finální kontrola

- Porovnání:
  - Influencer Dashboard
  - Partner Dashboard
  - Admin sekce

Cíl:
Jednotný systémový design napříč celou aplikací.

---

# PRIORITA

1️⃣ Sjednotit layout pattern  
2️⃣ Ověřit že nic neporušuje logiku  
3️⃣ Teprve potom řešit jemné design detaily  

---

Projekt je stabilní.
Není rozbitá žádná business logika.
Jedná se čistě o UI sjednocení.
# OneMil -- HISTORY.md

## 18.02.2026 21:56

### 🎬 Contest Gallery Implementation

-   Created new table `contest_media` with proper indexing and RLS.
-   Implemented gallery rendering inside ContestDetail.
-   Added background media type for cinematic page effect.
-   Enabled multiple images and videos per contest.
-   Implemented image upload to Supabase storage (`contest-images`).

### 🐛 Critical Runtime Bug Discovered

-   App crashing with:
    `RUNTIME_ERROR – Unknown file – has_blank_screen: true`
-   Cause: `setState()` calls inside JSX render block.
-   Resulted in infinite render loop.

### ✅ Fix Applied

-   Removed all debug instrumentation from JSX.
-   Restored clean ContestDetail.tsx.
-   Verified:
    -   Video embed works
    -   Image gallery works
    -   Background works
    -   No runtime crashes

------------------------------------------------------------------------

### 📌 System Stability Restored

ContestDetail is now stable and production-ready.

Next phase should focus on UX polish and performance improvements.
## 2026-02-19 – ContestDetail UI Balance Update

### 🔹 Background
- Odstraněna možnost YouTube/video background.
- Ponechány pouze statické fotografie.
- Vyřešen Lighthouse performance konflikt (animace ponechány záměrně).

### 🔹 Wallet & Bonus Box Redesign
- Zaveden symetrický layout:
  - Wallet box: logo vlevo, větší kredit.
  - Bonus box: logo vpravo.
- Logo velikost sjednocena (~70–80 % výšky boxu).
- Vertikální centrování textů.
- Zachována původní velikost kontejnerů.
- Nezměněna struktura layoutu.

### 🔹 Výsledek
- Vizuální stabilita.
- Prémiovější dojem.
- Žádné rozbití gridu.
- UX priorita potvrzena.

ContestDetail považován za vizuálně uzavřený (v této fázi).
# OneMil – Development History Summary

## Realtime Feed Implementation
- Initial contest-scoped subscription
- Migrated to global winners feed
- Fixed public.users.id vs auth.uid mismatch
- Added contest name resolution
- Implemented per-type cooldown
- Extended to support miocoin wins
- Refined Czech wording for clarity and legal tone

## Ticket Flow Optimization
- Eliminated artificial delays
- Added strict single-request guard
- Prevented double-spend risk
- Optimized modal performance
- Improved perceived speed

## Audio Integration
- Added global audio manager
- Implemented autoplay-compliant interaction trigger
- Added localStorage persistence
- Added visibility pause handling
- Confirmed cross-page persistence

## UX Refinement
- Premium toast animation
- Gold shimmer effect
- Refined message phrasing
- Balanced luxury + energy brand tone

---

Current phase:
System operational. Preparing for production-grade security validation, admin review, and full system testing before launch.
# ONE MIL – FIX HISTORY

---

## 2026-02-XX – Zásadní bezpečnostní opravy

Problém:
- Public UPDATE wallets
- Public UPDATE tickets
- Public INSERT payments
- Public UPDATE winners

Řešení:
- Kompletní RLS hotfix
- Uzamčení citlivých tabulek
- Admin role izolace

Stav: OPRAVENO

---

## 2026-02-XX – Neukládal se profil

Problém:
- Některé účty neměly public.users / wallets / profiles
- Profil ukládal do users, ale UI četlo profiles

Řešení:
- Kompletní backfill všech účtů
- Trigger handle_new_auth_user ověřen
- Synchronizační trigger users → profiles

Stav: OPRAVENO

---

## 2026-02-XX – Race condition nákup ticketu

Problém:
- Edge funkce nebyla atomická

Řešení:
- Přepnuto na RPC buy_ticket_atomic
- DB lockování contest + wallet

Stav: OPRAVENO 
# OneMil – HISTORY.md

## 2026-02-22 – USER 100% Core Audit

### 🔎 Payment Layer

* Discovered missing UNIQUE on `stripe_session_id`
* Verified no duplicate historical data
* Added UNIQUE constraint safely
* Confirmed Stripe retry safety

### 🎟 Ticket System

* Confirmed no duplicate tickets
* Added UNIQUE `(contest_id, number)`
* Verified no oversell
* Implemented `check_ticket_limit()` trigger
* Confirmed safe deployment (no contest at limit)

### 💰 Wallet Mechanism

* Confirmed deduction via trigger `on_coin_redeemed`
* Analyzed `redeem_coin_on_ticket()` logic
* Verified atomic UPDATE pattern prevents race conditions
* Confirmed DB-level safety without FOR UPDATE

---

## 🧩 Key Discoveries

* Production DB not version-controlled
* No migration folder in repository
* No ledger table (wallet derived logic)
* Core logic handled in DB triggers, not app layer

---

## 📌 Status After Audit

Financial + Ticket layer secured at database level.
System now protected against:

* Stripe duplication
* Ticket duplication
* Ticket oversell
* Coin double-spend

---

## ➡ Next Chat Must Continue With:

1. Full RLS policy audit (all public tables)
2. Admin privilege boundary testing
3. Stripe webhook replay / idempotency deep test
4. Role-based access validation (user vs admin)

Audit context complete and ready for continuation.
# OneMil – SECURITY HARDENING LOG

## 22.02.2026 – ACCESS CONTROL AUDIT

### Krok 1 – DB audit
- zmapovány všechny RLS policies
- kontrola GRANT
- kontrola SECURITY DEFINER
- kontrola trigger funkcí
- ověřena izolace mezi uživateli

Výsledek: DB vrstva bezpečná.

---

### Krok 2 – Edge Function zabezpečení

Zavedeno:
INTERNAL_FUNCTION_TOKEN

Uzavřeny všechny veřejné verify_jwt = false funkce.

---

### Krok 3 – USER Edge Functions refactor

Převedeno na JWT model:

- send-support-email
- send_event_to_sofinity
- create-stripe-checkout
- send-marketing-consent-notification
- send-test-notification

Testování:
- ruční fetch bez JWT → 401
- přihlášený uživatel → 200
- Stripe checkout úspěšný

Status: OK

---

## AKTUÁLNÍ STAV

USER vrstva bezpečná.
INTERNAL vrstva chráněna tokenem.
ADMIN vrstva čeká na role guard implementaci.

---

## DALŠÍ FÁZE

ADMIN SECURITY HARDENING
- verify_jwt = true
- kontrola profiles.role
- test role eskalace
- test běžný uživatel → 403 
# OneMil – HISTORY LOG

## 22. 02. 2026 – ADMIN SECURITY HARDENING

### Fáze 1 – Audit

* Kontrola RLS stavů
* Kontrola anon policies
* Kontrola public EXECUTE
* Kontrola SECURITY DEFINER funkcí
* Kontrola realtime publikace

Zjištění:

* winners mělo public read
* realtime bylo aktivní
* některé tabulky měly otevřený přístup

---

### Fáze 2 – Hardening

1️⃣ Zrušen public přístup na winners
2️⃣ Zapnuto FORCE RLS
3️⃣ Odstraněny všechny anon/public policies
4️⃣ Zrušeny public granty
5️⃣ Vypnuta realtime publikace
6️⃣ Uzavřen user_roles model

---

### Fáze 3 – Public API vrstva

Vytvořeno schéma:

* public_api

Vytvořené VIEW:

* contests
* winners

Charakteristika:

* Whitelist sloupců
* Žádné citlivé údaje
* Žádné user_id
* Anon SELECT pouze na VIEW

---

## Aktuální Stav

Database je bezpečně uzavřená.
Frontend může číst pouze přes public_api.
Admin vrstva zatím není implementována přes RPC.

---

## Další krok v novém chatu

Navrhnout a implementovat:

ADMIN SERVER LAYER

Bezpečný přístup k:

* contests
* winners
* users
* payments
* audit logs

Výhradně přes RPC nebo Edge Functions s kontrolou role.

---

Tento snapshot představuje bezpečný základ před pokračováním vývoje admin systému.
# ONEMIL DEVELOPMENT HISTORY

## 2026-03-08

### GitHub repository connected

Repository cloned locally:

git clone https://github.com/Divuna/million-ticket-draw.git

Local folder created:

C:\Users\PC_3\Documents\million-ticket-draw

Project files downloaded.

---

### Dependencies installed

Command used:

npm install

533 packages installed.

Audit result:

13 vulnerabilities
(6 moderate, 7 high)

No fixes applied yet.

---

### Playwright installed

Command used:

npx playwright install

Downloaded:

Chromium  
Firefox  
Webkit  
FFMPEG  
Winldd

Browsers installed successfully.

---

### Playwright configuration error

Error encountered:

ERR_MODULE_NOT_FOUND

Cause:

playwright.config.ts imported

lovable-agent-playwright-config

This package does not exist in npm.

Solution:

Config rewritten to standard Playwright configuration.

---

### Development server started

Command used:

npm run dev

Vite server started successfully.

Local URL:

http://localhost:8080

Network URL:

http://192.168.3.5:8080

Application loads.

---

### Playwright test execution

Command executed:

npx playwright test --headed

Result:

No tests found

Reason:

Repository does not include any test files.

No tests directory exists.

---

### Conclusion

System builds and runs locally.

However:

Automated testing has not yet been implemented.

Next development phase must focus on:

Full E2E testing of system features.

---

### Next session objectives

1. Implement Playwright E2E test suite
2. Simulate real user flows
3. Test authentication
4. Test role assignment
5. Test wallet logic
6. Test ticket system
7. Test admin panel
8. Test influencer system
9. Test partner integration
10. Verify RLS policies
11. Run security audit
12. Prepare production readiness checklist 
# OneMil – Development History

## 2026-03-08

### Playwright testing setup

Playwright byl nainstalován a nakonfigurován.

Příkazy:

npm install -D @playwright/test  
npx playwright install

### Spuštění testů

npx playwright test

Výsledek:

Running 13 tests  
13 passed

### Ověřené scénáře

Homepage loads  
Open login page  
Register user  
Login flow interaction  
Contest page loading  
Ticket purchase simulation  
Wallet page loading  
Complete OneMil flow  
Full system flow  
Database integration

### E2E testy

e2e_onemil.spec.ts  
Testuje kompletní flow uživatele.

e2e_full_onemil.spec.ts  
Testuje celý systém soutěže.

e2e_database_onemil.spec.ts  
Testuje interakci aplikace s databází.

onemil_full_system.spec.ts  
Testuje kompletní systémový scénář.

### Databázová kontrola

Dotaz:

select count(*) from tickets

Výsledek:

538

Závěr:

Ticket systém funguje a zapisuje data.

### Kontrola winners

Počet záznamů:

67

Pravděpodobně bonusové výhry nebo testovací data.

### Identifikace ticketů

tickets.id je UUID.

Nelze použít max(id) pro určení posledního ticketu.

Počet ticketů je nutné kontrolovat pomocí:

count(*)

### Výsledek auditu

Frontend flow: OK  
Registrace: OK  
Login: OK  
Wallet: OK  
Contest: OK  
Ticket purchase: OK  
Database write: OK  
E2E flow: OK

---

## Stav projektu

Aplikace je funkční a připravena na další fázi auditu.

Další práce:

- ochrana limitu ticketů
- winner selection mechanism
- admin panel audit
- anti-cheat ochrana
- production readiness test 
# OneMil – History Log

## 2026-03-08
### Velký databázový audit

Proveden kompletní audit databáze Supabase.

Kontrolováno:

tickets  
winners  
wallets  
vouchers  
referenční integrita

---

### Tickets

Výsledek:

- 112 ticketů
- poslední ticket = 112
- žádné duplicitní ticket numbers

Ticket engine je funkční.

---

### Winners

Kontrolováno:

- existence více main winners
- constraint uniq_main_winner_per_contest

Výsledek:

- žádná soutěž nemá více main winners
- tabulka winners konzistentní

---

### Referential integrity

Kontrolováno:

orphan tickets  
orphan winners  
orphan wallets  

Výsledek:

všechny testy = NULL

databáze je čistá.

---

### Voucher purchase refactor

Původní problém:

read → compute → write pattern

To mohlo způsobit race condition.

Řešení:

implementována RPC funkce:

buy_voucher_atomic()

Transakce:

1 lock wallet
2 kontrola voucher
3 insert/update user_vouchers
4 odečet coinů
5 increment voucher redeemed_count

Frontend byl upraven:

Vouchers.tsx  
Homepage.tsx  
VoucherCarousel.tsx

---

### Trigger audit

Na tabulce tickets existují:

audit_tickets_trigger  
trg_ticket_insert  
trg_check_bonus_prize_on_ticket  
trg_close_contest_on_million_ticket

Logika:

ticket insert  
→ bonus prize check  
→ million ticket check  
→ contest close  
→ winner creation

---

### Stav systému

Backend soutěže je stabilní.

Testy potvrzují:

tickets OK  
wallet OK  
voucher purchase OK  
winners OK  
constraints OK  

---

# Další práce

Další fáze projektu:

ADMIN SYSTEM AUDIT

Potřebujeme ověřit:

admin dashboard  
contest management  
winners management  
voucher management  
payments  
admin role permissions  
RLS bezpečnost

---

# Úkol pro další chat

Proveď **kompletní audit admin části v Lovable**.

Audit musí zjistit:

co je hotové  
co není napojené  
co nefunguje  
co chybí  
jaké jsou bezpečnostní díry  
jestli admin může poškodit soutěžní logiku 
# OneMil – HISTORY LOG

## 08.03.2026 – ADMIN SYSTEM AUDIT

Proveden kompletní audit admin systému.

Audit zahrnoval:

- admin dashboard
- supabase queries
- RLS policies
- ticket engine
- ticket map
- winner selection
- database indexes

---

# PROBLÉM 1

Ticket Map ukazovala

0 / 1 000 000

i když existovaly tickety.

Příčina:

RLS na tabulce tickets
bez SELECT policy.

Řešení:

policy vytvořena:

admin_read_tickets

auth.uid() = admin UUID

Ticket Map nyní funguje.

---

# PROBLÉM 2

Admin Test Suite

error:

statement timeout

Příčina:

COUNT queries přes velké tabulky.

Lovable optimalizoval:

- limit queries
- sequential execution

---

# PROBLÉM 3

tickets tabulka neměla index na contest_id.

Riziko:

pomalé dotazy při velkém objemu ticketů.

Řešení:

CREATE INDEX tickets_contest_id_id_idx
ON tickets(contest_id, id)

---

# TESTY PROVEDENY

ticket count
539

contest distribution
OK

duplicate tickets
OK

winner random selection
OK

---

# STATUS

| systém | stav |
|-------|------|
ticket engine | OK
contest engine | OK
admin dashboard | OK
RLS | OK
database performance | OK

---

# NEOTESTOVANÉ ČÁSTI

bonus_prizes trigger

contest closing trigger

winner insert pipeline

---

# DALŠÍ KROKY

1 test bonus prize mechanism
2 test contest closing
3 test winner insert
4 admin stress test

---

# POZNÁMKA

Systém je po dnešním auditu stabilní.

Další audit zaměřit na:

- contest lifecycle
- bonus prize distribution
- winners pipeline 
# OneMil Development History

## 08.03.2026
Large system audit executed.

Checked:

tickets  
bonus_prizes  
winners  
wallets  
payments

Detected duplicate bonus prize positions.
Fix prepared.

---

## 09.03.2026
Contest engine audit continued.

Verified:

ticket generation
winner detection
contest closing logic

Admin UI allowed manual closing of contests.
Security risk identified.

---

## 10.03.2026
Admin system modifications.

Removed ability to set:

status = closed

from Admin UI.

Contest must close only through system logic.

Files modified:

AdminContestManagement.tsx  
ContestDetailAdmin.tsx

---

## 12.03.2026

Stripe refund system implemented.

Edge Function created:

stripe-refund

Features:

JWT verification  
Admin role verification  
Stripe refund creation  
Wallet coin subtraction  
Audit log insertion  

Refund test successful.

Example:

payment
91cdfc01-89ec-4480-b90e-4337ea90ece0 | refunded

audit log
payment_refunded

Wallet updated.

---

## RLS Security Audit

RLS verified on all critical tables.

Tables secured:

profiles  
contests  
tickets  
winners  
bonus_prizes  
wallets  
payments  
messages  
notifications  
user_roles  

Result:

System security OK.

---

# Next Development Phase

Contest Engine Final Audit 
2026‑03‑12 Development Session

Major setup tasks completed.

GitHub Integration

Local repository cloned:

https://github.com/Divuna/million-ticket-draw

Git remote verified: origin fetch/push active.

Cursor now editing repository directly.

Local Development Environment

Installed dependencies via npm.

Server started with:

npm run dev

Vite dev server confirmed running.

Cursor AI Audit

Full repository audit executed focusing on:

Supabase integration

ticket generation

contest closing logic

winner selection

Audit identified several architecture and security issues.

Supabase Security Risk

Detected hard-coded anon key in project source. Action required: move to environment configuration.

Contest Close Edge Function

Potential logic failure where contest may close without inserting winner record. Requires transaction safety.

Ticket Purchase Flow Review

Client currently allowed to pass user_id into RPC. Must enforce auth.uid() validation in SQL.

Bonus Prize Distribution

Two conflicting mechanisms exist:

Client distribution logic Edge function distribution logic

System must choose one authoritative implementation.

Cursor Configuration Notes

Cursor connected to repository. Model currently running in Auto mode (free plan).

Recommended Cursor workflow:

Use prompts such as:

@codebase audit supabase integration @codebase check ticket race conditions @codebase verify database constraints

Cursor should not apply code changes automatically without review.

All modifications must be reviewed and committed through git.

Next Development Goals

Priority order:

1 Fix Supabase credential exposure 2 Harden close-contest transaction 3 Enforce auth.uid validation in buy_ticket_atomic 4 Unify bonus prize distribution logic 5 Implement secure random winner draw if required

Recommended Future Audits

Database constraints:

unique ticket numbers

contest capacity limits

Concurrency tests:

multiple ticket purchases simultaneously

Security:

RLS policies

RPC parameter validation

End of state snapshot.
# OneMil – Audit History

## Phase 1 – Contest Engine Audit

Byl proveden manuální audit hlavní funkce pro nákup ticketu.

Audit se zaměřil na:

- zamykání contest řádku
- zamykání wallet
- správný výpočet ticket čísla
- bonus prize logiku
- uzavření contestu

Výsledek:

logika nákupu ticketu je transakčně bezpečná.

---

## Phase 2 – Data Integrity

Byly provedeny SQL kontroly nad databází:

duplicate tickets

GROUP BY contest_id, number

duplicate winners

GROUP BY prize_id

multiple main winners

GROUP BY contest_id

Výsledek:

nebyly nalezeny duplicity.

---

## Phase 3 – Bonus Prize Engine

Audit bonus systému.

Tabulka:

bonus_prizes

Logika:

ticket_position určuje výherní ticket.

Pokud ticket odpovídá ticket_position:

zapisuje se bonus winner.

Výsledek:

bonus prize systém funguje správně.

---

## Phase 4 – Wallet System

Byl ověřen mechanismus odečtu coinů.

wallet update probíhá uvnitř transakce ticket nákupu.

To zabraňuje nekonzistentním stavům wallet.

---

## Phase 5 – Winner Recording

Byla ověřena tabulka winners.

Zapisují se:

bonus winners  
main winners  

Každý contest má pouze jeden main winner.

---

## Phase 6 – Admin & External Systems

Audit potvrdil funkčnost:

admin prize management

partner API

partner reward activation

influencer tracking

influencer commissions

invoice system

Tyto moduly byly označeny jako stabilní.

---

## Phase 7 – Cursor Integration

Cursor byl napojen na databázi přes MCP Postgres server.

Konfigurace umožňuje:

analýzu schématu databáze  
analýzu SQL funkcí  
strukturální audit projektu  

Zatím není potvrzeno, zda Cursor může provádět plné runtime SQL testy.

---

## Phase 8 – Remaining System Verification

Před produkčním nasazením musí být dokončeny:

parallel purchase test

wallet concurrency test

last ticket scenario

orphan tickets validation

orphan winners validation

event queue verification

cron jobs verification

admin security review 
# OneMil – Development History

## 12.03.2026

### Contest Close Debug

Admin button "Uzavřít soutěž" failed.

Error:

function public.close_contest(uuid) not found

Cause:

RPC function missing in database.

Fix:

Created function:

close_contest(uuid)

Function performs:

1 selects winning ticket
2 inserts record into winners
3 sets contest.status = closed

---

### Second Error

Error:

null value in column "type" of relation "winners"

Cause:

winners.type is NOT NULL.

Fix:

close_contest() updated to insert:

type = 'main'

---

### Test Result

Manual test executed.

Result:

contest.status = closed

Winner row successfully created.

Contest closing now works from Admin.

---

# Current System Status

Working:

contest lifecycle  
winner generation  
contest closing from admin

Previous system audits already performed earlier.

They must NOT be repeated.

These include:

- orphan tickets
- orphan winners
- contest integrity checks

---

# Next Development Phase

Focus moves to **Admin Panel completion**.

Goal:

Make Admin capable of running the entire system.

---

# Next Chat Workflow

Next chat must:

1 inspect Admin panel
2 identify missing functionality
3 repair modules step by step

Order of work:

1 contest admin verification
2 ticket map verification
3 winner management
4 payments overview
5 notification system
6 validation tools
7 Sofinity logs

Every step must:

- be implemented
- tested
- confirmed working

before continuing.

---

# Important Rule

Do not introduce new systems or tables.

Finish existing Admin functionality first.
# SYSTEM STATE — OneMil Project

Last update: 15.03.2026

## Current Development Environment

Primary development environment has been changed.

From now on the main development tool is:

**Cursor IDE**

Cursor will be responsible for:
- code auditing
- database inspection
- repository analysis
- implementing fixes
- generating migrations
- editing project files

ChatGPT will be used mainly for:
- architecture reasoning
- system design
- debugging guidance
- preparing instructions for Cursor

All code level work should now be executed inside Cursor.

---

# Project: OneMil (Million Ticket Draw)

Repository location:
# OneMil – Development History

## Phase: Deep backend stabilization audit
Date: 2026-03-15

A full automated backend audit was executed using Cursor autonomous analysis.

The goal was to verify the integrity, safety, and performance readiness of the OneMil backend.

## Audit scope

Areas analyzed:

- database schema
- SQL functions
- triggers
- migrations
- wallet system
- contest engine
- ticket generation
- bonus prize logic
- event pipeline
- push notification pipeline
- edge functions

Multiple reports were generated:

.cursor/OVERNIGHT_FULL_AUDIT.md  
.cursor/PRODUCTION_READINESS_REPORT.md  
.cursor/DATABASE_RISKS.md  
.cursor/PERFORMANCE_LIMITS.md  
.cursor/NEXT_ACTION_PLAN.md  

## Issues discovered

### Critical issues

1. Bonus prize wins were not returned to the client due to trigger execution order.

2. purchase-ticket edge function always returned Unauthorized because service role client was used for RPC calls.

3. Hardcoded Sofinity API token in database function.

### High-priority issues

- duplicate triggers on voucher events
- redundant ticket trigger performing COUNT(*) per purchase
- excessive UNIQUE indexes on winners table
- missing ledger entries for bonus wallet updates

### Medium issues

- missing safety constraints
- missing database guards for counter limits
- redundant index structures

## Fixes applied

Six migrations were generated and applied.

Migration list:

20260315240000_fix_bonus_prize_response.sql  
20260315260000_cleanup_duplicate_triggers.sql  
20260315270000_remove_redundant_ticket_trigger.sql  
20260315280000_cleanup_winners_indexes.sql  
20260315290000_additional_safety_constraints.sql  
20260315300000_fix_bonus_wallet_ledger.sql  

## Results after migration

Database integrity verified.

Checks performed:

- wallet balance validation
- duplicate ticket detection
- duplicate winner detection
- contest ticket counter consistency
- constraint validation

All checks passed.

Performance improvement achieved by removing COUNT(*) trigger from ticket purchases.

Estimated improvement:

30-40% higher purchase throughput.

## Current system state

The OneMil backend is now considered stable and production-capable from a database perspective.

The most critical systems are now verified safe:

- contest engine
- wallet ledger
- bonus prize logic
- ticket concurrency
- winner generation

## Remaining work

Remaining work focuses on:

- Sofinity token security (move token to Supabase Vault)
- full E2E testing
- contest lifecycle testing
- payment flow testing
- load simulation 
# OneMil Development History

## Phase: System Stabilization and Final Verification

Date: 2026-03-16

This phase focused on verifying system integrity, security and concurrency safety.

---

# Backend Lifecycle Tests

Completed successfully.

Tests:

user_registration  
wallet_creation  
voucher_purchase  
voucher_redeem  
ticket_purchase  
bonus_prize_trigger  
contest_close  
winner_generation  
wallet_ledger_consistency  
event_pipeline_sofinity

All returned PASS.

---

# Stability Tests

parallel_ticket_purchase
PASS

Concurrent purchases were executed.

Results:

- no duplicate ticket numbers
- no race conditions
- correct wallet balance updates

Ticket numbering uses row locking:

SELECT ... FOR UPDATE

---

last_ticket_behavior
PASS

Verified:

- last available ticket
- correct contest completion
- no oversell conditions

---

event_pipeline_delivery
PASS

Event pipeline confirmed:

events → processing → Sofinity integration.

---

# Production Readiness Tests

load_test_100_users
PASS

100 simultaneous users simulated.

System remained stable.

No performance degradation observed.

---

stripe_webhook_flow
PASS

Stripe payment → wallet credit pipeline verified.

update_wallet_after_payment trigger executed correctly.

Wallet balances updated atomically.

---

rls_security_check
PASS (after fix)

Critical vulnerability discovered:

Users could directly update wallet balance.

Policy removed:

DROP POLICY "Users can update own wallet"

Wallet manipulation now restricted to RPC.

---

rate_limit_test
ISSUES → FIXED

Initial audit revealed no rate limiter.

Rate limiter implemented:

purchase-ticket edge function.

Limit:

5 purchases / 5 seconds / user.

Sliding window logic implemented.

All tests PASS after fix.

---

admin_panel_integration
ISSUES → FIXED

Problems found:

1. create-contest used hardcoded email
2. analytics-query function missing
3. close_contest had no role check
4. payments RLS blocked admin

Fixes implemented:

- role validation via user_roles
- analytics-query edge function added
- close_contest secured with has_role
- admin_payments_read_all policy created

All admin endpoints verified.

---

# Current System State

Backend architecture confirmed safe:

wallet atomicity  
ticket concurrency protection  
secure RLS policies  
payment integration  
admin management tools

Contest engine ready for production.

---

# Next Development Phase

Future work:

1. unify role system

Current dual role sources:

public.users.role  
public.user_roles.role

Plan:

use user_roles as single role source.

---

2. monitoring

Add:

- contest analytics
- purchase metrics
- wallet activity monitoring

---

3. admin dashboard improvements

Optional:

- contest statistics
- purchase heatmap
- real-time ticket map

---

# Conclusion

The OneMil backend system is now fully verified.

All critical areas tested:

- security
- concurrency
- wallet integrity
- contest fairness
- payment processing

System is ready for production deployment.
# OneMil – DEVELOPMENT HISTORY

---

## 16.03.2026 – Contest Engine Finalization

Full backend verification completed.

System audited for:

- wallet consistency
- ticket integrity
- winner references
- contest revenue

All checks passed.

---

## Monitoring Layer Implemented

New monitoring views created:

contest_analytics  
contest_activity_last_24h  
contest_integrity_check  
system_health_monitor  

Purpose:

- detect contest inconsistencies
- detect wallet mismatch
- show contest activity

---

## Ticket Visualization System

View created:

contest_ticket_map

Provides status for each ticket:

sold  
bonus  
winner  

Used by admin ticket map.

---

## Admin Monitoring UI

New admin section created:

Monitoring

Displays data from:

contest_integrity_check

Detects:

wallet vs ticket mismatches.

---

## Admin Dashboard Improvements

Dashboard connected to:

contest_analytics  
contest_activity_last_24h  
system_health_monitor  

Provides overview of contest activity.

---

## Contest Control Panel

New admin panel implemented.

Component:

ContestControlPanel.tsx

Admin actions available:

pause contest  
resume contest  
close contest  
trigger draw  

---

## RPC Functions

New RPC functions created:

pause_contest  
resume_contest  
trigger_contest_draw  

Existing:

close_contest

trigger_contest_draw internally calls close_contest.

---

## Database Integrity Verification

Queries implemented:

wallet_consistency_check  
orphan_ticket_check  
orphan_winner_check  

Results verified.

No inconsistencies detected.

---

## System Status

Contest backend engine considered COMPLETE.

Remaining work focuses on:

- UI usability
- production readiness
- operational tools 
# OneMil – Development History

## Final Development Phase

The final phase focused on verifying the complete functionality of the OneMil system before production launch.

### 1. Contest Engine Verification

Full end-to-end test executed:

Flow tested:
- create contest
- create user
- simulate payment
- credit wallet
- purchase tickets
- trigger bonus prizes
- trigger main prize
- validate all tables

Result:
PASS

All contest mechanisms work correctly.

### 2. Concurrency Safety Test

Race condition simulation:

Test setup:
- 50 concurrent users
- 250 purchase attempts
- contest limit 100 tickets

Results:
- max tickets: 100
- no duplicate tickets
- sequential ticket numbers
- exactly one main winner

Result:
PASS

Engine is safe under concurrent load.

### 3. Pre-Launch System Verification

Five critical checks were performed:

1. Contest close mechanism
2. Ticket purchase limit
3. Wallet consistency
4. Winners page correctness
5. Admin monitoring functionality

Result:
PASS

### 4. Final UI Verification

User flow verified:

Homepage → contests → contest detail → ticket purchase → wallet updates → winners page.

Admin flow verified:

Admin can:
- create contests
- monitor ticket sales
- monitor contest progress
- view winners
- view voucher purchases.

Small UI fix applied:
ContestDetail now shows "Soutěž nenalezena" when invalid contest ID is used.

### 5. Final Status

All systems verified and working.

The OneMil application is now considered:

PRODUCTION READY 
17.03.2026 – Frontend Audit Phase Started
Completed

Full backend verification

Contest engine validated (production-ready)

Admin basic functionality tested

Issues discovered
ADMIN

Users not visible in admin panel

Likely cause:

incorrect filtering

or missing join (profiles ↔ auth.users)

MESSAGES

Sending fails for users that no longer exist

Cause: FK / missing receiver

USER FLOW

Stripe success page does not verify payment

UI shows incorrect messaging (voucher vs MioCoin)

Ticket history disappears when contest missing

Profile address parsing breaks structured fields

Wallet history incomplete

Conclusion

System backend is stable. Frontend contains multiple production-blocking UX and logic issues.

NEXT CHAT INSTRUCTIONS
Goal

Continue fixing frontend issues WITHOUT breaking backend.

Rules

DO NOT change database schema

DO NOT change contest engine

DO NOT redesign UI

ONLY fix broken logic and queries

Priority Order

ADMIN USERS ISSUE (CRITICAL)

Fix users not showing in admin panel

Ensure all users from profiles + auth.users are visible

Remove hardcoded email logic

STRIPE SUCCESS VERIFICATION

Ensure payment success page validates real credit

Do not show success without confirmation

USER FLOW FIXES

Fix ticket history (remove INNER JOIN issue)

Fix incorrect Stripe messaging

Fix profile address handling (safe parsing)

MESSAGES EDGE CASE

Prevent sending messages to deleted users

Task for next chat

Start with:

"Fix admin users page – users not visible in admin panel"

Then continue in order above.

Expected Outcome

Admin panel fully functional

User flow consistent with backend

No misleading UI states

Ready for final manual testing 
# 📜 Historie – OneMil (Role system fix)

🕓 18. 3. 2026

---

## 🔍 Problém

Admin panel:
- nešlo měnit role
- UI ukazovalo změnu, ale DB ji neuložila
- partner účty měly roli admin (špatně)

---

## 🧠 Příčina

1. RLS blokovalo INSERT/UPDATE do `user_roles`
2. Funkce `set_user_role` neprováděla správný UPSERT
3. Frontend byl omezen pouze na `superadmin`
4. Chyběla validace zápisu
5. Partner účty byly nesprávně v `user_roles`

---

## 🛠️ Opravy

### Backend
- přepsána funkce `set_user_role`
  - UPSERT logika
  - kontrola role (admin/superadmin)
  - blokace partner účtů
- nastavena `SECURITY DEFINER`

---

### RLS
- opraveny policies:
  - INSERT → WITH CHECK
  - UPDATE → USING + WITH CHECK
- odstraněny konfliktní policies

---

### Frontend
- odstraněna blokace pouze na superadmin
- přidán debug log RPC
- přidána kontrola uložené role po změně

---

### Data cleanup
- odstraněny nevalidní role:
  - partner účet měl admin roli → opraveno

---

## ✅ Výsledek

- role se ukládají správně
- UI odpovídá realitě
- partner účty jsou oddělené
- systém je stabilní

---

## 📌 Další směr

- audit log změn rolí
- bezpečnostní pravidla (self-edit, superadmin protection)
- automatická validace DB integrity

---
18. 3. 2026 – Debug session (kritická stabilizace systému)
🔧 Messaging

Identifikován bug: unread nefunguje

Příčina:

špatné read = true při insertu

trigger tr_message_created

Fix:

odstraněn trigger

opraven frontend count logic

realtime subscription stabilizována

🔧 Unread bug (system messages)

Zůstávaly „viset" zprávy

Příčina:

sender = system nebyl zahrnut

Fix:

zahrnut do read update

🔧 Live chat UX

Bug: count rostl i při otevřeném chatu

Fix:

realtime handler → okamžitě mark as read

🔧 Revenue bug

Zobrazovaly se MioCoiny místo CZK

Fix:

přepnuto na payment amount

🔧 Games today bug

UI ukazovalo špatná čísla

Příčina:

RLS na tickets

Fix:

použití daily_platform_metrics

oprava výběru dne

🔧 Ref Dashboard crash

Pád při null datech

Fix:

null handling + fallback 
DALŠÍ KROKY (další chat)

Audit contest flow (E2E test)

Kontrola winners pipeline

Wallet ledger consistency

Performance (realtime + queries)

UI polish (admin panel)

📌 STAV

👉 Aplikace je teď:

funkční

stabilní

připravená na testování

👉 Další fáze: ➡️ system audit + production hardening 
# 📜 OneMil – Historie (poslední session)

🕓 18. 03. 2026

---

## 🧩 Co jsme řešili

### 1. Ticket Result Modal

- úprava struktury
- odstranění duplicitního ticket čísla
- přesun CTA dolů
- zvýraznění „Chybí X tiketů“

➡️ UX zlepšeno

---

### 2. Wow efekty (částečně)

Implementováno:
- count-up animace čísla
- hover efekty
- základní animace

➡️ ale nebylo dokončeno (není priorita)

---

### 3. Design iterace (ZASTAVENO)

Proběhlo:
- několik redesign pokusů
- změna hierarchy (správně)
- diskuse o psychologii (progress > ticket)

Problém:
- grafika stále slabá
- neodpovídá premium produktu

---

### ❗ ROZHODNUTÍ

👉 DESIGN SE ODLOŽIL

Důvod:
- aplikace není 100% stabilní
- edge function hází chyby
- UI se zasekává

---

## 🚨 KLÍČOVÝ PROBLÉM

Edge function:

---

# 📄 history.md

```md
# 📘 Historie – OneMil Share System

---

## 🕓 19. 03. 2026

### 🔧 PROBLÉM
- OG preview nefungovalo
- error: "Missing authorization header"
- FB neviděl meta tagy (React SPA problém)

---

### 🧠 ANALÝZA
- React Helmet generuje meta až v browseru
- FB crawler čte pouze statický HTML
- OG meta tedy ignorováno

---

### ✅ ŘEŠENÍ

Zavedena nová architektura:

1. Edge Function:
   `og-ticket-share`
   → generuje obrázek

2. Změna sdílení:
   - původně: frontend URL ❌
   - nově: OG endpoint URL ✅

3. Úprava ShareTicket.tsx:
   - `shareUrl = ogImage`
   - FB/X sdílení → OG endpoint

---

### 📤 VÝSLEDEK

- FB Debugger:
  - response 200
  - preview OK
- X preview OK

---

### ⚠️ ZJIŠTĚNÍ

- IG / TikTok neumí OG preview
- nutný jiný přístup (obrázky, share API)

---

### 🧩 DALŠÍ KROKY IDENTIFIKOVÁNY

1. Web Share API
2. Download image
3. Tracking / referral
4. OG design upgrade
5. Validace ticket ID

---

## 📊 STAV

```text
Funkční share (FB + X)
UX nedodělané
Virální potenciál zatím nevyužit 
# 📜 OneMil – HISTORY

## 🔹 Co se řešilo

### 1. UI duplicity
- 2x výhry (správa vs předání)
- 2x platby
- 2x notifikace

---

### 2. Audit backendu (Cursor + analýza)

Zjištěno:

#### Výhry
- winners + bonus_prizes = duplicitní delivery systém
- claim_miocoin_bonus synchronizuje jen částečně

#### Notifikace
- push_log existuje, ale nepoužívá se
- trigger pro push byl odstraněn
- edge functions posílají push přímo
- notifications = log, ne engine

#### Platby
- backend OK
- UI nekonzistentní (CZK vs MioCoin)
- refund audit slabý

---

### 3. Závěr

Systém:
- funguje
- ale není stabilní

---

## ⚠️ Kritická zjištění

- neexistuje jednotný source of truth
- duplicita logiky
- riziko nekonzistence dat

---

## 🎯 Další krok

➡️ řízený refactor

Cíl:
- sjednocení architektury
- odstranění duplicit
- zachování funkčnosti

---

## ❌ Co NEDĚLAT

- nepřepisovat celý systém
- nemaž backend bez analýzy
- neměnit DB strukturu bez důvodu

---

## ✅ Co DĚLAT

- sjednotit logiku
- odstranit duplicity
- zachovat existující flow
HISTORY.md
🔄 Fáze 1 – DB push (NEFUNKČNÍ)

použit pg_net / http_post

problém: status_code = null

důvod: Supabase blokuje outbound HTTP

🔄 Fáze 2 – pokusy o fix

oprava funkcí

odstranění duplicit

fix triggerů

stále nefunkční

🔄 Fáze 3 – přechod na Edge Function (SPRÁVNĚ)

vytvořena Edge Function send-push

OneSignal volán přes fetch

odstraněny DB triggery

🔄 Fáze 4 – napojení UI

AdminNotifications.tsx volá Edge Function

push funguje (ověřeno odesláním)

🔄 Fáze 5 – logging problém

push_log se neplní

Cursor přidal persist logiku

problém stále přetrvává

NEXT CHAT INSTRUCTIONS
🎯 CO MÁ DALŠÍ CHAT UDĚLAT

Ověřit volání Edge Function:

přidat console.log před invoke

ověřit že se volá pro každý push

Ověřit Edge Function:

logovat vstup (player_id, message)

logovat OneSignal response

Ověřit DB zápis:

test INSERT do push_log z Edge Function

ověřit service_role

Fixnout:

pokud se invoke nevolá → opravit UI flow

pokud DB write selhává → opravit klienta

🎯 PO DOKONČENÍ

Cursor musí potvrdit:

push_log obsahuje záznamy

status = sent

response obsahuje OneSignal data

🚀 DALŠÍ KROK PO TOM

Retry systém pro failed push

Batch sending (pro velké objemy)

Segmentace uživatelů

Analytics (open rate, CTR)

📌 POZNÁMKA

NEVRACET SE:

k DB HTTP řešení

k pg_net

k trigger-based send

Pouze: → Edge Function architektura 
20. 03. 2026 – 23:30 CET
🔥 PUSH / NOTIFICATIONS – COMPLETED
Co se řešilo:

nefunkční push systém (pg_net, DB triggers)

Edge Function neexistovala

push_log se nezapisoval

OneSignal player_id se neukládal

RLS blokoval zápisy

duplicitní UI Notifikací

Co bylo opraveno:

odstraněn DB-based push

vytvořena Edge Function send-push

nasazen service_role přístup

implementován logging do push_log

opraveno ukládání player_id (useOneSignal)

opraveny RLS policies (notifications, user_devices)

odstraněna duplicita UI Notifikací

Finální stav:
Admin → Notifications → Edge Function → OneSignal → push_log

👉 plně funkční pipeline

📌 ZJIŠTĚNÍ BĚHEM DEBUGU

DB HTTP (pg_net) je nepoužitelný

Edge Functions jsou jediný správný způsob

OneSignal vyžaduje správný service worker

player_id se často načítá pozdě → nutný fallback

RLS je častý blocker

NEXT CHAT INSTRUCTIONS
🎯 HLAVNÍ ÚKOL

Vyřešit:

VÝHRY + PLATBY (ADMIN CLEANUP)
🔧 1) VÝHRY – CO UDĚLAT

sloučit:

Správa výher

Předání výher

vytvořit JEDEN systém:

pending → contacted → delivered

použít pouze tabulku winners

odstranit duplicity (UI + routing)

🔧 2) PLATBY – CO UDĚLAT

odstranit duplicitní sekce

ponechat 1 hlavní stránku

sjednotit komponenty

zachovat existující data (Stripe, payments)

⚠️ DŮLEŽITÉ

NEMĚNIT DB

NEMĚNIT backend logiku

řešit pouze:

UI + strukturu + routing
🎯 CÍL
Čistý admin panel bez duplicit

1× Notifikace ✔

1× Výhry (sjednocené)

1× Platby (sjednocené)

📌 PO DOKONČENÍ

spustit E2E test

ověřit:

contest flow

payments

winners

notifications

🧠 REALITA

backend = hotový

admin UI = poslední krok

🚀 DALŠÍ FÁZE

UI redesign

marketing

produkční launch 
Datum: 20.3.2026 23:30 CET

🔍 AUDIT SYSTÉMU (CURSOR)

Proběhl kompletní audit frontend auth + admin části.

Výsledek:

Byly nalezeny kritické bezpečnostní chyby, které:

umožňují obejít admin práva
umožňují obejít autentizaci
mohou způsobit pád aplikace
❗ KRITICKÉ NÁLEZY
🔴 LOGIN
undefined proměnná → crash
🔴 ADMIN
hardcoded email → backdoor
🔴 AUTH
test login aktivní v produkci
🔴 UI SECURITY
admin stránky bez guardu
🧠 INTERPRETACE

👉 systém je:

funkční
ale nebezpečný pro produkci

👉 toto není bug
👉 toto je security fail

📌 ROZHODNUTÍ
zastavit další vývoj feature
nejdřív 100% opravit auth + admin
🔜 CO BUDE DĚLAT NOVÝ CHAT

Nový chat dostane:

tento state
audit (ten co jsi poslal)

a musí:

KROK 1 – SECURITY FIX
opravit login crash
odstranit email admin hack
vypnout test login
přidat admin guard
KROK 2 – VALIDACE
ověřit, že:
admin ≠ user
bez role není přístup
auth nelze obejít
KROK 3 – POKRAČOVÁNÍ
až potom:
vouchers
wins
další věci
⚠️ DŮLEŽITÉ PRO NOVÝ CHAT
nic nevymýšlet
nic nepřepisovat zbytečně
jen fixnout konkrétní problémy z auditu
📎 Kontext projektu
OneMil = soutěžní platforma
event pipeline → Sofinity funguje
projekt je aktivní 
# 📜 OneMil – HISTORY

## 🕓 22. 3. 2026

### 🔍 E2E CONTEST FLOW – FINÁLNÍ OPRAVA

Dokončen kompletní debug ticket systému.

### ❌ Problémy:
- UUID → BIGINT konflikty
- staré DB funkce
- špatný payload (chyběl user_id)
- reference_id používal UUID

### ✅ Řešení:
- kompletní přepis `buy_ticket_atomic`
- odstranění reference_id usage
- UUID pouze v metadata
- fix Edge function payload
- reload schema
- oprava všech SQL funkcí

### 🧪 Výsledek:
E2E test plně úspěšný:

- 100/100 tickets
- contest closed
- winners správně
- wallet sedí
- notifications OK

➡️ Systém poprvé plně konzistentní

---

## 📌 DALŠÍ KROK

Přechod z debug fáze → stabilizace + production readiness 
POSLEDNÍ PRÁCE
1. Admin stabilizace
oprava chyb v navigaci
odstranění undefined konstant
sjednocení adminNavConfig
2. Fix runtime errorů
vouchers crash
referral dashboard crash
admin pages loading error
3. Routing audit
všechny /admin/* routy ověřeny
mapování nav → route → page potvrzeno
4. Git operace
commit + push
řešení konfliktů
git rebase --abort
git push --force
5. Build
npm run build OK
pouze warnings (CSS, chunk size)
6. Deployment problém
Lovable nebere změny z GitHubu
potvrzeno supportem jako incident
🚫 CO SE NEDĚLALO
Sofinity integrace (odloženo)
UI design finální (odloženo)
optimalizace bundle size
🎯 NEXT CHAT INSTRUCTIONS

V novém chatu:

Zkontrolovat, jestli Lovable sync funguje
Pokud ano:
ověřit produkční verzi
udělat finální audit UI + admin
Zahájit Sofinity integraci:
propojení eventů
napojení DB
push pipeline test
⚡ DŮLEŽITÉ
NEřešit znovu admin chyby (už opraveno)
NEdělat znovu audit rout 
Navázat přímo na Sofinity integraci 
# 📜 OneMil ↔ Sofinity HISTORY

---

## 🕓 23. 03. 2026 – FINÁLNÍ INTEGRACE

### 🔧 PROBLÉMY

- Git merge konflikty v `send_event_to_sofinity`
- špatný soubor (`.docx` místo `.ts`)
- Unauthorized chyby
- worker padal (`undefined error`)
- Sofinity API 401
- connection closed error
- malý batch → pomalé zpracování
- backlog ~4500 eventů

---

### 🛠️ OPRAVY

#### 1. Worker
- opraven null-safe handling
- opraven fetch
- přidán INTERNAL token

#### 2. send_event_to_sofinity
- kompletní rewrite
- odstraněn auth.getUser
- přidán x-internal-token bypass
- správné Authorization Bearer
- fix JSON response

#### 3. Env proměnné
- SOFINITY_API_URL ✔
- SOFINITY_API_KEY ✔
- INTERNAL_FUNCTION_TOKEN ✔

#### 4. Deployment
- edge functions nasazeny
- opraven entrypoint

#### 5. Debug
- logy analyzovány
- odstraněny runtime chyby

---

### 🚀 ZPRACOVÁNÍ BACKLOGU

- paralelní spouštění workeru
- batch processing
- reset failed → pending
- finální:
  - completed = 4570

---

### ⏱️ AUTOMATIZACE

- pg_cron nasazen:
  - každou minutu spouští worker

---

## 🎯 VÝSLEDEK

- pipeline plně funkční
- OneMil → Sofinity propojeno
- real-time přenos dat
- bez chyb
- bez backlogu

---

## 🔜 DALŠÍ KROKY

1. retry limit
2. dead queue
3. monitoring dashboard
4. alerting
5. performance tuning

---

## 🧠 POZNÁMKA

Tento stav je finální stabilní verze integrace.
Další vývoj = optimalizace + rozšíření.
# HISTORY — OneMil ↔ Sofinity

## 🧱 FÁZE 1 — Pipeline
- implementace event_queue
- worker (process_event_queue_worker)
- send_event_to_sofinity
- odstranění duplicity pipeline (event_logs trigger)

## 🧱 FÁZE 2 — Stabilita
- retry systém (retry_count, next_retry_at)
- dead-letter řešení bez nové tabulky
- fix stuck processing
- deduplikace event_queue (globální)

## 🧱 FÁZE 3 — Data integrity
- odstranění duplicit (metadata fix)
- fix processed_at
- fix failed stavu

## 🧱 FÁZE 4 — Push pipeline
- fix trigger_send_push_from_notifications
- oprava signatury send_push_via_onesignal
- napojení push_log → OneSignal

## 🧱 FÁZE 5 — Monitoring
- SQL monitoring dashboard
- error tracking
- performance metriky

## 🧱 FÁZE 6 — Alerty
- run_pipeline_alerts()
- cron job (1 min)
- admin notifikace
- end-to-end test OK

---

## 🎯 AKTUÁLNÍ STAV

✔ kompletní backend pipeline hotová  
✔ stabilní a monitorovaná  
✔ self-healing + alerting  

---

## 🚀 DALŠÍ FÁZE

AI CHAT INTEGRACE (Sofinity)

- user messages → AIRequests
- AI odpovědi
- fallback na admina 
# HISTORY — OneMil ↔ Sofinity

## 🧱 FÁZE 1 — Pipeline
- implementace event_queue
- worker (process_event_queue_worker)
- send_event_to_sofinity
- odstranění duplicity pipeline (event_logs trigger)

## 🧱 FÁZE 2 — Stabilita
- retry systém (retry_count, next_retry_at)
- dead-letter řešení bez nové tabulky
- fix stuck processing
- deduplikace event_queue (globální)

## 🧱 FÁZE 3 — Data integrity
- odstranění duplicit (metadata fix)
- fix processed_at
- fix failed stavu

## 🧱 FÁZE 4 — Push pipeline
- fix trigger_send_push_from_notifications
- oprava signatury send_push_via_onesignal
- napojení push_log → OneSignal

## 🧱 FÁZE 5 — Monitoring
- SQL monitoring dashboard
- error tracking
- performance metriky

## 🧱 FÁZE 6 — Alerty
- run_pipeline_alerts()
- cron job (1 min)
- admin notifikace
- end-to-end test OK

---

## 🎯 AKTUÁLNÍ STAV

✔ kompletní backend pipeline hotová  
✔ stabilní a monitorovaná  
✔ self-healing + alerting  

---

## 🚀 DALŠÍ FÁZE

AI CHAT INTEGRACE (Sofinity)

- user messages → AIRequests
- AI odpovědi
- fallback na admina
# OneMil – historie vývoje (AI chat)

## 🔥 HLAVNÍ ZMĚNA
- odstranění Sofinity pro chat
- kompletní nahrazení vlastním AI systémem

---

## 🧠 AI CHAT PIPELINE

messages (user)
→ trigger
→ Edge Function (ai-chat)
→ OpenAI
→ response do messages (ai)

fallback:
→ messages (admin)

---

## 🤖 BOB (AI)

- vytvořen vlastní AI asistent
- pevný system prompt
- kontext z DB
- řízené chování:
  - odpovědi krátké
  - vedení usera
  - žádné halucinace
  - fallback na admin

---

## 🎨 UI ZMĚNY

- přidán label:
  - AI asistent Bob
- přidáno jméno uživatele
- oddělení stylů:
  - user / ai / admin
- animace + realtime zachováno

---

## 🛠 DEBUG PROBLÉMY (vyřešeno)

- AI neodpovídala → token / header fix
- AI neměla jméno → system prompt fix
- barvy nefungovaly → CSS + priority fix
- Git push fail → rebase + conflict resolve
- Lovable neviděl změny → GitHub sync

---

## 📊 AKTUÁLNÍ STAV

- AI chat plně funkční
- UI stabilní
- backend stabilní
- systém připravený na rozšíření

---

## 🎯 DALŠÍ SMĚR

- monitoring (AI přehled)
- logování (co AI říká)
- admin nástroje
- AI automatizace (marketing / odpovědi)
# 🧭 OneMil – AI Bob HISTORY

## 📅 26. 03. 2026

---

## 🚀 CO SE UDĚLALO

### 1) AI chat nahrazení Sofinity
- Sofinity vyřazena
- vlastní AI Bob implementován
- plně funkční pipeline

---

### 2) Knowledge systém
- vytvořen kompletní textový základ
- schválen uživatelem
- napojen na AI

---

### 3) Intent systém
- základní intenty
- následně rozšířené scénáře:
  - pricing
  - referral
  - bonus
  - partner
  - affiliate
  - podpora

---

### 4) DB integrace
- napojení na:
  - wallets
  - winners
  - tickets

---

### 5) Critical fixy
- pricing intent (nejdůležitější bug)
- zabránění halucinacím
- správné pořadí logiky

---

### 6) AI rephrase
- odstranění copy-paste odpovědí
- přirozený jazyk
- zachování faktů

---

### 7) Greeting systém
- session-based
- bez spamu
- profesionální UX

---

### 8) Finální validace
- testy:
  - coin balance ✔️
  - pricing ✔️
  - referral ✔️
  - knowledge ✔️

---

## 📌 AKTUÁLNÍ STAV

👉 AI Bob = funkční, stabilní, připravený

---

## 🔜 DALŠÍ FÁZE

### Fáze 2 – Monetizace
- prodejní odpovědi
- doporučení balíčků
- konverzní logika

### Fáze 3 – Automatika
- AI follow-up
- automatické reakce

### Fáze 4 – Monitoring
- dashboard
- logy
- optimalizace
## 📜 OneMil – historie

### 26. 3. 2026
- implementace AI chat (Bob)
- napojení na DB
- knowledge + pricing
- rephrase systém
- hybrid support + conversion

### 26.–27. 3.
- fix crash: wallet undefined
- fix deploy/cache problém
- oprava linků (/contests → /customer-inbox)
- frontend: klikatelné odkazy

### 27. 3.
- stabilní běh AI
- odstraněno padání
- potvrzeno:
  - odpovídá
  - linkuje správně

❗ zjištěno:
- AI ignoruje wallet data
- odpovědi jsou slabé (jen akce)

---

### 🔜 DALŠÍ PRÁCE
- opravit decision logic
- zlepšit odpovědi
- zvýšit konverzi
# 📜 OneMil – historie

## 27–28. 3. 2026

### AI Bob vývoj
- implementace context sandwich (static + dynamic data)
- přidána práce s wallet balance
- odstraněno agresivní CTA
- fallback na WhatsApp

### CTA systém
- přechod z text CTA → strukturovaný JSON
- přidán mapping:
  - /customer-inbox → Soutěže
  - /wallet → Peněženka
  - /wins → Výhry
  - /vouchers → Vouchery

### Backend
- přidán enforcement CTA podle intentu
- normalizace payloadu
- ochrana proti CTA u supportu

### Frontend
- přidán parser JSON zpráv
- přidán CTA button render
- přidán navigate handler
- rozšíření o /wins a /vouchers

---

## ❗ ZJIŠTĚNÝ PROBLÉM

SQL kontrola:

```sql
SELECT STRING_AGG(content::text, ' || ')
# OneMil – HISTORY

## 🕓 28. 03. 2026 – AI CHAT FIX + PERFORMANCE

### 🔧 OPRAVY

#### 1. CTA PROBLÉM
- AI vracel `cta: null`
- frontend neměl co renderovat

✔️ FIX:
- fallback v backendu:
  if (!payload.cta) → default CTA

---

#### 2. JSON ULOŽENÍ
- dříve: pouze text
- nyní:
  {"text":"...","cta":{...}}

✔️ sjednoceno:
- jedna serializace
- žádné undefined

---

#### 3. DEPLOY BUG
- syntax error kvůli ``` v template stringu

✔️ FIX:
- escapování \`\`\`

---

#### 4. ROUTING CTA
- původně mix `/games` vs `/contests`

✔️ sjednoceno:
- systém běží na `/games`

---

#### 5. FRONTEND CTA
- přidán whitelist:
  action.startsWith('/')

---

#### 6. PERFORMANCE OPTIMALIZACE

Implementováno:
- limit historie pro OpenAI (10)
- limit UI (50)
- DB index
- optimistic update
- realtime subscription
- odstranění debounce
- odstranění presence

---

## ❌ AKTUÁLNÍ PROBLÉM

- ~14s delay při odpovědi
- změny pravděpodobně nejsou nasazené

---

## 🎯 DALŠÍ KROKY

1. deploy frontend (kritické)
2. otestovat:
   - okamžitý optimistic update
   - realtime insert
3. pokud lag zůstane:
   - měřit OpenAI response time
   - oddělit AI call async

---

## 📌 SHRNUTÍ

- architektura: správně
- data flow: správně
- CTA: vyřešeno
- hlavní blok: výkon

👉 další chat: řešit latency pipeline
# OneMil – aktuální stav

## ✅ HOTOVO

### Chat (Messages)
- AI chat (Bob) plně funkční
- ukládání zpráv ve formátu JSON `{ text, cta }`
- CTA routing funguje:
  - /games
  - /wins
  - /profile
  - /vouchers
  - /my-contests

### Performance
- odstraněn presence (hlavní lag fix)
- realtime optimalizovaný (no flood)
- limit state:
  - initial load: 20 zpráv
  - max state: 50 zpráv
- pagination:
  - scroll nahoru → load dalších 20
  - funguje až na začátek historie

### UX
- typing indicator („Bob píše…“) hotový
- stabilní scroll:
  - auto-scroll dole
  - „Nové zprávy ↓“
  - persistentní ↓ tlačítko
- žádné skoky / žádné lagy

### Streaming
- backend streaming implementovaný
- frontend simulace implementovaná
- UX efekt minimální (rychlé odpovědi)

---

## ⚠️ PROBLÉMY

### AI odpovědi (hlavní problém)
- Bob ignoruje USER DATA
- odpovídá obecně místo konkrétně
- příklad:
  - „kolik mám miocoinů“ → špatná odpověď

### Příčina
- routing opraven (jde do GPT)
- USER DATA existuje
- ❗ AI priorita je špatná (CTA > odpověď)

---

## 📊 STAV

- chat systém: ✅ production ready
- performance: ✅ vyřešeno
- UX: ✅ velmi dobré
- AI kvalita: ❌ hlavní slabina

---

## 🎯 PRIORITA

1. opravit logiku odpovědí Boba (nejdůležitější)
2. zvýšit přesnost odpovědí (balance, wins)
3. optimalizovat konverzní flow (CTA)

---

## 🗓 30. 3. 2026 – UPDATE

### Co bylo hotovo
- AI chat napojen na USER DATA
- opraven CTA systém
- implementován support-handoff
- přidána validace zpráv

### Nalezený problém
- follow-up zprávy ztrácí support CTA

### Další krok
- opravit detekci support intentu (follow-up kontext)