# OneMil – aktuální stav projektu

## Frontend (React + TypeScript)
- Homepage
  - Banner s hlavní cenou
  - 6 soutěžních boxů (dynamicky přidatelné)
  - Carousel bannerů
  - Box „Jak to funguje“ (postup hry + video)
  - Sekce s registrací / loginem
- Auth
  - Email + heslo
  - Google / Apple login
- Profil uživatele
  - Přehled coinů (peněženka)
  - Přehled voucherů
  - Historie použití
- Contest detail
  - Ticketová mapa / stav soutěže
  - Zobrazení bonusových výher
- Admin dashboard
  - Přidat soutěž (hlavní + bonusové ceny, libovolný počet)
  - Přehled účastníků
  - Přehled plateb (Stripe reporty)
  - Evidence předání výhry (stav: čeká / předáno)
  - Správa voucherů a kampaní
  - Správa notifikací
  - Role: Admin, SuperAdmin

## Backend (Supabase + Edge Functions)
- Autentizace uživatelů
- Správa voucherů (1 voucher = 1 CZK)
- Správa coinů (dobíjení peněženky)
- Contest logika
  - Každá soutěž má 1 000 000 ticketů
  - Ticket #1 000 000 = hlavní cena
  - Bonusové ceny → libovolné pozice
  - Soutěž se po dosažení 1 000 000 ticketů uzavírá
- Evidence výher (hlavní + bonusové)
- Push notifikace (individuální i automatické)
- Email upozornění (Resend + Sofinity)
- Export PDF výher / přehledů
- API callbacky od partnerů (validace uplatnění voucherů)

## Databázový model (Supabase)
- `users` → id, email, heslo, google_id, apple_id, jméno, adresa, telefon, role
- `wallets` → id, user_id, balance_coins, balance_vouchers
- `vouchers` → id, user_id, code, value, redeemed
- `contests` → id, title, description, main_prize, ticket_count (always 1 000 000), status
- `bonus_prizes` → id, contest_id, description, ticket_position, status
- `tickets` → id, contest_id, user_id, number, created_at
- `winners` → id, contest_id, prize_id, user_id, delivered (bool), notes
- `payments` → id, user_id, amount, method, stripe_session_id, status
- `notifications` → id, user_id, type, message, status, created_at
- `audit_logs` → id, event, user_id, metadata, created_at

## Integrace
- Stripe (platby voucherů)
- Resend (emaily)
- Sofinity (reporting v reálném čase – všechny eventy)
# Sofinity & OneMil – Stav projektu (17. 11. 2025)

## 🔹 Zprávy (Messages) – Aktuální stav

* **Realtime pipeline je funkční** (INSERT → trigger → event_forward_log → broadcast → klient).
* **Testovací INSERT proběhl správně**:

  * Záznam se objevil v `messages`.
  * Trigger úspěšně vytvořil záznam v `event_forward_log` se stavem `pending`.
  * Nebyla hlášena žádná chyba při volání broadcast_changes.

## 🔹 Opravy bezpečnosti

* Proveden **REVOKE EXECUTE ON FUNCTION public.forward_message_event() FROM PUBLIC**.
* Funkce nadále funguje ze triggeru (SECURITY DEFINER), ale nelze ji zneužít přes PUBLIC.

## 🔹 Problém: Zprávy se zobrazují až po reloadu

* Důvod: frontend **nepoužíval správné hooky** (useMessages, useAdminMessages) → žádné real‑time odposlechy.
* Supabase klient vytvořen správně → websocket funguje.
* Problém je **čistě frontend**.

## 🔹 Řešení připraveno

* Připravené **hotové komponenty**:

  * `MessagesPage.tsx`
  * `AdminMessagesPage.tsx`
* Tyto komponenty:

  * Používají přímo tvoje existující hooky.
  * Neobsahují duplicitu Supabase klienta.
  * Žádná další logika, žádné vedlejší efekty.
  * Jsou připravené k vložení přesně 1:1.

## 🔹 Co zbývá dodělat

1. **Vložit hotový MessagesPage.tsx a AdminMessagesPage.tsx** do projektu

   * Cesty:

     * `/src/pages/Messages.tsx`
     * `/src/pages/AdminMessages.tsx`
2. Ověřit, že hooky `useMessages` a `useAdminMessages` fungují → měly by se hned po vložení začít chovat realtime.
3. Pokud i potom realtime nebude 100 %, uděláme drobnou úpravu hooků (extrakce payloadu) – ale to až po testu.

## 🔹 Další krok pro nový chat

**„Pokračovat vložením dvou hotových stránek (`MessagesPage.tsx` a `AdminMessagesPage.tsx`) a otestovat realtime zobrazování zpráv bez reloadu.“**
# Sofinity & OneMil – Stav projektu (17. 11. 2025)

## 🔹 Zprávy (Messages) – Aktuální stav

* **Realtime pipeline je funkční** (INSERT → trigger → event_forward_log → broadcast → klient).
* **Testovací INSERT proběhl správně**:

  * Záznam se objevil v `messages`.
  * Trigger úspěšně vytvořil záznam v `event_forward_log` se stavem `pending`.
  * Nebyla hlášena žádná chyba při volání broadcast_changes.

## 🔹 Opravy bezpečnosti

* Proveden **REVOKE EXECUTE ON FUNCTION public.forward_message_event() FROM PUBLIC**.
* Funkce nadále funguje ze triggeru (SECURITY DEFINER), ale nelze ji zneužít přes PUBLIC.

## 🔹 Problém: Zprávy se zobrazují až po reloadu

* Důvod: frontend **nepoužíval správné hooky** (useMessages, useAdminMessages) → žádné real‑time odposlechy.
* Supabase klient vytvořen správně → websocket funguje.
* Problém je **čistě frontend**.

## 🔹 Řešení připraveno

* Připravené **hotové komponenty**:

  * `MessagesPage.tsx`
  * `AdminMessagesPage.tsx`
* Tyto komponenty:

  * Používají přímo tvoje existující hooky.
  * Neobsahují duplicitu Supabase klienta.
  * Žádná další logika, žádné vedlejší efekty.
  * Jsou připravené k vložení přesně 1:1.

## 🔹 Co zbývá dodělat

1. **Vložit hotový MessagesPage.tsx a AdminMessagesPage.tsx** do projektu

   * Cesty:

     * `/src/pages/Messages.tsx`
     * `/src/pages/AdminMessages.tsx`
2. Ověřit, že hooky `useMessages` a `useAdminMessages` fungují → měly by se hned po vložení začít chovat realtime.
3. Pokud i potom realtime nebude 100 %, uděláme drobnou úpravu hooků (extrakce payloadu) – ale to až po testu.

## 🔹 Další krok pro nový chat

**„Pokračovat vložením dvou hotových stránek (`MessagesPage.tsx` a `AdminMessagesPage.tsx`) a otestovat realtime zobrazování zpráv bez reloadu.“**
## Voucher systém – veřejné zobrazení (is_public)

- Každý voucher má nyní boolean pole `is_public` v tabulce `vouchers`
- V administračním rozhraní přehledu voucherů je nový sloupec „Zveřejnit“ (checkbox)
- Pokud je `is_public = true`, voucher se zobrazuje všem uživatelům na úvodní stránce (sekce „Dostupné vouchery“)
- Admin může tímto přepínačem dynamicky ovládat viditelnost každého voucheru
- Checkbox je umístěn přímo mezi „Stav“ a „Platnost“ v tabulce přehledu voucherů
- Změna se ukládá okamžitě do databáze
STATE.MD – Aktuální stav systému
1. Úpravy UI a struktury stránek

Sekce Moje hry byla změněna na Soutěže.

Přidáno tlačítko Oblíbené soutěže v horní části nad seznamem her.

Pro každou hru přidáno srdíčko pro označení oblíbené.

Na detailu hry a v oblíbených přidána tlačítka Zpět.

Úprava tlačítka „Uplatnit X miocoinů“ → připraveno pro rozdělení na dvě části (Uplatnit + Detail).

2. Implementace oblíbených her

Vytvořena databázová tabulka user_contest_favorites.

RLS pravidla: uživatel může číst/vkládat/mazat pouze své záznamy.

Ikony srdíčka nyní ukládají oblíbené soutěže do DB.

Akce „odehraná hra“ bude také přesouvat soutěž do oblíbených.

3. Carousel pro vouchery

Přidána logika automatického posunu (stejně jako soutěže).

Voucher carousel se má otáčet opačným směrem.

Aktuálně je ve stavu, kdy se neposouvá automaticky → oprava čeká.

4. Sekce „Připravujeme“ pro 3 bannery

Vytvořena DB tabulka coming_soon_banners.

Přidána sekce v Admin → Bannery:

umožňuje nahrát 3 obrázky,

každý ukládá do DB,

zobrazuje se na homepage pod „Naši partneři“.

RLS opraveno → admin může nahrát/mazat/aktualizovat.

5. Úpravy navigace

Spodní menu nyní obsahuje:

Domů

Vouchery

Soutěže

Profil 
Sofinity / OneMil – Záznam do state.md a history.md

Datum: 1. 12. 2025
Čas: 12:25 CET

🔄 Stav systému – OneMil
1. Zjištěné problémy

Platební proces funguje (Stripe Checkout), ale redirect URL po platbě vede na neexistující route /pay/return, což způsobuje 404.

Po zaplacení se uživatel nevrací zpět do aplikace a MioCoiny se nepřičítají.

Stripe Checkout session nemá správně nastavené:

success_url

cancel_url

Verifikace návratu v UI.

2. Analýza

Funkční profil + peněženka – zobrazují správně stav, data, zůstatek.

Dobíjení MioCoinů – inicializace je funkční, uživatel se dostane do Checkoutu.

Chyba nastává po návratu z platební brány.

URL /pay/return neexistuje v projektu Lovable → proto 404.

Stripe Checkout session byla konfigurována tak, že aplikace o výsledku platby neví.

3. Co je potřeba opravit (přesně)
Backend (Edge Function / createCheckoutSession)

Nahradit špatnou návratovou URL:

❌ https://onemil.cz/pay/return?session_id={CHECKOUT_SESSION_ID}

✔️ https://onemil.cz/profile?session_id={CHECKOUT_SESSION_ID}

Front‑end (Profile.tsx nebo Wallet.tsx)

Po návratu z platby detekovat session_id v URL.

Zavolat backend pro potvrzení:

supabase.functions.invoke("processPayment", { body: { sessionId } })
  .then(() => refreshWallet());
Stripe Dashboard

Ujistit se, že session používá POST a má správné redirect URL:

success_url = https://onemil.cz/profile?session_id={CHECKOUT_SESSION_ID}

cancel_url = https://onemil.cz/profile?canceled=true

4. Dopady & stav

Chyba neblokuje registrace ani profil.

Blokuje pouze dobíjení kreditů a vracení do aplikace po platbě.

Čeká se na implementaci výše uvedených oprav.

🧭 Další krok

Zjistit přesný route profilu (/profile, /muj-profil, /account …).

Připravím kompletní opravené soubory:

createCheckoutSession.ts

processPayment.ts

Profile.tsx úprava pro zpracování session

Hotové k vložení bez úprav (dle tvých pravidel).
### OneMil – Výherní systém (stav k uzavření chatu)

Aktuální problém:
- Výherní logika funguje částečně: tikety se kupují, hlavní i bonusové výhry se generují, ale logika není jednotná a některé výhry (MioCoin bonusy) se nechovají správně.
- Některé výhry se zapisují do `winners`, ale systém neví, co má admin potvrzovat a co má být automatické.
- Není jasné, jak jsou propojené tabulky `contests`, `tickets`, `bonus_prizes`, `winners`, `wallets`.
- Neexistuje jistota, kde se doplňují bonusové výhry (admin panel ukazuje údaje, ale není jasné, odkud se berou).
- V Moje výhry funguje zobrazení, ale chování zpět (navigace) je zatím špatně.
- V adminu jsou dvě místa pro vytvoření soutěže (duplikát: „Správa soutěží“ a „Vytvořit soutěž“).

Domluvený plán:
1. Než se začne cokoliv opravovat, udělá se kompletní AUDIT systému:
   - soutěže (contests)
   - tikety (tickets)
   - bonusové ceny (bonus_prizes)
   - výhry (winners)
   - peněženka (wallets)
   - funkce a triggery (hlavně buy_ticket_atomic)
   - vazby na admin panel (předání výher)
2. V dalším chatu se provede audit – pouze SELECT dotazy, žádné změny.
3. Teprve po auditu se navrhne čistá architektura:
   - co je automatické (např. MioCoin výhry)
   - co admin potvrzuje ručně (hlavní cena, fyzické ceny, drahé bonusy)
   - jak se napojí admin panel
   - sjednocení vytváření soutěže na jedno místo
