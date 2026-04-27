# OneMil — Brand & Graphics Guidelines

**Direction:** dark premium tech-luxury

---

## Aesthetic

- Dark, premium, tech-luxury — not casino, not gambling, not lottery kitsch
- Forbidden references: casino, gambling, betting, jackpot, roulette, chips, slot-machine (visuals AND wording)
- Tone: aspirational, exclusive, modern — closer to luxury tech brand than game-of-chance

---

## Typography

| Role | Font | Weight |
|------|------|--------|
| Headings / display | **Poppins** | 600–800 |
| Body / UI text | **Inter** | 400–500 |
| Monospace / data | system-mono | 400 |

- Heading size scale: 48 / 36 / 28 / 22 / 18 px (desktop), reduce ~20% on mobile
- Line-height: 1.15 for headings, 1.6 for body
- Letter-spacing: -0.02em for large headings, 0 for body

---

## Color Palette

### Base
| Token | Hex | Usage |
|-------|-----|-------|
| `--color-bg-deep` | `#0A0A0F` | page background |
| `--color-bg-surface` | `#13131A` | cards, panels |
| `--color-bg-elevated` | `#1C1C28` | modals, dropdowns |
| `--color-border` | `#2A2A3A` | dividers, outlines |

### Accent
| Token | Hex | Usage |
|-------|-----|-------|
| `--color-accent` | `#FF6B00` | primary CTA, highlights, active states |
| `--color-accent-hover` | `#FF8533` | hover state |
| `--color-accent-muted` | `#FF6B0022` | subtle accent fill |

### Metallic
| Token | Hex | Usage |
|-------|-----|-------|
| `--color-silver` | `#C0C0C8` | secondary text, logo metallic |
| `--color-platinum` | `#E8E8F0` | logo highlight, premium badges |
| `--color-gold-subtle` | `#B8965A` | optional premium detail (use sparingly) |

### Text
| Token | Hex | Usage |
|-------|-----|-------|
| `--color-text-primary` | `#F0F0F8` | primary content |
| `--color-text-secondary` | `#9898B0` | supporting text |
| `--color-text-muted` | `#5A5A70` | placeholders, disabled |

---

## Logo

### Primary logo
- Composition: trophy / number "1" motif **behind** the OneMil wordmark
- The wordmark sits in the foreground; the trophy/1 is a background element or subtle overlay
- Wordmark font: Poppins 700
- Logo colour: metallic silver / platinum gradient (not flat white, not gold)
- Use on dark backgrounds only (the canonical use case)

### Secondary logo
- Composition: trophy / number "1" motif **above** the OneMil wordmark (stacked vertical layout)
- Used in square/avatar contexts (app icon, social avatar, favicons)
- Same metallic silver / platinum treatment

### Logo don'ts
- No casino chip framing
- No roulette wheel
- No slot-machine reels
- No jackpot text
- No neon/Las Vegas palette (green felt, bright red)

### Export specs
| Format | Size | Usage |
|--------|------|-------|
| PNG transparent | 512 × 512 px | partner offers, in-app |
| PNG transparent | 1024 × 1024 px | app store / hi-res |
| SVG | — | web, scalable |
| Banner PNG | 1600 × 900 px | partner offer banner, OG image |

---

## UI Component Style Notes

- **Buttons (primary):** orange fill `#FF6B00`, Poppins 600, 14–16 px, 8 px radius, no border
- **Buttons (secondary):** transparent, `--color-border` border, silver text, same radius
- **Cards:** `--color-bg-surface` background, 1 px `--color-border` border, 12–16 px radius, subtle shadow
- **Badges:** small Poppins 600 caps, accent or metallic fill
- **Gradients:** dark-to-dark only (e.g. `#0A0A0F` → `#1C1C28`); orange gradients only on hero/CTA elements
- **Icons:** outline style (Lucide), silver/platinum colour; orange only on active/CTA icons

---

## Imagery

- **Photography style:** dramatic low-key lighting, dark backgrounds, luxury product feel
- **No stock casino imagery** (cards, dice, chips, wheels)
- **Partner offer banners:** 1600 × 900 px, dark background mandatory, partner logo top-left
- Preferred subjects: technology, achievement, exclusive lifestyle, abstract light/motion

---

## Voice & Wording

| Forbidden | Use instead |
|-----------|-------------|
| jackpot | hlavní výhra / grand prize |
| casino | soutěž / contest |
| gambling | účast / participation |
| bet / betting | tiket / ticket |
| slot / slots | — |
| roulette | — |
| chips | MioCoiny |

---

## File Naming Convention

```
onemil_logo_primary_512.png
onemil_logo_secondary_512.png
onemil_logo_primary.svg
onemil_banner_[partner-slug]_1600x900.png
onemil_icon_512.png
```
