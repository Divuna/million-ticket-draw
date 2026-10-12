# Po prvním resetu — co udělat jako první

Reset produkce proběhl **12. 10. 2026** (detail `onemil_state.md` § -18). Systém běží, ale je prázdný:
v produkci je jen účet `divispavel2@gmail.com`, žádné soutěže, partneři, vouchery ani bannery.
Obchodní CRM, nastavení a právní texty zůstaly.

Pořadí níže je doporučené. Odškrtávej `[x]`.

## A. Hned (provoz a kontrola)

- [ ] **Produkční smoke test.** GitHub secret `E2E_TEST_EMAIL` patřil účtu, který reset smazal →
      `playwright.yml` (3× denně) bude hlásit chybu přihlášení. Účet znovu zaregistrovat na
      `onemil.cz/register` se stejným e-mailem a heslem jako v secretech (nebo secrety změnit).
- [ ] **Kontrola webu:** přihlášení superadmina, `/admin` se načte, titulní stránka bez chyb.
- [ ] **Pozvat adminy** přes `/admin/admins` (`jan.bulir@onemil.cz`, případně `pepca@onemil.cz`)
      a dát jim oprávnění (např. `sales_leads.manage` pro obchod).
      Magin a obchodní dávky fungují i bez toho — vlastníkem je teď superadmin.

## B. Před první ostrou soutěží (bez toho soutěž nepůjde aktivovat)

- [ ] **Neomezený benefit** v administraci `/admin/guaranteed-benefits`:
      evidenční firma + sdílený slevový kód/odkaz, **neomezený**, rozsah **všechny soutěže**.
      Bez něj systém aktivaci soutěže odmítne (guard `guaranteed_benefit_active_contest_guard_enabled`).
      Dřív to byl Apartmán Portus / `PORTUS26` — reset ho smazal.
- [ ] **Založit soutěž** (zůstane `pending`): název, cena tiketu, počet tiketů, hlavní výhra,
      bonusové výhry.
- [ ] **Pravidla soutěže (PDF)** podle `docs/pravni-dokumenty/SABLONA_PRAVIDEL_SOUTEZE.md`,
      archivovat v `docs/pravni-dokumenty/souteze/NAZEV/`, nahrát k soutěži. Bez PDF nejde aktivovat.
- [ ] **Povolit nákup v nové soutěži:** `settings.guaranteed_benefit_purchase_contest_allowlist`
      dnes obsahuje 4 ID smazaných soutěží → nahradit ID nové soutěže
      (`guaranteed_benefit_purchase_enabled` je `true`).
- [ ] **Aktivovat soutěž** a udělat **testovací nákup** (Stripe je stále v testovacím režimu):
      dobití MIO → nákup tiketu → benefit → tiket v profilu.
- [ ] **Bannery** na titulní stránce (`/admin/banners`, „Připravujeme“) — reset je smazal.

## C. Partneři a e-shopy

- [ ] Partneři se musí **znovu zaregistrovat** (`/partner/register`) a nechat schválit.
- [ ] **Shoptet napojení od nuly** (export URL → ověření → schválení; baseline starých objednávek
      se vytvoří při schválení).
- [ ] **Nový widget snippet** v e-shopech (BOHEMIA INFINITY, vereonika): nový partner má **nové ID**,
      starý `data-onemil-partner` už nic nezobrazí. Partner zkopíruje kód z `/partner/dashboard`.
- [ ] Nastavit cenu za MIO a konverzi u každého partnera.
- [ ] Partnerské nabídky / vouchery podle potřeby.

## D. Před ostrým spuštěním pro zákazníky (samostatná rozhodnutí Pavla)

- [ ] **Stripe live** — live klíče, live webhook (samostatné schválení).
- [ ] **Právní texty** — finální review VOP / GDPR / cookies (GDPR sjednocený dokument čeká na schválení).
- [ ] **Bob** je vypnutý (`settings.bob_enabled = false`) — rozhodnout, zda zapnout.
- [ ] Kontrola peněženek: `select * from public.wallet_lot_consistency_issues();` musí vracet 0 řádků.

## Platí trvale

- Data vzniklá po resetu se **nesmí hromadně mazat** bez nového výslovného schválení Pavla.
- Záloha stavu před resetem: `backups/onemil-production-pre-first-reset-20261012-150802.dump`
  (SHA-256 `91D66912…6615D`) — návrat jen obnovou celé databáze.