4. Cílem je kompletně stabilní a jednotný výherní systém.

Připraveno na pokračování: AUDIT.
OneMil – Sjednocení soutěžních karet a příprava kroku B (detail soutěže)
Aktuální stav

Všechny soutěžní karty na Homepage, /games, /favorite-games jsou nyní sjednocené.

Používají jednotný komponent ContestCard se stejným layoutem, overlay prvky, tlačítky a UI logikou.

FavoriteGames byl upraven tak, aby měl identickou strukturu jako Games (stejná grid struktura, stejný wrapper, stejné chování).

V administraci je připravena funkcionalita pro AI generování bannerů, UI je hotové, ale OpenAI API zatím vrací chybu 403.

Důvod: čeká se na schválení OpenAI Organization Verification.

Do vyřešení nelze používat gpt-image-1.

Co bude následovat (Krok B)

Vytvoření velkého banneru pro detail soutěže.

Připravit nový komponent ContestBannerLarge.

Vložit jej na stránku /contest/[id].

Velký banner musí zachovat styl ContestCard, jen být větší + obsahovat více dat.

Do banneru se budou vkládat texty: název soutěže, hlavní cena, popis, cena tiketu, počet výher, atd.

Připravit prostor pro budoucí AI generování (layout, pozice textů).

Žádné změny v DB, žádné nové tabulky, žádné nové soubory mimo komponenty.
# OneMil – Stav projektu (02.12.2025)

## Status: Vše vráceno do původního stavu
Implementace nového workflow vytváření soutěží byla pozastavena.  
Rollback proběhl úspěšně, kód je nyní v identickém stavu jako před dnešními změnami.

## Připraveno k implementaci (schválené kroky)
1) Nové pořadí tabů:
   - Základní údaje
   - Bonusy – MioCoins
   - Popis hlavní výhry
   - Bonusy – věcné
   - Grafika – detail
   - Grafika – banner
   - Vytvořit soutěž

2) Tlačítko „Vytvořit soutěž“
   - Pouze v poslední záložce
   - Deaktivované, dokud nejsou všechna povinná pole vyplněná

3) Obrázky
   - Náhled hlavního obrázku ihned po nahrání
   - AI generování obrázku (nezměněno)
   - Sekundární obrázek v pravém boxu detailu
   - Banner v horní části detailu

4) Detail soutěže
   - Banner nahoře full width
   - Rozložení jako ve schválené grafice (levý box MioCoin, pravý box hlavní obrázek)

5) Backend
   - Bez změn, nic se nesmí upravovat

## Další krok
V dalším chatu provést implementaci krok za krokem, přesně podle plánu.
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

AKTUÁLNÍ STAV PROJEKTU (8. 12. 2025, 19:35 CET)

(stručný, ale jasně navazující technický stav)

📌 Stav: AI Banner Generator (Grok) — OPRAVENO

Problém s Grok API způsoboval parametr size → model jej NEPODPORUJE.

Starý model grok-2-image-1212 nebyl správný → opraveno na grok-2-image.

Chybný GROK_API_KEY → nahrazen validním → generování nyní FUNGUJE.

Edge funkce nyní generuje obrázek z Groku korektně a ukládá do contest-banners.

📌 Detail soutěže — ROZBITÝ

Po opravě banner generátoru se rozbil render detailu soutěže.

Bonusové výhry na detailu soutěže:
❌ nenahrávají obrázky
❌ mizí část dat ve „Cesta k hlavní výhře“
❌ nekonzistentní layout

Frontend zobrazuje fallback layout místo plánovaného UI.

📌 Další úkol

→ Opravit COMPLETE layout detailu soutěže
– načítání obrázků bonusových výher
– komponenta hlavního banneru
– textové bloky (popis, parametry)
– validace DB dotazů (bonus_prizes, bonus_images)
– kontrola props v ContestDetail.tsx nebo ekvivalentní pag 
(AKTUÁLNÍ STAV PROJEKTU – 100% DETAILNÍ)
🔥 OneMil – Stav projektu k dnešnímu okamžiku

Projekt OneMil má funkční frontend, backend i databázi (Soutěže, Bonusy, Vouchery, Peněženky, Stripe, Messaging, Sofinity eventy).
Probíhá integrace AI generování grafiky pro soutěže, která se TOTÁLNĚ rozsypala kvůli nekompatibilním modelům.

❗ Co se během posledních chatů stalo:
1. Pokusy integrovat různé AI modely selhaly

❌ Grok 2 / Grok Image → nepodporuje image-to-image ani obrázkový output.

❌ Lovable AI → generuje vlastní nesmysly, ignoruje vstupní obrázky.

❌ Google Gemini API (developer key) → umí přijmout obrázek, ale NEMÁ obrazový výstup → neumí generovat bannery.

❌ „Nano Banana Pro“ → NEEXISTUJE v Google API. Je to interní UI-only preset.

2. Výsledek: Nic z toho neumí to, co OneMil potřebuje

OneMil potřebuje:

👉 B1: IMAGE-TO-IMAGE s automatickou detekcí objektu

vstup: obrázek hlavní výhry (auto, motorka…)

zachovat objekt 1:1

změnit pozadí → OneMil styl

výstup PNG → uložit do Supabase Storage

❗ To umí JEDINĚ:

⭐ Google Vertex AI → Imagen 3 capability (EDIT_MODE_BGSWAP)
🔥 3. Co MUSÍ být vytvořeno, aby to fungovalo

Toto Lovable NEUMÍ nastavit.
Toto Supabase sama NEUDĚLÁ.
Toto je čistá Google backend integrace.

Potřebné kroky:
A) V Google Cloud

Zapnout Vertex AI API

Region: europe-west4

Vytvořit Service Account

Role:

Vertex AI User

Vertex AI Service Agent

(+ volitelně Storage Admin)

Exportovat jeho service-account.json

B) V Supabase – Secrets

Přidat do:

Project Settings → Secrets

VERTEX_SERVICE_ACCOUNT_JSON = <celý JSON>
VERTEX_PROJECT_ID = <project-id>
VERTEX_LOCATION = europe-west4

C) V Edge Function transform-prize-image

Musí:

Načíst service-account JSON

Vyrobit JWT (RS256)

Vyměnit JWT za Google OAuth access_token

Poslat požadavek na:

https://europe-west4-aiplatform.googleapis.com/v1/projects/<PROJECT_ID>/locations/europe-west4/publishers/google/models/imagen-3.0-capability-001:predict


Parametry:

inputImage → base64
maskMode = "MASK_MODE_BACKGROUND"
editMode = "EDIT_MODE_BGSWAP"
outputDimension { hero/banner/bonus }


Výsledek (PNG base64) uložit:

storage → contest-banners → ai-<layout>-<timestamp>.png

🔥 4. Stav: Nedokončeno

AI generátor NEFUNGUJE, protože:

nebyl vytvořen Vertex service account

nebyl vložen JSON do Supabase secrets

edge funkce stále není připravena pro Vertex AI

Lovable NEDOKÁŽE tyto kroky provést

API Keys „AQ…“ jsou pro Gemini, NE Vertex AI → absolutně nepoužitelné

🔥 5. Další krok (nutný):

Vývojář / admin se musí přihlásit do:

👉 Google Cloud Console
👉 Supabase Secrets
👉 Lovable (jen UI stránka, ne backend)

A provést Vertex integraci podle instrukcí.

Po přihlášení napíše ChatGPT heslo:

pavel

→ ChatGPT automaticky aktivuje režim "developer-komunikace" a povede ho KROK ZA KROKEM.
Vertex AI Integration Failure – Detailed Diagnostic Summary

Multiple attempts to deploy Edge Function vertex-generate-image failed with 401 Unauthorized during supabase functions deploy.

Local Supabase CLI showed inconsistent authentication state ("You are now logged in" even when no token was supplied), indicating corrupted or cached credentials.

Several login/logout cycles did not reset CLI state properly.

User attempted manual API calls to the function endpoint, resulting in 500 Internal Server Error, confirming the deployed function remained broken.

Google Vertex AI service account appears valid, but the Edge Function code incorrectly uses private_key_id as API key.

Required Supabase secrets exist but may contain malformed or incorrect JSON for GOOGLE_VERTEX_SERVICE_ACCOUNT.

Function logs show that the function executes but returns no image and logs internal errors.

CLI token login flow (supabase login) did not prompt for access token and instead auto-logged-in using invalid or stale state.

Attempts to purge config directories (.config/supabase, .supabase, %APPDATA%/supabase) confirmed some paths missing, increasing likelihood of misconfigured installation history.
Projekt: OneMil

Stav ke dni: 12. 12. 2025
Status: stabilizace systému soutěží – AI generování grafiky dočasně vypnuto

✅ Aktuální rozhodnutí (PLATÍ)
1️⃣ AI generování grafiky

❌ AI generování bannerů / obrázků JE DOČASNĚ VYPNUTÉ

✅ Soutěže používají výhradně ruční nahrávání obrázků

Důvod:

nestabilita Docker / Vertex / Cloud Run

zbytečná komplexita v rané fázi

🔜 AI automatizace se vrátí později, až:

poběží core systému bez chyb

bude jasný finální UX

2️⃣ Vytváření soutěží – aktuální tok

Soutěž se vytváří ručně:

základní údaje

bonusy – MioCoins

bonusy – věcné

grafika (ručně nahraná)

ŽÁDNÁ AI logika se v této fázi nepoužívá

3️⃣ Bonusové výhry – STRUKTURA (DŮLEŽITÉ)
Tabulka: bonus_prizes

Používá se pro:

🎁 věcné bonusové výhry (amount = 0 / NULL)

🪙 MioCoin bonusy (amount > 0)

Každý řádek = jedna konkrétní výhra

4️⃣ Oprava chyby: „vytvořím 4 bonusy, vidím jen 2“
❌ Původní problém

Ve ContestDetail.tsx byla tato logika:

setBonusPrizes(
  typedBonus.filter((b) => !b.amount || b.amount === 0)
);


➡️ Tím pádem:

MioCoin bonusy se odfiltrovaly

UI zobrazilo jen část výher

vznikal dojem, že se „něco ztratilo“

✅ Oprava (AKTUÁLNÍ STAV)
setBonusPrizes(typedBonus);


zobrazují se VŠECHNY bonus_prizes

žádné filtrování

žádné seskupování

žádná deduplikace

každý řádek = jedna karta (key={id})

5️⃣ Další plán (zatím NEIMPLEMENTOVÁNO)

UI logicky rozdělit:

Bonusové věcné výhry

Bonusy – MioCoins

Pouze ve frontendové vrstvě

Databáze se NEBUDE měnit

🧭 Shrnutí stavu

DB je správně

RLS není problém

contest_id je správně

bonus_prizes se ukládají korektně

chyba byla čistě ve frontendové filtraci

aktuální řešení je stabilní 
## 🔄 Stav projektu – aktualizace (17. 12. 2025)

### Kontext

Tento záznam shrnuje **kompletní sadu změn provedených dne 17. 12. 2025** napříč projekty **OneMil (frontend Lovable)** a **Supabase (RLS, Storage)**. Slouží jako autoritativní stavový záznam pro další navazující práci.

---

## ✅ 1. RLS – Avatary uživatelů v Admin Winners

**Problém:**
V admin přehledu výher nebyly vidět avatary uživatelů, přestože si je zákazníci nahrávali v profilu.

**Řešení:**
Přidána RLS politika umožňující adminům číst všechny profily.

```sql
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role IN ('admin', 'superadmin')
  )
);
```

**Výsledek:**

* Admin vidí avatar zákazníka u výher
* Zákazník má nadále přístup pouze ke svému profilu

---

## ✅ 2. Odstranění sekce „Moje výhry“ z detailu soutěže

**Změna:**
Sekce „Moje výhry“ byla **zcela odstraněna z detailu soutěže**, protože:

* byla duplicitní
* patří pouze na samostatnou stránku „Moje výhry“

**Dotčené soubory:**

* `src/pages/ContestDetail.tsx`
* `src/components/CustomerContestView.tsx`

---

## ✅ 3. Redesign detailu soutěže – nové pořadí sekcí

Nové pevné vertikální pořadí:

1. Hero (název, popis, obrázek)
2. Akční sekce uživatele (MioCoiny + akce)
3. Informační blok „Ve hře je celkem“
4. Progress „Cesta k hlavní výhře“
5. Bonusové věcné výhry

Cíl:

* vyšší přehlednost
* marketingová hierarchie

