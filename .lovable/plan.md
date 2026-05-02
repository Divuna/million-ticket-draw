## Problém

V detailu soutěže `tets 11WDEF` (`07555cb3-7190-45fc-9751-2a61be06012e`):
- text ukazuje **998 MioCoinů** místo skutečných **96 980**
- důvod: PostgREST má serverový strop ~1000 řádků, takže `.limit(200000)` se ignoruje a součet se počítá jen z části dat

Důležité: **bonusové MioCoiny** a **fyzické bonusové ceny** jsou dvě úplně oddělené věci. Nesmí se míchat. Fyzických cen může být v budoucnu i 10 000–50 000 a musí se vždy načíst všechny, **bez stropu**.

## Řešení (1 soubor: `src/pages/ContestDetail.tsx`)

Rozdělit načítání bonusů na dvě nezávislé větve, žádné `.limit(...)` nikde:

### 1) Bonusové MioCoiny → součet přes RPC
Existující funkce `get_contest_miocoin_bonus(p_contest_id uuid) RETURNS integer` vrátí jedno číslo, žádný řádkový limit ji neomezí.
Ověřeno na DB: pro dotčenou soutěž vrací `96980` ✓.

```ts
const { data: poolSum } = await supabase
  .rpc("get_contest_miocoin_bonus", { p_contest_id: id });
setMiocoinBonusPoolTotal(Number(poolSum ?? 0));
```

### 2) Fyzické bonusové ceny → stránkované načtení VŠECH řádků
Filtr `amount IS NULL OR amount = 0`, načítáme přes `.range()` v cyklu, dokud chodí data. Žádný horní strop — funguje pro 5, 5 000 i 50 000 cen.

```ts
const PAGE = 1000;
let from = 0;
const physical: BonusPrize[] = [];
while (true) {
  const { data, error } = await supabase
    .from("bonus_prizes")
    .select("id, contest_id, description, detailed_description, amount, image_url, ticket_position")
    .eq("contest_id", id)
    .or("amount.is.null,amount.eq.0")
    .order("ticket_position", { ascending: true })
    .range(from, from + PAGE - 1);
  if (error) { console.error('[ContestDetail] physical bonus fetch:', error); break; }
  if (!data || data.length === 0) break;
  physical.push(...(data as BonusPrize[]));
  if (data.length < PAGE) break;
  from += PAGE;
}
setBonusPrizes(physical);
```

Tím nahradíme současný blok řádků ~485–511 v `ContestDetail.tsx`.

## Co se NEMĚNÍ

- Žádná SQL migrace, žádné nové RPC, žádné RLS změny (RPC `get_contest_miocoin_bonus` už existuje).
- Admin UI (`AdminContestManagement.tsx`) zůstává beze změny — funguje správně.
- `buy_ticket_atomic` ani jiná core logika se nedotýká.
- Žádné jiné stránky.

## Ověření po nasazení

- `/contest/07555cb3-7190-45fc-9751-2a61be06012e`: text musí ukazovat **96 980 MioCoinů** a v gridu zůstávají **2 fyzické ceny**.
- Soutěže s běžným počtem bonusů fungují beze změny.
- Konstrukce je připravená i pro soutěže s 10 000 / 50 000 fyzickými cenami — načte všechny.
