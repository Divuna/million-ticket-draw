# OneMil – aktuální stav projektu

> **Autoritativní aktuální stav. Aktualizováno 9. 8. 2026.**
> Historický vývoj je v `onemil_history.md` a v Git historii. Pokud starší dokumentace odporuje tomuto souboru, pro současný provoz platí tento soubor a skutečný stav ověřený v GitHubu/Supabase.

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