---

## ✅ 4. Dva nové informační boxy (ContestDetail)

### Box A – Stav MioCoinů uživatele

* Zobrazuje **aktuální zůstatek MioCoinů**
* Akce:

  * „Uplatnit 1 MioCoin"
  * „Dobít MioCoiny"
* Kompaktní card design

### Box B – Bonusové MioCoiny v soutěži

* Pouze informační
* Text:
  „Do této soutěže jsme navíc přidali XXXX MioCoinů jako bonusové výhry, které můžete během soutěže získat."
* Hodnota je **statická marketingová**

⚠️ DŮLEŽITÉ:

* Tento box **nesmí nikdy ukazovat zůstatek**
* Vždy zobrazuje původní hodnotu z vytvoření soutěže

---

## ✅ 5. Statická hodnota bonusových MioCoinů

**Chyba, která byla identifikována:**
UI původně počítalo bonusové MioCoiny z `bonus_prizes` (dynamicky), což vedlo k:

* poklesu hodnoty během hry
* zobrazení 0 po vyčerpání

**Správné chování (definitivní):**

* Používá se **výhradně** pole:

```ts
contests.total_miocoin_bonus
```

* Toto pole:

  * se nastavuje při vytváření soutěže
  * **nikdy se nemění**
  * slouží jako marketingová informace

---

## ✅ 6. Animace – info boxy

* Přidána `animate-fade-in`
* Staggered efekt:

  * Box A: 0.1s
  * Box B: 0.2s

---

## ✅ 7. WinDetailModal – efekty výhry

### Hlavní výhra

* Confetti: 350 částic
* Zlaté barvy
* Zvuková fanfára (Web Audio API)

### Bonusová výhra

* Confetti: 120 částic
* Fialové barvy
* Jemný dvoutónový zvuk

---

## ✅ 8. Stránka „Moje výhry“ (Wins.tsx)

### Funkce:

* Filtry podle stavu: Čeká / Odesláno / Doručeno
* Filtry podle typu: Hlavní / Bonusová
* Řazení: Nejnovější / Nejstarší

Filtry jsou kombinovatelné.

---

## 📌 Shrnutí

Tento stav je považován za **stabilní a referenční**.
Další práce musí:

* respektovat statickou povahu `total_miocoin_bonus`
* neznovuzavádět „Moje výhry“ do detailu soutěže
* zachovat RLS oddělení admin vs. user

---

🧭 Další doporučené kroky:

* Admin statistiky MioCoinů
* Validace `total_miocoin_bonus` při vytváření soutěže
* UX polish progress baru
# Projekt OneMil – aktuální stav

## Datum
2025-12-22

## Stav systému
Projekt OneMil je funkční, databáze je konzistentní, ale proces generování MioCoin bonusů je v přechodovém stavu.

## Klíčová zjištění
- Tabulka `contests.total_miocoin_bonus` odpovídá součtu z `bonus_prizes` (ověřeno).
- Databáze NENÍ rozbitá, problém není v SQL ani v triggerech.
- Problém je v aplikační logice (AdminContestManagement).

## Aktuální chování
- Pole **„Celkový počet MioCoinů ve hře“ (např. 50 000)**:
  - pouze nastavuje hodnotu
  - **negeneruje žádné záznamy v `bonus_prizes`**
- UI již automaticky negeneruje MioCoin bonusy při vytvoření soutěže.
- Edge funkce `distribute-bonus-prizes` EXISTUJE a je správná cesta pro generování většího množství bonusů (50k+).

## Co je potvrzeno
- Sekvenční inserty z UI → timeout / nekompletní generování
- Promise.all / paralelní inserty → nekonzistentní součty
- Edge function je správná architektura, ale NENÍ aktuálně jasně navázaná na admin workflow

## Aktuální rozhodnutí
- Nic dalšího se teď neupravuje.
- Stav byl vrácen zpět do funkční, ale **nekompletní** podoby.
- Další práce bude pokračovat v novém chatu.

## Další krok (pro další chat)
Navrhnout a implementovat JEDNOZNAČNÝ proces:
1. Vytvoření soutěže (bez generování bonusů)
2. Explicitní akce „Vygenerovat MioCoin bonusy“ (volání edge funkce)
# OneMil – CURRENT STATE

## Project
OneMil (Supabase + Lovable)

## Last update
2025-12-22

## Status
🟠 IN PROGRESS – Bonus MioCoin flow is broken (bonus wallet not working correctly)

---

## CONFIRMED BUSINESS RULES (FINAL)

- Every MioCoin bonus win MUST go to a **bonus wallet**
- Bonus MioCoins MUST NOT be credited automatically to the main wallet
- User must explicitly click **“Převést do hry”**
- No limits, no expiration (for now)

---

## DATABASE MODEL (CONFIRMED)

### bonus_prizes
- `status = 'pending'` → bonus waiting in bonus wallet
- `status = 'delivered'` → bonus already transferred to main wallet

### winners
- `type = 'bonus'`
- `delivered = false` → bonus not yet transferred
- `delivered = true` → bonus already transferred

### wallets
- Main wallet column: `balance_coins`
- MUST NOT be updated during ticket purchase

---

## WORKING PARTS

✅ `claim_miocoin_bonus` RPC  
- Validates ownership via `winners`
- Credits `wallets.balance_coins`
- Sets:
  - `bonus_prizes.status = 'delivered'`
  - `winners.delivered = true`

This function is CORRECT and should NOT be changed further.

---

## BROKEN PART (ROOT CAUSE)

❌ `purchase-ticket` (Edge Function / RPC)

Current behavior (WRONG):
- Automatically credits MioCoins to `wallets`
- Skips or instantly delivers bonus_prizes
- Bonus wallet has nothing to show

Correct behavior (REQUIRED):
1. Create `bonus_prizes` with `status = 'pending'`
2. Create `winners` with `type = 'bonus'` and `delivered = false`
3. DO NOT touch `wallets`

---

## CURRENT SYMPTOMS

- UI shows “Vyhrál jsi MioCoin”
- Bonus wallet does NOT appear
- Sometimes MioCoin is added directly to main wallet
- User cannot manually transfer bonus (because it never exists)

---

## NEXT STEP (MANDATORY)

Fix `purchase-ticket`:
- Remove ALL wallet updates for MioCoin bonuses
- Always create pending bonus record
- Let user control transfer via bonus wallet

---

## READY FOR NEXT CHAT
YES – continue from purchase-ticket fix
# OneMil – aktuální stav projektu

Datum: 2025-12-24
Stav: STABILNÍ / FUNKČNÍ SNAPSHOT

## ✅ Funkční části
- Web OneMil je funkční (Lovable + Supabase)
- Hlavní herní logika, tickety, MioCoiny funkční
- Výsledkový modal ticketu funkční
- Generování grafické karty ticketu (Canvas) funkční
- Upload grafiky ticketu:
  - pouze přes Edge Function (service role)
  - storage bucket: `ticket-shares`
  - public READ, žádný INSERT/UPDATE z klienta

## 🔗 Sdílení ticketů
- Veřejná share stránka `/share/ticket/:id` existuje
- OpenGraph metadata připravena
- Sdílení na Facebook / X technicky hotové
- Instagram / TikTok řešeno stažením obrázku

⚠️ Sdílení NENÍ aktuálně plně funkční kvůli:
- chybě HTTPS / SSL na doméně onemil.cz
- ERR_SSL_VERSION_OR_CIPHER_MISMATCH

➡️ Tento bod je **vědomě odložen** do doby:
- nasazení finální domény
- platného SSL certifikátu

## 🧾 Footer – aktuální obsah
ODSTRANĚNO:
- Kariéra
- Tiskové zprávy

PONECHÁNO:
- Informace (O společnosti, Jak to funguje, Naše mise)
- Podpora (FAQ, Centrum nápovědy, Kontakt, Nahlásit problém, Živý chat)
- Právní podmínky (VOP, Ochrana osobních údajů, Pravidla soutěží, Cookies, Autorská práva)

## 🛠 Admin / CMS
- Admin stránka EXISTUJE
- CMS pro texty (mise, info, footer) ZATÍM NEIMPLEMENTOVÁNO
- Rozhodnutí: odložit, dokud nebude uzamčena struktura webu

## 🔐 Bezpečnost
- Storage chráněn (žádný client upload)
- Edge Functions používají service role
- Stav vhodný pro zálohu
# OneMil – state.md

🔄 Projekt OneMil načten (ruční zápis)
🕓 Poslední záznam: 26. 12. 2025 (Europe/Prague)
🧭 Poslední fokus: MioCoin bonusy v detailu soutěže + automatizace generování soutěží/obrázků (NEPOUŽITO / revert)

---

## 1) Aktuální stav (co je teď pravda)

### A) Zobrazení MioCoin bonusů u zákazníka (ContestDetail)
- Cíl byl: aby se u zákazníka v detailu soutěže zobrazilo číslo “kolik MioCoinů je ve hře”.
- Byly dva přístupy:
  1) Počítat na FE z tabulky `bonus_prizes` (SUM(amount) WHERE amount > 0) → problém s limity/partial generací.
  2) Zobrazovat přímo `contests.total_miocoin_bonus` (jednodušší, jeden zdroj pravdy) → nakonec zvoleno jako “jednoduché řešení”.

⚠️ Poznámka:
- Po cestě vznikly rozbité verze souboru `ContestDetail.tsx` (template stringy bez backticků, rozbité interpolace, TS error u TicketResultModal typů).
- Uživatel se opakovaně vracel na funkční verzi (“ukazuje to 1000” apod.) a požadoval pouze jednu minimální změnu.

### B) DB: `contests.total_miocoin_bonus` je správně synchronizované (aspoň pro konkrétní soutěž)
- Pro soutěž:
  - id: `0c3e9303-f9b3-4ba4-ab89-83e25dd07627` (title: veronika)
  - `total_miocoin_bonus` bylo nakonec nastaveno na `50050` (předtím bylo 0).
- Pro další soutěž:
  - id: `989d8ab9-8247-40af-9ce6-e348339f601d` (title: dfghdsrfgsdf)
  - `total_miocoin_bonus` bylo nastaveno na `65000`.
- V jednom testu se zjistilo, že v `bonus_prizes` bylo:
  - `pocet_bonusu=60000`, `soucet_miocoinu=60000`, `min_amount=1`, `max_amount=1`
  - tzn. generovalo to 60 000 řádků po 1 MC (vysoké riziko timeout / partial completion).

### C) Trigger pro blokování ručních update + synchronizační trigger
Bylo potvrzeno, že existují triggery:
- `trg_prevent_manual_total_miocoin_update` na `contests` (blokuje přímé UPDATE `total_miocoin_bonus`)
- `trg_sync_total_miocoin_bonus` na `bonus_prizes` (AFTER INSERT, FOR EACH ROW)

Pozn.: Během debugu se řešilo, že synchronizace nemusí pokrývat DELETE/UPDATE bonusů, ale konečný závěr byl: pro “jednoduché zobrazení čísla” stačí používat `contests.total_miocoin_bonus` přímo.

### D) Kritická chyba: `admin_actions.admin_id` NOT NULL (padá na update contests)
Opakovaně se objevila chyba:
- `null value in column "admin_id" of relation "admin_actions" violates not-null constraint`
- Kontext: PL/pgSQL `handle_contest_sofinity_event()` při UPDATE/INSERT do `contests`
- Trigger na contests:
  - `tr_contest_sofinity_events` (AFTER INSERT OR UPDATE → `handle_contest_sofinity_event()`)
  - + další triggery: `trg_contest_update` (`fn_send_event_to_sofinity()`), `on_contest_closed`, `update_contests_updated_at`, `trg_set_default_contest_status`

Tohle je riziko: jakmile se contest upraví mimo admin session / bez admin_user_id, trigger se snaží logovat admin akci a spadne to.

---

## 2) Co se ZKOUŠELO, ale nakonec NEPOUŽITO / revert

### A) “Fix” generování MioCoin bonusů přes edge funkci `distribute-bonus-prizes`
- Původní problém: do DB se ukládalo méně bonusů než očekáváno (typicky 1000), protože generace 50k+ řádků mohla timeoutnout.
- “Plan” byl:
  - posílat do edge funkce `amount_per_unit` dle “step value” (např. 100) → méně řádků, větší hodnoty
  - mapovat distribution `even -> step_interval`, `random -> random`
- I po změnách ale byl vytvořen test, kde to stále vkládalo `60000 × 1`.
- Nevyřešeno v tomto chatu do finální robustní verze.

