# OneMil — Brand & Graphics Guidelines

**Direction:** dark premium tech-luxury
**Tagline:** Luxusní soutěže. Skutečné výhry.

Source of truth: `docs/brand/onemil_brand_kit.zip`

---

## Aesthetic

- Dark, premium, tech-luxury — not casino, not gambling, not lottery kitsch
- Forbidden references: casino, hazard, sázení, sázka, jackpot, žetony, zbohatni (visuals AND wording)
- Tone: aspirational, trustworthy, energetic, digitally modern — luxury competition platform, not a quick-rich scheme

---

## Typography

| Role | Font | Weight |
|------|------|--------|
| H1 | **Poppins** | 700 (Bold) |
| H2 | **Poppins** | 600 (SemiBold) |
| H3 | **Poppins** | 500–600 (Medium/SemiBold) |
| Body | **Inter** | 400 (Regular) |
| Buttons | **Inter** 500 or **Poppins** 600 | — |

- Fonts loaded via Google Fonts only — do not store font files in repo
- Google Fonts import: `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@500;600;700;800&display=swap`
- Letter-spacing: `-0.02em` for headings

---

## Color Palette

Named colors from brand kit:

| Name | Hex | CSS token | Usage |
|------|-----|-----------|-------|
| Midnight Black | `#0A0B0F` | `--om-black` | page background |
| Deep Navy | `#101722` | `--om-navy` | cards, panels |
| Graphite | `#1D2128` | `--om-graphite` | modals, dropdowns |
| Platinum | `#E7EBF0` | `--om-platinum` | primary text, logo highlight |
| Silver | `#BFC6CF` | `--om-silver` | secondary text, logo metallic |
| Muted Silver | `#8E98A6` | `--om-muted-silver` | supporting/placeholder text |
| Energy Orange | `#FF8A00` | `--om-orange` | primary CTA, highlights, active states |
| Warm Amber | `#FFB547` | `--om-amber` | CTA gradient endpoint, hover |
| Soft Gold | `#D8BA78` | `--om-soft-gold` | optional premium detail (use sparingly) |

### CSS tokens (canonical)

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@500;600;700;800&display=swap');

:root {
  --om-black:        #0A0B0F;
  --om-navy:         #101722;
  --om-graphite:     #1D2128;
  --om-platinum:     #E7EBF0;
  --om-silver:       #BFC6CF;
  --om-muted-silver: #8E98A6;
  --om-orange:       #FF8A00;
  --om-amber:        #FFB547;
  --om-soft-gold:    #D8BA78;
  --om-font-heading: 'Poppins', system-ui, sans-serif;
  --om-font-body:    'Inter', system-ui, sans-serif;
}
```

---

## Logo System

### Primary logo
- Composition: trophy / number "1" motif **behind** the OneMil wordmark (wordmark in foreground)
- Wordmark font: Poppins 700
- Logo colour: metallic silver / platinum gradient — not flat white, not yellow gold
- Use on dark backgrounds only
- Files: `02_logos/png/primary_logo_trophy_behind_text.png`, `…_transparent_estimated.png`

### Secondary logo
- Composition: trophy / number "1" motif **above** the OneMil wordmark (stacked vertical)
- Used for social banners, posters, large hero graphics
- Same metallic silver / platinum treatment
- Files: `02_logos/png/secondary_logo_trophy_above_text.png`, `…_transparent_estimated.png`

### Standalone icon
- Composition: trophy / number "1" symbol only (no wordmark)
- Used for: favicon, app icon, small avatars, watermarks
- File: `02_logos/png/icon_symbol_trophy_1_transparent_estimated.png`
- Favicon sizes available: 16, 32, 48, 64, 128, 180, 192, 256, 512 px in `03_icons/favicon_app/`

### Logo don'ts
- No casino chip framing
- No roulette wheel or slot-machine reels
- No jackpot text
- No neon / Las Vegas palette (green felt, bright red)
- SVG in kit is a placeholder — for production use, vectorize in Figma/Illustrator

---

## Export / Asset Specs

| Format | Size | Usage |
|--------|------|-------|
| PNG transparent | 512 × 512 px | in-app, partner offers |
| PNG transparent | 1024 × 1024 px | app store / hi-res |
| SVG | — | web scalable (placeholder only — vectorize for production) |
| Hero banner PNG | 1920 × 480 px (4:1) | web hero section |
| Partner offer / OG banner PNG | 1600 × 900 px | partner offer cards, Open Graph |

---

## UI Component Style

- **Primary CTA button:** orange→amber gradient `linear-gradient(135deg, #FF8A00, #FFB547)`, dark text `#111`, Poppins/Inter 700, border `rgba(255,181,71,.65)`, glow `0 0 24px rgba(255,138,0,.20)`
- **Secondary CTA button:** transparent background, `#FF8A00` border at 45% opacity, Platinum text
- **Cards:** Deep Navy `#101722` → Midnight Black `#0A0B0F` gradient, `1px rgba(191,198,207,.16)` border, shadow `0 18px 50px rgba(0,0,0,.35)`
- **Navigation / active states:** Energy Orange `#FF8A00`
- **Icons:** outline style (Lucide), Silver/Platinum colour; Orange only on active/CTA icons

---

## Imagery

- **Photography:** dramatic low-key lighting, dark backgrounds, luxury product feel
- **Suitable subjects:** luxury car, motorbike, watches, jewellery, electronics, Dyson, Apple, PlayStation, premium lifestyle
- **No stock casino imagery** (cards, dice, chips, wheels, roulette, slot machines)
- **Partner offer banners:** 1600 × 900 px, dark background mandatory, partner logo top-left
- **Hero banners:** 1920 × 480 px, dark edges, safe margins, `object-cover`

---

## Voice & Wording

### Forbidden → use instead

| Forbidden (CZ) | Forbidden (EN) | Use instead |
|----------------|----------------|-------------|
| casino | casino | soutěž / contest |
| hazard | gambling | účast / participation |
| sázení / sázka | betting / bet | tiket / ticket |
| jackpot | jackpot | hlavní výhra / grand prize |
| žetony | chips | MioCoiny |
| zbohatni | — | — |
| — | roulette / slot / slot-machine | — |

### Recommended terms
soutěž, výhra, ticket, MioCoin, voucher, luxusní cena, skutečné výhry, rychlá hra, denní šance

### Legal framing
- MioCoin je interní digitální kredit — nelze vybrat zpět na peníze
- Výhry jsou věcné
- OneMil musí komunikovat jako spotřebitelská soutěžní platforma, ne hazardní služba

---

## File Naming Convention

```
onemil_logo_primary_512.png
onemil_logo_secondary_512.png
onemil_logo_primary.svg
onemil_icon_trophy1_512.png
onemil_banner_hero_1920x480.png
onemil_banner_[partner-slug]_1600x900.png
```
