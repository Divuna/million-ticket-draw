# OneMil Brand Kit

Praktický balík assetů a implementačních podkladů pro OneMil.

## Nejdůležitější pravidlo

**Tento brand kit není zdroj pravdy pro aktuální veřejný vizuální směr.**

Jediný závazný zdroj pravdy je:
`docs/advertising/GRAPHICS_SOURCE_OF_TRUTH.md`

Pokud starý PDF, reference image, token, prompt nebo jiný soubor v tomto balíku odporuje `GRAPHICS_SOURCE_OF_TRUTH.md`, je zastaralý a nesmí se podle něj tvořit nová grafika.

Aktuální veřejný styl OneMil je **světlý**: white/warm cream základ, tmavý text a oranžový akcent. Starý dark premium směr je zrušen.

## Obsah
- `01_brand_manual/` — textový/PDF brand manual; textová verze je aktualizovaná, starý PDF může obsahovat historické vizuální informace a není autoritativní.
- `02_logos/source/` — zdrojové varianty originálního loga.
- `02_logos/png/` — PNG exporty originálního loga a transparentní verze.
- `03_icons/favicon_app/` — favicony a app ikony.
- `04_design_tokens/` — implementační tokeny; pro veřejný vizuál musí odpovídat aktuálnímu source of truth.
- `05_prompts_for_ai_tools/` — pomocné AI prompty; jsou podřízené `GRAPHICS_SOURCE_OF_TRUTH.md`.
- `06_reference_images/` — historické/grafické reference; samy neurčují aktuální barvy ani styl.
- `07_web_snippets/` — manifest pro web/app ikony.

## Loga a ikony

Při tvorbě grafiky používat pouze originální OneMil/MioCoin soubory z projektu. Nikdy nevymýšlet, nepřekreslovat ani nenahrazovat logo novým AI logem.

Transparentní PNG byly vytvořené z rastrových podkladů. Pro finální produkční SVG je vhodné použít schválený přesný vektor. Fonty se neposílají jako soubory; používej Google Fonts import pro Poppins a Inter.