### B) Edge funkce `generate-complete-contests` (automatická tvorba 10 soutěží + obrázky)
- Lovable navrhlo vytvořit obří edge funkci, která:
  - vytvoří soutěže,
  - vygeneruje obrázky přes Lovable AI gateway,
  - nahraje do storage,
  - vloží 20 fyzických bonusů/contest.
- Uživatel to nechtěl dál testovat a krok byl vrácen (zůstaly “nedodělané hry”), následně ručně upraveno.
- Tento přístup je označen jako NEPOUŽÍT (příliš rizikové, mění moc věcí najednou).

### C) SQL skript pro vytvoření soutěže “Svět luxusních ikon” + 20 bonusů
- SQL insert soutěže + DO $$ blok na bonus_prizes (pozice 1–20) byl připraven.
- Problém: MioCoin bonusy se tím negenerují (to je jiný mechanismus) + obrázky se v praxi nemusely zobrazit.
- Uživatel narazil, že “nejsou MioCoiny” a “nejsou obrázky”.

### D) Storage/RLS pro bucket `contest-banners`
- Lovable navrhlo SQL pro:
  - vytvoření bucketu `contest-banners`,
  - policies na `storage.objects` (public read, authenticated insert, admin update/delete).
- Uživatel odmítl další schvalování/testy (riziko rozbití).
- Stav: NEAPLIKOVÁNO / nezaručeno.

---

## 3) Co je finální dohoda po tomhle chatu

1) Neřešit teď “AI automatizace 10 soutěží”.
2) Držet se jednoduchého cíle:
   - “Číslo MioCoinů ve hře” = jedno číslo v `contests.total_miocoin_bonus` a to zobrazit v detailu soutěže.
3) Neprovádět další riskantní SQL na storage policies bez jasného ověření stávajícího stavu bucketů/RLS.
4) Při dalším chatu:
   - udělat čistý audit: proč se generace MioCoin bonusů někdy zasekne na 1000 / partial completion
   - opravit admin trigger problém (`admin_actions.admin_id`), protože to blokuje update contestů.

---

## 4) Nejbližší další kroky (doporučení pro příští chat)

### Krok 1: Ověřit realitu pro konkrétní contest (bez hádání)
- Pro zadané contest_id:
  - `SELECT total_miocoin_bonus FROM contests WHERE id = ...`
  - `SELECT COUNT(*), COALESCE(SUM(amount),0) FROM bonus_prizes WHERE contest_id=... AND amount>0`
- Porovnat, zda DB odpovídá UI.

### Krok 2: Vyřešit `admin_actions.admin_id` fail (blokuje UPDATE)
- Upravit `handle_contest_sofinity_event()` tak, aby:
  - buď uměl fallback admin_id,
  - nebo nelogoval admin_actions pokud admin_user_id je NULL,
  - nebo aby se to logovalo do jiné tabulky bez NOT NULL.
(Neimplementováno v tomto chatu, jen detekováno jako blocker.)

### Krok 3: Robustní generace MioCoin bonusů
- Opravit, aby generování:
  - buď nevytvářelo desítky tisíc řádků po 1,
  - nebo mělo retry/batching a tvrdý “success only if all created”.
(Neuzavřeno v tomto chatu.)

---

## 5) Důležité “NE”
- Nepouštět znovu edge funkci pro generování 10 soutěží s obrázky (dokud není ověřené storage + RLS).
- Neschvalovat naslepo SQL na `storage.objects` policies bez ověření, co už existuje.
- Nepřepisovat celý `ContestDetail.tsx` — pouze minimální cílené změny.

---
Projekt: OneMil
Datum: 27. 12. 2025
Stav: ✅ FUNKČNÍ / STABILIZOVÁNO

Stav MioCoin & bonusového systému

Generování MioCoin bonusů při vytvoření soutěže funguje správně

MioCoin bonusy:

title = 'MioCoin'

amount > 0

Věcné bonusy (fyzické výhry):

title IS NULL

amount = 0 / NULL

Stav, kdy by existoval záznam:

title IS NULL AND amount > 0
NEEXISTUJE (ověřeno SQL)

Interpretace statistik

miocoin_rows = počet MioCoin bonusů (správně)

null_title_rows = počet věcných výher (správně, není chyba)

Důležité rozhodnutí

❌ Nebude se nyní měnit pojmenování v UI

❌ Žádné další zásahy do DB ani backendu

✅ Systém odpovídá očekávané logice

Aktuální závěr

Bonusový systém je v pořádku.
Rozdíl mezi MioCoiny a věcnými výhrami je dán datovým modelem a je záměrný.
Projekt: OneMil

Datum zápisu: 29. 12. 2025
Stav: funkční, ale hlavní audit výher přerušen – nutno navázat

✅ CO JE NYNÍ HOTOVÉ (OVĚŘENO A FUNKČNÍ)
🏆 Výhry (winners)

Tabulka winners:

přidán sloupec user_seen

badge „Výhry“ funguje

po otevření stránky „Moje výhry“ se správně odznačí

Realtime:

winners je přidána do supabase_realtime

REPLICA IDENTITY FULL nastaveno

Zvuk při výhře:

přehrává se pouze userovi

admin / superadmin nikdy

respektuje winSoundEnabled

💬 Zprávy

Zprávy o výhře:

chodí pouze zákazníkovi

admin je nevidí v inboxu (správně)

Badge:

user badge počítá sender='admin'

admin badge počítá sender='user'

Systémové zprávy byly sjednoceny na sender='admin'

Guardian zprávy:

řešeny triggerem na winners

fungují jen pro <18

⚠️ CO JE ZÁMĚRNĚ ODLOŽENO

Design / finální zvuk výhry (řešit později)

Typing indicator, animace, konfety

🎯 HLAVNÍ NEVYŘEŠENÝ BLOK (DŮVOD DALŠÍHO CHATU)
❗ Audit výher – HLAVNÍ TOK (NEBYL DOKONČEN)

Původní plán (ze začátku chatu) byl:

Audit podmínky vzniku výhry

kde přesně vzniká (SQL / Edge / trigger)

jestli se nevytváří víckrát

Audit winners

správné user_id

správné prize_id

správné contest_id

Audit vazby na bonus_prizes

fyzická vs MC výhra

guardian_required

Audit zobrazení v UI

žádné duplicity

správné řazení

správné počty

👉 TENTO AUDIT BYL PŘERUŠEN
kvůli řešení:

badge

realtime

zpráv

zvuků

🔁 CO SE MÁ UDĚLAT JAKO PRVNÍ V DALŠÍM CHATU

Navázat bodem 2: Audit winners (hlavní tok výhry)

Konkrétně:

projít kde se winners vytváří

ověřit, že:

nevzniká víckrát

odpovídá skutečné výhře

teprve potom pokračovat bodem 3 a 4 
# Projekt OneMil – aktuální stav (heslo: pavel)

🕓 Poslední aktualizace: 30. 12. 2025 CET  
🧭 Aktivní návratový bod: **pavel**

## Kontext
Projekt OneMil (Supabase + Lovable) – administrace výher a jejich předání.

Během vývoje došlo k výraznému odbočení k:
- realtime zvukovým notifikacím
- online presence uživatelů
- Stripe platbám
- horní admin liště (indikátory)

Tyto části jsou nyní **funkční nebo odloženy**, ale **nejsou součástí aktivního úkolu**.

---

## Aktivní oblast (PAVEL – hlavní fokus)
**Admin – Přehled předání výher podle soutěží**

Cílem je:
- mít jasný, přehledný a použitelný admin workflow pro správu výher
- odstranit zmatečné přesměrování mezi stránkami
- zlepšit UX tak, aby admin **vždy věděl:**
  - co je výhra
  - v jakém je stavu
  - co má udělat jako další krok

---

## Stav funkcionalit (k datu návratu)
### Hotovo / funkční
- SQL funkce `get_prizes_delivery_summary` opravena
  - počítá pouze skutečné výhry (`won`, `delivered`)
  - nepočítá pending bonusové pozice
- Admin statistiky:
  - počet výher
  - počet předaných
  - počet čekajících
- Klik na výhru:
  - otevře detail výhry (karta / modal / detail)
- Po zavření detailu:
  - **má zůstat admin na přehledu výher** (neodskakovat jinam)

---

## Rozpracované / k dodělání (hlavní úkol pro další chat)
1. **Definitivně ujasnit UX admina pro výhry**
   - co se má dít po kliknutí na výhru
   - jestli:
     - modal
     - drawer
     - inline detail
   - bez změny stránky

2. **Jasně definovat význam položky „pozice výhry“**
   - proč tam je
   - k čemu slouží
   - jak ji má admin použít

3. **Zjednodušit administrátorský tok**
   - admin otevře přehled
   - klikne na výhru
   - změní stav / poznámku / předání
   - zavře detail
   - zůstává na stejném přehledu

---

## Co teď NEřešit
❌ zvukové notifikace  
❌ online presence  
❌ Stripe / platby  
❌ horní lištu a indikátory  
❌ realtime / polling / deduplikace  

---

## Další krok (pro nový chat)
➡️ **Navázat na bod „pavel“**  
➡️ Zaměřit se **výhradně na admin správu výher a UX přehledu předání**

AKTUÁLNÍ STAV PROJEKTU (k 30. 12. 2025)
Projekt

OneMil – Správa výher (Admin + uživatel)

Stav

✅ StABILNÍ / PŘIPRAVENO K DALŠÍ FÁZI

Shrnutí funkčního stavu
1️⃣ Výhry – datová a logická vrstva

Tabulka winners je stabilní

Rozlišeno:

MioCoin výhry → automaticky připsané (read-only)

Fyzické výhry (hlavní / bonusové) → ruční správa stavů

Stavový model:

čeká na potvrzení

připraveno k odeslání

odesláno

vyplaceno

Unikátní indexy:

1 hlavní výhra na soutěž

žádné duplicitní bonusy

2️⃣ Admin – Správa výher (UI)

Přehledná tabulka:

Email, adresa, název soutěže, Popis ceny, typ, stav, historie, akce

Popis ceny – finální podoba:

řádek: název výhry (např. Dyson, MioCoin – 1 MioCoins)

řádek: pouze Ticket #X

žádné duplicity textů („hlavní/bonusová“ se řeší badge)

MioCoin:

stav vždy „Připsáno“

akce: Automaticky připsáno

stav nelze měnit

Fyzické výhry:

plně ovladatelné dropdownem

historie změn se ukládá

3️⃣ Historie změn

Kompletní audit:

starý stav → nový stav

datum + čas

email admina

Popup historie:

zavření klikem mimo (click-outside)

stabilní chování

MioCoin historie:

obsahuje datum připsání

4️⃣ Filtry

Funkční filtry:

Všechny stavy

Čeká na potvrzení

Připraveno k odeslání

Odesláno

Vyplaceno

Automaticky připsáno (MioCoin)

Filtry jsou korektně oddělené (MioCoin ≠ fyzické výhry)

5️⃣ Exporty

CSV export výher:

kompletní data

ticket číslo

stav

soutěž

CSV export historie:

auditní přehled změn

Export funguje a je použitelný pro účetnictví / archiv 
# 🔄 Projekt OneMil – STATE

**Datum a čas:** 02. 01. 2026 (CET)

## ✅ Aktuální stav projektu

### 1️⃣ Doména a produkce

* **onemil.cz** je funkční a běží jako hlavní produkční doména.
* Aplikace je publikována z Lovable do produkce.

### 2️⃣ Autentizace (Supabase)

* **Google Sign-In: OPRAVENO a FUNKČNÍ** ✅

  * Problém: `Invalid token: signature is invalid`
  * Příčina: chybějící povolené domény v **Google Cloud Console (OAuth Client)**.
  * Oprava:

    * Přidány povolené redirect URI:

      * `https://onemil.cz`
      * `https://onemil.cz/**`
    * Supabase **Site URL** nastaveno na `https://onemil.cz`.
    * Redirect URLs obsahují `https://onemil.cz/**`.
    * Callback URL v Supabase **NEMĚNĚNA** (`supabase.co/auth/v1/callback`).
  * Stav: přihlášení přes Google nyní funguje korektně na produkční doméně.

### 3️⃣ Facebook / Meta integrace

* **Meta App Review – rozpracováno** ⚠️
* Stav ověření domény:

  * Meta tag `facebook-domain-verification` je **správně vložen staticky** do `index.html` (v `<head>`):

    ```html
    <meta name="facebook-domain-verification" content="gxkf1jmavmy2zhzwmslyan4fc92az" />
    ```
  * Tag je přítomen v produkčním HTML (onemil.cz).
  * Meta Business Manager zatím hlásí **Domain not verified**.
