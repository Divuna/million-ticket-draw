## Co je rozbité

Na screenshotu vidím dvě věci v HERO sekci `src/pages/ContestDetail.tsx` (řádky 728–778):

1. **Title `bgggggnbvnbvnbnbvhbh`** je jedno dlouhé slovo bez mezer. I s `break-words` se na velikosti `text-5xl` (lg) a šířce viewportu 1058px nezalomí čistě a vizuálně přetéká přes hero obrázek (Corvette banner).
2. **Badge „Fast game"** je inline vedle nadpisu (řádek 737–739), což znamená že "skáče" pod title a tlačí layout. Má být v rohu sekce.

## Návrh opravy (jen `src/pages/ContestDetail.tsx`, řádky 728–778)

### A) Badge „Fast game" → absolute pozice v levém horním rohu
- Přesunout `<Badge>` ze středu vedle `<h1>` do pozice `absolute top-3 left-3 z-20` přímo na `<section>`.
- Drobnější styling: `text-xs md:text-sm px-3 py-1 shadow-lg`.

### B) Title nesmí přetékat přes obrázek
- Velikost zmenšit z `text-3xl md:text-4xl lg:text-5xl` na `text-2xl md:text-3xl lg:text-4xl` — pořád prominentní, ale zlomí se i s dlouhým slovem.
- Změnit `break-words` na `break-all` (zlomí na libovolné pozici i v rámci slova bez mezer — což je přesně tento případ).
- Odstranit obalový `<div className="flex items-center gap-3 flex-wrap">` kolem title (badge je teď absolute).

### C) Posílit hranice text containeru
- `md:max-w-[55%]` → `md:max-w-[50%]` aby měl obrázek o trochu víc rezervy.
- `Hlavní výhra` text zmenšit z `text-xl md:text-2xl` na `text-lg md:text-xl` (kompaktnější).
- Description `<p>` doplnit `break-words`.

### D) Drobná oprava pod-řádky
Hero `<img>` má duplicitní třídu `max-h-[260px] max-h-[300px]` (chybí `md:` prefix u druhé). Opravit na `max-h-[260px] md:max-h-[300px]`.

## Co se NEmění
- Žádná DB migrace, žádné RLS, žádný RPC, žádná jiná stránka.
- Funkčnost (nákup tiketu, galerie, bonusy) se nedotýká.
- Pozadí (background fallback) zůstává jak je z předchozího kroku.

## Riziko
Nulové. Čistě CSS úprava jedné sekce v jednom souboru.
