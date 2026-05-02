## Co se reálně děje

V `src/components/AdminContestManagement.tsx` jsem našel toto:

1. Pole `totalMioCoinsInput` (default 1000) a `stepValue` (default 10) se **automaticky** používají k výpočtu `computedPositionCount = floor(totalMioCoinsInput / stepValue)` — tj. hned po otevření modalu se v UI zobrazí věta „Počet pozic: 100" i když uživatel nic nezadal.
2. V tabu „Bonusy – MioCoins" je horní badge `Celkem: {totalMioCoins} MC ({mioCoinBonuses.length} pozic)` — `totalMioCoins` se počítá ze stavu `mioCoinBonuses`. Sám se „nevytváří", ale generování spustí jen kliknutí na **Vygenerovat MioCoiny**.
3. Při otevření nové soutěže běží **draft restore z localStorage** (`DRAFT_KEY = "draft_new_contest"`). Ten ale ukládá **jen `form`**, ne `mioCoinBonuses` ani `totalMioCoinsInput`/`stepValue`. Takže po reopen modalu se vstupy resetují na 1000/10 → vidíš v UI „Počet pozic: 100" aniž bys cokoli zadal.
4. Uživatelské vnímání „číslo se samo mění a vrací" odpovídá tomu, že:
   - při psaní do polí se přepočítává `computedPositionCount` živě (každý keystroke),
   - mezi taby (Detail/Bonusy/Galerie) se hodnoty drží ve state, ale po **zavření modalu** se MioCoin pole resetuje na default 1000/10, zatímco `form` se obnoví z draftu → opětovně otevřeno vypadá jako „samo se to vyplnilo".
5. „Smazat vše" volá `clearMioCoinBonuses()` které vyčistí `mioCoinBonuses` → po tom už generování funguje normálně, protože uživatel sám stiskne tlačítko Vygenerovat.

Žádný cyklický refetch ani realtime kanál v tomto modalu na `bonus_prizes` neexistuje (realtime na bonusy je jen v `AdminBonusOverview` mimo modal a v `TicketMapAdmin`).

## Závěr

Není to bug s automatickou tvorbou bonusů na DB. Je to UI bug:

- defaultní hodnoty 1000 / 10 se zobrazují jako by uživatel něco zadal,
- draft persistence při nové soutěži ukládá jen `form` a ignoruje stav MioCoin/Physical/Gallery → po reopen modalu vznikne nekonzistentní stav (form má data, MioCoin je default, badge ukazuje „100 pozic"),
- žádná indikace, jestli jsou MioCoiny opravdu uložené v DB nebo jen čekají v paměti.

## Navrhovaná oprava

Soubor: `src/components/AdminContestManagement.tsx`

1. **Default vstupů na 0** — `useState<number>(1000)` → `useState<number>(0)` pro `totalMioCoinsInput` a `useState<number>(10)` → `useState<number>(0)` pro `stepValue`. Dokud uživatel nic nezadá, sekce nebude předstírat „100 pozic".
2. **Sjednotit reset při otevření**: v `useEffect` reagujícím na `[editingContest, open]` (řádky 191–239) přidat při větvi `else` (nová soutěž) reset i pro `setTotalMioCoinsInput(0)`, `setStepValue(0)`, `setDistributionType("even")`. Při větvi `editingContest` při `loadExistingBonuses` taky resetovat vstupy na 0, ať se po načtení reálných bonusů z DB nemíchá.
3. **Skrýt řádek „Počet pozic: …"** dokud nejsou obě hodnoty > 0 (už podmínka existuje, ale defaulty 1000/10 ji tříští). Po bodu 1 se to vyřeší samo.
4. **Vizuální rozlišení uloženo vs neuloženo**: badge nahoře přejmenovat na `Celkem: X MC (Y pozic) – {ulozeno|cekajici}` podle toho, jestli je `editingContest` nastaven a `mioCoinBonuses` mají vyplněné `id`. Aby bylo jasné, že čísla nejsou „magická", ale jen v paměti.
5. **Volitelně rozšířit draft persistence** o `mioCoinBonuses`, `totalMioCoinsInput`, `stepValue`, `distributionType`, `physicalPrizes` (bez File objektů) — aby se po zavření a opětovném otevření modalu obnovil i stav bonusů a uživatel neměl pocit, že se to „samo vytvořilo a zase smazalo".

Žádná DB migrace. Žádné změny v `bonus_prizes`, `distribute-bonus-prizes` ani RPC `admin_manage_bonus_prize` — ta logika je v pořádku.

## Riziko

Minimální. Změna je čistě frontend ve formuláři, žádné dotčení `buy_ticket_atomic`, žádné dotčení RLS. Existující soutěže s reálně uloženými bonusy se chovají stejně (načítají se z DB přes `loadExistingBonuses`).