* Pravděpodobná příčina:

  * Cache / zpoždění ověření na straně Meta (běžně až 24–72 hodin).
  * Meta si zatím nenačetla aktuální HTML z produkce.

### 4️⃣ Právní a kontaktní údaje

* Přidáno a sjednoceno napříč aplikací:

  * Provozovatel: **iCONIC POINT s.r.o.**
  * IČO: 177 95 851
  * Sídlo: Na Folimance 2155/15, Vinohrady, 120 00 Praha 2
  * Jednatel: Pavel Diviš
  * E-mail: [podpora@onemil.cz](mailto:podpora@onemil.cz)
  * Telefon: +420 776 532 562
* Aktualizováno:

  * Patička
  * Stránka `/kontakt`
  * Obchodní podmínky
  * Zásady ochrany osobních údajů
  * Mazání účtu

---

## ⏳ Co je otevřené / čeká se

### Facebook (Meta)

* Počkat na:

  * Propagaci změn (cache Meta)
  * Ruční opětovné kliknutí na **Verify domain** v Meta Business Manageru
* Pokud se do 24–48 h neověří:

  * Použít **Sharing Debugger** a znovu scrape `https://onemil.cz`
  * Případně zkusit alternativní metodu (DNS TXT záznam)

---

## 🔜 Další logický krok v novém chatu

* Dokončit **Facebook / Meta ověření domény**
* Navázat na **App Review (email, public_profile)**
* Ověřit, že Facebook login / integrace budou připravené pro další fázi
AKTUÁLNÍ STAV PROJEKTU (OneMil)

Datum aktualizace: 3. 1. 2026
Stav: aktivní design & UI stabilizace (hero banner + sekce homepage)

🔒 ZÁVAZNÁ DESIGNOVÁ PRAVIDLA – HERO BANNER

Oficiální rozměr hero banneru:
1920 × 480 px (poměr 4:1)
Tento rozměr je definitivní a je používán při generování grafiky (Nano Banana / Gemini 3 Fast).

Chování banneru v kódu:

banner kontejner má pevnou výšku

desktop: h-[480px]

tablet: h-[360px]

mobile: h-[240px]

šířka: w-full, max-w-[1920px], mx-auto

povolené: object-cover

zakázané: object-contain, dynamická výška, automatický crop

Důvod:
Grafika je navržena přesně na 4:1, žádný obsah se NESMÍ ořezávat ani deformovat.

🎨 GRAFICKÝ STYL OneMil (závazné)

Barevnost:

tmavé luxusní pozadí (dark navy / černá)

zlaté linky a oddělovače (světelné jádro + fade do ztracena)

typografie:

nadpisy: zlatý / champagne kovový efekt

běžný text: bílé zlato / stříbrný tón (ne čistě bílý)

Hero banner obsahuje:

luxusní vůz (Corvette – nový model)

luxusní produkty: Rolex, Louis Vuitton kabelka, šperky, Dyson, PlayStation 5, Apple (MacBook + iPhone)

vila / dům u moře (Thajsko nebo Dubaj)

atmosféra: prémiová, lehký pohyb / dynamika, cinematic light

🧱 LAYOUT – HOME SEKCE

Sekce „Dobijte si MioCoiny“ a „Poslední výherci“

jsou v grid-cols-1 lg:grid-cols-2

mají stejnou výšku (h-full)

rozměry jsou zafixované kvůli designu

nesmí se dynamicky přepočítávat podle obsahu 
## Stav projektu – Poslední výherci (UI)

Byla implementována možnost řídit vzhled karet „Poslední výherci“ pomocí admin banneru
s cílovou stránkou „Vzhled – karta výher“.

Technicky:
- WinnerCard podporuje dekorativní background přes cardStyleImageUrl
- Homepage i /winners správně načítají placement „vzhled_karta_vyher“
- Obrázky výher jsou opravně načítány z Supabase Storage (plné URL)

Aktuální blokér:
- chybí finální PNG grafika karty (bez textu, bez avatarů, bez pozadí sekce)

Další krok:
- vytvořit a nahrát finální grafiku karty výher.
6.1.2025
Stav úvodní stránky

✅ Horní část homepage (hero, MioCoin balíčky, poslední výherci, separátory) je graficky sjednocená

✅ Barevná paleta ustálena:

tmavé pozadí (dark navy / graphite)

zlaté akcenty (obrysy, separátory, CTA)

stříbrné / muted texty

✅ Footer:

extrahován do reusable Footer komponenty

typografie sjednocena

barvy sjednoceny na design tokeny

⚠️ Footer je zatím použit jen na homepage (ostatní stránky používají BottomNavigation)

Klíčový problém (AKTUÁLNÍ FOKUS)

❌ Karta soutěže (ContestCard) není vizuálně na úrovni cílového designu

Probíhající soutěže používají:

vnitřní panely / glass boxy

více vrstev (overlay v overlayi)

CTA oddělené od karty

Výsledkem je:

neklidný layout

vizuální roztříštěnost

odklon od prémiového „Apple-like“ stylu

Cílový design ContestCard (DEFINOVÁNO)

👉 Apple-style „kapka / pill card“

Vlastnosti cílové karty:

jedna sjednocená plocha (žádné vnitřní boxy)

obrázek = pozadí celé karty

jemný tmavý gradient pouze dole pro čitelnost textu

velké, hladké zaoblení rohů

zlatý glow pouze po obvodu karty

žádný glassmorphism

žádné vnořené panely

žádné bílé / šedé plochy

Obsah karty:

název + podnázev vlevo dole

CTA „Uplatnit 1 MioCoin“:

pill shape

tmavé pozadí

zlatý obrys

ikona trofeje

sekundární „Detail“ tlačítko minimalistické

Technický stav

Komponenta: ContestCard

Platforma: Lovable

Stav: NEUZAMČENO, probíhá iterace

Logika karty se NESMÍ měnit

Mění se POUZE VIZUÁL (CSS / struktura JSX) 
Projekt: OneMil
Datum: aktuální
Stav: stabilní, aktivní vývoj
Fokus fáze: UX / bezpečnost / partnerská integrace

✅ DOKONČENO (OVĚŘENO)
🎨 UI / UX

ContestCard redesign do Apple-style pill karet

Sjednocený vizuál:

Homepage

ContestDetail

Dostupné vouchery

Partneři

CTA tlačítka sjednocena (pill, h-11)

Aktivní soutěže:

odstraněn badge „Aktivní“

zobrazují se pouze neaktivní stavy (pozastaveno / ukončeno)

Bonusové MioCoiny v Profil → Peněženka:

vždy viditelné, i při hodnotě 0

UX problém vyřešen

🧾 BONUSOVÉ VĚCNÉ VÝHRY

Přidán detailní popis bonusové výhry při vytváření soutěže (admin)

Databáze:

ALTER TABLE public.bonus_prizes 
ADD COLUMN IF NOT EXISTS detailed_description text;


Implementován modal detailu bonusové výhry:

otevření klikem na kartu

název, obrázek, detailní popis

Vizuální styl bonusových výher sjednocen s „Poslední výherci“ (starry background)

📜 SCROLL & NAVIGACE

Identifikován problém: nelze doscrollovat na konec ContestDetail

Příčina:

fixed BottomNavigation

chybějící safe-area-inset-bottom (iOS)

Schválená oprava:

ContestDetail:

min-h-screen

zvýšený bottom padding

safe-area kompenzace

BottomNavigation:

respektuje env(safe-area-inset-bottom)

Oprava aplikována POUZE na ContestDetail (správně, ne globálně)

🔐 BEZPEČNOST – KONCEPČNĚ

Ujasněn bezpečnostní model:

RLS všude

frontend nikdy nemanipuluje se zůstatkem

audit logy

partner API s klíči, rate limit, idempotence

Potvrzeno:

kombinace zdarma získané MioCoiny + možnost dobití je OK

právně bezpečný model (virtuální odměnové body)

🤝 PARTNERSKÝ MODEL (SHOPTET A DALŠÍ)

Navržen funkční koncept:

doplněk / plugin

reward: např. 1 MioCoin / 100 Kč

zákazník:

získá MioCoiny zdarma

aktivuje je dobrovolně

e-shop:

platí jen za aktivované MioCoiny

měsíční vyúčtování

OneMil:

API award → activate → billing

žádná finanční hodnota bodů

⚠️ OTEVŘENÉ BODY / ROZPRACOVANÉ

oprava klikatelnosti bonusových karet:

po jedné úpravě došlo k rozbití onClick (stav znovu analyzován)

grafika z homepage:

přenesená na ContestDetail

potvrzeno, že styl může zůstat 
Stav projektu

OneMil je vlastní produkt společnosti Iconic Point (ne agentura, žádný vývoj na zakázku).

Iconic Point provozuje a rozvíjí vlastní digitální produkty.

Web Iconic Point má vysvětlovat firmu jako provozovatele a OneMil jako produkt.

OneMil: vysvětlující, obchodní narativ (jak funguje, k čemu slouží, přínosy pro zákazníky i partnery).

Rozhodnutí (závazná)

NE: vývoj aplikací pro klienty, agenturní služby.

ANO: vlastní produkt, vlastní odpovědnost.

Hlavní cíl: rychlá adopce e‑shopů a firem („BUM efekt“).

Nový systém k vybudování – PARTNERSKÝ SYSTÉM ONEMIL
Cíl

Centrální systém, kde se firmy/e‑shopy:

zaregistrují,

projdou schválením,

samy generují kódy,

nasadí je kamkoliv (bez API),

platí až při aktivaci/uplatnění kódu.

Režimy

A) Univerzální (PRIORITA): bez API, bez Shoptetu, jen kódy + návod.

B) Platformy (POZDĚJI): Shoptet/Eshop‑rychle jako doplněk, napojené na stejný backend.

Flow partnera

Registrace firmy

Ruční schválení adminem

Partner dashboard

Neomezené generování kódů

Aktivace kódu při použití

Aktivace = podklad pro fakturaci

Technický postup

Lovable (nejdřív): UI, flow, logika (registrace, schválení, dashboardy).

SQL (potom): datový model (partneři, kódy, aktivace, fakturace, audit).
# Projekt OneMil – stav projektu (state.md)

## Poslední aktualizace

Datum: **19. 1. 2026 (CET)**

## Aktuální stav – DŮLEŽITÉ

### 🔐 Registrace partnera / Auth (Supabase)

* Problém s registrací e‑mailu **[eshop@onemil.cz](mailto:eshop@onemil.cz)** byl **NE v kódu**, ale v **Supabase Auth – Email Confirmation flow**.
* Supabase vracel chybu: `Email address "eshop@onemil.cz" is invalid`.
* Potvrzeno, že šlo o **serverovou validaci Supabase** (email confirmation / SMTP), nikoliv UI validaci.

### ✅ Co bylo uděláno

* **Dočasně vypnuto „Confirm email“ v Supabase Auth**.
* Po vypnutí:

  * registrace partnera **OK**
  * přihlášení jako **[eshop@onemil.cz](mailto:eshop@onemil.cz)** **OK**
  * vstup do partnerského portálu **OK**
* Tím je potvrzeno:

  * frontend validace je správná
  * doména `onemil.cz` je syntakticky OK
  * problém je výhradně v email / SMTP vrstvě Supabase

### ⚠️ Kritické upozornění

* Tento stav je **POUZE pro testování**.
* Email confirmation **MUSÍ být v produkci zapnuté**, ale:

  * až po správném nastavení **custom SMTP**
* NIKDO nesmí:

  * znovu mazat auth uživatele
  * znovu zapínat confirm email bez funkčního SMTP
  * upravovat registrační logiku nebo regexy

---

## 🧾 Partner registration flow (aktuální pravda)

1. Partner se registruje na `/partner/register`
2. Vytvoří se **auth user**
3. Do `user_metadata` se ukládá:

   * `partner_registration = true`
4. Partner **není veřejný**
5. Admin ho vidí v **Čekající registrace**
6. Po schválení adminem:

   * vytvoří se záznam v `partners`
   * `status = approved`
   * `logo_status = none`
7. Partner:

   * nahraje logo → `logo_status = pending`
8. Admin:

   * schválí logo → `logo_status = approved`
9. Homepage:

   * zobrazuje POUZE partnery kde:

     * `status = approved`
     * `logo_status = approved`
     * `logo_url IS NOT NULL`

---

## 🧩 Technické invarianty – NESMÍ SE PORUŠIT

* ❌ Partner approval **NESMÍ publikovat partnera**
* ❌ Logo upload **NESMÍ publikovat partnera**
* ✅ Pouze admin nastavuje `logo_status = approved`
* ✅ Homepage filtruje přísně podle 3 podmínek

