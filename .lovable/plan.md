# Oprava MioCoin bonus poolu konzistentně všude (detail soutěže + admin)

## Cíl
Hodnota „MioCoinů přidaných do soutěže jako bonusové výhry" (např. 96 980) musí být reálná a stejná na **všech místech**, kde se zobrazuje:
- detail soutěže (zákaznický pohled) — text „Do této soutěže jsme navíc přidali X MioCoinů..."
- admin Správa soutěží — sloupec „Bonusové MioCoiny"

## Jediný zdroj pravdy
**Suma `bonus_prizes.amount` kde `amount > 0`**, počítaná **na klientu** ze stejného SELECTu na `bonus_prizes`.

Důvod proč tabulka, ne `contests.total_miocoin_bonus`:
- Sloupec `total_miocoin_bonus` v tabulce `contests` udržuje DB trigger `trg_sync_total_miocoin_bonus`, který u některých soutěží zjevně nesedí (proto vidíš 0).
- `bonus_prizes` má RLS `SELECT true` pro `public` i `authenticated` (ověřeno ve schématu) — čtení funguje pro přihlášené i nepřihlášené.

## Co změním (2 soubory, 2 místa)

### 1. `src/pages/ContestDetail.tsx` (cca ř. 484–503)
Nahradím dnešní dvojitý dotaz (`bonus_prizes` + RPC `get_contest_management_data`) jedním dotazem:
```ts
const { data: bonusData } = await supabase
  .from("bonus_prizes")
  .select("id, contest_id, description, detailed_description, amount, image_url, ticket_position")
  .eq("contest_id", id)
  .order("ticket_position", { ascending: true })
  .limit(200000);

const rows = (bonusData ?? []) as BonusPrize[];

// věcné výhry pro grid (zachovat dnešní chování)
setBonusPrizes(rows.filter(b => b.amount == null || Number(b.amount) === 0));

// MC bonus pool pro text „přidali jsme X MioCoinů"
setMiocoinBonusPoolTotal(
  rows.reduce((sum, b) => {
    const a = Number(b.amount ?? 0);
    return a > 0 ? sum + a : sum;
  }, 0)
);
```
- `.limit(200000)` obejde defaultní 1000-řádkový strop.
- Žádný RPC, žádný `count`, žádný PostgREST `sum()`.

### 2. `src/components/AdminContestManagement.tsx` (ř. 2149–2166)
Dnes počítá `count: "exact", head: true` nad `bonus_prizes WHERE amount > 0` → vrací **počet řádků**, ne součet. Nahradím za reálnou sumu po dávkách (kvůli 1000-řádkovému stropu) pro každou soutěž paralelně:
```ts
await Promise.all(
  contestIds.map(async (contestId) => {
    let total = 0;
    let from = 0;
    const STEP = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("bonus_prizes")
        .select("amount")
        .eq("contest_id", contestId)
        .gt("amount", 0)
        .range(from, from + STEP - 1);
      if (error || !data || data.length === 0) break;
      total += data.reduce((s, r) => s + Number(r.amount ?? 0), 0);
      if (data.length < STEP) break;
      from += STEP;
    }
    mioCoinTotals[contestId] = total;
  })
);
```
Hlavička sloupce („Bonusové MioCoiny") zůstává — bude ukazovat skutečné MC, ne počet řádků. Hodnota bude sedět s detailem soutěže.

## Co NEdělám
- Žádná DB migrace, žádný nový RPC, žádné RLS změny.
- Bez sahání na `buy_ticket_atomic`, peněženku, edge functions, contest engine.
- Bez změn layoutu, designu nebo jiných bloků.
- `contests.total_miocoin_bonus` nechávám být — UI ho prostě nebude používat jako zdroj.

## Co se ověří po opravě
- Detail soutěže `tets 11WDEF` ukáže v textu reálnou hodnotu (96 980 nebo aktuální).
- Admin Správa soutěží ukáže ve sloupci „Bonusové MioCoiny" stejnou hodnotu jako detail.
- U menších soutěží (méně než 1000 MC řádků) zůstává chování identické — paginace v adminu jen jednou doběhne a skončí.

## Riziko
Velmi nízké. Změny jsou jen v UI dotazech, oba dotazy čtou z tabulky, která je veřejně čitelná. Větší soutěž s ~100 tisíci řádky znamená v adminu ~100 paralelních HTTP requestů (pro každou soutěž), proto to běží v `Promise.all` po dávkách 1000 — to je v rámci běžného Supabase rate limitu i u 10+ aktivních soutěží.