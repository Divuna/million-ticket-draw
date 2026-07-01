## Problém

Hero banner na hlavní stránce (`src/pages/Homepage.tsx`, řádky 425–432) používá **fixní výšky** a `object-cover`:

```tsx
<div className="w-full h-[240px] sm:h-[360px] md:h-[480px] ... overflow-hidden ...">
  <img className="w-full h-full object-cover object-center" ... />
</div>
```

Jak to funguje:
- Kontejner má **pevnou výšku** (240 / 360 / 480 px) a **plnou šířku okna**.
- `object-cover` obrázek zvětší tak, aby úplně vyplnil kontejner — a přebytek **ořízne** ze stran nebo shora/zdola.
- Tvůj banner má poměr ~16:5 (např. 1920×600). Na širokém okně vyjde poměr kontejneru ~1920×480 (=4:1), což je vyšší než banner → obrázek se roztáhne do šířky a **ořízne se ze stran** (levý a pravý kraj). Přesně to vidíš na druhé fotce (chybí levý okraj s logem OneMil a pravá strana).
- V Lovable preview (užší okno ~880 px) vychází poměr kontejneru náhodou blízko poměru banneru, takže se skoro nic neořízne.

Projektová paměť (CLAUDE.md, 25. 05. 2026) navíc říká, že **finální stav banneru byl `w-full sm:aspect-[16/5] sm:max-h-[600px]` + `h-auto object-contain` na mobilu / `sm:object-cover` na tabletu+**. Ten stav byl někdy přepsán na fixní výšky + tvrdé `object-cover` → z toho pochází regres.

## Návrh opravy (frontend-only, jen prezentace)

Vrátit hero banner na variantu, která **respektuje poměr stran obrázku** místo fixní výšky.

### Změna v `src/pages/Homepage.tsx` (řádky 426–432)

**Před:**
```tsx
<div className="w-full h-[240px] sm:h-[360px] md:h-[480px] relative overflow-hidden bg-[hsl(220_30%_6%)]">
  <img
    src={...}
    alt={...}
    className="w-full h-full object-cover object-center"
  />
```

**Po:**
```tsx
<div className="w-full sm:aspect-[16/5] sm:max-h-[600px] relative overflow-hidden bg-[hsl(220_30%_6%)]">
  <img
    src={...}
    alt={...}
    className="w-full h-auto sm:h-full sm:w-full object-contain sm:object-cover object-center"
  />
```

Chování:
- **Mobil (`<640px`):** kontejner nemá fixní výšku, obrázek se škáluje `h-auto` + `object-contain` → celý banner je vidět, žádný ořez, žádné černé pruhy pod ním (výška je odvozená od obsahu).
- **Tablet+ (`≥640px`):** kontejner má `aspect-[16/5]` (přesně poměr banneru 1920×600) s `max-h-[600px]`, obrázek `object-cover` v tomto poměru **nic neořízne**, protože poměr kontejneru = poměr obrázku. Nad 3000 px šířky (max-h cap) se drží 600 px vysoký; pak by mohl začít mírně ořezávat okraje, ale to je bezpečná horní hranice.

Doporučuji **do budoucna** dodávat/generovat všechny hero bannery v poměru 16:5 (např. 1920×600) — pak nikdy nic neořízne. Pokud v adminu někdo nahraje jiný poměr, `object-contain` na mobilu / cover v 16:5 rámu na desktopu udrží banner rozumně čitelný.

### Rozsah změny
- **Jediný upravený soubor:** `src/pages/Homepage.tsx` (jen 2 řádky wrapperu + img).
- **Nemění se:** admin banner upload, DB (`coming_soon_banners`, `homepage_banners`, `megajackpot_banners`), Supabase, hook `useMegajackpotBanners`, ostatní placement bannery, zlaté separátory, dot navigace, šipky, texty.
- **Bez SQL, bez deploye Edge Function, bez migrace, bez ovlivnění produkčních dat.** Změna se v Lovable preview projeví hned, na `onemil.cz` po Lovable Publish.

### Ověření
- Vizuální kontrola v preview: mobil (375 px), tablet (768 px), desktop (1440 px), ultra-wide (1920+).
- Zkontrolovat, že se banner na live `onemil.cz` už neořezává (Publish provede Pavel).