---

## 🔜 Další krok (až v dalším chatu)

1. Otestovat partnerský dashboard jako `eshop@onemil.cz`
2. Ověřit:

   * upload loga
   * chování stavů
   * data v přehledech
3. Teprve POTÉ:

   * řešit SMTP
   * nastavit sender email
   * znovu zapnout confirm email

⚠️ Dokud SMTP není 100% funkční → **Confirm email ZŮSTÁVÁ VYPNUTÉ**
Projekt: OneMil – Admin / Partners
Datum: 2026-01-21
Stav: ⚠️ Nestabilní – rozbitý AdminPartners UI + nefunkční generování API klíčů z frontendů (Lovable)

Co funguje ✅

Edge Function rotate-partner-api-key:

Ověřeno ručně (PowerShell / curl)

Vrací 200 OK a platný api_key

SUPABASE_SERVICE_ROLE_KEY je správně nastaven

Backend:

partner_api_keys tabulka existuje

Klíče se zapisují (key_prefix, revoked_at = null)

Admin role existuje (user_roles obsahuje admin)

Auth:

JWT token je platný

Authorization: Bearer <access_token> funguje

Co NEfunguje ❌

AdminPartners.tsx je rozbitý

UI je rozpadlé / prázdné / skeleton

Některé verze souboru z Lovable odstranily většinu JSX

Generování API klíčů z UI NEfunguje

Chyba: Failed to send a request to the Edge Function

Problém se objevuje jen z Lovable / frontendu

Lovable:

Opakovaně přepisuje soubor destruktivně

Nedrží původní layout ani strukturu

Míchá kód z AdminPartnersPortal.tsx (špatně)

Důležité technické poznámky

Edge Function funguje → problém je 100 % ve frontendu

Session + JWT existují, ale:

buď se neposílá Authorization header

nebo Lovable volá funkci dřív, než je session ready

nebo je rozbitý import Supabase klienta

UI bylo původně plně funkční (tabs, CRUD, dialogy, API klíče) 
Projekt: OneMil – Partnerský portál & API

Stav k uzavření chatu: ✅ funkční, zabezpečené, připravené k integraci

✅ CO JE HOTOVÉ
1️⃣ Oddělení účtů

Existují oddělené typy účtů:

Zákazník (hraje, kupuje)

Partner (portál, API, žádné hry)

Admin / SuperAdmin

Partner:

NEVIDÍ bottom navigaci

NEMŮŽE hrát hry

JE NATVRDO BLOKOVÁN od zákaznických rout (guard + redirect)

2️⃣ Admin proces (schválení)

Admin:

schvaluje partnera

schvaluje logo partnera

generuje API klíče

Partner nemá žádnou možnost si API klíč vytvořit sám

3️⃣ Partnerský dashboard (UX)

Jasný dashboard po přihlášení partnera:

stav účtu (Aktivní / Čeká / Pozastaveno)

primární akce:

API klíče

Dokumentace API (placeholder)

Kontakt na podporu

Checklist „Jak začít“ s progressem:

schválení účtu

logo

API klíč

integrace (info)

Viditelné čekací hlášky:

účet čeká na schválení

logo čeká na schválení

API klíč zatím nebyl vygenerován

4️⃣ Partnerský header (globální)

Viditelný pouze pro partnery

Obsahuje:

logo partnera (fallback na název)

název firmy

label „Partnerský portál“

status badge (responsive – funguje i na mobilu)

tooltip „Přejít na partnerský dashboard“

klik na logo → /partner/dashboard

API klíče

Odhlásit se

Header je oddělený od zákaznického UI

5️⃣ API bezpečnost – BACKEND (KRITICKÉ)

Nasazeno SQL-only, bez UI závislosti:

🔒 Centrální guard:

verify_partner_api_key(api_key)

Podmínky pro průchod API:

klíč existuje

klíč není revoked

partner status = approved

logo_status = approved

View:

valid_partner_api_keys

Audit:

partner_api_key_usage

log_partner_api_key_usage()

➡️ API klíč je technicky použitelný POUZE pokud jsou splněny všechny podmínky.

❗ CO JE DŮLEŽITÉ VĚDĚT

UI může ukazovat „Aktivní“, ale rozhoduje backend guard

Bez schválení API NEPROJDE

Bez schváleného loga API NEPROJDE

Toto je připravené pro externí firmy (bezpečné)

🔜 CO ZBÝVÁ DODĚLAT (DALŠÍ CHAT)

Edge Function wrapper

používat verify_partner_api_key()

vracet 401 / 403 / 200

Test endpoint

jednoduchý „partner-test“ endpoint

Integrace do reálných API endpointů

všechny partner API volání musí jít přes guard

(volitelné) Reporting / monetizace

kolik klíčů

kolik volání

kolik hodnoty 
## Stav projektu OneMil – partnerské odměny (26. 1. 2026)

### Hotovo v tomto chatu

* Byla analyzována a **opravena SQL logika pro partnerské API klíče**.
* Aktivováno a použito **pgcrypto (extensions.digest + convert_to UTF8)** pro bezpečné hashování API klíčů (bytea).
* Opravena a znovu vytvořena funkce **activate_partner_reward_sql(text, text, uuid)** – funkce nyní:

  * správně hashují API klíč,
  * vrací strukturovaný JSON (`{ success: true, partner_id }`),
  * funguje bez závislosti na `auth.uid()`.
* Ověřeno volání SQL funkce přímo v Supabase (success response potvrzena).
* Implementováno **ověření API klíče** pomocí existujících funkcí:

  * `validate_partner_api_key(text)`
  * `log_partner_api_key_usage(uuid, uuid)`
* Nastaveno **RLS / oprávnění**: RPC `activate_partner_reward_sql` je spustitelné pouze rolí `authenticated`.

### UI / Lovable

* Do **PartnerDashboard** bylo přidáno:

  * tlačítko a modal **„Aktivovat odměnu“** (manuální nástroj),
  * modal obsahuje pole „Kód odměny“ a „API klíč“ (API klíč je maskovaný `type=password`),
  * volání RPC `activate_partner_reward_sql` se správnými parametry,
  * české toasty (success / error).
* **DŮLEŽITÉ:** Tento nástroj **NENÍ pro běžné e-shopy**.
* UI bylo **omezeno pouze pro adminy** (`isAdmin` přes `useUserRole`).

  * Běžní partneři (e-shopy) tlačítko ani modal **nevidí**.

### Architektonické rozhodnutí (potvrzeno)

* **Hlavní business flow**:

  * E-shop má API klíč napojený ve svém systému.
  * Po nákupu zákazníka e-shop **automaticky** volá API OneMil.
  * Systém připíše MioCoiny + pošle email zákazníkovi.
  * Žádné ruční potvrzování, žádné UI kroky pro e-shop.
* Manuální „Aktivovat odměnu“ je **pouze admin/support nástroj** (testy, offline akce, troubleshooting).

### Stav

* Backendová logika: **HOTOVO / stabilní**.
* Admin nástroje: **HOTOVO**.
* UI omezení: **HOTOVO**.

### Další kroky (prioritizované)

1. **Vytvořit hlavní API endpoint pro e-shopy** (Edge Function nebo RPC):

   * vstup: `api_key`, `customer_identifier (email / external_id)`, `amount_miocoin`, `order_id`.
2. **Automatické odeslání emailu zákazníkovi** po připsání MioCoinů.
3. **Rate limiting / ochrana API** (ochrana proti zneužití klíče).
4. Logování nákupů / audit (volitelné, ale doporučené).
# OneMil – Partner API Keys (stav)

🕓 Poslední aktualizace: 25. 1. 2026 večer
🧭 Aktuální oblast: Admin → Správa partnerů → API klíče

## Cíl
Umožnit adminovi vygenerovat / rotovat API klíč partnera přes Admin UI.
Tok:
Admin UI → Edge Function `rotate-partner-api-key` → RPC `generate_partner_api_key` → tabulka `partner_api_keys`.

## Aktuální stav
⚠️ FUNKČNOST NENÍ JEŠTĚ DOKONČENA – práce byla přerušena před finálním nasazením DB opravy.

## Co je hotové
### 1) Edge Function
- Edge Function `rotate-partner-api-key` **JE NASAZENÁ**.
- Používá **výhradně `SUPABASE_SERVICE_ROLE_KEY`** (správně).
- Nepoužívá request JWT pro DB operace (správně).
- Má:
  - CORS (OPTIONS + POST)
  - validaci `partner_id`
  - detailní logování (`requestId`, payload, rpc error.code/message/details/hint)
