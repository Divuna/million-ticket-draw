Co jsem ověřil v DB pro `15a67cda-…63ce4`

- `main_image` = `aa0fc9be….png` (uložen jako relativní path do `contest-images`)
- `banner_image` = **NULL**
- `main_prize_secondary_image` = **NULL**
- `generated_poster_url` = NULL
- `contest_media`: 1 řádek typu `image` (gallery), žádný `background`, žádný `banner`
- `description` je dlouhý text → tlačí HERO sekci do výšky

Takže DB skutečně neobsahuje detail (`main_prize_secondary_image`) ani banner ani background. To je první příčina toho, že „obrázky neukazují jak mají" — z formuláře pro vytvoření soutěže se neuložily. Druhá vrstva je čistě CSS bug v `ContestDetail.tsx`.

## Co je rozbité a proč

1. **Pozadí (`bgImageUrl`) se neukazuje**
  - `ContestDetail.tsx` (řádky 659–668): hledá v `contest_media` položku typu `background`, jinak fallback na `main_prize_secondary_image`. Obě jsou prázdné, takže pozadí je `null` → žádný fixed background a navíc tmavý gradient overlay je natažený přes prázdné pozadí. **Záměrně nefalbackuje na `main_image**` — takže když admin nahraje jen hlavní obrázek (běžný případ), pozadí zůstane černé.
2. **Dlouhý popis posouvá hero obrázek**
  - HERO sekce (řádek 728): `flex flex-col md:flex-row md:items-center` bez `min-w-0` na text divu a bez pevné šířky. Když je description velmi dlouhý, text divu naroste a obrázek se buď scvrkne (`object-contain` ho zmenší) nebo se hero rozjede mimo card (na úzké šířce 1058px je `md:` breakpoint aktivní → texty mají `max-w-lg` ale to neplatí pro nadpis a prize, které tlačí layout).
  - Description nemá žádný strop výšky (`whitespace-pre-line` + bez `line-clamp` ani max-h) → karta naroste vertikálně neúměrně obsahu.
3. **„Obrázky se neukazují jak mají z toho zadání"**
  - `AdminContestManagement.handleSubmit` (řádky 1284–1294) ukládá `main_prize_secondary_image` a `banner_image` **jen pokud uživatel zvolil `detail_image_file` resp. `banner_image_file**`. Při vytvoření soutěže, kde admin nahrál jen hlavní obrázek (nebo zaškrtl něco jiného), tyto sloupce zůstanou NULL.
  - Galerie / background média se ukládají do `contest_media` přes auto-flush (přidaný v minulém kroku), ale uživatel evidentně nenahrál žádný `background` typ → fallback na `main_image` v ContestDetail neexistuje, viz bod 1.

## Návrh opravy

### A) `src/pages/ContestDetail.tsx` — robustní fallback hierarchie obrázků

Sjednotit pořadí preferencí pro pozadí i hero, ať je vždy něco vidět:

- **Background** (fixed pozadí): `contest_media[background]` → `banner_image` → `main_prize_secondary_image` → `main_image` → null
- **Hero img** (v kartě vpravo): `main_prize_secondary_image` → `main_image` → `banner_image` → `/fallback-car.png`

Tím se pro tento contest okamžitě zobrazí `main_image` jak na pozadí (rozmazané přes overlay), tak v hero kartě.

Vytvořit malý helper `resolveContestImage(pathOrUrl)` který přilepí storage prefix jen když není `http`, ať se ten řetězec ternárů třikrát neopakuje (řádky 638–668).

### B) `src/pages/ContestDetail.tsx` — HERO layout odolný proti dlouhému popisu

V sekci HERO (řádky 727–761):

- Text container: přidat `min-w-0` (jinak flex item nedovolí shrink), `md:max-w-[55%]`.
- Image container: změnit `flex-shrink-0` + `max-w-[280px]…[380px]` na `**md:w-[320px] md:flex-none**`, aby měl obrázek zaručené místo nezávisle na délce textu.
- Description `<p>`: přidat `line-clamp-6 md:line-clamp-8` + `overflow-hidden` a pod ní volitelný „Zobrazit více" toggle (jednoduchý `useState`). Tím karta nenaroste neúměrně.
- Hero `<img>` zachovat `object-contain`, ale dát mu `max-h-[260px] md:max-h-[300px]` aby nepřekročil výšku karty když je text krátký.

### C) `src/components/AdminContestManagement.tsx` — fallback při ukládání

Aby admin už při vytváření nemusel řešit tři uploady, doplnit logiku v `handleSubmit` (kolem řádků 1284–1294):

- Pokud admin nezvolil `detail_image_file` ale zvolil `main_image_file`, **automaticky** zkopírovat `additionalUpdates.main_prize_secondary_image = main_image_path` (stejná hodnota). Detail tím dostane stejný obrázek jako hlavní a customer detail se neukáže prázdný.
- Pokud admin nezvolil `banner_image_file` ani `background` v galerii, žádnou DB změnu nedělat — fallback řeší frontend (bod A).
- Není potřeba migrace, není potřeba měnit `admin_manage_contest` RPC.

### D) Reload existující soutěže (volitelně)

Pro `15a67cda-…` admin pak může jednoduše otevřít edit a kliknout Uložit (nebo nahrát detail manuálně). Pokud preferuješ rychlý fix bez admin akce, můžu do migrace dát `UPDATE contests SET main_prize_secondary_image = main_image WHERE main_prize_secondary_image IS NULL AND main_image IS NOT NULL` — ale to je nevratná data změna, takže to udělám jen pokud řekneš ano.

## Co se NEmění

- `buy_ticket_atomic`, ekonomika, RLS, `contest_media` schéma — beze změny.
- Žádná DB migrace (pokud neschválíš bod D).
- Žádná změna ostatních stránek (Games, ContestCard, AdminBonusOverview).

## Riziko

Malé. Změny jsou layout + fallback chain. Žádný dopad na nákup tiketů ani peněžní toky.

## Otázka pro tebe

Mám zahrnout i bod **D** (jednorázový SQL update existujících soutěží, kde chybí `main_prize_secondary_image` a je vyplněný `main_image`)? Bez něj se konkrétní soutěž `15a67cda` opraví až po (A)+(B)+(C) díky frontend fallbacku — což by mělo stačit.