

# Oprava problikávání TicketResultModal

## Problem
Modal po otevření problikne 2-3x, protože se vícekrát spouští useEffect na generování share obrázku. Kazde spusteni resetuje stav obrazku na null, coz zpusobi prazdny stav a bliknuti.

## Pricina
Druhy `useEffect` (generovani a upload obrazku) ma zavislosti `[isOpen, result, isLoading, bonusPrize, contestId]`. Po otevreni modalu se postupne meni `isLoading` (true -> false) a `bonusPrize` (null -> data), coz spusti effect 2-3x. Kazde spusteni na radcich 233-238 resetuje `previewImageUrl`, `previewBlob` a `publicShareUrl` na null, takze uzivatel vidi prazdny stav (bliknuti).

Navic objekt `result` je vytvaren inline v `ContestDetail.tsx`, takze jeho reference se meni pri kazdem renderovani.

## Reseni

### 1. Stabilizovat `result` referenci v ContestDetail.tsx
- Zabalit objekt predavany do `result` prop do `useMemo` v `ContestDetail.tsx`, aby se nemenil pri kazdem renderovani.

### 2. Pridani ref-based guard v druhem useEffectu
- Pouzit `useRef` pro sledovani, jestli uz pro dany ticket_number byl obrazek vygenerovan.
- Pokud uz byl vygenerovan, preskocit dalsi spusteni.
- Resetovat ref az pri zavreni modalu nebo zmene tiketu.

### 3. Odstranit synchronni resetovani stavu
- Na radcich 233-238 se stav resetuje pred async volanim. Misto toho se stary obrazek revokuje az po uspesnem vytvoreni noveho, bez mezistavu "null".

## Technicke detaily

**Soubor: `src/pages/ContestDetail.tsx`**
- Zabalit inline objekt `result` v `TicketResultModal` prop do `useMemo` se zavislostmi na primitivnich hodnotach (`modalResult?.ticket_number`, `modalResult?.won_type`, atd.).

**Soubor: `src/components/TicketResultModal.tsx`**
- Pridat `const generatedForTicketRef = useRef<number | null>(null);`
- V druhem useEffectu: pokud `generatedForTicketRef.current === result.ticket_number`, preskocit generovani.
- Po uspesnem vygenerovani nastavit `generatedForTicketRef.current = result.ticket_number`.
- Resetovat ref na `null` kdyz `isOpen` se zmeni na false.
- Odstranit radky 233-238 (synchronni reset na null pred generovanim).

## Omezeni
- Zadne zmeny v logice nákupu tiketu
- Zadne zmeny v typech/rozhranich
- Zadne nove soubory
- Jen tyto dva soubory budou upraveny