- Volá RPC:
  ```ts
  supabase.rpc("generate_partner_api_key", {
    p_partner_id: partner_id
  });
2) Frontend (Admin UI)
Volání z AdminPartners.tsx je správně:

posílá { partner_id }

NEposílá manuálně apikey header (opraveno)

Admin generuje klíč (ne partner).

UI správně počítá s tím, že:

klíč se zobrazí jen jednou

pak zůstane jen key_prefix + status

3) Diagnostika chyb (už vyřešeno mentálně, ne ještě v DB)
Byly identifikovány tyto skutečné příčiny selhání:

❌ chybějící pgcrypto extension → gen_random_bytes() neexistovalo

❌ RPC používala sloupce created_by, description, které neexistují v partner_api_keys

❌ pokusy o ALTER selhávaly kvůli existující funkci (nutný DROP)

❌ mismatch signatur RPC vs. volání (p_partner_id / pořadí parametrů)

Co NENÍ ještě provedeno (kritické)
🚨 DB oprava nebyla zatím nasazena, pouze navržena.

Konkrétně CHYBÍ:

CREATE EXTENSION pgcrypto

DROP FUNCTION generate_partner_api_key(...)

Znovuvytvoření RPC bez neexistujících sloupců

Ověření RPC přímým SELECT * FROM generate_partner_api_key(uuid)

Až poté test Edge Function + Admin UI

Připravená cílová RPC (schválená)
Finální správná verze RPC má:

pouze parametr p_partner_id uuid

zapisuje jen:

partner_id

key_prefix

key_hash

vrací:

api_key (plaintext – jen jednou)

key_id

key_prefix

created_at

Další krok (pro nový chat)
👉 Navázat okamžitě zde:

Spustit DB opravu (pgcrypto + DROP + CREATE FUNCTION)

Otestovat RPC v SQL editoru

Otestovat Edge Function přes POST

Ověřit Admin UI (toast + refresh seznamu klíčů)

❗️Není potřeba znovu ladit frontend ani Edge Function – problém je čistě DB/RPC.

# 🔄 STATE – Partner účet (OneMil)

🕓 **Aktuální stav:** Partner účet je **TECHNICKY HOTOVÝ A FUNKČNÍ**

---

## ✅ Funkční části (ověřeno)

### API klíče

* Generování partner API klíče (uložen pouze hash + prefix)
* Jednorázové zobrazení klíče (nelze znovu zobrazit)
* Rotace API klíče partnerem po zadání hesla
* Automatické zneplatnění starého klíče

### Bezpečnost

* Validace API klíče přes prefix + hash
* Rate‑limit (ověřený, funkční)
* Guard funkce pro všechny partner API endpointy
* Kontrola stavu partnera (schválený / aktivní)

### Audit

* Logování všech API volání
* View `partner_api_activity`
* Partner vidí pouze vlastní API aktivitu (RLS)

### Partner Dashboard

* Zobrazení stavu účtu
* Sekce API klíče (bez zobrazení hodnoty)
* Tlačítko „Regenerovat API klíč“ (self‑service)
* API aktivita (read‑only)

---

## 🔒 Omezení

* API klíče nelze znovu zobrazit
* Partner nevidí cizí data
* Přímá validace klíče mimo guard je uzamčena

---

## 🟢 Stav modulu

**PARTNER ÚČET = READY**

Modul je připraven k použití bez dalších nutných zásahů.
# OneMil – aktuální stav projektu

Datum: 1. 2. 2026

## Celkový stav
Projekt OneMil je ve fázi dolaďování obsahových (CMS) stránek, podpory a designové konzistence spodních sekcí aplikace.

Hlavní funkcionality aplikace fungují. Aktuálně se řeší:
- CMS obsah (Informace / Podpora / Právní dokumenty),
- jednotný vizuální styl těchto sekcí,
- a sjednocení zdrojů dat (CMS jako single source of truth).

---

## CMS (Obsah & právní dokumenty)

### Stav:
- Existuje tabulka `content_pages`
- Dynamické routování `/:section/:slug` funguje
- Stránky:
  - Informace (O nás, Jak to funguje, Kontakt – rozpracováno)
  - Podpora (FAQ, Nahlásit problém – formulář hotový)
  - Právní dokumenty (VOP, Pravidla soutěží, GDPR, Cookies)

### Důležité zjištění:
- Footer i některé části aplikace byly historicky **hardcoded**
- Postupně se přechází na **CMS jako jediný zdroj obsahu**
- Ne všechny spodní sekce mají jednotný layout (typografie, mezery, boxy)

---

## Podpora – Nahlásit problém

### Hotovo:
- Formulář „Nahlásit problém“ je:
  - viditelný pouze na `/support/nahlasit-problem`
  - funkční
  - odesílá e-mail přes Resend
- Řešeno:
  - diakritika ve slugu (`nahlásit-problém` vs `nahlasit-problem`)
  - normalizace slugů
- E-maily chodí na `podpora@onemil.cz`

### Poznámka:
- Design formuláře funguje
- **Textový obsah nad formulářem (CMS text)** není vizuálně sjednocen s ostatními stránkami

---

## Kontakt – stav

### Rozhodnutí:
- Kontakt **má čerpat výhradně z CMS**
- Žádná natvrdo zapsaná data v komponentě

### Aktuální stav:
- Refaktor kontaktu byl zkoušen
- Dočasně vráceno o krok zpět
- CMS stránka `info / kontakt` zatím **není finálně napojená**

---

## Design

### Problém:
- Spodní sekce (Kontakt, Podpora, Právní dokumenty) nemají:
  - jednotné řádkování
  - jednotné bloky (cards / sekce)
  - jednotný styl textu jako např. VOP

### Cíl:
- sjednotit:
  - nadpisy
  - oddělovače
  - textové bloky
  - zlaté akcenty
- bez rozbití ostatních částí aplikace

---

## Co je připraveno pro další chat
- Funkční CMS routování
- Funkční podpora formulář
- Jasné rozhodnutí: CMS = jediný zdroj obsahu
- Vráceno do stabilního bodu (bez rozbitých komponent)

# OneMil – aktuální stav projektu

## Stav k datu
Partner sekce a API integrace jsou funkčně dokončeny a považovány za HOTOVÉ.

---

## Partner sekce – stav
✅ Partner portál funkční  
✅ Generování a rotace API klíčů  
✅ Přehled API aktivity  
✅ Stav integrace (aktivní / neaktivní) dle reálných API volání  
✅ Dashboard metriky:
- vydané kódy
- akceptované kódy
- konverzní poměr
- status integrace

---

## API dokumentace
✅ Centrální dokumentace uložena v DB (`settings.partner_api_documentation`)  
✅ Zobrazení v Partner Dashboardu (read-only modal)  
✅ Markdown formát (## sekce, seznamy, code blocky)  
✅ Styling sjednocený, decentní (tlumená zlatá, konzistentní hierarchie)

Dokumentace obsahuje:
- popis účelu API
- princip fungování
- autentizaci
- endpoint
- request / response
- chybové stavy
- doporučený postup
- vysvětlení stavu integrace

---

## Funkčnost API
✅ Vydávání MioCoinů funguje  
✅ Duplicitní objednávky ošetřeny (`order_id`)  
✅ API aktivita logována  
✅ Testovací endpointy neovlivňují status integrace  
✅ Stav „Integrace API: aktivní“ = reálné volání za posledních 30 dní

---

## Důležitá poznámka k budoucímu rozšíření
📝 **Zapsáno do backlogu – řešit později:**

- Možnost nastavení **konverzního poměru útrata → MioCoiny**:
  - partner si nastaví vlastní koeficient
  - výpočet bude plynulý (desetinné MioCoiny)
  - příklad: 99 Kč → 3,8 MioCoinu
- Téma určeno k řešení v samostatném chatu
- Nezasahuje do aktuální funkčnosti API

---

## Stav projektu
🟢 **Sekce PARTNEŘI = UZAVŘENA**
# OneMil – aktuální stav projektu
Datum: 2026-02-02

## Stav: FUNKČNÍ PIPELINE (ISDOC + EMAIL), DOLADĚNÍ CRONŮ

### ✅ Hotové
- Edge function `generate-isdoc`
  - generuje ISDOC z DB (`build_isdoc_payload`)
  - ukládá do Storage bucketu `partner-invoices`
  - správná cesta: `partner/{invoice_id}/isdoc-{invoice_id}.isdoc`
  - zapisuje záznam do `partner_invoice_exports`

- Storage
  - bucket `partner-invoices` existuje a je public
  - RLS vyřešeno policy umožňující insert pro edge functions

- Email pipeline
  - tabulka `email_queue` funkční (`pending / sent / failed`)
  - edge function `process-email-queue`:
    - odesílá emaily přes Resend
    - podporuje přílohy přes `attachment_url`
  - staré `pending` bez přílohy označeny jako `failed`
  - testovací email s ISDOC úspěšně odeslán (`sent`)

- Faktury
  - `partner_invoices` má správně vyplněné:
    - `period_start`, `period_end`, `period_from`, `period_to`
  - stavy `draft → issued` fungují
  - vazba na `partner_invoice_exports` ověřena

### ⚠️ Otevřené
- Cron joby:
  - chyba při `cron.unschedule('partner_invoices_monthly_auto')`
  - důvod: job pod tímto názvem neexistuje / má jiné jobid
- Týdenní automatika:
  - požadavek: **každou neděli** generovat a odesílat faktury
  - nutné ověřit existenci funkce:
    - `create_partner_invoices_for_last_week()`

### 🔜 Další krok (PRIORITA)
1. Vypsat existující cron joby:
   ```sql
   select jobid, jobname, schedule, active from cron.job;
Najít starý měsíční cron (pokud existuje) a odstranit ho podle jobid.

Založit JEDEN týdenní cron (neděle).

(doporučeno) Upravit process-email-queue:

zpracovávat jen pending AND attachment_url IS NOT NULL.
Datum: 7.2.2026
Projekt: OneMil
Stav: stabilní, připraveno na rozšíření o referral / affiliate

🔒 Právní a koncepční stav

OneMil je spotřebitelská soutěž o věcné ceny

Žádný hazard, žádné peněžní výhry

MioCoin = digitální marketingový kredit

MioCoin nelze vybrat ani směnit za peníze

Právní analýza MioCoin (11/2025) potvrzuje bezpečný model

🧱 Technický stav (shrnutí)

Backend: Supabase (auth, wallets, contests, tickets, payments)

Frontend: React / Lovable

Platby: Stripe (dobíjení MioCoinů)

Eventy: posílány do Sofinity

Messaging systém: stabilní

„Jak to funguje“ texty aktualizovány dle reality (bez slibů)

🧩 Nově navržený koncept (PŘIPRAVENO, NEIMPLEMENTOVÁNO)

Referral / doporučovací program pro uživatele (primárně sociální sítě)

Základní pravidla:

Každý uživatel má vlastní referral kód / odkaz

Referral je součástí každého uživatelského účtu

Odměny POUZE z dobitých MioCoinů

ŽÁDNÁ odměna:

za registraci

z MioCoinů získaných zdarma z e-shopů

💰 Nastavení provizí (schválený návrh)

5 % z dobitých MioCoinů doporučeného uživatele

0 % za registraci

0 % z bonusových / zdarma MioCoinů

🛑 Důležité zásady

Referral není hazard

Odměny jsou pouze v MioCoinech

Žádné peníze, žádné výplaty

Žádné farmení registrací

🔜 Další krok

V navazujícím chatu:

vytvořit referral / affiliate funkci

DB návrh + logika připisování

UI sekce „Pozvi přátele“
Datum: 7. 2. 2026
Stav: stabilní, funkční, bez blokujících chyb

✅ Referral systém – FINÁLNÍ STAV
Funkčnost

Referral systém je plně funkční

Odměny se připisují:

5 % z každého placeného dobití

+15 MC jednorázově za první placené dobití doporučeného uživatele

Odměny se nepřipisují za registraci, pouze za placené dobití

Technické řešení

Trigger: trg_payments_referral_reward

Funkce:

create_referral_reward_from_payment()

reverse_referral_reward_on_payment_status_change()

Data se ukládají do referral_rewards

Bonus za první dobití má commission_rate = 0

Kontrola duplicit je zajištěna (1× bonus)

Peněženka

Referral odměny se:

rovnou připisují do wallets.balance_coins

neukládají se do bonus_balance_coins

Není potřeba žádné „převést bonus“ tlačítko pro referral provize

Ověřeno na uživateli veru.enge@gmail.com

✅ Admin – Referraly

Admin stránka /admin/referrals:

seznam referrerů

detail odměn

blokace / odblokace

změna statusu odměn

Admin vidí plné user_id (žádná anonymizace)

Vše je funkční, žádné UI změny nejsou nutné

✅ Email systém (Resend)
Obecné emaily

Email worker process-email-queue:

běží každých 10 minut

úspěšně odesílá referral emaily

Referral email:

předmět: „🎉 Získali jste MioCoiny za doporučení“

status: sent

ověřeno v Resend i DB

⚠️ Faktury – AKTUÁLNÍ ROZHODNUTÍ
Stav

Email „OneMil – faktura připravena“:

je pouze informační

neobsahuje PDF / ISDOC

ŽÁDNÁ faktura se zatím negeneruje jako dokument

Neexistuje:

pdf_url

attachment_url

tabulka s fakturačními soubory

Opatření

Email worker byl upraven tak, že:

NEODESÍLÁ faktury bez přílohy

tyto emaily zůstávají ve stavu pending / ignored

Tím je zabráněno chybám a spamování partnerů

Rozhodnutí

Faktury budou:

zatím dostupné pouze v partnerském portálu

odesílání PDF emailem je odloženo

⏸️ Odložené úkoly (NEŘEŠIT TEĎ)

Generování PDF / ISDOC faktur

Ukládání faktur do Supabase Storage

Odesílání faktur emailem s přílohou 
🔄 Projekt OneMil – stav fakturačního modulu

🕓 Datum: 2026-02-08 (neděle)

## Aktuální stav

Fakturační modul OneMil je funkčně dokončen a připraven k ostrému provozu. Byla provedena kompletní revize logiky generování faktur, idempotence, e-mailového odesílání i PDF výstupů.

## Co je hotovo

* Automatická fakturace **1× týdně (Po–Ne)**, vystavení **v pondělí**
* Cron funkce `create_partner_invoices_for_last_week` normalizována na Po–Ne
* Oprava duplicitních faktur (kontrola `period_start/end` i `period_from/to`)
* Manuální i single-partner generování faktur zabezpečeno proti duplicitám
* Správné číslování faktur + variabilní symbol
* Generování **PDF faktury** (opraven Unicode font problém)
* Dodavatel: **Iconic Point s.r.o.** (IČO 17795851, sídlo Na Folimance 2155/15, Praha 2)
* Odběratel: data z profilu partnera (název, IČO, DIČ volitelně, adresa)
* Přehled aktivací na faktuře (order_id / email / coins)
* Email odesílání faktur: **draft → issued**, zabránění duplicit
* Partnerská sekce **Faktury** (zobrazení, stažení PDF)
* Editace fakturačních údajů partnerem

## Testovací stav

* Partner: BOHEMIA INFINITY s.r.o. ([eshop@onemil.cz](mailto:eshop@onemil.cz))
* Připraveny aktivace MioCoinů: **10 coins** v aktuálním týdnu
* Kontrolní dotaz potvrzuje připravenost k fakturaci

## Co se má stát dál

* **Pondělí (automaticky):**

  * vytvoření 1 faktury za právě ukončený týden
  * odeslání emailu s PDF
  * označení aktivací jako `invoiced = true`

## Poznámky

* Staré testovací / duplicitní faktury zatím ponechány (vyčistit po ověření pondělního běhu)
* Email obsah a PDF texty lze ještě finálně doladit (terminologie, layout)

Stav: ✅ připraveno k ostrému testu pondělní fakturace
📅 Datum: 2026-02-08
🧩 Modul: Influencer Affiliate – V1 (UZAVŘENO)

STAV:
Influencer affiliate sekce je dokončena ve verzi V1 a připravena k internímu testování.
Architektura, databáze i základní UI jsou stabilní a produkčně použitelné.

CO JE HOTOVO:

1) Registrace influencera
- Registrace probíhá přes existující flow `partners`
- Influencer je rozlišen pomocí `partners.notes` (type = influencer)
- Stav schválení: pending / approved / rejected
- Admin schvaluje v admin UI

2) Přihlášení & routing
- Jeden login systém (společný s partnery)
- Po přihlášení:
  - approved influencer → /influencer/dashboard
  - partner → /partner/dashboard
