# OneMil — Brand & Graphics Implementation Reference

**STATUS: PODŘÍZENÁ IMPLEMENTAČNÍ REFERENCE — NENÍ SOURCE OF TRUTH.**

Jediný závazný zdroj pravdy pro novou veřejnou grafiku OneMil je:
`docs/advertising/GRAPHICS_SOURCE_OF_TRUTH.md`

Pokud je mezi tímto souborem, ZIP brand kitem, starým PDF/manualem, design tokeny nebo AI promptem jakýkoli rozpor, **vždy platí `GRAPHICS_SOURCE_OF_TRUTH.md`**.

**Aktuální veřejný směr:** light premium OneMil — white/warm cream základ, tmavý text, Energy Orange akcent. Starý dark premium tech-luxury směr je zrušen a nesmí být použit jako výchozí styl pro nové veřejné grafiky.

**Tagline:** Luxusní soutěže. Prémiové výhry.

---

## Aesthetic

- Light, clean, premium and modern.
- White / warm cream is the default public canvas.
- Dark navy/black is primarily text, shadow, small detail or a natural part of product photography — not the full-page brand background.
- Energy Orange is the main brand accent.
- Warm Amber is a secondary highlight.
- No casino, gambling, lottery or dark gaming aesthetic.

---

## Typography

| Role | Font | Weight |
|------|------|--------|
| H1 | **Poppins** | 700 (Bold) |
| H2 | **Poppins** | 600 (SemiBold) |
| H3 | **Poppins** | 500–600 (Medium/SemiBold) |
| Body | **Inter** | 400 (Regular) |
| Buttons | **Inter** 500 or **Poppins** 600 | — |

Fonts loaded via Google Fonts only. Do not store/share font files.

---

## Public Color Palette

| Name | Hex | Usage |
|------|-----|-------|
| White | `#FFFFFF` | primary public background |
| Warm Cream | `#FAFAF9` | secondary sections |
| Cloud | `#F7F8FB` | light gradients / surfaces |
| Ink | `#111827` | primary text |
| Slate | `#4B5563` | secondary text |
| Light Border | `#E5E7EB` | borders / dividers |
| Energy Orange | `#FF8A00` | primary accent / CTA |
| Approved UI Orange | `#F97316` | approved web/B2B orange variant |
| Warm Amber | `#FFB547` | gradient/highlight |
| Soft Gold | `#D8BA78` | rare premium detail only |

Legacy dark colors `#0A0B0F`, `#101722`, `#1D2128` are **not public background defaults anymore**. They may remain in legacy/scoped application components and existing assets, but must not drive new marketing graphics.

---

## Logo System

Use only original approved OneMil assets from the project. Never invent, redraw or stylize a new OneMil/MioCoin logo.

### Primary logo
- Trophy / number "1" motif behind the OneMil wordmark.
- Use the original project file.
- On a light public background, use only a version with sufficient contrast; do not recolor it by invention.

### Secondary logo
- Trophy / number "1" above the OneMil wordmark.
- Use the original project file for social banners/posters when suitable.

### Standalone icon
- Trophy / number "1" symbol only.
- Use original favicon/app/avatar asset.

If an original logo cannot be placed accurately, create the proposal without a logo and add the original asset later.

---

## Export / Asset Specs

| Format | Size | Usage |
|--------|------|-------|
| PNG transparent | 512 × 512 px | in-app, partner offers |
| PNG transparent | 1024 × 1024 px | hi-res |
| Hero banner PNG | 1920 × 480 px (4:1) | web hero section |
| Partner offer / OG banner PNG | 1600 × 900 px | partner offer cards, Open Graph |
| Social post | 1080 × 1080 px | Facebook / Instagram |
| Story / Reels | 1080 × 1920 px | vertical social |

---

## Public UI / Marketing Component Style

- Primary CTA: Energy Orange / orange→amber, clear and high contrast.
- Secondary CTA: light/white surface with subtle border and dark text.
- Cards: white or warm-cream, subtle gray/orange border, soft shadow.
- Navigation / active states: Energy Orange.
- Icons: clean outline style (Lucide where applicable), dark neutral with orange accent.
- Avoid full black/navy card systems in new public marketing layouts.

---

## Imagery

- Realistic premium products and lifestyle photography.
- Bright/neutral premium environment or naturally lit photography preferred.
- Dark parts of a product/photo are fine; do not force a black/navy brand backdrop.
- Suitable subjects: cars, motorbikes, watches, jewellery, electronics, travel, homes and premium lifestyle.
- No casino imagery, chips, roulette, cards, slots, money piles or Las Vegas styling.

---

## Voice & Wording

Follow `docs/advertising/GRAPHICS_SOURCE_OF_TRUTH.md` and the current legal/copy documents for allowed/forbidden terms. This implementation reference must never override them.

---

## Hierarchy

1. `docs/advertising/GRAPHICS_SOURCE_OF_TRUTH.md` — **only visual source of truth**.
2. `docs/advertising/VISUAL_RULES.md`, `AD_FORMATS.md`, `PROMPTS_FOR_ADS.md`, `SOCIAL_ADS_OPERATIONS.md` — channel-specific rules derived from it.
3. This brand-kit file, old brand manual, design tokens and AI prompt files — implementation/reference only.
4. Old PDF/reference images may document historical assets but do not define current colors or visual direction.
