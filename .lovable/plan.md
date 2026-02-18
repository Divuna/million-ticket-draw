

# Oprava pretrvavajiciho problemu s problikavanim TicketResultModal

## Problem
Modal stale problikava - uzivatel vidi na zlomek sekundy "non-winner" obsah pred spravnym vysledkem.

## Pricina
Jsou dva `useEffect` hooky, ktere oba reagují na zmenu `isOpen` a oba meni `isLoading`, ale v opacnem smeru:

1. **Cleanup effect** (radek 229-241): Nastavi `setIsLoading(true)` kdyz `!isOpen`
2. **Fetch effect** (radek 194-226): Taky se spusti kdyz `!isOpen` a nastavi `setIsLoading(false)` (radek 197)

React spusti oba effecty ve stejnem renderovacim cyklu. Fetch effect svym `setIsLoading(false)` prepise cleanup effect. Kdyz se modal znovu otevre, `isLoading` je `false` a na prvni render se zobrazi non-winner obsah misto loading stavu.

## Reseni

### Soubor: `src/components/TicketResultModal.tsx`

**Zmena 1** - Radek 195-198: Odebrat `setIsLoading(false)` z early return a NERESIT isLoading pri zavreni modalu ve fetch effectu. To nechame ciste na cleanup effectu.

```typescript
// Pred:
if (!isOpen || !result || !contestId) {
  setBonusPrize(null);
  setIsLoading(false);
  return;
}

// Po:
if (!isOpen || !result || !contestId) {
  setBonusPrize(null);
  return;
}
```

Tato zmena zajisti, ze kdyz se modal zavira, `isLoading` zustane na `true` (nastavene cleanup effectem) a nebude prepsan na `false`.

## Souhrn
- Jedina zmena: odebrani `setIsLoading(false)` na radku 197
- Zadne nove soubory
- Zadna zmena logiky, struktury ani stylu
- Pouze `src/components/TicketResultModal.tsx`