- Žádná mezistránka, redirect probíhá automaticky

3) Influencer Dashboard (V1)
Obsahuje:
- Hero sekci „Vydělávejte s OneMil“
- Statistiky:
  - Celkem přivedeno
  - Registrace (30 dní)
  - Celkem vyděláno (CZK – pouze paid)
  - Tento měsíc (CZK)
  - Konverze (%) – počítá se z unikátních platících uživatelů
- Referral odkaz:
  - unikátní URL
  - kopírování
  - vysvětlení jak vydělávat
- Provize & výplaty:
  - další výplata (1. den následujícího měsíce)
  - čekající / vyplacené částky
- Kampaně:
  - aktivní kampaně (pokud existují)

4) Profil influencera
- Editovatelné údaje:
  - jméno
  - e-mail
  - telefon
  - web / sociální sítě
- Firemní údaje pouze pro čtení (pokud existují)

5) Výplatní údaje (KRITICKÉ – HOTOVO)
Databáze:
- partners.payout_account
- partners.payout_bank
- partners.payout_currency (default CZK)
- partners.payout_ready
- partners.payout_updated_at

UI:
- Pole „Číslo účtu / IBAN“
  - placeholder: 123456789/0800 nebo CZ65 0800 0000 0012 3456 7899
  - vysvětlení, že kód banky patří za lomítko
- Pole „Banka (volitelné)“
- payout_ready = true pouze pokud je účet vyplněn
- Admin vidí výplatní údaje u influencera (read-only)

6) Technický stav
- Bug se ztrátou focusu v inputech opraven
- Použity inline inputy + funkční setState
- Žádné nové tabulky, pouze nové sloupce v partners

CO ZÁMĚRNĚ NENÍ SOUČÁSTÍ V1:
- Asset library (bannery, stories, videa)
- Personalizace podle kanálů (IG/TikTok/YT rozdílně)
- Úkoly / checklist pro influencera
- Pokročilé kampaně

MODUL JE UZAVŘEN JAKO:
InfAKTUÁLNÍ STAV (INFLUENCER SYSTÉM)

Stav: ✅ INFLUENCER SYSTEM V1 – FUNKČNÍ, OTESTOVANÝ, PRÁVNĚ OK

Role v systému (FINÁLNÍ ROZLIŠENÍ)

Hráč (User)

Odměny: MioCoiny

Souhlasy: user_legal_acceptances

Slug podmínek: obchodni-podminky, gdpr

NENÍ partner, NENÍ influencer

Partner (soutěže)

Tabulka: partners

Souhlas: partners.terms_accepted_at

Nepočítají se provize

Influencer

JE partner (partners)

Navíc tabulky: influencer_*

Odměny: CZK provize

Souhlas: partners.terms_accepted_at

ŽÁDNÉ míchání s hráči

Obchodní podmínky – uložení (OVĚŘENO)

✅ Hráči:

user_legal_acceptances

document_slug = obchodni-podminky

accepted_at vyplněno při registraci

✅ Partneři & Influenceři:

partners.terms_accepted_at

ukládá se při potvrzení v Influencer → Podmínky spolupráce

❌ žádné křížení dat mezi hráčem a partnerem

Influencer systém – technický stav

RLS na všech influencer_* tabulkách

Provize:

funkce calculate_influencer_commissions_current_month

počítá pouze z reálných plateb

cron 1× měsíčně

Admin:

vidí provize

může vyplácet

Influencer:

vidí jen svoje data

UX / Routing – OPRAVENO

Admin ani influencer:

nejsou přesměrováni na onboarding

nejsou nuceni k ověření věku

Podmínky spolupráce:

mají tlačítko Souhlasím

po potvrzení návrat zpět

není slepá stránka

Admin → Provize:

již NEHÁZÍ na login

Poslední ověřené SQL (důkaz)

partners.terms_accepted_at funguje

user_legal_acceptances funguje

žádné míchání rolí potvrzeno

DALŠÍ KROK (PRO NOVÝ CHAT)

👉 Influencer V2 – EDGE CASE & UX

Blokace influencera BEZ terms_accepted_at

nemá vidět provize

jasná hláška

Admin přehled:

sloupec „Podmínky přijaty“

UX polish:

stav „čeká na souhlas“

jemné upozornění v dashboarduluencer Affiliate – V1 (funkční základ, MVP)
## 🔄 Projekt OneMil – aktuální stav (2026-02-10)

### Modul: Influencer systém

**Stav:** PRODUKČNĚ HOTOVO ✅

### Co je dokončeno a ověřeno

* ✅ **Tracking `?ref=`** – referral vzniká pouze při registraci přes odkaz influencera.
* ✅ **Antifraud (registrace)** – žádné limity na počet registrací, zůstává:

  * blokace self-ref
  * blokace test / fake emailů
* ✅ **Antifraud (první dobití)** – provize vzniká **až po první platbě ≥ 50 Kč**:

  * platby < 50 Kč = žádná provize
  * registrace bez platby = žádná provize
* ✅ **Provize** – výpočet běží pouze z `v_influencer_referrals_paid`.
* ✅ **Admin UI**:

  * seznam influencerů
  * referral count
  * součet provizí
  * detail influencera (souhrn výkonu)
  * správa stavů provizí (calculated → approved → paid)
* ✅ **Influencer UI**:

  * jasné stavy pending / rejected / approved
  * žádný dead-end

### Klíčové technické body

* `v_influencer_referrals_valid` – validní referral bez limitů
* `v_first_topup_valid` – první platba ≥ 50 Kč
* `v_influencer_referrals_paid` – referral až po první platbě
* Provize **není** navázaná na registraci

---

### 🔜 Další krok (NAVÁZAT V NOVÉM CHATU)

**Kompletní manuální TEST Admin ↔ Influencer**:

1. Přihlásit se jako **Admin**

   * ověřit, že vidí:

     * všechny influencery
     * správné počty referralů
     * správné součty provizí
     * správné stavy provizí
2. Otevřít **detail influencera**

   * zkontrolovat souhrn (referrals / provize / paid vs pending)
3. Přihlásit se jako **Influencer**

   * ověřit dashboard
   * ověřit, že vidí pouze svá data
4. Ověřit konzistenci:

   * co vidí admin = co odpovídá DB
   * co vidí influencer = podmnožina admin dat

**Cíl:** potvrdit, že Admin i Influencer vidí **přesně to, co mají** a nic navíc.

# OneMil – Partner Portal Design Unification
Datum zápisu: 18. 02. 2026 CET

## Aktuální stav

### 1. Partner Dashboard
- Funkční logika beze změn
- Statistiky (Vydané kódy, Aktivované kódy, Konverzní poměr, Status) fungují
- Logo partnera – upload OK
- Fakturační údaje – OK
- API klíče – OK
- API aktivita – OK
- Marketingová investice (simulace) – OK

### 2. Partner Messages (/partner/messages)
- Funkční realtime komunikace (Supabase channel)
- Zprávy se správně načítají a odesílají
- Read flag funguje
- Layout wrapper shodný s dashboardem
- Design se pokusil sjednotit, ale změny nejsou konzistentní

### 3. Design stav
- Influencer sekce má čistý, konzistentní dark admin styl
- Partner sekce má smíšený styl (část influencer pattern, část původní)
- Některé úpravy byly pouze whitespace (bez vizuální změny)
- Luxury/gold styl byl aplikován jen částečně nebo nekonzistentně

## Kritický závěr

Logika není rozbitá.
Problém je pouze v nekonzistentním designu a nesjednocené struktuře komponent.

Cíl: 100% sjednotit Partner Portal podle Influencer design pattern.
# OneMil -- STATE.md

## Last Update

18.02.2026 21:56

## Current Status

### ✅ Contest Gallery System

-   `contest_media` table created and fully functional.
-   Supports types: `image`, `video`, `background`.
-   Multiple images and videos per contest supported.
-   Proper sorting via `sort_order`.
-   Admin image upload implemented (Supabase bucket: `contest-images`).
-   YouTube formats supported:
    -   youtube.com/watch?v=
    -   youtu.be/
    -   youtube.com/shorts/

### ✅ ContestDetail Stability

-   Runtime crash resolved.
-   Root cause: `setState()` calls inside JSX render (infinite render
    loop).
-   ContestDetail.tsx reverted to clean, stable version.
-   Gallery, video embed, and background rendering now stable.

### 🔧 Current Architecture

-   Two-phase contest creation (save contest → then add gallery media).
-   Background media optional (cinematic effect for premium contests).
-   Gallery defensive rendering active (no crash on empty media).

------------------------------------------------------------------------

## ⚠️ Important Rule Going Forward

Never call `setState()` directly inside JSX render. All state updates
must be inside: - event handlers - useEffect - async functions

------------------------------------------------------------------------

## 🎯 Next Chat -- What To Continue

1.  Polish gallery visual experience (premium look refinement):
    -   Smooth fade/zoom transitions
    -   Lazy loading for videos
    -   Optional autoplay (muted) toggle
2.  Optimize performance:
    -   Prevent unnecessary re-renders
    -   Add memoization where needed
3.  Clean Admin UX:
    -   Improve gallery reordering
    -   Add drag & drop support
    -   Better background preview in admin
4.  Remove temporary global error listeners if stable.

Priority suggestion: 👉 Refine gallery UX (animation + performance) now
that system is stable.
# OneMil – Aktuální stav
Aktualizováno: 19. 2. 2026 – 09:45 CET

## Modul: ContestDetail (detail soutěže)

### ✅ Vizuální úpravy dokončeny

- Optimalizace background – odstraněno YouTube/video.
- Background nyní pouze fotografie (stabilní řešení).
- Zachovány marketingové animace (UX priorita před Lighthouse skóre).
- Rolování soutěží a voucherů ponecháno (GPU animace).

### ✅ Úprava boxů (Wallet + Bonus)

#### Levý box – Stav peněženky
- Logo MioCoin přesunuto vlevo.
- Velikost loga: ~70–80 % výšky boxu.
- Číslo kreditu výrazně zvětšeno (dominantní prvek).
- Vertikální centrování textu pomocí flex.

#### Pravý box – Bonus MioCoinů
- Logo ponecháno vpravo.
- Velikost identická jako vlevo (symetrie).
- Text vertikálně vycentrován.
- Box rozměrově nezměněn.

### 🎯 Výsledek
- Symetrická kompozice
- Luxusní vizuální vyváženost
- Zachován layout grid
- UX priorita potvrzena

---

## Lighthouse
- Nízké skóre způsobeno animacemi (nikoliv JS loopem).
- Rozhodnuto: neřešit Lighthouse agresivně.
- Priorita: marketingový efekt + UX.

---

## Stav
ContestDetail vizuálně stabilní.
Připraveno k dalšímu rozvoji.
# OneMil – Current System State

## Core Platform
- Realtime global winners feed (main / bonus / miocoin)
- Per-type cooldown (main/bonus 120s, miocoin 60s)
- Toast duration 10s
- Own wins suppressed
- Contest name correctly displayed in format:
  "V soutěži {contest_name} padla {win_type}"

## Ticket System
- 1 click = 1 request (requestInFlightRef protection)
- No parallel requests
- Server authoritative
- Modal only for wins
- Non-win = lightweight toast
- Faster modal animation (≈280ms)

## Audio System
- Global background music
- File: /public/sounds/onemil.mp3
- Loop enabled
- Volume ≈ 0.25
- No autoplay (browser compliant)
- Starts on first user interaction if enabled
- LocalStorage key: onemil_music_enabled
- Pauses on visibilitychange / pagehide

## Database
- winners table in supabase_realtime publication
- RLS enabled
- Authenticated SELECT allowed
- Winners types: main | bonus | miocoin
- contests.name used in realtime toast

## UX Tone
- Premium cinematic positioning
- Dark gold luxury feel
- Calm professional messaging (no aggressive exclamation)

---

System is stable and functional.
Ready for security hardening and production validation.

---

## 🕓 UPDATE: 30. 3. 2026

### Stav
- AI chat (Bob) funguje správně a používá USER DATA
- Support flow (support-handoff) je funkční
- CTA systém je stabilní (žádné náhodné support handoffy)

### Problém
- Follow-up zprávy typu:
  - "ale ona mi nedorazila"
  - "pořád nic"

→ nejsou rozpoznány jako support intent  
→ zmizí CTA „Kontaktovat podporu“  
→ vrací se fallback CTA (/games)

### Příčina
- isSupportIntentForCta je příliš přísný
- nerozpozná follow-up bez slova „podpora“

### Další krok
- rozšířit support intent:
  - detekce follow-up frází
  - kombinace s předchozím kontextem (výhra)