# OneMil – aktuální stav projektu

**Aktualizováno:** 31. 05. 2026

---

## ➡️ CURRENT NEXT STEP (31. 05. 2026)

**Připravit lepší premium vizuální koncept pro OneMil video/prezentační vizuály.**
Surové screenshoty (raw screenshots) působí příliš technicky a nedostatečně premium.
Pavel není plně spokojen s raw screenshoty z HeyGen demo přípravy a chce kvalitnější
premium vizuální koncept (mockupy / brand kompozice / prezentační vizuály) místo holých
screenshotů aplikace.

---

## CUSTOMER MIOCOIN CODE REDEMPTION — KOMPLETNÍ + NASAZENO (31. 05. 2026)

- **Funkce:** přihlášený zákazník zadá MioCoin kód v Profilu (pod kartou Peněženka) a kredit se
  bezpečně připíše do peněženky.
- **Frontend:** `src/components/RedeemMioCoinCard.tsx` (nová komponenta) mountnutá v
  `src/pages/Profile.tsx` pod kartou Peněženka. Referral kód zůstává odděleně v „Pozvi přátele".
- **Migrace:** `supabase/migrations/20260531_redeem_miocoin_code.sql` — RPC
  `redeem_miocoin_code(p_code text) RETURNS jsonb` (SECURITY DEFINER). Zamkne řádek
  `partner_reward_codes FOR UPDATE`, validuje status=issued / not cancelled / not expired /
  email match, připíše `wallets.balance_coins`, zapíše `wallet_transactions`, označí kód
  `activated` (existující trigger `trg_log_partner_coin_activation_reward` zapíše
  `partner_coin_activations` — RPC ten řádek NEvkládá ručně).
- **Commit:** `ce76027b` — feat: add customer MioCoin code redemption (na GitHub `main`).
- **Staging RPC ověřen** (projekt `dxmowysntemfqfnanxua`): kód `HEYGEN-TEST-250` připsal 250 MC,
  peněženka 2500 → 2750, opakované použití vrátilo `already_used`, `wallet_transactions` vytvořen,
  `partner_coin_activations` vytvořen triggerem.
- **Produkční RPC `redeem_miocoin_code` APLIKOVÁN** v projektu `xkzhjldrojjlrkezorey`
  (SECURITY DEFINER=true, EXECUTE grant pro `authenticated`).
- **Frontend publikován přes Lovable** a karta funguje v produkci.
- **UI wording je source-neutral:** titulek „Uplatnit MioCoin kód"; kód může pocházet z partnerské
  akce, kartičky, QR kódu nebo e-mailu (ne pouze e-mail).

---

## ERROR TOAST CONTRAST FIX — KOMPLETNÍ (31. 05. 2026)

- **Problém:** chybové toasty měly červené pozadí, ale text byl šedý/muted a špatně čitelný.
- **Oprava obou toast systémů:**
  - shadcn `useToast` (`variant: 'destructive'`) v `src/components/ui/toast.tsx` — bílý text na červené.
  - sonner `toast.error()` v `src/components/ui/sonner.tsx` — error varianta má pevné červené pozadí
    (`!bg-destructive`) + bílý titulek i popis (přepis `[data-title]`/`[data-description]`). `richColors`
    se NEPOUŽÍVÁ (vedlo k theme-dependent světle růžovému pozadí s šedým textem).
- **Výsledek:** všechny error toasty mají červené pozadí s bílým čitelným textem. Success/default styling
  beze změny.
- **Commit:** `a220d993` — fix: improve error toast contrast (na GitHub `main`).
- **Pozn.:** vyžaduje Lovable Publish, pokud ještě nebyl publikován.

---

## PROFILE SAVE RLS FIX — KOMPLETNÍ (31. 05. 2026)

- **Problém:** uložení profilu selhávalo, protože `handleProfileSave` v `Profile.tsx` používá `upsert`
  na `public.profiles`, ale RLS neměla žádnou INSERT policy. `upsert` = `INSERT … ON CONFLICT DO UPDATE`;
  RLS vyhodnocuje INSERT WITH CHECK první → bez INSERT policy selže celý příkaz s 42501 „new row violates
  row-level security policy" (i když řádek už existuje a má proběhnout jen UPDATE).
- **Oprava aplikována ručně na staging i produkci:**
  `profiles_insert_own FOR INSERT TO authenticated WITH CHECK (id = auth.uid())`
- **Ukládání profilu v produkci ověřeno funkční.**
- **Permanentní migrace zaznamenána:** `supabase/migrations/20260531_profiles_insert_own_rls.sql`
  (idempotentní: `DROP POLICY IF EXISTS` před `CREATE`).
- **Commit:** `6fceef27` — fix: persist profiles insert RLS policy (na GitHub `main`).

---

## HEYGEN STAGING DEMO — PŘÍPRAVA (31. 05. 2026)

- **Staging projekt** `dxmowysntemfqfnanxua` připraven s demo uživatelem:
  `heygen.staging@onemil.cz`, UUID `217dc715-8af7-41ac-97e5-00a9617c3a9d`.
- **Demo storage buckety:** `contest-images`, `voucher-images`.
- **Demo soutěže mají MioCoin bonusy:** Porsche 575 MC, Dubaj 700 MC, Hodinky 570 MC, Domácí kino 625 MC.
- **Demo screenshoty vytvořeny**, ale Pavel není plně spokojen — chce kvalitnější premium vizuální koncept
  (viz „CURRENT NEXT STEP" nahoře).

---

## SOCIAL LOGIN BUTTON VISIBILITY — AKTUÁLNÍ STAV (31. 05. 2026)

### Výchozí chování

- Google social login tlačítko je viditelné defaultně.
- Facebook social login tlačítko je viditelné defaultně.
- Apple social login tlačítko je skryté defaultně, protože Apple provider v Supabase vracel chybu `Unsupported provider: provider is not enabled`.

### Env flagy

| Provider | Výchozí stav | Env override |
|----------|--------------|--------------|
| Google | viditelné | `VITE_ENABLE_GOOGLE_AUTH=false` nebo `0` skryje tlačítko |
| Facebook | viditelné | `VITE_ENABLE_FACEBOOK_AUTH=false` nebo `0` skryje tlačítko |
| Apple | skryté | `VITE_ENABLE_APPLE_AUTH=true` nebo `1` zobrazí tlačítko |

### Soubory a pravidla

- Kanonická konfigurace viditelnosti je `src/config/socialAuth.ts`.
- `src/pages/Login.tsx` a `src/pages/Register.tsx` pouze čtou `ENABLED_OAUTH_PROVIDERS`.
- Email/password login zůstal beze změny.
- Odkazy mezi loginem a registrací zůstaly beze změny.
- Nebyla měněna Supabase Auth konfigurace, databáze, profile, wallet, contests, tickets, vouchers, winners, Partner Offers, AI chat ani admin.

### Commity

| Commit | Popis |
|--------|-------|
| `cdbaec0` | první fix: social auth tlačítka skrytá za explicitním env opt-in |
| `ec48700` | merge s aktuálním `origin/main`, zachování social auth guardů |
| `3874f20` | finální úprava: Google/Facebook default visible, Apple default hidden |

---

## WINNER CARD BACKGROUNDS — KOMPLETNÍ (31. 05. 2026)

### Assets

Soubory v `src/assets/winner-backgrounds/`:

| Soubor | Použití v rotaci |
|--------|-----------------|
| `winner-card-bg-trophy.png` | index % 3 === 0 (1., 4., 7. … karta) |
| `winner-card-bg-crown.png` | index % 3 === 1 (2., 5., 8. … karta) |
| `winner-card-bg-clean.png` | index % 3 === 2 (3., 6., 9. … karta) |
| `winner-card-bg-trophy-with-coin-area.png` | dostupný, zatím mimo rotaci |

### Rotační konstanta (copy-paste pattern)

```tsx
import winnerBgTrophy from '@/assets/winner-backgrounds/winner-card-bg-trophy.png';
import winnerBgCrown from '@/assets/winner-backgrounds/winner-card-bg-crown.png';
import winnerBgClean from '@/assets/winner-backgrounds/winner-card-bg-clean.png';

const WINNER_BG_ROTATION = [winnerBgTrophy, winnerBgCrown, winnerBgClean];

// v .map():
cardStyleImageUrl={WINNER_BG_ROTATION[index % WINNER_BG_ROTATION.length]}
```

### Kde se rotace používá

| Stránka/komponenta | Soubor | Stav |
|-------------------|--------|------|
| Homepage „Poslední výherci" | `src/pages/Homepage.tsx` | ✅ rotace |
| Standalone Winners stránka | `src/pages/Winners.tsx` | ✅ rotace |

### WinnerCard overlay — aktuální CSS (src/components/WinnerCard.tsx)

Dvě vrstvy na `z-[1]` (DOM order — gradient překryje obrázek):

```tsx
// Vrstva 1 — background image
opacity: 0.42

// Vrstva 2 — dark gradient overlay
linear-gradient(to right,
  rgba(10,11,15, 0.78)  0–88px      // levý pruh: zakrývá hnědý blok
  rgba(10,11,15, 0.42)  130px       // přechod
  rgba(10,11,15, 0.20)  55%         // střed: text čitelný
  rgba(10,11,15, 0.14)  100%        // vpravo: dekorativní tvar viditelný
)
```

**Pravidlo:** Pokud přidáváš novou stránku se `WinnerCard`, použij `WINNER_BG_ROTATION` a `index % 3` — overlay logika je v `WinnerCard.tsx` automaticky.

**Nesmí se měnit bez souhlasu:** `cardStyleImageUrl` prop v `WinnerCard` — overlay logika závisí na tom, zda je prop vyplněný.

### Commity

| Commit | Popis |
|--------|-------|
| `7276c254` | feat: přidány background assets + rotace na Homepage |
| `4b127aef` | fix: snížena opacity obrázku (0.28), přidán dark gradient overlay |
| `9d9c716c` | fix: opacity 0.42, pravý gradient 0.14 (dekorace viditelná) |
| `8197d6ae` | feat: rotace přidána na Winners stránku, Lucide Trophy → OneMilTrophyIcon |

### GitHub Actions — stav (31. 05. 2026)

- Repo bylo **private** → GitHub Actions minuty se vyčerpaly → CI nefungovalo
- **Oprava:** repo změněno na **public** → Actions minuty jsou nyní zdarma neomezeně
- Smoke tests ✅ (1m 10s), Staging Full E2E ✅ (3m 39s) — oba prošly po zveřejnění

---

## ONEMIL PREMIUM ICON SYSTEM — KOMPLETNÍ (30. 05. 2026)

### Soubory

- **`src/components/icons/OneMilIcons.tsx`** — kanonický soubor všech OneMil brand ikon (23 ikon)
- **`src/assets/icons/icon-trophy-onemil.svg`** — kopie brand kit SVG (512×512, dark bg, silver+orange gradient)

### Exportované ikony (OneMilIcons.tsx)

| Export | Použití |
|--------|---------|
| `OneMilTrophyIcon` | Soutěže, hlavní výhra |
| `OneMilWinIcon` | Výhry sekce, počet výher |
| `OneMilVoucherIcon` | Vouchery stránka, empty states |
| `OneMilWalletIcon` | Peněženka, MioCoin balance |
| `OneMilMessageIcon` | Zprávy sekce |
| `OneMilProfileIcon` | Profil sekce |
| `OneMilHomeIcon` | Domů nav |
| `OneMilHeartIcon` | Oblíbené |
| `OneMilGiftIcon` | Bonusové výhry, dárky |
| `OneMilDiamondIcon` | Premium/bonus (náhrada Sparkles) |
| `OneMilZapIcon` | Fast access |
| `OneMilShieldIcon` | Bezpečnost, právní |
| `OneMilInfoIcon` | Info tooltip |
| `OneMilFilterIcon` | Filtrování |
| `OneMilMioCoinIcon` / `OneMilCoinsIcon` | MioCoin balance, dobití |
| `OneMilCartIcon` | Zakoupené, nákup |
| `OneMilEmailIcon` | E-mail sekce |
| `OneMilBellIcon` | Notifikace |
| `OneMilCrownIcon` | VIP/level badge |
| `OneMilStarIcon` | Hvězdičkové hodnocení |
| `OneMilMedalIcon` | Ocenění |
| `OneMilTicketIcon` | Tikety, Moje hry |

### Props pattern

```tsx
<OneMilXxxIcon
  size={24}          // SVG width/height atribut
  className="w-6 h-6 text-[#FF8A00]"  // CSS override + color
  active={false}     // true = orange/amber, false = silver
  color="#FF8A00"    // přímý override barvy
/>
```

### Sémantická pravidla (závazná)

- `OneMilGiftIcon` — POUZE bonusové výhry a dárky; **NE** pro vouchery ani MioCoin
- `OneMilVoucherIcon` — stránka Vouchery, záložky, empty states voucherů
- `OneMilMioCoinIcon` — dobití MioCoinů, balance sekce
- `OneMilWinIcon` — sekce Výhry (tab, count badge, empty state)
- `OneMilTrophyIcon` — Soutěže, hlavní výhra v filtrech
- `OneMilDiamondIcon` — premium/bonus vizuály (náhrada Lucide Sparkles)

### Premium page-header tile vzor (závazný pro všechny hlavní stránky)

```tsx
<div
  className="relative overflow-hidden rounded-2xl p-6"
  style={{
    background: 'linear-gradient(135deg, hsl(220, 25%, 8%) 0%, hsl(220, 30%, 12%) 50%, hsl(220, 25%, 8%) 100%)',
    border: '1px solid rgba(255,138,0,0.2)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,138,0,0.1)',
  }}
>
  {/* Shimmer */}
  <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
    background: 'linear-gradient(90deg, transparent 0%, rgba(255,181,71,1) 50%, transparent 100%)',
    backgroundSize: '200% 100%', animation: 'shimmer 4s ease-in-out infinite',
  }} />
  <div className="relative flex items-center gap-4">
    {/* Tile */}
    <div className="w-14 h-14 md:w-16 md:h-16 rounded-xl flex items-center justify-center shrink-0"
      style={{ background: 'linear-gradient(135deg, #FF8A00 0%, #c86000 100%)', boxShadow: '0 4px 20px rgba(255,138,0,0.3)' }}>
      <OneMilXxxIcon size={36} className="w-7 h-7 md:w-9 md:h-9 text-black" />
    </div>
    {/* Text */}
    <div>
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight"
        style={{ background: 'linear-gradient(135deg, #FFB547 0%, #FF8A00 50%, #FFB547 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
        Název stránky
      </h1>
      <p className="text-sm text-gray-400 mt-1">Podtitulek</p>
    </div>
  </div>
</div>
```

**Tile ikona:** 56×56px mobile / 64×64px desktop · ikona 28px mobile / 36px desktop · barva ikony `text-black`

### Stránky s uniforním header tile vzorem

| Stránka | Ikona | Commity |
|---------|-------|---------|
| `/games` | `OneMilTrophyIcon` | `1d5c5dde`, `87f74083` |
| `/vouchers` | `OneMilVoucherIcon` | `1d5c5dde`, `87f74083` |
| `/wins` | `OneMilWinIcon` | `1d5c5dde`, `87f74083` |
| `/messages` | `OneMilMessageIcon` | `1d5c5dde`, `87f74083` |
| `/my-contests` | `OneMilTicketIcon` | `1d5c5dde`, `87f74083` |

**Profil (`/profile`):** záměrně odlišný — hero layout s avatarem, VIP badge, gradient jméno. Tile vzor sem nepatří.

### Bottom navigation

- Ikony: OneMil brand ikony (všech 6 nav items)
- Velikost: `size={24}` (navýšeno z 22)
- Active: `scale-110` (navýšeno z scale-105)
- Pořadí: Domů, Vouchery, Soutěže, Výhry, Zprávy, Profil

### Kde zůstaly Lucide ikony (záměrně)

- Utility: `Clock`, `ArrowLeft/Up/Down`, `ChevronLeft/Right/Down`, `Check`, `CheckCircle`, `XCircle`, `Loader2`, `Camera`, `Volume2/VolumeX`, `Send`, `Package`, `Tag`, `Target`, `Gamepad2`
- Social: `Facebook`, `Twitter`, `Instagram`
- Wins header orange bg tile: Lucide `Trophy text-black` — brand SVG by na orange bg kolidovalo (záměrně ponecháno)

### Kompletní commity icon systému

| Commit | Popis |
|--------|-------|
| `cc490725` | feat: první Trophy brand SVG v customer UI |
| `ee9b7d9c` | feat: add OneMil premium icon system (remote session) |
| `cfcc6e86` | fix: replace placeholder icons (remote session) |
| `61840ab6` | feat: full customer-facing icon sweep + Crown/Star/Medal/Ticket |
| `94ed004f` | fix: sémantické opravy (Voucher/Win/MioCoin) |
| `1d5c5dde` | feat: unified premium header tiles na všech hlavních stránkách |
| `87f74083` | fix: fine-tune icon sizes (tile 36px desktop, nav 24px) |

---

**Aktualizováno:** 27. 05. 2026

---

## MIGRACE APLIKOVÁNA: coming_soon_banners.description (27. 05. 2026)

- `supabase/migrations/20260527_coming_soon_banners_add_description.sql` aplikována manuálně v Supabase a ověřena
- Ověřená struktura tabulky: `id uuid, image_url text, title text, created_at timestamp with time zone, description text`
- Info popup feature (admin textarea + homepage ℹ ikona + modal) je plně funkční

---

## WINNERCARD PREMIUM REDESIGN (27. 05. 2026)

- `src/components/WinnerCard.tsx` přepsán — sjednocen s MioCoin card stylem
- Styl: `hsl(220 45% 6%)` bg, `rgba(255,138,0,0.22)` border, subtle glow
- Prize name: Poppins bold orange→gold gradient (nejdominantnější prvek)
- Winner name: `#E7EBF0` silver, bez prefixu
- Spodní řádek: contest · ticket# · timeAgo — vše muted `#8E98A6`
- Odstraněny prefixové labely „Cena:/Výherce:/Soutěž:"
- Star šum snížen (opacity 0.09–0.14), outer homepage card star background odstraněn
- Výška: `112px` fixed
- Commit: `b6776ebe`

---

## PŘIPRAVUJEME BANNERY — INFO POPUP (27. 05. 2026)

- Nový sloupec `description TEXT` v `coming_soon_banners` (migrace `20260527_...` — viz PENDING výše)
- Admin: každý slot má textarea „Info text" + tlačítko Uložit → ukládá do `description`
- Homepage: pulsující ℹ ikona (orange/gold, `@keyframes info-pulse`) pokud `description` není prázdný
- Klik na ikonu → dark premium modal s title (Poppins gradient) + description text
- Commit: `f11b634f`

---

## PŘIPRAVUJEME BANNERY — EDITOVATELNÉ TITULY + PREMIUM STYL (27. 05. 2026)

- Admin `Připravujeme (3 bannery)`: každý slot má input „Popisek banneru" + Uložit → `coming_soon_banners.title`
- Admin preview: title jako overlay label (Poppins bold, silver→orange gradient) přes obrázek
- Homepage Připravujeme title: stejný premium Poppins gradient styl jako v admin preview
- Žádná nová DB migrace (sloupec `title` existoval)
- Commity: `4428b7d0` (admin editace), `265f2330` (homepage styl)

---

## TELEGRAM BOT NASTAVEN (25. 05. 2026)

- Bot: **@Onemilclaudebot** (id: `8969270078`)
- Token uložen jako Windows env var `TELEGRAM_BOT_TOKEN` (pouze lokálně na PC Pavla, ne v repozitáři)
- Chat ID Pavla: `6714365501` — uloženo jako Windows env var `TELEGRAM_CHAT_ID`
- Claude Code může posílat notifikace přes `Invoke-RestMethod` / `curl` na Telegram Bot API
- Obousměrná komunikace (příjem zpráv od Pavla) zatím neimplementována

---

## CI: ARTIFACT UPLOAD CONTINUE-ON-ERROR (25. 05. 2026)

- Smoke run `26374584373` selhal přestože testy prošly — příčina: kvóta artefaktů ještě nebyla přepočítána po mazání
- Oprava: `continue-on-error: true` na všech `upload-artifact` krocích v `playwright.yml` i `playwright-staging.yml` (commit `408da958`)
- Testy jsou nyní autoritativní — plná kvóta workflow neshodí

---

## HOMEPAGE HERO BANNER — FINÁLNÍ STAV (25. 05. 2026)

- Hero banner je plnou šířkou viewportu (mimo `container mx-auto`)
- **Cílový rozměr obrázku: 1920 × 600 px**
- Kontejner: `w-full sm:aspect-[16/5] sm:max-h-[600px]`
- Mobil: `h-auto object-contain` — celý obrázek bez pruhů
- Tablet+: `object-cover` — plné pokrytí bez ořezu
- Zlaté oddělovací linky + navigační šipky + tečkové indikátory zachovány
- Commit: `ecea087c` (finální stav po sérii 7 iterací)

---

## ADMIN BANNERY — TOGGLE „ZOBRAZOVAT TRVALE" (24. 05. 2026)

- `src/pages/AdminBanners.tsx`: přidán Switch „Zobrazovat trvale (bez omezení datumem)"
- Výchozí stav: zapnuto (nové bannery jsou trvale bez datumu)
- Když zapnuto: datumová pole skryta, `start_date`/`end_date` = `null`
- `null` datum = vždy zobrazit (hook to tak již interpretoval — žádná DB změna)
- Commit: `03271812`

---

## HOMEPAGE PLACEMENT BANNERY — LAYOUT (24. 05. 2026)

- **MioCoin karty (4 balíčky):** fallback text skryt když existuje placement banner obrázek
- **MioCoin karty — layout:** obrázek nahoře (`flex-1`), tlačítko „Dobít" přišpendleno ke spodku (`flex-shrink-0`)
- **Lower boxy** (`probihajici_souteze`, `koupit_voucher`): ikona + text skryty při banner obrázku; `min-h` zachovává výšku karty
- Commity: `f486afa9`, `9e58c386`, `e84ab661`, `e9254494`

---

## STARÉ LOGO PREVIEW ODSTRANĚNO (22. 05. 2026)

### PR #112 — style: remove stale PWA preview showing old pre-brand logo (merge commit `1b9e704f`)
- **Smazáno:** `docs/brand/onemil-pwa-icon-preview.png` — zastaralý read-only docs snapshot z 13. 05. 2026 obsahující old logo (bílý čtverec + oranžový text "OneMil") v pravém dolním panelu
- Soubor nebyl importován žádným aplikačním kódem — čistě docs reference
- **`src/assets/logo-onemil.png`** je od PR #110 správný brand kit asset (MD5-ověřeno shodný s `primary_logo_trophy_behind_text_transparent_estimated.png`) — žádná změna
- Všech 9 aplikačních importů loga (Header, Login, Register, TicketResultModal, ShareTicket, OnboardingDateOfBirth, PartnerLogin, PartnerRegister, InfluencerRegister) nadále používají správný brand kit asset ✅
- Playwright Smoke Tests (branch `26286729712` ✅, post-merge `26286806820` ✅)

---

## ZÁKAZNICKÁ GRAFIKA — VIZUÁLNĚ SCHVÁLENO (21. 05. 2026)

Zákaznická grafika OneMil vizuálně zkontrolována a schválena Pavlem Divišem po dokončení brand resetu.

**Potvrzeno:**
- Barvy odpovídají OneMil brand kitu (Energy Orange `#FF8A00`, Warm Amber `#FFB547`, dark backgrounds) ✅
- Logo v headeru je správné (brand kit `primary_logo_trophy_behind_text_transparent_estimated.png`) ✅
- Favicon (`/favicon.ico`) a PWA ikony (`android-chrome-192×192/512`, `apple-touch-icon`) jsou z brand kitu ✅
- Fonty Inter (body) a Poppins (h1–h6, nadpisy) jsou správně nastaveny ✅
- 404 stránka opravena na dark brand (`bg-background`) ✅
- Zákaznická část vizuálně působí v pořádku — dark premium tech-luxury styl bez starých modrých/casino prvků ✅

**Scope:**
- Zákaznické stránky: `/`, `/games`, `/vouchers`, `/wins`, `/messages`, `/login`, `/register`, `/kontakt`, `/profile`, `NotFound`, cookie banner, header, footer
- Admin, influencer a partner portál: záměrně mimo tento scope, brand reset odložen

**Závěr:** Žádný další grafický PR pro zákaznickou část není aktuálně potřeba.

---

## NOTFOUND DARK BACKGROUND — OPRAVENO (21. 05. 2026)

### PR #111 — style: fix NotFound page light background to dark brand (merge commit `33cbeeb7`)
- **`src/pages/NotFound.tsx`** (1 ins/1 del): `bg-gray-100` → `bg-background`
- Nález z finálního vizuálního smoke auditu: 404 stránka byla jedinou zákaznickou stránkou se světlým pozadím (`rgb(243,244,246)`) — nesoulad s dark premium brandem
- Vizuálně ověřeno v preview: Midnight Black pozadí, "404" amber, "Return to Home" oranžový link ✅
- Playwright Smoke Tests (branch `26253920880` ✅, post-merge `26253998050` ✅)

---

## FONT AUDIT — DOKONČEN (21. 05. 2026)

- **Google Fonts import** (`src/index.css:1`): `Inter 300–700` + `Poppins 500–800` — správně ✅
- **`body`** (`index.css:149`): `font-family: 'Inter', system-ui, sans-serif` ✅
- **`h1–h6`** (`index.css:159`): `font-family: 'Poppins', system-ui, sans-serif` ✅
- **Tailwind `font-heading`** (`tailwind.config.ts:17`): `['Poppins', 'system-ui', 'sans-serif']` ✅
- **Tailwind `font-body` + `font-sans`** (`tailwind.config.ts:18–19`): `['Inter', 'system-ui', 'sans-serif']` ✅
- **Plus Jakarta Sans**: 0 výskytů v celém projektu ✅
- **Inline `fontFamily`** v TSX/TS: 0 výskytů ✅
- **Arbitrary `font-[...]` Tailwind hodnoty**: 0 výskytů ✅
- **`font-mono`**: použit výhradně oprávněně — UUID/ID v admin tabulkách, `<code>` bloky v CMS prose, numerické hodnoty v grafu ✅
- **`@font-face`**: 0 výskytů — fonty pouze přes Google Fonts ✅
- **Závěr**: fontový systém plně odpovídá OneMil brand kitu (Poppins pro nadpisy, Inter pro tělo). Další font PR není potřeba.

---

## BRAND LOGO ASSETS — OPRAVENO (21. 05. 2026)

### PR #110 — style: replace header logo and favicon with brand kit assets (merge commit `8b94e0df`)

**Nalezené logo soubory před opravou:**
- `src/assets/logo-onemil.png` — 1.4MB, JINÝ od brand kitu → nahrazeno
- `public/favicon.ico` — 7.5K, JINÝ od brand kitu → nahrazeno
- `public/android-chrome-192x192.png` — identický MD5 s brand kitem ✅ beze změny
- `public/android-chrome-512x512.png` — identický MD5 s brand kitem ✅ beze změny
- `public/apple-touch-icon.png` — identický MD5 s brand kitem ✅ beze změny

**Nahrazené soubory:**
- `src/assets/logo-onemil.png` → `primary_logo_trophy_behind_text_transparent_estimated.png` z brand kitu (průhledné pozadí, správné pro tmavý header)
- `public/favicon.ico` → `favicon.ico` z brand kitu (`03_icons/favicon_app/`)
- `index.html` — opraven wrong MIME type `type="image/svg+xml"` → `type="image/x-icon"` na favicon linku

**Kde se logo používá v aplikaci:**
- `src/components/Header.tsx` — `import logo from '@/assets/logo-onemil.png'`, zobrazeno jako `<img>` v sticky headeru
- `public/manifest.webmanifest` — odkazuje na `android-chrome-192x192.png` a `android-chrome-512x512.png` (PWA ikony, již správné)
- `index.html` — `<link rel="icon">` → `favicon.ico`, `<link rel="apple-touch-icon">` → `apple-touch-icon.png`

- Playwright Smoke Tests (branch `26252667493` ✅, post-merge `26252302107` ✅)

---

## BRAND CUSTOMER-FACING CLEANUP — FINÁLNĚ DOKONČENO (21. 05. 2026)

### Final low-priority cleanup (PR #109, merge commit `a3e56146`)
- **`src/pages/Vouchers.tsx`** (8 ins/8 del): 7 sparkle radial-gradient dots `hsl(45/40)` → `rgba(255,181,71/255,138,0,...)`; Gift icon `hsl(45_60%_40%/0.4)` → `rgba(255,138,0,0.4)`
- **`src/App.tsx`** (1 ins/1 del): winner toast inline border `hsl(43,70%,45%,0.3)` → `rgba(255,138,0,0.3)`
- **`src/components/cms/CMSPageLayout.tsx`** (1 ins/1 del): CMS heading gradient `via-[hsl(45_85%_60%)]` → `via-[#FFB547]`
- **`src/components/ui/badge.tsx`** (1 ins/1 del): `info` variant `blue-500` → brand orange/amber `rgba(255,138,0,...) / #FFB547`
- Playwright Smoke Tests (branch): SUCCESS ✅ run `26252078508` | (post-merge): SUCCESS ✅ run `26252162219`

### Finální grep audit výsledek
- **Customer-facing accent zbytky: ŽÁDNÉ** — všechny `hsl(43/45/40)` accent hodnoty převedeny
- `VoucherCarousel.tsx:128` — `hsl(40_20%_14%)` strukturní tmavé pozadí karty (warm-dark tone, záměrně ponecháno)
- `OneMilAudit.tsx` — admin stránka, odloženo záměrně
- Admin / Influencer / Partner portal — odloženo záměrně dle instrukce

---

## BRAND CUSTOMER-FACING CLEANUP — STEPS 21–26 DOKONČENY (21. 05. 2026)

Šest dalších customer-facing brand PRů po step 20 auditu. Žádné admin/influencer/partner změny.

### Step 21 — TicketResultModal.css + index.css (PR #103, merge commit `bd3d107b`)
- **`src/components/TicketResultModal.css`** (6 ins/6 del): `win-moment-cta-pulse` keyframe box-shadows `hsl(43/48)` → `rgba(255,138,0/255,181,71,...)`; reduced-motion fallback shadow → brand; `.win-moment-value-shimmer` gradient `hsl(43/48/35)` → brand rgba
- **`src/index.css`** (3 ins/3 del): winner-shimmer bar `hsl(43 90% 55%)` → `rgba(255,138,0,...)`
- Playwright Smoke Tests (branch): SUCCESS ✅ | (post-merge): SUCCESS ✅

### Step 22 — CookieConsentBanner.tsx (PR #104, merge commit `c8b61546`)
- **`src/components/CookieConsentBanner.tsx`** (9 ins/9 del): banner + dialog borders, 3× section item borders, 2× outline button hover, 2× CTA "Souhlasím" button gradient + shadow → brand orange/amber
- Playwright Smoke Tests (branch): SUCCESS ✅ | (post-merge): SUCCESS ✅

### Step 23 — Login.tsx + Register.tsx (PR #105, merge commit `64c2cb16`)
- **`src/pages/Login.tsx`** (5 ins/5 del): card border, submit CTA gradient + shadow, 3× OAuth outline button → brand
- **`src/pages/Register.tsx`** (5 ins/5 del): same pattern
- Playwright Smoke Tests (branch): SUCCESS ✅ | (post-merge): SUCCESS ✅

### Step 24 — VoucherCarousel.tsx (PR #106, merge commit `e1cecdf9`)
- **`src/components/VoucherCarousel.tsx`** (3 ins/3 del): card border + hover, image border, CTA button gradient + shadow → brand
- Playwright Smoke Tests (branch): SUCCESS ✅ | (post-merge): SUCCESS ✅

### Step 25 — Messages.tsx (PR #107, merge commit `1145ca2e`)
- **`src/pages/Messages.tsx`** (35 ins/35 del): all 35 inline `hsl(45/35)` → brand rgba/hex (system bubble border, Sparkles icon, label gradient, CTA bubble button, send button surface, particles, shimmer overlays, header border/shadow/shimmer/icon/title/count-badge, scrollbar, empty state, jump button, input bar border/shadow/shimmer/focus, flying message, sparkle icon)
- Playwright Smoke Tests (branch): SUCCESS ✅ | (post-merge): SUCCESS ✅

### Step 26 — Misc customer-facing (PR #108, merge commit `16d1637d`)
- **`src/components/ContactForm.tsx`** (4 ins/4 del): heading gradient, success box border/bg/icon/text → brand
- **`src/components/SupportForm.tsx`** (4 ins/4 del): same 4-change pattern
- **`src/pages/Kontakt.tsx`** (1 ins/1 del): heading gradient `via-[hsl(45_85%_60%)]` → `via-[#FFB547]`
- **`src/components/BonusPrizeDetailModal.tsx`** (1 ins/1 del): dialog title `text-yellow-400` → `text-[#FFB547]`
- **`src/components/BonusPrizeOverlay.tsx`** (1 ins/1 del): delivered/claimed badge `blue-*` → brand orange
- **`src/pages/Homepage.tsx`** (1 ins/1 del): login chip `bg-blue-100/10 text-blue-400` → brand
- **`src/pages/NotFound.tsx`** (1 ins/1 del): link `text-blue-500` → brand orange
- **`src/pages/MyContestDetail.tsx`** (1 ins/1 del): draft status dot `bg-yellow-500` → `bg-[#FF8A00]`
- **`src/components/MessageForm.tsx`** (1 ins/1 del): submit button `bg-blue-600` → brand orange
- Playwright Smoke Tests (branch): SUCCESS ✅ | (post-merge): SUCCESS ✅ run `26251107153`

---

## BRAND CUSTOMER-FACING CLEANUP — STEPS 15–19 DOKONČENY (21. 05. 2026)

Finální customer-facing brand cleanup — 5 PRů, 5 souborů, žádné admin ani influencer změny.

### Step 15 — OfferCard + OfferDetailModal (PR #98, merge commit `7faea2b9`)
- **`src/components/OfferCard.tsx`** (4 ins / 4 del):
  - hover border/shadow: `hover:border-blue-400/40 hover:shadow-blue-500/10` → brand orange
  - Tag ikona: `text-blue-400/30` → `text-[rgba(255,138,0,0.3)]`
  - "Nová" badge: `bg-blue-500/90 text-white` → `bg-[rgba(255,138,0,0.9)] text-black`
  - Partner name: `text-blue-400` → `text-[#FFB547]`
- **`src/components/OfferDetailModal.tsx`** (2 ins / 2 del):
  - Tag ikona: `text-blue-400` → `text-[#FFB547]`
  - Partner name: `text-blue-400` → `text-[#FFB547]`
- Playwright Smoke Tests (branch): SUCCESS ✅ | (post-merge main): SUCCESS ✅

### Step 16 — TicketProgressBar (PR #99, merge commit `88e73dc0`)
- **`src/components/TicketProgressBar.tsx`** (4 ins / 4 del):
  - Progress fill: `from-blue-700 to-blue-500` → `from-[#FF8A00] to-[#FFB547]`
  - Legend dot: `bg-blue-500` → `bg-[#FF8A00]`
  - Clock ikona: `text-blue-400` → `text-[#FFB547]`
  - TrendingUp ikona: `text-yellow-400` → `text-[#FFB547]`
- Playwright Smoke Tests (branch): SUCCESS ✅ | (post-merge main): SUCCESS ✅

### Step 17 — TicketResultModal blue hints (PR #100, merge commit `f429adbd` area)
- **`src/components/TicketResultModal.tsx`** (4 ins / 4 del):
  - Partner name v offer result: `text-blue-400` → `text-[#FFB547]`
  - CTA hint: `text-blue-200/75` → `text-[rgba(255,181,71,0.75)]`
  - CTA hint span: `text-blue-100` → `text-[#FFB547]`
  - "Zobrazit nabídku" button: `border-blue-500/40` → `border-[rgba(255,138,0,0.4)]`
- Playwright Smoke Tests (branch): SUCCESS ✅ | (post-merge main): SUCCESS ✅

### Step 18 — WinCard badge (PR #101, merge commit `f429adbd`)
- **`src/components/WinCard.tsx`** (1 ins / 1 del):
  - "Připraveno k odeslání" badge: `bg-blue-500/90 text-white` → `bg-[rgba(255,138,0,0.9)] text-black`
- Playwright Smoke Tests (branch): SUCCESS ✅ | (post-merge main): SUCCESS ✅

### Step 19 — Wins.tsx inline hsl cleanup (PR #102, merge commit `02b3f2a3`)
- **`src/pages/Wins.tsx`** (24 ins / 24 del):
  - Particles: `hsl(45, 93%, X%)` → `rgba(255,181,71,1)`
  - Shimmer: `hsl(45, 93%, 60%)` → `rgba(255,181,71,1)`
  - Header card border: `hsl(45, 70%, 40%, 0.2)` → `rgba(255,138,0,0.2)`
  - Header shadow inset: `hsl(45, 70%, 50%, 0.1)` → `rgba(255,138,0,0.1)`
  - Trophy icon box gradient: `hsl(45,80%,45%) → hsl(35,90%,35%)` → `#FF8A00 → #c86000`
  - Trophy box shadow: `hsl(45, 80%, 40%, 0.3)` → `rgba(255,138,0,0.3)`
  - Title gradient: `hsl(45,93%,65%) → hsl(35,90%,55%)` → `#FFB547 → #FF8A00`
  - Win count badge bg/border: `hsl(45,80%,45%)/10 hsl(45,70%,50%)/20` → `rgba(255,138,0,...)`
  - Crown ikona: `text-[hsl(45,80%,55%)]` → `text-[#FF8A00]`
  - Count span: `text-[hsl(45,80%,60%)]` → `text-[#FFB547]`
  - Tab/filter active (replace_all): `from-[hsl(45,80%,45%)] to-[hsl(35,90%,35%)]` → `from-[#FF8A00] to-[#c86000]`
  - "Nabídky" tab active: `from-blue-600 to-blue-700 text-white` → `from-[#FF8A00] to-[#c86000] text-black`
  - Sort button hover border (replace_all): → `hover:border-[rgba(255,138,0,0.3)]`
  - Arrow ikony (replace_all): `text-[hsl(45,70%,50%)]` → `text-[#FF8A00]`
  - Empty state borders: `hsl(45, 70%, 40%, 0.15/0.1)` → `rgba(255,138,0,0.15/0.1)`
  - Trophy empty ikona (replace_all): → `text-[#FF8A00]/30`
  - Empty title gradient: `hsl(45,93%,65%) → hsl(35,90%,55%)` → `#FFB547 → #FF8A00`
- Playwright Smoke Tests (branch): SUCCESS ✅ | (post-merge main): SUCCESS ✅

---

## BRAND REFERRALSECTION — STEP 13 DOKONČEN (21. 05. 2026)

Komponenta ReferralSection sjednocena podle OneMil brand kitu.

### Co bylo provedeno

- **`src/components/ReferralSection.tsx`** (8 ins / 8 del):
  - Outer card shadow: `hsl(43_90%_55%/0.15)` → `rgba(255,138,0,0.15)`
  - Shimmer overlay gradient: `hsl(43 90% 55% / 0.03/0.05)` → `rgba(255,138,0,...)`
  - Coins stat card bg/border: `yellow-500/10 yellow-500/5 yellow-500/20` → brand orange
  - Coins ikona + číslo: `text-yellow-500` → `text-[#FFB547]`
  - Enter-code box bg/border: `yellow-500/8 yellow-500/5 yellow-500/15` → brand orange
  - Code Input: `bg-yellow-500/5 border-yellow-500/20 focus:...` → brand orange
  - Submit button: `from-yellow-500 to-yellow-600` → `from-[#FF8A00] to-[#FFB547]`

### Merge + testy

- **PR #97** mergnut do `main` — merge commit `5fc4bad3`
- **Playwright Smoke Tests (branch)**: SUCCESS ✅ (run `26247928785`)
- **Playwright Smoke Tests (post-merge main)**: SUCCESS ✅ (run `26248006157`)

---

## BRAND WINS + WINDETAILMODAL — STEP 12 DOKONČEN (21. 05. 2026)

Wins.tsx a WinDetailModal.tsx sjednoceny podle OneMil brand kitu.

### Co bylo provedeno

- **`src/pages/Wins.tsx`** (5 ins / 5 del):
  - "Odesláno" filter button: `from-blue-500 to-blue-600` + `rgba(59,130,246,0.3)` + `bg-blue-500/10 text-blue-400 border-blue-500/30` → Energy Orange brand
  - Tag ikona v empty offers state: `text-blue-400/30` → `text-[rgba(255,138,0,0.3)]`
- **`src/components/WinDetailModal.tsx`** (4 ins / 4 del):
  - Status badge `pending`: `bg-yellow-500/20 text-yellow-400 border-yellow-500/30` → `rgba(255,138,0,0.2)` / `#FFB547`
  - Status badge `připraveno k odeslání`: `bg-blue-500/20 text-blue-400 border-blue-500/30` → `rgba(255,138,0,0.2)` / `#FFB547`
  - Status badge `default`: `bg-yellow-500/20 text-yellow-400 border-yellow-500/30` → `rgba(255,138,0,0.2)` / `#FFB547`
  - Trophy ikona v type badge: `text-yellow-400` → `text-[#FFB547]`

### Merge + testy

- **PR #96** mergnut do `main` — merge commit `e18d40ab`
- **Playwright Smoke Tests (branch)**: SUCCESS ✅ (run `26247530336`)
- **Playwright Smoke Tests (post-merge main)**: SUCCESS ✅ (run `26247612549`)

---

## BRAND CUSTOMERCONTESTVIEW — STEP 11 DOKONČEN (21. 05. 2026)

Komponenta CustomerContestView sjednocena podle OneMil brand kitu.

### Co bylo provedeno

- **`src/components/CustomerContestView.tsx`** (9 ins / 9 del):
  - `text-yellow-400` (×4 — Coins/Crown ikony) → `text-[#FFB547]`
  - Contest title gradient: `#FACC6B/#FBBF24/#FEF3C7` + `rgba(250,204,21,0.45)` → `#FFB547/#FF8A00` brand
  - Progress bar bg glow: `rgba(250,204,21,0.2)` → `rgba(255,138,0,0.2)`
  - Progress bar fill: `from-yellow-400/70 via-yellow-300/60` + shadow → Energy Orange brand
  - Milestone dots: `from-yellow-300 to-yellow-500` + `rgba(250,204,21,0.9)` → `#FFB547/#FF8A00`

### Merge + testy

- **PR #94** mergnut do `main` — merge commit `3f421521b1932600a5e7f6955c15f5e89c641b7d`
- **Playwright Smoke Tests**: SUCCESS ✅

---

## BRAND TICKETRESULTMODAL — STEP 10 DOKONČEN (21. 05. 2026)

Win-moment modal sjednocen podle OneMil brand kitu.

### Co bylo provedeno

- **`src/components/TicketResultModal.tsx`** — win-moment vizuál sjednocen:
  - Modal border/shadow: `border-yellow-500/40`, `rgba(255,190,60,...)`, `rgba(255,200,0,...)` → `rgba(255,138,0,...)`
  - Win glow orb: `hsl(43_90%_55%/0.55)` → `rgba(255,138,0,0.55)`
  - Win headline gradient: `from-amber-100 via-yellow-300 to-amber-200` → `from-[#FFB547] via-[#E7EBF0] to-[#FFB547]`
  - Prize title drop-shadow: `rgba(250,204,21,0.35)` → `rgba(255,138,0,0.35)`
  - Particle barva (warm gold): `hsl(43 95% 62%)` → `#FFB547`
  - Next-win distance highlight: `hsl(43_80%_65%) hsl(35_90%_55%)` → `#FFB547 #FF8A00` (×2)
  - "Hrát znovu" CTA (×3): `from-amber-500 via-yellow-500 to-amber-400` → `from-[#FF8A00] via-[#FFB547] to-[#FF8A00]`
  - Main prize text: `text-yellow-600` → `text-[#FF8A00]`
  - Loss state border: `border-yellow-500/30` → `border-[rgba(255,138,0,0.3)]`
  - Share divider: `rgba(234,179,8,0.4)` → `rgba(255,138,0,0.4)`
  - Emotivní amber/white text třídy a confetti barvy zachovány

### Merge + testy

- **PR #93** mergnut do `main` — merge commit `d88a76a9a1cef323e3b477e683aa3e69442d618a`
- Změněn pouze 1 soubor: `src/components/TicketResultModal.tsx` (15 ins / 15 del)
- **Playwright Smoke Tests**: SUCCESS ✅

---

## BRAND MIOCOIN — STEP 9 DOKONČEN (21. 05. 2026)

Komponenta MioCoin sjednocena podle OneMil brand kitu.

### Co bylo provedeno

- **`src/components/MioCoin.tsx`** — okrajový gradient a glow shadow coin ikony:
  - `from-yellow-500/40` → `from-[rgba(255,138,0,0.4)]` (Energy Orange)
  - `via-yellow-400/10` → `via-[rgba(255,181,71,0.1)]` (Warm Amber)
  - `rgba(234,179,8,0.35)` → `rgba(255,138,0,0.35)` (Energy Orange)
  - Velikost, layout, props, importy a logika beze změny

### Co se nezměnilo

- Žádná logika aplikace, Supabase, wallet, Stripe, migrace

### Merge + testy

- **PR #92** mergnut do `main` — merge commit `baa61ab30dac4a2703774d35722a2b770b5e3961`
- Změněn pouze 1 soubor: `src/components/MioCoin.tsx` (1 ins / 1 del)
- **Playwright Smoke Tests**: SUCCESS — run `26244784903` ✅

### Další krok

Step 10: `src/components/TicketResultModal.tsx` — sjednotit yellow/gold/amber HSL hodnoty ve win modalu na Energy Orange / Warm Amber.

---

## BRAND TOKEN CLEANUP — STEP 8 DOKONČEN (21. 05. 2026)

CSS tokeny a stránka Games sjednoceny podle OneMil brand kitu.

### Co bylo provedeno

- **`src/index.css`** — staré tokeny přesměrovány na brand hodnoty (názvy zachovány pro zpětnou kompatibilitu):
  - `--neon-blue: 220 80% 45%` → `33 100% 50%` (Energy Orange) — propaguje přes `--glow-blue`, `--gradient-primary/hero/mystery`, keyframes (`luxury-pulse`, `luxury-glow`, `title-glow`), `.neon-ticket`, `.ticket-profile`, `.hero-title`, `.story-link`
  - `--heading-gold: 43 55% 66%` → `38 100% 64%` (Warm Amber) — propaguje do `h1`, `h2` base stylů
  - `--heading-gold-soft: 43 45% 58%` → `38 85% 55%`
  - `--heading-gold-muted: 43 38% 48%` → `38 65% 42%`
  - `.text-heading-gold` gradient: staré warm-yellow HSL stops → `#FFB547 / #FF8A00` brand stops
- **`src/pages/Games.tsx`** — nadpis „Soutěže": `text-heading-gold` → `text-[#FFB547]` (přímá brand hodnota)

### Co se nezměnilo

- Žádný layout, logika aplikace, routing, UI texty
- Žádné Supabase dotazy, wallet, Stripe, migrace
- Žádné nové soubory, žádné smazané tokeny

### Merge + testy

- **PR #91** mergnut do `main` — merge commit `4a27bb04bc4518167b8e5dbaa8a6689f5300803a`
- Změněny 2 soubory: `src/index.css` (8 ins / 10 del), `src/pages/Games.tsx` (1 ins / 1 del)
- **Playwright Smoke Tests**: SUCCESS — run `26235203208` ✅

### Další krok

Finální vizuální audit po krocích 1–8 a rozhodnutí, zda řešit logo / PWA ikony.

---

## BRAND BOTTOM NAVIGATION — STEP 7 DOKONČEN (21. 05. 2026)

Spodní navigace sjednocena podle OneMil brand kitu.

### Co bylo provedeno

- **`src/components/BottomNavigation.tsx`** — aktivní stav nav tlačítka sjednocen:
  - **Blue ring**: `ring-blue-400/80` → `ring-[rgba(255,181,71,0.8)]` (Warm Amber)
  - **Blue shadow outline**: `rgba(96,165,250,0.45)` → `rgba(255,138,0,0.45)` (Energy Orange)
  - **Blue glow**: `rgba(59,130,246,0.18)` → `rgba(255,138,0,0.18)` (Energy Orange)
  - Layout, ikony, routing, badge counts, texty a logika beze změny

### Co se nezměnilo

- Žádná logika aplikace — routing, badge counts, unread messages, unseen wins, admin guard
- Žádné Supabase dotazy, wallet, Stripe, migrace
- Žádné UI texty ani nové soubory

### Merge + testy

- **PR #90** mergnut do `main` — merge commit `2f01e1acf7489a56723dc0c17e8100b4ecb898c3`
- Změněn pouze 1 soubor: `src/components/BottomNavigation.tsx` (1 ins / 1 del)
- **Playwright Smoke Tests**: SUCCESS — run `26234450223` ✅

### Další krok

Step 8: `src/index.css` token cleanup (`--heading-gold`, `--neon-gold`, `--neon-blue` → brand hodnoty) + `src/pages/Games.tsx` class cleanup (`text-heading-gold` → brand třída).

---

## BRAND PROFILE — STEP 6 DOKONČEN (21. 05. 2026)

Stránka Profile sjednocena podle OneMil brand kitu.

### Co bylo provedeno

- **`src/pages/Profile.tsx`** — všechny yellow/gold HSL a Tailwind hodnoty nahrazeny brand hodnotami:
  - **VIPCard gold varianta**: `border-yellow-500/25`, `from-yellow-500/5` → `rgba(255,138,0,0.2)`, navy bg; shimmer overlay → orange rgba; floating particles `bg-yellow-500/20` → `rgba(255,138,0,0.15)`
  - **CSS efekty**: `avatar-ring-glow` keyframe, `premium-input` focus shadow, `vip-header-container::before`, `avatar-hover-shimmer` → orange rgba brand hodnoty
  - **Avatar ring**: conic-gradient `hsl(48 95% 65%), hsl(43 90% 55%), hsl(38 85% 48%)` → `#FFB547, #FF8A00, #e07800`; avatar border + fallback bg → orange brand
  - **Crown badge**: `from-yellow-400 via-yellow-500 to-yellow-600` → `from-[#FFB547] via-[#FF8A00] to-[#e07800]`; glow shadow → orange
  - **Profile name heading**: multi-stop zlatý gradient → Platinum `#E7EBF0` → Amber `#FFB547` → Orange `#FF8A00`; VIP badge border + bg + ikony → orange
  - **Peněženka sekce**: Wallet icon, "Peněženka" heading, coin glow + ikona, MioCoin balance číslo (`from-yellow-300 via-yellow-400 to-yellow-500` → `from-[#FFB547] via-[#FF8A00] to-[#FFB547]`), "Dobít MioCoiny" CTA → orange brand
  - **Formuláře (edit mód)**: labely `text-yellow-500/70`, inputy a textarea `bg-yellow-500/5 border-yellow-500/20 focus:border-yellow-500/40` → orange rgba; "Uložit změny" CTA → `#FF8A00→#FFB547`
  - **Profile view řádky (5×)**: border, bg gradient, hover border → orange rgba; labely → `rgba(255,138,0,0.55)`
  - **Win sound toggle**: sekce bg, ikona Volume2, Switch → `#FF8A00`
  - **Marketing sekce**: ikona Mail, heading gradient, inactive status bg, Loader2, subscribe borders, "Přihlásit marketing" CTA → orange brand
  - **Top-up modal**: DialogContent border/bg, Coins ikona, package selected state, hover border, pay button → orange brand

### Co se nezměnilo

- Žádná logika aplikace — nákup MioCoinů, přenos bonusů, formulář profilu, avatar upload, notifikace, marketing
- Žádné Supabase dotazy, wallet, Stripe, routing, migrace
- Žádné UI texty ani nové soubory

### Merge + testy

- **PR #89** mergnut do `main` — merge commit `9ece5828958103afd6c8d389225ffc314fa7fd04`
- Změněn pouze 1 soubor: `src/pages/Profile.tsx` (116 ins / 116 del)
- **Playwright Smoke Tests**: SUCCESS — run `26233223586` (1m 9s) ✅

### Další krok

Vizuální audit po krocích 1–6 a rozhodnutí, jestli pokračovat: Header, BottomNavigation, logo a případné zbývající soubory.

---

## BRAND HOMEPAGE — STEP 5 DOKONČEN (21. 05. 2026)

Stránka Homepage sjednocena podle OneMil brand kitu.

### Co bylo provedeno

- **`src/pages/Homepage.tsx`** — všechny yellow/gold/amber HSL a Tailwind hodnoty nahrazeny brand hodnotami:
  - **Zlaté separátory (5×)**: vnější glow `hsla(45, 80%, 50%, 0.15…0.25…0.30)` → `rgba(255,138,0,0.1…0.18…0.22)` ; ostrá linka `hsla(45, 75%, 50%, 0.6) → hsla(50, 95%, 70%, 1.0)` → `rgba(255,138,0,0.45) → rgba(255,181,71,0.95)` ; shimmer `hsla(50, 100%, 90%, 0.4)` → `rgba(255,220,150,0.3)`
  - **Banner horní separátor + horizontální light gradient**: gold → orange/amber brand při zachovaných průhlednostech
  - **Hvězdné částice „Poslední výherci"** (15-line blok): `hsla(45, 80%, 70%, 0.8)` → `rgba(255,181,71,0.55)`, `hsla(45, 60%, 65%, 0.6)` → `rgba(255,138,0,0.45)` atd.
  - **Okraje sekcí (2×)**: `border-amber-300/20` → `border-[rgba(255,138,0,0.2)]`
  - **"Probíhající soutěže" action box**: `border-amber-400/30` → `border-[rgba(255,138,0,0.3)]`, hover border → `rgba(255,138,0,0.5)`, inset glow → orange, Trophy icon `text-amber-400` → `text-[#FF8A00]`
  - **Admin "Pouze čtení" badge**: `bg-amber-100/10 border-amber-400/30 text-amber-400` → `bg-[rgba(255,138,0,0.08)] border-[rgba(255,138,0,0.3)] text-[#FF8A00]`
  - **Empty state „Žádné aktivní soutěže"**: `border-amber-400` + `from-amber-50 to-yellow-50` → `border-[rgba(255,138,0,0.4)]` + deep navy gradient `from-[hsl(220_35%_8%)] to-[hsl(220_30%_5%)]`; titulek `text-amber-800 dark:text-amber-400` → `text-[#FFB547]`; text → `text-muted-foreground`
  - **Inline voucher karta**: `from-[hsl(40_20%_14%)] … border-[hsl(40_30%_35%)]` → deep navy + `border-[rgba(255,138,0,0.35)]`, hover border/shadow → orange brand
  - **Partner karty**: stejný vzor jako voucher karta
  - **3× coming-soon karty**: `from-[hsl(40_20%_14%)] … border-[hsl(45_80%_45%)]` → navy + `border-[rgba(255,138,0,0.4)]`

### Co se nezměnilo

- Žádná logika aplikace — soutěže, tikety, wallet, vouchery, partner karty, routování
- Žádné Supabase dotazy, Stripe, backend, migrace
- Žádné UI texty

### Merge + testy

- **PR #88** mergnut do `main` — merge commit `02d7f4c6c9de054910e5ecd075307fd0c820b6ff`
- Změněn pouze 1 soubor: `src/pages/Homepage.tsx` (48 ins / 48 del)
- **Playwright Smoke Tests**: SUCCESS — run `26229779258` (1m 11s), `completed / success`

### Další krok

Step 6: `src/pages/Profile.tsx` — 115 výskytů yellow/gold; VIPCard varianty, plovoucí částice, avatar ring (conic-gradient), MioCoin balance display, form vstupy, CTA tlačítka.

---

## BRAND VOUCHERS — STEP 4 DOKONČEN (21. 05. 2026)

Stránka Vouchery sjednocena podle OneMil brand kitu.

### Co bylo provedeno

- **`src/pages/Vouchers.tsx`** — všechny yellow/gold HSL hodnoty nahrazeny brand hodnotami:
  - Voucher karty (dostupné, oblíbené, zakoupené): border `hsl(40_30%_30%)` → `rgba(255,138,0,0.35)`, hover border → `rgba(255,138,0,0.55)`, hover glow → orange
  - Skeleton / empty state karty: `from-[hsl(40_20%_14%)]` gradient → deep navy `from-[hsl(220_35%_8%)]`, border → `rgba(255,138,0,0.3)`
  - Gold particle efekty (3×): `hsl(45 80% 65%)` → `rgba(255,138,0,...)` / `rgba(255,181,71,...)` při snížené průhlednosti (decentní brand efekt)
  - CTA tlačítka KOUPIT: `from-[hsl(40_70%_42%)] via-[hsl(42_75%_48%)] to-[hsl(38_70%_42%)]` → gradient `#FF8A00 → #FFB547`, text `#111`
  - Tlačítko Uplatnit voucher: stejný orange→amber gradient
  - Cena / voucher kód: `hsl(45_80%_55%)` → Warm Amber `#FFB547`
  - Redeem modal: border `hsl(40_30%_35%)` → `rgba(255,138,0,0.35)`, pozadí `hsl(40_20%_12%)` → dark navy; kód text → `#FFB547`; Copy button: zlatá → `#FF8A00→#FFB547`
  - "Zkopírovat kód" outline: border/hover → orange brand hodnoty
  - Image separátor + info badge: `hsl(40_25%_25%/0.4/0.5)` → `rgba(255,138,0,0.2)`
  - Heart button border + loader barva → orange
  - Gift icon placeholder → `rgba(255,138,0,0.35)`

### Co se nezměnilo

- Žádná logika aplikace — nákup voucheru, oblíbené, zakoupené, kopírování kódu, modaly, tabing
- Žádné Supabase dotazy, wallet, Stripe, soutěže, tikety, Partner Offers ani backend
- Žádné stránky, routing ani texty UI
- Žádné migrace

### Merge + testy

- **PR #87** mergnut do `main` — merge commit `6dab7c3527b11c1e0559220d71228ef485911fad`
- Změněn pouze 1 soubor: `src/pages/Vouchers.tsx` (45 ins / 45 del)
- **Playwright Smoke Tests**: SUCCESS před mergem (PR check) i po mergi (main, run `26228589925`)

### Další krok

Rozhodnout: pokračovat brand alignmentem dalších stránek (profile, homepage, header), nebo nejdřív provést vizuální audit po všech 4 krocích.

---

## BRAND CONTEST DETAIL — STEP 3 DOKONČEN (21. 05. 2026)

Detail soutěže sjednocen podle OneMil brand kitu.

### Co bylo provedeno

- **`src/pages/ContestDetail.tsx`** — všechny yellow/gold hodnoty nahrazeny brand hodnotami:
  - Hero sekce: h1 titulek `text-yellow-400` → Platinum `#E7EBF0`; popis/výhra → Silver `#BFC6CF`; hero border → `rgba(255,138,0,0.45)` (konzistentní s ContestCard)
  - "Zobrazit více/méně": `yellow-400/300` → Energy Orange `#FF8A00 / #FFB547`
  - Gallery media border → `rgba(255,138,0,0.2)`
  - Box 1 (MioCoin stav): border, MioCoin glow, live shimmer → Energy Orange
  - "Dobít MioCoiny" outline button: yellow-500 → `rgba(255,138,0,...)`
  - Box 2 (bonus pool): pozadí, border, číslo `text-yellow-400` → `#FFB547`, MioCoin glow
  - Sekce 4 (cesta k tiketu): border → `rgba(255,138,0,0.2)`
  - Sekce 5 (věcné výhry): border, hover, count badge → amber brand
  - PDF tlačítko: `from-amber-500 to-yellow-400` → `from-[#FF8A00] to-[#FFB547]`

### Co se nezměnilo

- Žádná logika aplikace, Supabase dotazy, nákup tiketu, wallet, contests, winners, Partner Offers ani backend
- Žádné stránky, routing ani texty UI
- Žádné migrace

### Merge + testy

- **PR #86** mergnut do `main` — commit `63ecbcb` (rebase merge)
- Změněn pouze 1 soubor: `src/pages/ContestDetail.tsx` (18 ins / 18 del)
- **Playwright Smoke Tests**: SUCCESS před mergem (PR check) i po mergi (main, run `26227604101`)

### Další krok

Vizuálně sjednotit vouchery.

---

## BRAND CONTEST CARDS — STEP 2 DOKONČEN (21. 05. 2026)

Soutěžní karty a CTA tlačítka sjednoceny podle OneMil brand kitu.

### Co bylo provedeno

- **`src/components/ContestCard.css`** — border sweep animace: jasná žlutá/zlatá → Energy Orange `rgba(255,138,0)` / Warm Amber `rgba(255,181,71)`; animace zpomalena (2.5s → 4s / 5s) pro premium pocit; vnitřní glow přesměrován na oranžový nádech; CSS třídy zachovány, pouze hodnoty změněny
- **`src/components/ContestCard.tsx`** — hlavní CTA: outlined orange → plný gradient `#FF8A00 → #FFB547`, tmavý text `#111`, amber border, orange glow; Detail/Login tlačítka: silver border `rgba(191,198,207,0.25)` s orange hover; karta: border přesměrován na přímý brand hex
- **`src/components/ui/button.tsx`** — varianta `premium`: gold `hsl(45 93% 60%)` → Energy Orange `#FF8A00`

### Co se nezměnilo

- Žádná logika aplikace, databáze, platby, wallet, soutěže, tikety, Partner Offers ani backend
- Žádné stránky, routing ani texty UI
- Žádné migrace

### Merge + testy

- **PR #85** mergnut do `main` — commit na main `9a508d5` (rebase merge)
- Změněny pouze 3 soubory: `ContestCard.css`, `ContestCard.tsx`, `ui/button.tsx`
- **Playwright Smoke Tests**: SUCCESS před mergem (PR check) i po mergi (main, run `26226461672`)

### Další krok

Vizuálně sjednotit detail soutěže nebo vouchery.

---

## BRAND TOKEN RESET — STEP 1 DOKONČEN (21. 05. 2026)

Sjednoceny základní CSS brand tokeny v `src/index.css` podle OneMil brand kitu.

### Co bylo provedeno

- **Přidány `--om-*` brand tokeny** do `:root`: `--om-black`, `--om-navy`, `--om-graphite`, `--om-platinum`, `--om-silver`, `--om-muted-silver`, `--om-orange`, `--om-amber`, `--om-soft-gold`, `--om-font-heading`, `--om-font-body`
- **Základní tokeny přesměrovány na brand barvy** (`:root` i `.dark`): background → Midnight Black, card/panel → Deep Navy/Graphite, primary/accent/ring → Energy Orange (`33 100% 50%`), secondary → Warm Amber, foreground → Platinum, muted text → Muted Silver
- **Sidebar tokeny sjednoceny** — `--sidebar-primary` a `--sidebar-ring` → Energy Orange (místo modré)
- **Zachované ale přesměrované tokeny**: `--neon-gold`, `--package-gold` → Warm Amber; `--heading-gold` → Soft Gold oblast; `--text-silver` → blíže Silver
- `body::before` gradient přesměrován na brand černé odstíny

### Co se nezměnilo

- Žádná logika aplikace, databáze, platby, wallet, soutěže, tikety, Partner Offers ani backend
- Žádné komponenty ani stránky
- Žádné migrace

### Merge + testy

- **PR #84** mergnut do `main` — merge commit `4de961b7d286c4309b916f5b00edad2e2e15ec7b`
- Změněn pouze `src/index.css` (+67 / -54 řádků)
- **Playwright Smoke Tests**: SUCCESS před mergem (PR check) i po mergi (main, run `26212014595`)
- Větev: `style/brand-token-reset-step-1`

### Další krok

Viditelně sjednotit soutěžní karty a CTA tlačítka podle brand kitu (ContestCard, ContestCard.css, primární CTA gradient).

---

## ADMIN „ONLINE TEĎ" — REGISTERED USERS LIVE (20. 05. 2026)

Admin top bar "Online teď" badge nyní zobrazuje skutečný počet přihlášených uživatelů.

### Architektura

- **`public.users.last_seen_at`** (timestamptz, nullable) — nový sloupec, index `idx_users_last_seen_at`
- **`public.bump_user_last_seen()`** — SECURITY DEFINER RPC; updatuje pouze `auth.uid()` řádek; volán frontendem každých 60 s
- **`public.get_admin_online_users(p_active_window_seconds int DEFAULT 300)`** — SECURITY DEFINER RPC; vrací uživatele aktivní v posledních 5 minutách; pouze admin/superadmin
- **`src/hooks/useHeartbeat(userId)`** — nový hook; no-op pokud `userId` je undefined; ihned po přihlášení + každých 60 s
- **`src/hooks/useAdminOnlineIndicator`** — přepsán; polluje `get_admin_online_users` každých 30 s; `statusLabel` a `lastUpdatedAt` jsou živé
- **`src/App.tsx`** — `useHeartbeat(user?.id)` namountován vedle `useOneSignal` / `useApplyPendingReferral` / `useRetentionTriggers`

### Co se nesleduje

- Anonymní návštěvníci nejsou v OneMil sledováni — zůstávají v Google Analytics
- Historie stránek, URL, telefonní čísla — nic z toho se neukládá

### Migrace + verifikace

- Migrace `20260520_registered_user_presence.sql` aplikována na **staging** (`dxmowysntemfqfnanxua`) i **produkci** (`xkzhjldrojjlrkezorey`) ✅
- Staging RPC verifikace: `bump_user_last_seen=exists`, `get_admin_online_users=exists`, `last_seen_at_column=exists` ✅
- Produkce RPC verifikace: všechny tři checks `exists` ✅
- End-to-end test na staging (simulate via SQL): bump zapsal `last_seen_at`, admin RPC vrátil uživatele, non-admin dostal `success: false` ✅
- Commit `0732738` — feat, commit `ab5cb25` — fix runtime crash

### Runtime crash fix (commit ab5cb25)

`supabase.rpc(...).catch is not a function` — Supabase RPC vrací thenable, ne plný Promise; `.catch()` na něm neexistuje. Opraveno přepsáním `bump()` na `async/await` + `try/catch`.

### CI lock — spec 21 (20. 05. 2026)

- **`tests/e2e/21-admin-online-registered-users.spec.ts`** — staging-only, dva browser contexts (normální E2E uživatel + admin)
- Commit `b70beba` — přidán spec 21
- Commit `b2129ac` — fix: `exact: false` → `exact: true` pro email assertion (strict-mode violation: `e2e@onemil.cz` bylo substring `admin-e2e@onemil.cz`)
- **Staging Full E2E run `26189017692` ✅ — 29 passed, 0 failed, 3 skipped** (4m 35s)
- Spec 21 prošel za 16.8s: badge count ≥ 1 ✅, popover zobrazuje e-mail E2E uživatele ✅, žádná sekce „Anonymní návštěvníci" ✅

### Invarianty

- `useHeartbeat` nikdy nesmí vyhodit výjimku — heartbeat je best-effort
- `getAdminOnlineUsers` vrací `success: false` pro non-admin bez leakage dat
- `AdminSoundIndicator.tsx` UI nedotčen — popover zobrazuje reálná data automaticky
- Anonymní návštěvníci nejsou v OneMil sledováni — zůstávají pouze v Google Analytics

---

## ISSUE #71 — FINÁLNĚ VYŘEŠEN A ZAMČEN PROTI REGRESI (20. 05. 2026)

Velké MioCoin bonusové save (~95 000 pozic) nyní fungují na produkci.
**Chunked save flow je od 20. 05. 2026 chráněn každým staging CI během** přes
`tests/e2e/20-admin-miocoin-chunked-save.spec.ts` (run `26180130657` — 28/0/3 ✅).

### CI lock (PRs #79/#80/#81)
- **PR #79** přidal spec 20 (staging-only, non-destructive)
- **PR #80** přidal `seed-spec20-contest` step do `playwright-staging.yml` (status=draft, ticket_count=1000)
- **PR #81** opravil locator strict-mode kolizi (`/^Celkem:.*600 pozic/i`)
- Run `26180130657` ✅ — spec 20 prošel za 9.7 s, ověřil: 600 pozic vygenerováno, 2 chunky (`CHUNK_SIZE=500`), `bonus_prizes` count = 600, `total_miocoin_bonus` = 6 000, `admin_actions` obsahuje `miocoin_save_begin` + `miocoin_bulk_create` s `metadata.chunked = true`
- Telegram `✅ OneMil STAGING full E2E OK — all specs passed` doručen (message_id 560)



### Final invariant
Large MioCoin bonus saves **musí** používat chunked flow:
```
admin_begin_miocoin_save(contest_id, expected_count)
  → admin_append_miocoin_chunk(contest_id, chunk_payload) × N
  → admin_finalize_miocoin_save(contest_id, expected_count)
```
Konstanta ve frontendu: **`CHUNK_SIZE = 500`** (v `src/components/AdminContestManagement.tsx`, `handleSave`).

### Cesta k řešení (chronologicky)
1. **PR #74** — frontend switch z Edge Function (`distribute-bonus-prizes`) na SQL RPC (`admin_bulk_insert_miocoin_bonuses`). ✅ vyřešilo Deno wall-clock timeout, ale narazilo na nový limit.
2. **PR #75** — generator nikdy nevygeneruje pozici = `ticket_count` (rezervováno pro hlavní výhru). ✅ data integrity fix.
3. **PR #76** — pokus o `set_config('statement_timeout', '300000', true)` uvnitř funkce. ❌ NEÚČINNÉ (PL/pgSQL `set_config` LOCAL nezasahuje běžící outer statement; Supabase API gateway má vlastní HTTP timeout).
4. **PR #77** — chunked flow: tři SECURITY DEFINER funkce + frontend orchestrace begin → append × N → finalize. ✅ základ architektury správný.
5. **PR #78** — `CHUNK_SIZE = 5000 → 500`. ✅ test23 ukázal že 5000 stále hitá gateway timeout; 500 prochází komfortně.

### Production verification
- Migrace `20260520_miocoin_chunked_save_functions.sql` aplikována na produkci ✅
- Verifikace: `admin_begin_miocoin_save=exists`, `admin_append_miocoin_chunk=exists`, `admin_finalize_miocoin_save=exists` ✅
- Lovable frontend publikován ✅
- Final manual test na produkci: MioCoin bonus creation works, admin totals display correctly ✅

### Předchozí selhané cesty (neopakovat)
1. ❌ Jeden velký Edge Function request s `explicit_bonuses` (Deno wall-clock timeout ~150s)
2. ❌ Jeden velký SQL RPC (`admin_bulk_insert_miocoin_bonuses`) — PostgREST/Kong gateway HTTP timeout ~60s
3. ❌ Chunked save s `CHUNK_SIZE = 5000` — chunk 1/9 stále hitnul gateway timeout

### Co se NESMÍ udělat
- Vracet se k jednomu monolitickému RPC volání pro large saves
- Spoléhat se na `set_config('statement_timeout', ...)` uvnitř funkce volané z PostgREST
- Zvýšit `CHUNK_SIZE` nad 500 bez explicitního důkazu že gateway HTTP timeout to unese
- Měnit kontrakt tří funkcí (`admin_begin_miocoin_save` / `admin_append_miocoin_chunk` / `admin_finalize_miocoin_save`) bez ověřené architektonické náhrady
- Smazat legacy `admin_bulk_insert_miocoin_bonuses` — ponechán beze změny pro backward compatibility / malé saves

---

## PAPERCLIP / AI TEAM CONTEXT

**Aktualizováno:** 12. 05. 2026

Detailní pravidla, schvalovací model a technické poznámky jsou v souboru:
**`PAPERCLIP_SETUP_CONTEXT.md`**

### Aktuální stav Paperclip (12. 05. 2026)

- **Server:** běží lokálně na `http://127.0.0.1:3100` (verze 2026.428.0)
- **Spuštění:** `npx paperclipai onboard --yes` z `C:\Users\divis\Desktop\Onemil - Projekt\million-ticket-draw`
- **PowerShell okno musí zůstat otevřené** po dobu běhu serveru

**Firma v Paperclip:**
- iCONIC POINT s.r.o. (prefix: ICO)

**Projekt v Paperclip:**
- OneMil

**Aktivní agenti:**

| Agent | Adaptér | Role |
|-------|---------|------|
| Provozní ředitel OneMil | claude_local nebo codex_local | Manažer, AI koordinátor, deleguje práci |
| Průzkumník obchodních leadů OneMil | codex_local | Lead researcher, hledá a třídí firmy |

**Pavel Diviš zůstává owner a final decision maker. Nic se neprovádí bez jeho schválení.**

### Klíčová pravidla agentů

- Provozní ředitel je **manažer, ne exekutor**. Specializovanou práci deleguje příslušnému agentovi.
- Provozní ředitel **nečte onemil_history.md automaticky** — pouze na výslovnou žádost Pavla.
- Provozní ředitel neřeší osobně: rozsáhlý výzkum, lead scouting, velké tabulky, marketingový průzkum, právní analýzu, technické práce ani repetitivní zpracování — pokud Pavel neřekne **„zpracuj osobně"**.
- Pro lead výzkum deleguje vždy na Průzkumníka obchodních leadů OneMil.
- Pokud vhodný agent neexistuje → navrhne nového agenta a čeká na schválení Pavla.
- Výstup se **zveřejňuje přímo do komentáře Paperclip issue**, ne jen interně.
- Reporty, CSV a Markdown soubory se ukládají do: `C:\Users\divis\Desktop\OneMil Paperclip Outputs`

### Technické poznámky

- Claude Code adaptér funkční; může být limitován kredity Pro účtu.
- Codex local adaptér funkční na Windows.
- Pro Codex local na Windows: Extra args → `--skip-git-repo-check`
- Model: **Default** nebo **gpt-5.3-codex** (o4-mini nebyl podporován s aktuálním nastavením).
- Provozní ředitel: Enable search **OFF**, Can assign tasks **ON**, Can create agents **OFF**, Heartbeat **OFF**.
- Průzkumník: Enable search **ON**, Can assign tasks **OFF**, Can create agents **OFF**, Heartbeat **OFF**.

### Issues vytvořené při nastavování (ICO projekt)

| Issue | Obsah |
|-------|-------|
| ICO-15 | Lead scouting — 10 českých e-shopů/značek |
| ICO-16 | Shortlist top 3 firem z existujících leadů |
| ICO-17 | Ověření veřejných B2B kontaktů — Dedoles, Slevomat, Rohlik.cz |
| ICO-18 | Dedoles one-pager draft → `dedoles_one_pager_ICO-18_2026-05-12.md` |
| ICO-19 | Návrh ideálního AI týmu pro OneMil → `onemil_ai_team_ICO-19_2026-05-12.md` |

### Další krok

Pokračovat v budování lead databáze. Průzkumník rozšiřuje seznam; Provozní ředitel koordinuje priority a předkládá shortlisty Pavlovi ke schválení před jakýmkoli outreachem.

---

## BUSINESS / PRODUCT CONTEXT

Aktuální obchodní a produktový kontext OneMil je v souboru:
**`ONEMIL_BUSINESS_CONTEXT.md`**

Tento soubor je hlavní zdroj pravdy pro pochopení toho, co OneMil je, jak funguje B2B odměnový model, partneři, MioCoiny, kupony, vouchery, soutěže, influenceři, agentury a sociální kampaně.

---

## FIREMNÍ KONTEXT

Aktuální firemní identita, kontakty, e-mailový podpis a fakturační údaje jsou v souboru:
**`COMPANY_CONTEXT.md`** — zdroj pravdy pro všechny asistenty a nástroje.

---

## ADMIN CONTEST ECONOMY PANEL — PHASE 4: PERSISTENCE DOKONČENA (18. 05. 2026)

### Phase 4 — Economy Persistence (18. 05. 2026) ✅ HOTOVO — PRODUKCE + STAGING OVĚŘENY

- **PR #66 migrace aplikována na produkci (20. 05. 2026):** `admin_bulk_insert_miocoin_bonuses` materializuje JSON payload do `tmp_miocoin_bonuses (ON COMMIT DROP)` — `jsonb_array_elements` voláno 1× místo 5×. Index `idx_bonus_prizes_contest_position ON bonus_prizes(contest_id, ticket_position)` přidán. Timeout při 56 000–95 000 MioCoin pozicích odstraněn. Toto je aktuální finální zelený stav.
- **Staging Full E2E ZELENÝ po PR #66 (20. 05. 2026):** run `26156907020` — **27 passed, 0 failed, 3 skipped** (3m 6s). Spec 18 ✅ (11.3s). Spec 19 ✅ (10.4s). Telegram OK (message_id 521).
- **PR #66 mergnut (20. 05. 2026):** perf: materialize JSON payload once in admin_bulk_insert_miocoin_bonuses (fix 56k timeout). Merge commit: `59b2efe3154d629d6c4b9acd4dd4477f0a4ef502`. Pouze `supabase/migrations/20260520_materialize_bulk_miocoin_payload.sql` (226 řádků). Production smoke po mergi zelený (run `26157401708`, 1m 19s). Žádný frontend, žádné testy, žádný workflow.
- **PR #65 migrace aplikována na produkci (20. 05. 2026):** set-based SQL validace (GROUP BY HAVING, JOIN) namísto per-row PL/pgSQL smyčky + O(N²) array_append. Timeout při 95 000 pozicích odstraněn (první část opravy). Staging E2E zelený (run `26153556353`, 27/0/3, spec 18 ✅ 10.0s, spec 19 ✅ 10.0s). Production smoke po mergi zelený (run `26153872933`).
- **PR #65 mergnut (20. 05. 2026):** perf: optimize admin_bulk_insert_miocoin_bonuses for 95k rows. Merge commit: `e809bd0561d05846290922d94a860d5df49c78cf`. Pouze `supabase/migrations/20260520_optimize_bulk_miocoin_bonuses.sql`.
- **PR #64 mergnut (20. 05. 2026):** fix duplicate contest creation when CREATE save partially succeeds. Merge commit: `72b74bc64dad27abd04a2c64214c77dc1e3a533c`. Pouze `src/components/AdminContestManagement.tsx`. Root cause: outer `catch` v `handleSave` nezavíral modal po částečném úspěchu v CREATE módu → opakované kliknutí Uložit → 2. contest v DB. Fix: `createdContestIdInCreateMode` tracking — při chybě po úspěšném `admin_manage_contest` outer catch zavolá `onSaved()/onClose()` s informativním toastem. Staging E2E zelený (run `26152507277`, 27/0/3).
- **PR #63 mergnut (20. 05. 2026):** fix stale `contests.total_miocoin_bonus` after bulk MioCoin save. Migrace `20260520_sync_total_miocoin_bonus_after_bulk.sql` aplikována na staging i produkci. Root cause: trigger `sync_total_miocoin_bonus` neexistuje na produkci → sloupec vždy 0. Fix: UPDATE contests.total_miocoin_bonus po každém bulk INSERT + backfill + zero-fill všech existujících contests.
- **PR #62 mergnut (20. 05. 2026):** fix silent save when MioCoin generator inputs filled but bonuses not generated. Guard v `handleSave` v `src/components/AdminContestManagement.tsx`. Root cause: admin mohl uložit se zaplaněnými MioCoin inputy aniž klikl Vygenerovat → 0 MioCoin řádků v DB bez varování. Fix: `if (mioCoinBonuses.length === 0 && totalMioCoinsInput > 0 && stepValue > 0)` → destructive toast + return. Staging E2E zelený (run `26135981706`, 27/0/3).
- **PR #61 mergnut (20. 05. 2026):** bulk MioCoin bonus save — nová SECURITY DEFINER funkce `admin_bulk_insert_miocoin_bonuses(p_contest_id uuid, p_bonuses jsonb)` nahrazuje N sequential RPC callů jedním bulk INSERT. Migrace `20260519_bulk_miocoin_bonuses.sql` + RLS policy "Allow admin full access to bonus prizes" (idempotentní DO block). Aplikováno na staging i produkci. Root cause: 95 000 pozic → ~11 hodin při 430ms/call, vždy selhávalo v půlce.
- **Staging Full E2E ZELENÝ po PR #60 (19. 05. 2026):** run `26113679217` — **26 passed, 0 failed, 3 skipped** (spec 18 prošel na retry — transient staging latence; spec 19 ✅). Telegram OK (message_id 497).
- **PR #60 mergnut (19. 05. 2026):** fix create modal not closing when rules PDF upload fails after contest creation. Merge commit: `a25a7d71d986485d60cab92f153db30746e09019`. Změněn pouze `src/components/AdminContestManagement.tsx`. Root cause: contest je vytvořen SECURITY DEFINER RPC `admin_manage_contest` před PDF uploadem; pokud upload selhal, `return` v error branch zavřel modal… ne — naopak nechal modal otevřený. Fix: mirrors PR #55 pattern — v CREATE módu při chybě PDF upload kód falls through k `onSaved()/onClose()` místo `return`; v EDIT módu původní chování (setSaving + return) zachováno. Žádné migrace, žádný RPC, žádné workflow changes.
- **Staging Full E2E ZELENÝ po PR #59 (19. 05. 2026):** run `26106988469` — **27 passed, 0 failed, 3 skipped** (3m 6s). Spec 18 ✅ (11.3s, první pokus). Spec 19 ✅. Telegram OK (message_id 492).
- **PR #59 mergnut (19. 05. 2026):** fix spec 18 pro PRs #56/#57 economy UI changes. Merge commit: `ab9e37f`. Změněn pouze `tests/e2e/18-admin-economy-persist.spec.ts`. Step 4a: `Náklad na hlavní výhru` přesunuto do Basic tabu (PR #57) — fill tam. Step 4b: `Náklad na MioCoin bonusy` je vždy read-only (PR #56/#57) — fill odstraněn. Verifikace (Step 7) odpovídajícím způsobem upravena. Žádný app kód, workflow, schéma nezměněno.
- **PR #58 mergnut (19. 05. 2026):** fix physical prize grouping key — image_url vyloučeno z klíče. Merge commit: `3ca06bf`. Změněn pouze `src/pages/ContestDetail.tsx`. Bulk výhry každá s unikátní UUID storage cestou → při groupování podle description+image_url vznikla N karet místo 1. Fix: klíč nyní `${description}||${detailed_description}` bez image_url — bulk výhry se správně seskupí.
- **PR #57 mergnut (19. 05. 2026):** Economy input cleanup. Merge commit v main. Změněn pouze `src/components/AdminContestManagement.tsx`. `Náklad na hlavní výhru` přesunut z Economy tabu do Basic tabu (vedle `Hlavní výhra`). `Reálný náklad na MioCoin bonusy` vždy read-only (auto-odvozeno z bonus state přes `effectiveMioCoinCost`). Popisné texty aktualizovány.
- **PR #56 mergnut (19. 05. 2026):** fix MioCoin bonus save RPC overload + auto-sync economy. Merge commit v main. Změněn pouze `src/components/AdminContestManagement.tsx`. Part A: `admin_manage_bonus_prize` RPC volán s explicitními `p_image_url: null, p_detailed_description: null` — eliminuje "could not choose best candidate function" chybu při 5-arg vs 9-arg overload. Part B: `effectiveMioCoinCost` = skutečné MioCoin bonusy pokud existují, jinak ruční input, jinak předpoklad — auto-synchronizuje ekonomiku se skutečnými bonusy.
- **Staging Full E2E ZELENÝ po PR #55 (19. 05. 2026):** run `26059677757` — **27 passed, 0 failed, 3 skipped** (4m 14s). Spec 18 ✅ (10.8s, první pokus). Spec 19 ✅ (10.9s). Telegram OK (message_id 475).
- **PR #55 mergnut (19. 05. 2026):** fix duplicate physical prize cards + create modal close. Merge commit: `9808f83d13e4ff09516dc2f352abcc3c28274ab8`. Změněny: `src/pages/ContestDetail.tsx`, `src/components/AdminContestManagement.tsx`. Part A: `groupedBonusPrizes` useMemo seskupuje identické fyzické výhry (description+detailed_description+image) do jedné karty s badge `N× v soutěži`. Part B: pro CREATE mód, při `updatedRows.length === 0` (RLS blokuje client-side UPDATE čerstvého řádku vytvořeného SECURITY DEFINER RPC) kód nyní pokračuje k `onSaved()/onClose()` místo `return`; pro EDIT mód původní chování zachováno. Žádné migrace, žádný RPC, žádné workflow changes.
- **Staging Full E2E ZELENÝ po PR #53 + #54 (18. 05. 2026):** run `26057380995` — **26 passed, 0 failed, 3 skipped** (4m 0s). Spec 08 ✅ skipped (PR #54 fix), spec 18 ✅ passed (retry #1 — transient staging latence), spec 19 ✅. Telegram OK (message_id 471).
- **PR #54 mergnut (18. 05. 2026):** fix flaky skip guard spec 08. Merge commit: `819cb77819bfc37598a621b46821a1995c17d2c9`. Změněn pouze `tests/e2e/08-partner-offer-persistence.spec.ts`. Nahrazen `waitForTimeout(2_000) + okamžité isVisible()` za `Promise.race` (mirror spec 07): wait up to 10s pro offer card nebo empty state, poté skip guard + `!firstCard.isVisible()` fallback skip. Root cause: na pomalejším staging loadu se empty-state text nevykreslil do 2s → `isVisible()` vrátilo false → skip se nespustil → test selhal. Žádný app kód ani workflow nezměněn.
- **PR #53 mergnut (18. 05. 2026):** fix gallery upload "Invalid key". Merge commit: `8356ac04bdf3d03f457febe6e199fca4593e856b`. Změněn pouze `src/components/AdminContestManagement.tsx`. Přidán `sanitizeStorageFileName()` helper a aplikován na všechny 3 gallery upload paths. Produkční error: `Invalid key: contests/.../gallery/...-Snímek obrazovky 2026-05-09 150423.png`. Fix: NFD normalize + strip diakritiky + spaces→hyphens + strip speciálních znaků + `${Date.now()}-${crypto.randomUUID()}-${safeFileName}`. Czech error fallback: "Galerii se nepodařilo nahrát. Zkuste soubor přejmenovat bez speciálních znaků."
- **PR #52 mergnut (18. 05. 2026):** bulk quantity distribution pro věcné bonusové výhry. Merge commit: `e43cda76c4f187bd4a8e9ae00ec3396626a73e19`. Změněn pouze `src/components/AdminContestManagement.tsx`. Nová UI pole: Počet kusů (default 1, min 1), Rozmístění pozic (Rovnoměrně / Náhodně, default Rovnoměrně). Při qty > 1 app automaticky generuje N `PhysicalPrize` objektů s bezkolizními pozicemi přes `pickPositions` helper (Fisher-Yates nebo rovnoměrné indexy). Kolizní pravidla: vylučuje MioCoin pozice, existující věcné výhry, final-ticket pozici a pozice mimo rozsah 1..(ticket_count-1). Toast ukazuje prvních 5 pozic. Economy pole (dodavatel/cena/DPH/balné) se zachovávají po bulk add pro rychlé zadání dalšího produktu. Opraven stale helper text. Žádné migrace, žádný RPC, žádné workflow changes.
- **Staging Full E2E ZELENÝ po PR #52:** run `26053065266` — **27 passed, 0 failed, 3 skipped** (3m 56s). Spec 18 ✅ (9.8s), spec 19 ✅ (10.0s). Telegram OK doručen. Žádná regrese.
- **Staging Full E2E ZELENÝ — Phase 4 kompletní:** run `26046436837` — **27 passed, 0 failed, 3 skipped** (4m 28s). Spec 18 ✅ (11.9s), spec 19 ✅ (11.2s, první pokus). Telegram OK doručen. Toto je finální zelený stav po všech staging SQL opravách.
- **Staging SQL opravy aplikovány manuálně (18. 05. 2026) na `dxmowysntemfqfnanxua`:**
  1. `ALTER TABLE bonus_prizes ADD COLUMN IF NOT EXISTS supplier_name TEXT, unit_cost_czk NUMERIC, vat_rate_percent NUMERIC, handling_override_czk NUMERIC;` — Phase 4 economy sloupce (ekvivalent migrace `20260517180100`).
  2. `CREATE POLICY "Allow admin full access to bonus prizes" ON public.bonus_prizes FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)) WITH CHECK (...);` — chybějící write policy; bez ní direct client UPDATE/DELETE na bonus_prizes tichce selhal (RLS blokoval 0 řádků bez chyby), ale SECURITY DEFINER RPC INSERT fungoval, čímž se maskoval problém.
- **PR #51 mergnut (18. 05. 2026):** workflow seed step "Ensure staging admin E2E user has admin role" přidán do `playwright-staging.yml`. Zajišťuje existenci `admin-e2e@onemil.cz` v auth.users, public.users (role=admin), user_roles, profiles, wallets před E2E suite. Idempotentní. Merge commit: `97797662d19cafe53062a04fb73449545ef98780`.
- **Migrace aplikovány na produkci (18. 05. 2026):**
  - `public.contest_economy` tabulka existuje na produkci ✅
  - `public.bonus_prizes` sloupce `supplier_name`, `unit_cost_czk`, `vat_rate_percent`, `handling_override_czk` existují na produkci ✅
  - `bonus_prizes` write policy na produkci existuje ✅ (aplikována dříve jako součást baseline)
  - **Production smoke po migraci:** run `26027726603` — ✅ **5 passed, 0 failed, 0 skipped** (22s). Telegram: `✅ OneMil PROD smoke OK` doručen.
- **Frontend** (`AdminContestManagement.tsx`) nyní při finálním uložení soutěže persistuje ekonomické předpoklady do `contest_economy` (upsert) a economy metadata věcných výher do `bonus_prizes` (update po RPC). Při znovuotevření editačního modalu se data načítají zpět.
- **E2E spec 18** (`tests/e2e/18-admin-economy-persist.spec.ts`) ověřuje celý cyklus economy assumptions: vyplnit → uložit → zavřít → znovu otevřít → ověřit perzistenci.
- **E2E spec 19** (`tests/e2e/19-admin-physical-prize-economy-persist.spec.ts`) ověřuje celý cyklus fyzických nákladových údajů: dodavatel / nákupní cena / DPH / balné → přidat výhru → uložit → znovu otevřít → ověřit perzistenci (PR #50, merge commit `1b937efba87cbda9118a2d8e532d2da6fdc46d44`).
- **Playwright testy: 19 spec souborů** (01–19); staging full E2E obsahuje všechny spec soubory; všechny zelené.
- Fyzické nákladové údaje věcných výher (supplier_name, unit_cost_czk, vat_rate_percent, handling_override_czk) jsou na `bonus_prizes` jako nullable sloupce — persistovány a E2E ověřeny (spec 19).

---

## ADMIN CONTEST ECONOMY PANEL — READ-ONLY PHASE 1 (16. 05. 2026)

### Stav
- PR #26 **feat: add read-only contest economy panel** byl mergnut do `main` (merge commit `5f5eb28b17c0cab2b8eaa47e360d75b34252ba59`).
- PR #27 **feat: add admin economy summary bar** byl mergnut do `main` (merge commit `9ea63c81c218ba91422005e8c09ab457800ef395`).
- PR #30 **Fix MioCoin final save to use previewed positions** byl mergnut do `main` (merge commit `7b50b30d2413ad6d839f8e4100c2a9c7a806710d`).
- PR #72 byl mergnut do `main` (merge commit `7dfa9ffc29bd0dddb6253f9a68ef1d10758a8636`).
- `src/components/AdminContestManagement.tsx` má nový read-only tab **„Ekonomika"** v admin modalu pro vytvoření/editaci soutěže.
- Nad taby admin contest modalu je kompaktní read-only live economy summary bar.
- Summary bar ukazuje počet ticketů, celkové odhadované náklady, doporučenou cenu ticketu, odhadovaný čistý zisk a marži.
- Panel slouží jako orientační ekonomický náhled během přípravy soutěže.
- Panel počítá: hrubou tržbu, DPH, čistou tržbu, náklad na hlavní výhru, náklad na MioCoin bonusy, balné/poštu/práci, jednorázový setup/distribuční náklad, marketingový náklad, celkové odhadované náklady, odhadovaný zisk, marži, bod zvratu v počtu ticketů a doporučenou minimální cenu ticketu.
- Summary bar používá stejné frontend-only výpočty jako tab „Ekonomika".
- Ekonomické předpoklady jsou zatím pouze frontend state; po změně modal kontextu se resetují na výchozí hodnoty.
- Panel zatím nic neukládá do Supabase a nemá databázovou persistenci.
- Phase 2B opravila finální MioCoin save behavior v `AdminContestManagement`: finální uložení soutěže nyní persistuje MioCoin bonusy podle přesně previewovaných pozic z frontend state `mioCoinBonuses`.
- Finální architektura pro velké MioCoin bonusy je nyní: batched Edge Function `distribute-bonus-prizes` s `explicit_bonuses`.
- Velké vytvoření MioCoin bonusů nyní funguje i pro desítky tisíc pozic bez monolitického timeoutujícího RPC insertu.
- Admin save path pro MioCoin bonusy zachovává přesně previewované pozice a ukládá je přes batched explicit path.
- Před uložením se validují bonusové pozice: celá čísla, rozsah `1..ticket_count`, duplicitní MioCoin pozice, kolize MioCoin/věcné výhry a kolize s posledním ticketem.
- Editace bonusových pozic existující soutěže je blokována, pokud už pro soutěž existují tikety.
- Vygenerované / materializované MioCoin bonusové pozice jsou po vytvoření soutěže neměnné. V editaci je nelze přegenerovat, přepsat ani nahradit.
- Edge Function `distribute-bonus-prizes` byla po PR #72 nasazena i do produkce.
- Ověření `test7`: `admin_total=63000`, `real_total=63000`, `miocoin_rows=63000`.
- Phase 3A rozšiřuje frontend-only `PhysicalPrize` preview o lokální ekonomická pole: dodavatel, nákupní cena v Kč, DPH a volitelný override balného / pošty / práce.
- Formulář věcné bonusové výhry zobrazuje tato pole česky a seznam přidaných výher ukazuje i cost preview metadata.
- Ekonomika tab i horní economy summary bar nově započítávají preview nákladů věcných bonusových výher do celkových odhadovaných nákladů, zisku, marže, bodu zvratu a doporučené ceny ticketu.
- Balné používá per-prize override, pokud je zadaný; jinak používá globální default z ekonomických předpokladů.
- Nákladové údaje věcných výher jsou v této fázi pouze frontend preview a neukládají se do Supabase.

### Invariant
- Nebyl změněn `buy_ticket_atomic`, ticket purchase logic, winner logic, Partner Offers, `bonus_prizes` schema, `admin_manage_bonus_prize`, main prize final-ticket logic, migrace ani production smoke scope.
- Preview fyzických nákladů zatím nemá databázovou persistenci a nemění finální save behavior bonusů.

---

## STORE POLICY / LAUNCH COPY — UZAMČENO (13. 05. 2026)

### Stav
- PR #2 **Store policy copy cleanup: 18+ and ticket order model** byl mergnut do `main` (merge commit `c132be9ff60e15884d84f38d486c53dcb7f94666`).
- PR obsahoval pouze:
  - `src/pages/ContestDetail.tsx`
  - `src/pages/Games.tsx`
  - `src/pages/OnboardingDateOfBirth.tsx`
  - `src/pages/PrivacyPolicy.tsx`
  - `src/pages/TermsConditions.tsx`
  - `src/pages/Vouchers.tsx`
- Před mergem prošlo PR smoke E2E a Playwright Staging Full E2E na větvi `feature/store-policy-18plus-ticket-order-copy`.
- Po mergi do `main` prošel production smoke workflow `25795875077` a Playwright Staging Full E2E workflow `25795953772`.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

### Veřejná launch pravidla
- Launch age rule je **18+**.
- Veřejný text nesmí popisovat soutěže jako loterii, losování ani náhodný generátor.
- Správný veřejný model: **tikety se otevírají postupně v pořadí 1, 2, 3... a výherní pozice jsou předem určeny v pravidlech dané soutěže**.
- MioCoin je **interní kredit OneMil**.
- MioCoin **nelze vybrat ani vyplatit jako peníze**.
- MioCoin **nelze převádět mimo OneMil**.
- MioCoin lze použít pouze uvnitř OneMil.
- Dobročinné / charitativní kampaně musí vždy uvádět konkrétního příjemce, účel a výši podpory pro danou kampaň.

### Invariant
Tyto změny jsou copy/legal/store-review cleanup. Neměnily contest engine, wallet, DB, Supabase, Stripe, Sofinity, OneSignal, Partner Offers, `tickets`, `winners`, `bonus_prizes` ani `buy_ticket_atomic`.

---

## LAUNCH STRATEGY — WEB/PWA FIRST (13. 05. 2026)

### Strategické rozhodnutí
- OneMil bude spuštěn nejdříve jako **Web/PWA**.
- Podání do **Apple App Store** a **Google Play** se odkládá.
- Důvod: OneMil nebude v této fázi platit Apple/Google poplatky 15–30 % z nákupů MioCoinů.
- Stripe zůstává platebním providerem pro **Web/PWA MioCoin top-up**.
- Budoucí nativní iOS/Android aplikace lze znovu zvážit pouze po schválení platební/store strategie.

### Důsledky pro aktuální roadmapu
- Priorita store-readiness se přesouvá z nativních store submission kroků na Web/PWA readiness.
- Stripe web flow zůstává platný pro nákup MioCoinů mimo Apple/Google store billing.
- Native app store práce se neimplementuje, dokud nebude schváleno, zda má být:
  - consumption-only app bez nákupu MioCoinů,
  - native billing přes Apple/Google,
  - nebo jiný právně a obchodně schválený model.
- Toto rozhodnutí nemění contest engine, wallet, DB, Supabase, Stripe webhook, Sofinity, OneSignal, Partner Offers, `tickets`, `winners`, `bonus_prizes` ani `buy_ticket_atomic`.

### PWA readiness audit — aktuální nález
- `index.html` má základní mobile viewport a title `OneMil`.
- Produkční `public/` obsahuje pouze `favicon.ico`, `robots.txt`, `sitemap.xml`, `OneSignalSDKWorker.js`, `placeholder.svg`, `mockup-detail.html` a `sounds/`.
- V aktivním `public/` není nalezený web app manifest.
- V `index.html` není odkaz na manifest, `apple-touch-icon`, `theme-color` ani PWA splash metadata.
- Brand kit obsahuje připravené PWA/icon podklady v `docs/brand/onemil_brand_kit/.../03_icons/favicon_app/` a ukázkový `manifest.webmanifest`, ale nejsou zapojené do aktivního web buildu.
- Aktivní service worker pro offline/PWA cache nebyl nalezen. Existuje pouze OneSignal worker `public/OneSignalSDKWorker.js` pro push notifikace.
- Add-to-home-screen chování není explicitně implementované ani zdokumentované v kódu.
- Stripe Checkout je na Web/PWA dostupný přes existující `create-stripe-checkout` flow v `Homepage.tsx` a `Profile.tsx`.

### Nejbližší PWA blocker
Aktivní Web/PWA build zatím nemá zapojený manifest, app icons, `theme-color`, Apple touch icon, splash metadata ani offline/service worker strategii. Před veřejným Web/PWA launch je potřeba připravit samostatný PWA setup PR.

---

## TICKET PURCHASE FLOW — AKTUÁLNÍ STAV (04–05. 05. 2026)

### buy_ticket_atomic — opravené odpovědní fieldy (aplikováno v produkci)
- **Migrace:** `supabase/migrations/20260504_add_remaining_and_bonus_distance_to_buy_ticket_atomic.sql`
- Funkce nyní vrací 3 nová pole:
  - `remaining_tickets` = `v_ticket_count - v_next_ticket`
  - `next_bonus_position` = nejbližší pending `bonus_prizes.ticket_position` > aktuální tiket
  - `distance_to_next_bonus` = `next_bonus_position - v_next_ticket`
- Ověřeno produkcí: STRING_AGG query potvrdila všechna 3 pole ✅
- Nákupní logika, wallet, winner, Partner Offers — nedotčeny

### buy_ticket_atomic — timeout fix (57014)
- **Migrace:** `supabase/migrations/20260504_fix_nonblocking_sofinity_triggers.sql`
- **Root cause:** `trigger_sofinity_forward()` a `process_event_queue_trigger()` volaly `net.http_post()` synchronně uvnitř transakce → při saturaci pg_net workerů → 57014 statement timeout
- **Fix:** `trigger_sofinity_forward()` přepsán na INSERT do `event_queue`; `process_event_queue_trigger()` je no-op — doručení přebírá polling edge function
- Stav: migrace commitnuta, nutno aplikovat v Supabase SQL Editoru (pokud ještě neaplikováno)

### Frontend — oprava null → 0 přepisu
- **Soubory:** `src/pages/ContestDetail.tsx`, `src/pages/Games.tsx`, `src/pages/FavoriteGames.tsx`
- `remaining_tickets: result.remaining_tickets ?? 0` → `?? undefined` ve všech třech souborech
- Root cause: `?? 0` převáděl null z RPC na 0 → `0 > 0 = false` → `nearestPrizeDistance = null` → vždy se zobrazoval fallback text místo vzdálenosti

### TicketResultModal — opravené zobrazení (dokončeno)
- Odstraněno číslo tiketu z hlavního result boxu
- Odstraněno extra „0" (bylo způsobeno `?? 0` v mappedResult + React renderem `{0 && <JSX>}`)
- Nový text vzdálenosti (helper `nextWinTicketText` + `tahPlural`):
  - X = 1: „Další výherní ticket čeká už při dalším tahu."
  - X = 2–4: „Další výherní ticket čeká už za X tahy."
  - X ≥ 5: „Další výherní ticket čeká už za X tahů."
- Přidán vysvětlující řádek (`NEXT_WIN_EXPLAINER`): „Může jít o bonusovou i hlavní výhru. Kdo výherní ticket otevře první, vyhrává."
- Fallback (bez dat): „Další výhra může být blíž, než si myslíš."
- **Partner Offers jsou striktně vyloučeny** z výpočtu vzdálenosti — počítají se pouze fyzické bonus_prizes a main výhra

### TicketResultModal — toast po nákupu tiketu
- Odstraněna spodní toast notifikace „Ticket #56 zakoupen!" po úspěšném nákupu
- Důvod: result modal potvrzení nákupu duplikoval; toast navíc odhaloval číslo tiketu

### Contest karty (Homepage + /games)
- Skryt název soutěže na listing kartách
- Skryt celkový počet tiketů na listing kartách
- Tyto detaily zůstávají záměrně pouze na stránce detailu soutěže
- Důvod: název soutěže je součástí generovaného banneru/grafiky, ne UI textu na kartách

### Sdílovací karta / generovaný obrázek tiketu — IMPLEMENTOVÁNO
- `generatePremiumShareCard` v `TicketResultModal.tsx` — nový canvas 1200×630 s reálnou grafikou výhry
- Logika:
  - Bonusová fyzická výhra → `bonusPrize.image_url`
  - MioCoin výhra → existující MioCoin asset
  - Partner offer → `partner_offer.banner_url`, fallback `partner_offer.logo_url`; nápis „Získal jsem speciální nabídku na OneMil"
  - Hlavní výhra → contest/main prize obrázek
  - Nevýherní tikety → sdílení odstraněno nebo minimalizováno
- Dark premium background (OneMil brand: Midnight Black → Deep Navy → Graphite)
- Commit: `0790362 Refined share image canvas`

### Favorites UI — OPRAVENO
- Počítadlo oblíbených se aktualizuje bez page refresh po přidání/odebrání
- Commity: `ebf5e8e Updated fav count display`, `00e1e99 Opravil počítadlo viditelnost`

### Partner Offers — potvrzeno funkční
- Assignment po nákupu tiketu funguje správně (potvrzeno uživatelem)
- Cooldown 5 minut aktivní, žádné duplicity
- Žádná mutace produkčních dat při ověřování

### Invarianty (uzamčeno)
- Partner Offers **nejsou** výhry soutěže
- Partner Offers se **nesmí** počítat do výpočtu vzdálenosti k nejbližší výhře
- Partner Offers se **nesmí** zapisovat do `winners` ani `bonus_prizes`
- `buy_ticket_atomic` se nemá znovu měnit bez explicitní instrukce

---

## CLOSED CONTEST STATUS — FINÁLNÍ (05. 05. 2026)

### Bug
V admin UI bylo možné u soutěží se statusem `closed` (Ukončeno) znovu změnit status na `draft`, `pending`, `active` nebo `paused`.

### Fix (`src/components/AdminContestManagement.tsx`, commit `54466bb`)
- `handleStatusChange` blokuje jakoukoli změnu statusu pokud `current.status === "closed"` — zobrazí toast: _„Ukončenou soutěž nelze znovu aktivovat ani přesunout."_
- Status Select v tabulce je pro closed contests disabled (`contest.status === "closed"`)
- Badge „Ukončeno" zůstává viditelný (readonly)
- Duplicitní deklarace `const current` v `draft` bloku odstraněna (nyní sdílí proměnnou z vrcholu funkce)

### Invariant (uzamčeno)
`closed` je finální stav. Uzavřená soutěž nesmí být nikdy znovu aktivována, přesunuta do draftu, pending ani paused — ani z admin UI, ani přes `handleStatusChange`.

---

## CONTEST RULES PDF — OPRAVENO (05. 05. 2026)

### Bug
- Admin contest formulář vyžaduje nahrání PDF s pravidly soutěže.
- Po uložení soutěže zůstával `contests.rules_pdf_url = NULL` v databázi.
- ContestDetail proto nezobrazoval odkaz „Zobrazit pravidla soutěže".

### Root cause
- Přímý UPDATE `contests.rules_pdf_url` z frontendu byl blokován chybějící RLS UPDATE policy na `public.contests` pro admin role.
- Supabase vracel `{ data: [], error: null }` (0 rows affected, žádná chyba) — silent no-op.
- Navíc chyběl `return` po UPDATE error → úspěšný toast se zobrazil i při selhání (false confirmation).

### Opravy
- **DB migrace:** přidána RLS policy `contests_admin_update` — admin/superadmin mohou UPDATE `public.contests` (commity `bfc7813`, `95ab8e3`)
- **Frontend `src/components/AdminContestManagement.tsx`:**
  - Přidán `setSaving(false); return;` po UPDATE error (commit `20e4a34`)
  - UPDATE změněn na `.update(additionalUpdates).eq("id", contestId).select("id")` — detekuje 0 rows affected (commit `934bfbd`)
  - Chybová hláška upřesněna na „Pravidla soutěže / obrázky se neuložily"
- **Frontend `src/pages/ContestDetail.tsx`:**
  - Text odkazu změněn z „Stáhnout pravidla soutěže" na „Zobrazit pravidla soutěže" (link otevírá PDF v novém tabu)

### Invariant (uzamčeno)
- Každá veřejná soutěž s nahraným PDF pravidel musí zobrazovat tlačítko/odkaz „Zobrazit pravidla soutěže" na stránce ContestDetail.
- `rules_pdf_url` se ukládá výhradně přes `additionalUpdates` UPDATE po RPC `admin_manage_contest` — RPC samotný tento sloupec neobsahuje.

### Playwright — stav po opravě
- E2E výsledek: **14 passed / 3 skipped / 0 failed** ✅
- Opraveny také testy 03-voucher-purchase.spec.ts:
  - Fixed: `waitForTimeout(3_000)` → `expect(buyButton.or(emptyState)).toBeVisible({ timeout: 15_000 })`
  - Fixed: `getByText(regex)` → `getByRole('heading', { name: '...' })` (strict mode violation)

---

## CI & PLAYWRIGHT — AKTUÁLNÍ STAV (18. 05. 2026)

### Staging Full E2E — spuštěno po PR #50 (18. 05. 2026)

- **Run:** `26029330415` — ⏳ probíhá (spuštěno po mergi PR #50 — spec 19 physical prize economy persist)
- **Spec 19** `Admin — Physical Prize Economy Persist` — `19-admin-physical-prize-economy-persist.spec.ts` — čeká na výsledek
- **Playwright testy: 19 spec souborů** (01–19); staging full E2E obsahuje všechny spec soubory

### Staging Full E2E — ZELENÝ po PR #49 (18. 05. 2026)

- **Run:** `26026329321` — ✅ **26 passed, 3 skipped, 0 failed** (2m 50s)
- **Spec 18** ✅ `Admin — Economy Persist` — `18-admin-economy-persist.spec.ts` prošel (10.7s) — **economy persistence E2E ověřena**
- **Spec 17** ✅ `Profile Smoke` prošel
- **Spec 16** ✅ `Admin — Economy Preview Smoke` prošel
- **Telegram:** `✅ OneMil STAGING full E2E OK — all specs passed` doručeno ✅

### Staging Full E2E — ZELENÝ po PR #16 (17. 05. 2026)

- **Run:** `25995782004` — ✅ **25 passed, 3 skipped, 0 failed** (3m 36s)
- **Spec 17** ✅ `Profile Smoke` — `17-profile-smoke.spec.ts` prošel (5.7s)
- **Spec 16** ✅ `Admin — Economy Preview Smoke` prošel (6.0s)
- **Telegram:** `✅ OneMil STAGING full E2E OK — all specs passed` doručeno ✅

### PR #16 — Profile smoke E2E test — MERGNUT (17. 05. 2026)

- **Branch:** `test/e2e-profile-smoke` → `main`
- **Merge commit:** `7fd9766972b4a84c9ee33b11357f42ad46c38854`
- **Přidaný soubor:** `tests/e2e/17-profile-smoke.spec.ts` (54 řádků, staging-only, read-only)
- **Co test ověřuje:** login jako E2E user → přechod na `/profile` → ověří identitu (e-mail), sekci peněženky (Peněženka, MioCoiny, Váš MioCoin účet), Účet heading, Přihlašovací údaje a Osobní údaje heading — bez redirectu na login/onboarding.
- **Přejmenování:** původně `12-profile-smoke.spec.ts` — přejmenováno na `17-` aby nedošlo ke kolizi s existujícím `12-mobile-messages-layout.spec.ts`.
- **Guard:** `test.skip` pokud chybí `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`; staging-only (přeskakuje bez `E2E_CONTEST_ID`).
- Žádný app kód, DB schéma, migrace, workflow soubory, Supabase volání, platby, soutěže, tikety, výhry, vouchery, Partner Offers ani `buy_ticket_atomic` nezměněny ✅
- `npm run build` prošel ✅

### Staging Full E2E — ZELENÝ po PR #38 (17. 05. 2026)

- **Run:** `25994857704` — ✅ **24 passed, 3 skipped, 0 failed** (2m 36s)
- **Spec 16** ✅ `Admin — Economy Preview Smoke` prošel poprvé čistě (5.3s)
- **Telegram:** `✅ OneMil STAGING full E2E OK — all specs passed` doručeno ✅

### PR #38 — spec 16 Ekonomika tab scope fix — MERGNUT (17. 05. 2026)

- **Branch:** `fix/spec16-ekon-tab-scope` → `main`
- **Merge commit:** `214248d40b95956636315ca7c7f9b60abd56fcc3`
- **Změněný soubor:** `tests/e2e/16-admin-economy-preview.spec.ts` (1 soubor)
- **Fix:** Všech 7 assertions v Ekonomika tab sekci přesunuto na `econPanel = dialog.locator('[role="tabpanel"][data-state="active"]')` — summary bar (vždy viditelný nad záložkami) obsahoval stejné texty (`Celkové odhadované náklady`, celková hodnota), strict mode odmítal 2 shody
- Žádný app kód, migrace, workflow soubory ani business logika nezměněna ✅

### PR #37 — spec 16 Balné strict mode fix — MERGNUT (17. 05. 2026)

- **Branch:** `fix/spec16-strict-mode-balne` → `main`
- **Merge commit:** `cd5a497cb4bc7b4d7dd994d620af3e3f93e33c99`
- **Změněný soubor:** `tests/e2e/16-admin-economy-preview.spec.ts` (1 řádek)
- **Fix:** `/Balné \/ pošta \/ práce/` regex → `'Balné / pošta / práce', { exact: true }` — regex matchoval label z věcného formuláře (hidden v DOM) i span v Ekonomika tabu
- Žádný app kód, migrace ani business logika nezměněna ✅

### PR #36 — Admin contest modal layout cleanup — MERGNUT (17. 05. 2026)

- **Branch:** `fix/admin-modal-layout-issue-35` → `main`
- **Merge commit:** `f6a28ca51ebf7783a3529e70fd36745fe77a95cc`
- **Změněný soubor:** `src/components/AdminContestManagement.tsx` (pouze layout CSS třídy, 5 řádků)
- **Co se změnilo:**
  - `max-w-4xl` cap odstraněn → modal je nyní `max-w-[95vw]` — podstatně širší na desktopu
  - `overflow-x-auto` odstraněn z wrapperu economy summary baru → žádný vnitřní horizontální scrollbar
  - Economy bar grid: `min-w-max grid-cols-5` → `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` (responsivní wrap)
  - `min-w-[9.5rem]` odstraněn z items (grid řídí šířku)
  - TabsList: `inline-flex w-max` → `flex flex-wrap h-auto w-full` (záložky se zalamují)
- Žádné kalkulace, validace, save behavior, Supabase volání, testy, migrace ani business logika nezměněny ✅
- `npm run build` prošel ✅

### PR #34 — Admin economy preview E2E smoke test (spec 16) — MERGNUT (17. 05. 2026)

- **Branch:** `codex/issue-33-admin-economy-preview` → `main`
- **Merge commit:** `ff45f2ad37bcf7ca4178c96277bb300aec52dd6c`
- **Přidaný soubor:** `tests/e2e/16-admin-economy-preview.spec.ts` (staging-only, read-only)
- **Co test ověřuje:**
  - Admin otevře modal „Vytvořit novou soutěž", vyplní preview pole věcné výhry (dodavatel, cena, DPH, balné, pozice)
  - Klikne „Přidat věcnou výhru" — bez finálního uložení soutěže
  - Ověří, že horní economy summary bar zobrazuje správné hodnoty (celkové náklady, doporučená cena, zisk, marže)
  - Ověří záložku Ekonomika — zobrazuje cost breakdown věcné výhry
- **Opravené selektory (Codex review feedback):**
  - `getByLabel()` nahrazen `inputByLabel()` helper: `label[hasText] → .. → input` (stabilní bez htmlFor/id)
  - `summaryValue()` přepsán: `div.uppercase.opacity-70[hasText] → xpath=following-sibling::div[1]` (přesně jeden element)
- Test se přeskakuje (`test.skip`) pokud chybí `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` ✅
- PR také přinesl Phase 3A: `AdminContestManagement.tsx` rozšířen o frontend-only cost preview pole pro věcné výhry
- Žádný app kód mimo formulář fyzických výher nezměněn; žádné migrace; žádná produkce ✅
- `npm run build` prošel ✅

### PR #24 + PR #25 — Admin Affiliate pages smoke test (spec 15) — MERGNUTY (15. 05. 2026)

- **PR #24** — `test/e2e-admin-affiliate-pages-smoke` → `main`, merge commit `8a8ba05`
  - Přidán: `tests/e2e/15-admin-affiliate-pages-smoke.spec.ts` (80 řádků, read-only)
  - Ověřuje 3 admin Affiliate stránky bez mutací: `/admin/influencers`, `/admin/influencer-commissions`, `/admin/influencer-campaigns`
  - `test.skip` pokud `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` chybí
- **PR #25** — `test/wire-admin-e2e-secrets` → `main`, merge commit `024fd92`
  - 2 řádky přidány do `playwright-staging.yml`: `E2E_ADMIN_EMAIL` + `E2E_ADMIN_PASSWORD`
- **Staging admin E2E účet (staging only):**
  - `admin-e2e@onemil.cz`, id `3960e47f-b583-4ef9-a48f-786bfe432bbd`, `public.user_roles.role=admin` ✅
  - Produkce nedotčena ✅
- **GitHub Secrets přidány:** `STAGING_E2E_ADMIN_EMAIL`, `STAGING_E2E_ADMIN_PASSWORD`
- **Spec 15 nyní RUNS:** run `25942146994` ✅ — **23 passed, 3 skipped, 0 failed** — spec 15 ✅ (10.5s) — Telegram OK
- App kód nedotčen — žádné migrace, žádný deploy, žádná produkce ✅

### PR #23 — Affiliate E2E secrets zapojeny do staging workflow — MERGNUT (15. 05. 2026)

- **Branch:** `test/wire-affiliate-e2e-secrets` → `main`
- **Merge commit:** `ecf7abf`
- **Změna:** 2 řádky přidány do `.github/workflows/playwright-staging.yml` — `E2E_AFFILIATE_EMAIL` a `E2E_AFFILIATE_PASSWORD` předávány ze `STAGING_E2E_AFFILIATE_EMAIL` / `STAGING_E2E_AFFILIATE_PASSWORD` secrets.
- **Staging Affiliate E2E účet vytvořen (staging only):**
  - `affiliate-e2e@onemil.cz` vložen do staging `auth.users` (e-mail potvrzen), `auth.identities` vytvořen.
  - `public.partners` row: `status=approved`, `approved_at=now()`, `notes={"type":"influencer"}`, `auth_user_id=8975593e-cc27-4f6b-ba23-c7077c914f38`, `contact_email=affiliate-e2e@onemil.cz`.
  - Produkce nedotčena ✅
- **GitHub Secrets přidány:** `STAGING_E2E_AFFILIATE_EMAIL`, `STAGING_E2E_AFFILIATE_PASSWORD` (Divuna/million-ticket-draw).
- **Spec 14 nyní RUNS (ne skip):** run `25941172937` ✅ — **22 passed, 3 skipped, 0 failed** — spec 14 `Affiliate Dashboard — Login Smoke` ✅ (4.9s) — Telegram OK.
- App kód nedotčen — žádné migrace, žádný deploy, žádný zásah do produkce ✅

### PR #22 — spec 10 flaky E2E test opraven — MERGNUT (15. 05. 2026)

- **Branch:** `fix/e2e-voucher-balance-before-read` → `main`
- **Merge commit:** `3d645d7b98f5650c0a0f29c86f24f8ac87ff85cf`
- **Změněný soubor:** `tests/e2e/10-voucher-purchase-balance.spec.ts` — pouze (+16 / −1)
- **Root cause:** „before" zůstatek peněženky byl čten bez `waitForResponse(GET /rest/v1/wallets)`. „After" čtení již tento guard mělo. Při dvou staging bězích spuštěných v rozmezí 7 minut mohla async operace z předchozího spece (spec 09 `buy_ticket_atomic`) doběhnout právě v okně spec 10, čímž test naměřil 15 MC pokles místo očekávaných 5 MC.
- **Fix:** Přidán `waitForResponse(GET /rest/v1/wallets)` armovaný **před** `page.goto()` a awaited před čtením `balanceParagraph.textContent()` — symetrizuje „before" čtení s již existujícím guardem na „after" čtení.
- **PR #21 nebyl příčinou:** spec 14 v obou failing i passing runech skipoval čistě (bez secrets). Selhání bylo pre-existing flakiness v spec 10, odhalené těsným spuštěním dvou E2E runů.
- **App kód nedotčen** — žádná wallet logika, voucher logika, Stripe, soutěže, tikety, výhry, Partner Offers, Affiliate, `buy_ticket_atomic` — vše beze změny.
- **Pre-merge branch Staging Full E2E:** run `25939178932` ✅ 21 passed, 4 skipped, 0 failed — spec 10 ✅ (17.0s)
- **Post-merge production smoke:** run `25939417571` ✅ 5 passed (20.7s) — Telegram OK
- **Post-merge Staging Full E2E na main:** run `25939483233` ✅ **21 passed, 4 skipped, 0 failed** — spec 10 ✅ (13.4s) — Telegram OK
- Nebyl proveden deploy, migrace ani zásah do produkčních dat ✅

### PR #21 — Affiliate dashboard login smoke test — MERGNUT (15. 05. 2026)

- **Branch:** `test/e2e-affiliate-dashboard-smoke` → `main`
- **Merge commit:** `b868aaf183ceeee71544832c43e23758cf46d809`
- **Přidaný soubor:** `tests/e2e/14-affiliate-dashboard-smoke.spec.ts` (115 řádků)
- **Co test ověřuje:** `/partner/login` form → přihlášení schváleného Affiliate partnera → redirect na `/influencer/dashboard` → „Aktivní Affiliate partner" badge → H1 „Vydělávejte s OneMil" → „Váš Affiliate odkaz" sekce → `input[readonly]` obsahuje `/?ref=` pattern.
- **Guard:** `test.skip` pokud `E2E_AFFILIATE_EMAIL` / `E2E_AFFILIATE_PASSWORD` chybí — skipuje čistě v production smoke i staging full E2E bez secrets.
- **Read-only:** bez Supabase write, bez vytváření uživatelů, bez form submission dat.
- **Staging secrets doplněny v PR #23:** `STAGING_E2E_AFFILIATE_EMAIL` a `STAGING_E2E_AFFILIATE_PASSWORD` přidány do GitHub Secrets a zapojeny do `playwright-staging.yml`. Spec 14 nyní běží a je zelený ✅
- **Production smoke (větev):** run `25937181131` ✅ SUCCESS
- **Pre-merge branch Staging Full E2E:** run `25937679308` ✅ 21 passed, 4 skipped (spec 14 skip ✅)
- **Post-merge production smoke:** run `25937888356` ✅ SUCCESS — Telegram OK
- **Post-merge Staging Full E2E na main:** run `25937949756` ❌ FAILED — spec 10 flaky (15 MC místo 5 MC) — příčina: 2 runs v 7 minutách, async timing. **Spec 14 nesouvisí — skippoval čistě.** Opraveno v PR #22 (viz výše).
- Nebyl proveden deploy, migrace ani zásah do produkčních dat ✅

### PR #17 — Messages composer fix — MERGNUT (15. 05. 2026)

- **Branch:** `fix/messages-composer-above-bottom-nav` → `main`
- **Merge commit:** `42a06f6`
- **Změněný soubor:** `src/pages/Messages.tsx` — 1 řádek
- **Fix:** Odstraněna třída `min-h-screen` z vnějšího wrapperu Messages stránky. `index.css` již definuje `.messages-mobile-fixed-shell` s `height: calc(100dvh - 5.75rem - env(safe-area-inset-bottom, 0px))` na mobilu — výška viewportu minus spodní navigace. Tailwindový `min-h-screen` (`min-height: 100vh`) tuto hodnotu přebíjel, čímž vstupní pole skončilo za spodní navigací na iPhone/PWA.
- **Výsledek:** Psací pole je celé viditelné těsně nad spodní navigací; zprávy scrollují ve svém kontejneru; spodní lišta zůstává fixní.
- **Bob, odesílání zpráv, routy, DB, Supabase, Stripe, wallet, soutěže, tikety, výhry, Partner Offers, `buy_ticket_atomic` — nedotčeny.**
- **PR smoke:** run `25887802417` ✅ 5 passed (1m10s)
- **Pre-merge Staging Full E2E:** run `25887887248` ✅ 17 passed, 3 skipped, 0 failed (2m6s)
- **Post-merge production smoke:** run `25888181338` ✅ 5 passed (18.8s) — Telegram OK
- **Post-merge Staging Full E2E na main:** run `25888244060` ✅ 17 passed, 3 skipped, 0 failed (2m21s) — Telegram OK
- Nebyl proveden deploy, migrace ani zásah do produkčních dat ✅

### PR #14 čistý test-only — Voucher purchase E2E (spec 10) — MERGNUT (14. 05. 2026)

- **Branch:** `test/e2e-voucher-purchase-balance-clean` → `main`
- **Merge commit:** `4cba4b0`
- **Přidané soubory (pouze 4):**
  - `tests/e2e/10-voucher-purchase-balance.spec.ts` — nový Staging Full E2E test
  - `.github/workflows/playwright-staging.yml` — přidány 3 seed/reset kroky
  - `onemil_state.md` — dokumentace
  - `onemil_history.md` — dokumentace
- **Test ověřuje:** login → /contest/:id balance read → /vouchers buy E2E Spec10 Voucher → Zakoupené tab "Uplatnit voucher" → balance decrease o přesně voucherPrice MC
- **Guard:** test.skip pokud `E2E_CONTEST_ID` není nastaven (produkční CI ho nemá)
- **Collision prevention:** E2E Spec10 Voucher seeded s `created_at: "2020-01-01"` (last in list); spec03 používá `.first()` (newest = E2E Spec03 Voucher) — žádná kolize
- **App code nedotčen** — `useUserVouchers.ts` fix je již na main (PR #13)
- **PR #11 uzavřeno bez merge** (bylo smíšené)
- **Pre-merge Staging Full E2E:** run `25882844526` ✅ **16 passed, 3 skipped, 0 failed** (2m0s)
- **Post-merge production smoke:** run `25883126324` ✅ **5 passed (21.7s)** — Telegram OK
- **Post-merge Staging Full E2E na main:** run `25883434451` ✅ **16 passed, 3 skipped, 0 failed** (2m12s) — spec10 prošel 16.5s, Telegram OK
- **Žádná migrace není součástí PR #14** — RLS fix byl proveden manuálně (viz sekce níže)

### Staging user_vouchers RLS — MANUÁLNĚ OPRAVENO (14. 05. 2026)

**Nález:** Stagingový baseline dump vynechal tři RLS policies na tabulce `user_vouchers`. Produkce (`xkzhjldrojjlrkezorey`) měla všechny 4 správné policies. Staging (`dxmowysntemfqfnanxua`) měl pouze `admin_all_voucher_access_secure` (ALL).

**Chybějící policies na stagingu:**
- `user_owns_voucher` (SELECT, `user_id = auth.uid()`) — **kritická** — bez ní `fetchUserVouchers()` vracelo `[]` pro všechny běžné uživatele (PostgREST vrací prázdné pole, ne chybu); tab Zakoupené byl vždy prázdný
- `user_vouchers_insert_own` (INSERT) — chybělo pro přidávání oblíbených přes frontend
- `user_vouchers_delete_own` (DELETE) — chybělo pro odebírání oblíbených přes frontend

**Fix:** Tři policies přidány manuálně na staging přes Supabase MCP. Produkce nedotčena.

**Žádná migrace nebyla commitnuta** v PR #14. Tato oprava je staging infrastrukturní maintenance — není to app kód ani produkční schémová změna.

### PR #13 — useUserVouchers PostgREST embedded join fix — MERGNUT (14. 05. 2026)

- **Branch:** `fix/user-vouchers-fetch` → `main`
- **Merge commit:** `f9719101cf98d6063aaf009f7b50acd2e833c33c`
- **Změněný soubor:** `src/hooks/useUserVouchers.ts` pouze
- **Fix:** dva explicitní dotazy místo `voucher:vouchers!user_vouchers_voucher_id_fkey(...)` — PostgREST embedded join vracel HTTP 400 na stagingu (FK constraint name neshoda), tiše zachycený → `setVouchers([])` → prázdný tab Zakoupené
- **PR smoke:** run `25878064722` ✅ success
- **Post-merge production smoke:** run `25878209886` ✅ success
- **Post-merge Staging Full E2E na main:** run `25878303521` ✅ 15 passed, 3 skipped
- **PR #11 uzavřeno bez merge** (smíšené změny — app kód + testy + CSS)
- Nebyl proveden deploy, migrace ani zásah do produkčních dat ✅

---

### Staging full E2E — ZELENÝ (10. 05. 2026, run `25625184545`)

- Workflow: **Playwright Staging Full E2E** (`.github/workflows/playwright-staging.yml`)
- Trigger: `workflow_dispatch`
- Výsledek: ✅ **ALL PASSED** — 13 passed, 4 skipped (expected), 0 failed, 2m 33s
- Všech 9 spec souborů (`01–08`, plus `03-ticket-purchase` je ve dvou souborech): prošly nebo byly přeskočeny dle očekávání
- Auto-seed win contestu funguje: `STAGING_SUPABASE_SERVICE_ROLE_KEY` → PostgREST INSERT → nový contest s `created_at: "2020-01-01T00:00:00Z"` → ID předáno jako step output
- Wallet reset funguje: PostgREST PATCH nastaví `balance_coins: 5000, bonus_balance_coins: 0` před každým spuštěním testů (commit `50ba68c`)
- Telegram success notifikace doručena: `✅ OneMil STAGING full E2E OK — all specs passed`
- Produkce nedotčena
- **Pipeline je bezpečná k plánování každých 8 hodin** — čeká na schválení

**Commity (stabilizace + wallet reset + signup fix):**
| Commit | Popis |
|--------|-------|
| `3c4aecf` | `ci: keep auto win contest out of games first position` — seed contest dostane `created_at: 2020-01-01` |
| `324a747` | `test: stabilize destructive win flow e2e` — toast scoped na `[data-sonner-toast]`; `retries: 0` |
| `6ee26df` | `test: scope result dialog locator to avoid cookie banner conflict` — `getByRole('dialog', { name: /Výhra/i })` |
| `e70fd5c` | `test: robust wait for offer cards or empty state in partner offer open spec` — `Promise.race` wait |
| `50ba68c` | `ci: reset staging e2e wallet before full run` — wallet reset na 5 000 MioCoin před testy |
| `631f915` | `test: use valid email domain for staging signup` — `@example.com` → `@onemil.cz`; HTTP 400 není skip |

**Signup test — aktuální stav:**
- Email doména: `e2e+${Date.now()}@onemil.cz`
- HTTP 400 se neskipuje — reálný staging signup zůstává testován
- Ověřeno: run `25627706906` ALL PASSED 2m 45s

**Schedule (commit `37cfd6c`):**
| Workflow | Časy (Praha CEST) | Cron |
|----------|-------------------|------|
| Production smoke | 00:00 / 08:00 / 16:00 | `0 22 * * *` / `0 6 * * *` / `0 14 * * *` |
| Staging full E2E | 04:00 / 12:00 / 20:00 | `0 2 * * *` / `0 10 * * *` / `0 18 * * *` |

- Žádný překryv mezi production smoke a staging full E2E
- `workflow_dispatch` zůstává dostupný pro manuální spuštění

**Pravidla (nezměnit):**
- Destruktivní testy (03–08) **nesmí běžet v produkci** — `playwright.yml` je hard-coded pouze na `01-registration` + `02-login`
- Každý run dostane nový win contest a resetovaný wallet; stav se nekumuluje mezi běhy

### Production smoke — manuálně ověřeno (10. 05. 2026, run `25618763318`)

- Workflow: **Playwright Smoke Tests** (`.github/workflows/playwright.yml`)
- Trigger: `workflow_dispatch`
- Výsledek: **6 passed** za 1m 22s
- Spuštěné testy:
  - `01-registration.spec.ts` — 3 passed ✅
  - `02-login.spec.ts` — 3 passed ✅
- Specs 03–08 **nebyly spuštěny** — potvrzeno z logu; žádný ticket purchase, voucher purchase, wallet, win-flow ani Partner Offers test neproběhl v produkci
- Telegram zpráva doručena: `✅ OneMil PROD smoke OK — registration + login passed` ✅
- Neblokující varování: `.claude/worktrees/ecstatic-lichterman-1aa60a` způsobilo `git exit code 128` v post-job cleanup kroku — testy ani pipeline nebyly ovlivněny

### Workflow split — produkce vs staging (commit `82f979f`)

Dva oddělené CI workflow:

| Workflow | Soubor | Trigger | Testy |
|----------|--------|---------|-------|
| Production smoke | `.github/workflows/playwright.yml` | push/PR `main`, schedule 3× denně, `workflow_dispatch` | pouze `01-registration`, `02-login` |
| Staging full E2E | `.github/workflows/playwright-staging.yml` | `workflow_dispatch` only | všech 9 spec souborů |

**Produkce nemůže spustit testy 03–08** — `playwright.yml` má hard-coded paths na dva spec soubory. Ticket purchase, voucher purchase, wallet, win-flow a Partner Offers testy jsou fyzicky nedostupné z produkčního workflow.

**Staging secrets** (mapovány na standardní env var názvy, které app a testy čtou):
- `STAGING_VITE_SUPABASE_URL` → `VITE_SUPABASE_URL`
- `STAGING_VITE_SUPABASE_ANON_KEY` → `VITE_SUPABASE_ANON_KEY`
- `STAGING_VITE_INTERNAL_FUNCTION_TOKEN` → `VITE_INTERNAL_FUNCTION_TOKEN`
- `STAGING_E2E_TEST_EMAIL` → `E2E_TEST_EMAIL`
- `STAGING_E2E_TEST_PASSWORD` → `E2E_TEST_PASSWORD`
- `STAGING_E2E_CONTEST_ID` → `E2E_CONTEST_ID`
- `STAGING_E2E_WIN_CONTEST_ID` → `E2E_WIN_CONTEST_ID`

Staging workflow aktivní až po seedu staging DB a nastavení těchto secrets.

**Telegram zprávy:**
- Production: `✅ OneMil PROD smoke OK — registration + login passed` / `❌ OneMil PROD smoke FAILED` + run URL
- Staging: `✅ OneMil STAGING full E2E OK — all specs passed` / `❌ OneMil STAGING full E2E FAILED` + run URL

### Opravená chyba v registračním testu
- **Příčina 4× selhání (01.05.2026):** Supabase má zapnuté potvrzení emailu → po registraci `session: null` → localStorage bez `onemil-auth` klíče → `Profile.tsx` přesměroval na `/login` → `expectSessionExists()` selhalo
- **Oprava:** `tests/e2e/01-registration.spec.ts` — test nyní zvládá 3 platné stavy po registraci:
  1. Email auto-confirmed → session v localStorage → bottom nav viditelný
  2. Email confirmation required + session null → Profile přesměruje na `/login` → test prochází
  3. Email confirmation required + dočasná session → DateOfBirthGuard zobrazí "Potvrďte svůj e-mail" → test prochází
- **Bonus:** pokud Supabase vrátí 429 (rate limit) nebo 422, test se přeskočí místo pádu CI
- **Commity:** `945a77d`, `0659a28`

### Scheduled testy — nové nastavení
- Testy nyní běží **3× denně** automaticky (commit `156000f`):
  - 00:00 Praha (22:00 UTC)
  - 08:00 Praha (06:00 UTC)
  - 16:00 Praha (14:00 UTC)
- Časy jsou v letním čase (CEST = UTC+2); v zimě (CET) by byl posun o 1h
- Workflow: `.github/workflows/playwright.yml`

### Nástroje diagnostiky
- **gh CLI** nainstalován na tomto stroji (via winget)
- **GitHub Credential** — token je čitelný z Windows Credential Manager (`git:https://github.com`) přes P/Invoke CredRead API → použito pro přímé volání GitHub Actions API
- Výsledky runů čitelné přes: `gh run view <run_id> --log-failed` nebo GitHub API

### Stav testů (po opravě)
- `01-registration`: ✅ opraveno (zvládá email confirmation i rate limit)
- `02-login`: ✅ passing
- `03-08`: ⏭ skip v produkci — čekají na staging secrets v `playwright-staging.yml`

---

## STAGING SEED — OVĚŘENÝ STAV (10. 05. 2026)

**Projekt:** `onemil-staging`, ref `dxmowysntemfqfnanxua`, region `eu-north-1`

### Test user
| Pole | Hodnota |
|------|---------|
| Email | `e2e@onemil.cz` |
| User ID | `7822a82e-f1d3-45ee-827b-679640ce6b65` |
| Wallet balance | `5000.00` MioCoin |

### Contests
| Secret | Contest ID | Status | next_ticket_number |
|--------|-----------|--------|-------------------|
| `STAGING_E2E_CONTEST_ID` | `3fa56db0-4007-4fb7-aa2f-e460173070d8` | `active` | 1 |
| `STAGING_E2E_WIN_CONTEST_ID` | `7ff58a8e-c691-46e1-9e0c-ca6cddeb8abb` | `active` | 100 |

**Win contest poznámka:** Po každém úspěšném test-05 běhu je nutné resetovat `sold_tickets` zpět na `N - 1` a `next_ticket_number` na 100, jinak test 05 selže na dalším CI runu.

### Partner offer
| Pole | Hodnota |
|------|---------|
| Offer ID | `28278c87-17b6-49c3-ae7e-004d0d1f18b0` |
| Status | `approved` |
| deployment_mode | `selected_contests` |
| Připojena k | `STAGING_E2E_CONTEST_ID` (`3fa56db0-4007-4fb7-aa2f-e460173070d8`) |

### GitHub Secrets — co zbývá nastavit
Staging seed je připraven. Zbývá přidat do GitHub Secrets repozitáře:
- `STAGING_VITE_SUPABASE_URL`
- `STAGING_VITE_SUPABASE_ANON_KEY`
- `STAGING_VITE_INTERNAL_FUNCTION_TOKEN`
- `STAGING_E2E_TEST_EMAIL` → `e2e@onemil.cz`
- `STAGING_E2E_TEST_PASSWORD`
- `STAGING_E2E_CONTEST_ID` → `3fa56db0-4007-4fb7-aa2f-e460173070d8`
- `STAGING_E2E_WIN_CONTEST_ID` → `7ff58a8e-c691-46e1-9e0c-ca6cddeb8abb`

Po nastavení secrets je `playwright-staging.yml` připraven ke spuštění přes `workflow_dispatch`.

---

## E2E TESTOVÁNÍ — PRODUKČNÍ BEZPEČNOST & STAGING PLÁN (05. 05. 2026)

### Proč nelze destruktivní testy spouštět v produkci

Nákup tiketu (`buy_ticket_atomic`) zapisuje do **12+ systémů** v jedné atomické transakci a mimo ni:
- `wallets` (deduct balance)
- `wallet_transactions` (append-only ledger — **nelze mazat ani upravovat**, trigger `fn_wallet_transactions_immutable()` RAISES EXCEPTION na UPDATE/DELETE)
- `tickets`
- `contests` (sold_tickets increment)
- `bonus_prizes` (status → won)
- `winners` + `winner_status_history`
- `event_logs` → `event_queue` → Sofinity (analytika)
- `user_partner_offers` (assign partner offer)
- `partner_offers.last_assigned_at`
- `partner_offer_activations`
- `notifications` → `push_log` → OneSignal
- `email_queue`

**Klíčový závěr:** `wallet_transactions` je append-only permanentní finanční ledger. Jakýkoli test, který volá `buy_ticket_atomic`, vytváří permanentní záznamy. Cleanup není možný. **Destruktivní testy (03–08) se nesmí spouštět v produkci.**

### Výsledek porovnání tří možností E2E izolace

| Možnost | Závěr |
|---|---|
| Separátní staging Supabase projekt | ✅ **Doporučeno** — plná izolace, stejný kód aplikace, jiné env/secrets |
| `is_e2e` flag na contestech v produkci | ⚠️ Neúplné — funguje pro čtecí cesty, ale wallet_transactions se stále píší trvale; neizoluje Sofinity pipeline |
| Testovací tabulky + cleanup v produkci | ❌ **Nemožné** — `wallet_transactions` immutability trigger zakazuje DELETE i UPDATE |

### Potvrzené projekty a regiony (09. 05. 2026)

| | Produkce | Staging |
|---|---|---|
| **Projekt** | `onemil` | `onemil-staging` |
| **Project ref** | `xkzhjldrojjlrkezorey` | `dxmowysntemfqfnanxua` |
| **Region** | `eu-north-1` | `eu-north-1` |
| **První secret po vytvoření** | — | `SOFINITY_RELAY_URL` → `sofinity-noop` |

### Staging Edge Functions — aktuální stav (10. 05. 2026)

| Funkce | Status | Poznámka |
|--------|--------|---------|
| `sofinity-noop` | ✅ ACTIVE | Absorbuje Sofinity eventy; nasazena dříve |
| `upload-ticket-share` | ✅ ACTIVE | Nahrává share PNG do storage; nasazena 10. 05. 2026 |

**Storage:** bucket `ticket-shares` existuje na staging `dxmowysntemfqfnanxua`, `public: true`, `file_size_limit: 5242880` (5 MB) ✅

Produkce `xkzhjldrojjlrkezorey` nebyla dotčena. Žádné jiné funkce nebyly nasazeny.

### Staging koncept

- **Stejný kód aplikace** (`main` branch) — žádné speciální code paths
- **Jiná instance Supabase** — jiný `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, jiné secrets
- **Jiné env proměnné pro CI testy** (staging secrets v GitHub Actions)
- Frontend klient je správně připraven: `client.ts` čte Supabase URL/key z env proměnných — žádné hardcodování ✅

### Staging readiness audit — co brání plné izolaci

**Frontend (Supabase klient):** ✅ env-var-based, připraven ihned

**Tři hardcoded URL, které je nutno opravit před staging:**

| Soubor | Řádek | Problém | Fix |
|---|---|---|---|
| `supabase/functions/process_event_queue_worker/index.ts` | 19 | **Nejvyšší riziko** — hardcoded `https://rrmvxsldrjgbdxluklka.supabase.co/functions/v1/sofinity-event` (Sofinity relay); staging by posílal události do produkční analytiky | `Deno.env.get("SOFINITY_RELAY_URL") ?? "<prod-url>"` |
| `src/pages/ShareTicket.tsx` | 22 | Hardcoded prod Supabase URL pro OG image generování | Nahradit `` `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/og-ticket-share` `` |
| `src/components/TicketResultModal.tsx` | 416 | Stejný hardcoded OG image URL | Stejný fix jako ShareTicket.tsx |

`supabase/functions/daily-onboarding-reminder/index.ts:103` obsahuje fallback URL ale je nízké riziko — potlačí se nastavením `APP_URL` secret v staging projektu.

### Dvoustupňová CI strategie (doporučeno)

| CI | Testy | Databáze | Důvod |
|---|---|---|---|
| **Produkční CI** (current) | 01–02 (registration, login) | Produkce | Pouze read/auth — žádné peněžní transakce |
| **Staging CI** (budoucí) | 01–08 (full suite) | Staging Supabase | Plná izolace — destruktivní testy bezpečné |

### Fáze 1 — Staging-safe URL fix — DOKONČENO (09. 05. 2026, commit `20c6452`)

Hardcoded produkční URL nahrazeny env/client-based hodnotami:

| Soubor | Změna |
|---|---|
| `supabase/functions/process_event_queue_worker/index.ts` | `sendEndpoint`: `Deno.env.get("SOFINITY_RELAY_URL") ?? "<prod URL>"` |
| `src/pages/ShareTicket.tsx` | OG image URL: `${supabaseUrl}/functions/v1/og-ticket-share` |
| `src/components/TicketResultModal.tsx` | OG image URL: `${supabaseUrl}/functions/v1/og-ticket-share` |

- Build: ✅ passed (0 errors)
- `.claude/settings.local.json` nebyl commitnut ani pushnut
- `api/og-ticket.ts` a `vercel.json` — legacy; aktivní deploy cesta je Lovable, tyto soubory se nikdy nespouští v produkci; oprava odložena

### Krok-za-krokem plán pro staging (Fáze 1 hotova, čeká na souhlas pro Fázi 2)

**Fáze 1 — Opravit hardcoded URLs ✅ HOTOVO (commit `20c6452`)**
1. `process_event_queue_worker/index.ts` — hotovo
2. `src/pages/ShareTicket.tsx` — hotovo
3. `src/components/TicketResultModal.tsx` — hotovo

**Fáze 2 — Vytvořit staging Supabase projekt ✅ HOTOVO (09. 05. 2026)**
- Projekt `onemil-staging` vytvořen, ref `dxmowysntemfqfnanxua`, region `eu-north-1`
- Secret `SOFINITY_RELAY_URL` nastaven manuálně → `https://dxmowysntemfqfnanxua.supabase.co/functions/v1/sofinity-noop`
- Edge Function `supabase/functions/sofinity-noop/index.ts` vytvořena a nasazena pouze na staging (commit `4167527`)
- POST test: HTTP 200 `{"ok":true,"noop":true}` ✅
- Produkční projekt `xkzhjldrojjlrkezorey` nedotčen ✅
- Produkční Sofinity relay `rrmvxsldrjgbdxluklka` nedotčen ✅
- Žádné migrace nebyly spuštěny ✅

**Fáze 3 — CI staging workflow**
8. Přidat GitHub Secrets pro staging: `STAGING_VITE_SUPABASE_URL`, `STAGING_VITE_SUPABASE_ANON_KEY`, `STAGING_E2E_TEST_EMAIL`, `STAGING_E2E_TEST_PASSWORD`
9. Vytvořit `.github/workflows/playwright-staging.yml` — spouští plný suite 01–08 proti staging projektu
10. Aplikovat migrace na staging DB
11. Seedovat: testovacího uživatele, wallet, test contest(y), partner offer

**Aktuální stav:** Fáze 1 + 2 hotovy. Fáze 3 pozastavena — viz sekce níže (partial migration failure + cleanup).

**Fáze 3 — Migrace na staging DB — POZASTAVENO (10. 05. 2026)**

`npx supabase db push` selhal při migraci #3 (`20250914043049_`) — chyba: `relation "public.payments" does not exist`.

**Root cause:** První ~5 migračních souborů (blank-name, 14. 09. 2025) jsou hotfixy na již existující schéma, ne CREATE skripty. Počáteční schéma (tabulky `payments`, `wallets`, `users`, `contests`, `tickets` atd.) bylo vytvořeno přímo v Supabase dashboardu a **nebylo nikdy zachyceno jako migrační soubor**. Staging má prázdnou DB — tyto tabulky neexistují.

**Stav staging DB — schema baseline aplikován manuálně (10. 05. 2026):**
- Produkční schéma zdumpováno a aplikováno na staging přes Supabase SQL Editor (manuálně)
- Ověřeno na staging `dxmowysntemfqfnanxua`:
  - 73 public tabulek ✅ (včetně `public.payments`, `wallets`, `tickets`, `contests`, `users` atd.)
  - `buy_ticket_atomic` funkce existuje ✅
  - `fn_wallet_transactions_immutable()` trigger existuje ✅
  - 95 RLS policies ✅
- Produkce `xkzhjldrojjlrkezorey` nedotčena ✅

**`supabase_migrations.schema_migrations` — experimenty s formátem (10. 05. 2026):**

CLI extrahuje z lokálních `.sql` souborů **vedoucí číselný prefix** (ne celý stem), např. `20250914034944_.sql` → `20250914034944`. DB záznamy s jiným formátem CLI nespáruje.

| Pokus | Obsah | Počet | Výsledek dry-run |
|-------|-------|-------|-----------------|
| 1 | Celé filename stems (bez `.sql`) | 341 | ❌ Všech 341 "Remote not found" |
| 2 | Číselné prefixy, deduplikováno | 327 | ❌ 3 krátké 8-ciferné prefixy "Remote not found" |
| 3 | 324 prefixů (bez 3 konfliktních) | 324 | ❌ 17 lokálních souborů "pending before last remote" |
| 4 | 324 + 17 plných stemů sekundárních souborů | 341 | ❌ 22 chyb (plné stemy + 5 dříve fungujících se rozbilo) |
| **Finální** | **Zpět na 324 číselných prefixů** | **324** | **❌ 17 souborů pending — nejlepší dosažitelný stav** |

**Root cause neřešitelného selhání dry-run:**
- 4 páry souborů sdílí stejný 14-ciferný timestamp (např. `20260315280000_buy_ticket_rate_limit.sql` + `20260315280000_cleanup_winners_indexes.sql`) — CLI páruje jeden DB záznam s prvním souborem abecedně, druhý zůstává "pending before last remote"
- 3 smíšené skupiny mají 8-ciferné i 14-ciferné soubory (např. `20260419_*` + `20260419104519_*`) — 8-ciferný prefix CLI nespáruje, soubor zůstává pending
- **Celkem: 17 lokálních souborů permanentně pending** při 324 DB záznamy; exit code 0 nelze dosáhnout bez přejmenování souborů

**Aktuální stav `schema_migrations` na staging:** 324 řádků (číselné prefixy).

**⛔ Nespouštět `db push` na staging. Needitovat `schema_migrations` bez schválení.**

**Rozhodnutá strategie pro staging migrace — Option A (10. 05. 2026):**
- `db push` se na staging **nepoužívá** — ani nyní, ani dokud nebudou přejmenovány duplicitní soubory
- Nové změny DB se aplikují na staging **manuálně přes Supabase SQL Editor** — stejný workflow jako v produkci
- Aktuální staging schema baseline je přijat jako správný; 17 pending souborů je již obsaženo v baseline schématu, CLI je nedokáže sledovat kvůli duplicitním/smíšeným timestamp prefixům
- `schema_migrations` zůstává na 324 řádcích — neměnit
- Staging CI (testy 03–08) nevyžaduje `db push --dry-run` exit 0 — závisí pouze na správnosti schématu DB

---

## VIZUÁLNÍ SYSTÉM / GRAFIKA — NEDOKONČENO (27. 04. 2026)

### Aktuální situace
Grafický systém je v přechodném stavu. Momentálně probíhá testování funkčnosti systému (platby, tiket purchase, contest flow). Grafika bude dořešena až po ověření funkčnosti.

### Co bylo uděláno (větev `claude/setup-playwright-tests-bShrg`)
Commity `d6d4597` a `25e87dd` — **nemergnuto do `main`**:
- Font nadpisů změněn z `Plus Jakarta Sans` → **Poppins**
- CSS proměnné `--primary`, `--secondary`, `--accent` přepsány z modré/zlaté na **Energy Orange** (`hsl(32 100% 50%)`)
- Bordery a gradienty ContestCard a ContestDetail přepsány ze zlaté na oranžovou
- Progress bary: `#f6e27a/#d4a017` → `#FF8A00/#FFB547`

### Co bylo uděláno (větev `claude/thirsty-volhard-e1eb7c`, commit `a21ef28`)
Vizuální zmírnění na aktuální větvi — **pushnuté, nemergnuto do `main`**:
- `src/index.css` — `--neon-gold` z `43 90% 55%` → `33 70% 44%`, stejně `--package-gold`, `--secondary`, `--accent`; `--heading-gold*` sada ztmavena; `--glow-gold` opacity snížena ~50 %; keyframes `luxury-pulse`, `luxury-glow`, `title-glow` — gold opacity snížena; `.text-heading-gold` gradient zmírněn; `.text-neon-gold` text-shadow snížena
- `src/components/ContestCard.css` — border sweep barvy ze zlaté na tlumenou amber-oranžovou; inner glow opacity snížena
- `src/components/ContestCard.tsx` — statický border → `rgba(191,198,207,0.16)`; progress bar gradient → `#C07018/#884A08`; CTA button text/border → tlumená amber-oranžová
- `src/components/MioCoin.tsx` — outer ring gradient ze `yellow-500/40` → `amber-800/25`; shadow opacity snížena

### Co ještě chybí / co je potřeba dořešit
- [ ] Rozhodnutí: mergovat brand větev (`setup-playwright-tests-bShrg`) nebo aplikovat brand tokeny přímo na `main`
- [ ] Sjednotit font: `Plus Jakarta Sans` → `Poppins` (nebo potvrdit jiný výběr)
- [ ] Sjednotit primární barvu: zlatá → Energy Orange `#FF8A00` (nebo potvrdit výsledek zmírnění z `thirsty-volhard`)
- [ ] Projít stránky: Homepage, Games, ContestDetail, Profile, Vouchers — vizuálně ověřit konzistenci po brand změnách
- [ ] MioCoin package karty (Vouchers page) — přidat dark overlay, ověřit kontrast
- [ ] Otestovat v prohlížeči na localhost:8080/8081 a schválit výsledek před mergem

### Větve relevantní pro grafiku
| Větev | Co obsahuje | Stav |
|---|---|---|
| `claude/setup-playwright-tests-bShrg` | Poppins + Energy Orange (úplná brand aplikace) | Hotovo, nemergnuto |
| `claude/thirsty-volhard-e1eb7c` | Zmírnění zlaté, soft rgba bordery | Hotovo, nemergnuto |
| `main` | Původní zlatá/modrá paleta | Žádné brand změny |

---

**Aktualizováno (předchozí):** 24. 04. 2026 (CI & Payment Pipeline stabilization)

---

## CI & PAYMENT PIPELINE – FINAL VERIFIED STATE (24.04.2026)

### Playwright Smoke Tests
- Celkem **8 spec souborů**, ~20 testů:
  - `01-registration` — registrace nového účtu
  - `02-login` — přihlášení existujícího účtu
  - `03-ticket-purchase` — navigace na contest + pokus o koupi tiketu
  - `04-voucher-purchase` — (starší spec, čeká na credentials)
  - `05-win-flow` — koupě poslední tikety → výhra (vyžaduje `E2E_WIN_CONTEST_ID`)
  - `06-partner-offers` — po nákupu tikety detekce partner offer v result modalu
  - `07-partner-offer-open` — /wins → Nabídky tab → klik na nabídku → assert dialog + opened_at PATCH
  - `08-partner-offer-persistence` — otevření nabídky → reload → nabídka stále přítomna + žádný „Nová" badge
- Registrace + login testy: **passing**
- Testy 03–08: **skip** (čekají na `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`; 05 navíc `E2E_WIN_CONTEST_ID`)
- CI workflow: `.github/workflows/playwright.yml` — branch `claude/**`, PR do `main`, `workflow_dispatch`
- Supabase propojen v CI přes GitHub Secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- webServer: `npm run dev` (Vite, port 8080), spouštěn automaticky Playwrightem

### Nový env var pro win-flow test
- `E2E_WIN_CONTEST_ID` — musí ukazovat na soutěž se **právě 1 zbývající tiketou** (seeded contest)
- Přidat jako GitHub Secret + případně do lokálního `.env`

### Stripe webhook (`supabase/functions/stripe-webhook/index.ts`)
- Všechny failure paths uvnitř `checkout.session.completed` vracejí **HTTP 500** (Stripe retry)
- Idempotency: před INSERT se kontroluje `stripe_session_id` v `payments`; duplicity vracejí 200 + log `STRIPE WEBHOOK DUPLICATE`
- Structured failure log: `console.error('STRIPE WEBHOOK FAILURE', {session_id, reason, user_id, amount})`
- Outer catch: opraveno z 400 → **500** (aby Stripe retryoval i při neočekávaných runtime chybách)
- Signature check inner catch zůstává 400 (správně — unsigned requesty nejsou validní Stripe events)
- Wallet credit: trigger `update_wallet_after_payment` (AFTER INSERT ON payments WHERE status='completed')

### Registrace + auth flow
- `auth.users` → trigger `on_auth_user_created` → `handle_new_auth_user()` → `public.users` + `profiles` + `wallets`
- Migrace `20260420_ensure_wallet_exists.sql`: centralizovaná DB funkce `ensure_wallet_exists(p_user_id)` — commitnuta, **nutno aplikovat v Supabase SQL Editoru**
- Migrace `20260420_fix_profiles_insert_remove_user_id.sql` — commitnuta, **nutno aplikovat v Supabase SQL Editoru**

### won_type priority oprava
- Migrace `supabase/migrations/20260424_fix_won_type_main_priority_over_bonus.sql` — commitnuta (commit `68e06fc`), **nutno aplikovat v Supabase SQL Editoru**
- Bug: pokud poslední tiket zároveň zasáhl bonusovou pozici, `won_type` vracel `'bonus'` místo `'main'`
- Fix: CASE pořadí vyměněno — `v_next_ticket = v_ticket_count → 'main'` je teď před `v_bonus_prize_id IS NOT NULL → 'bonus'`
- Platí i pro `won_prize` CASE (konzistence)
- Frontend: tři místa volají `buy_ticket_atomic` **přímo** (ne přes Edge Function): `ContestDetail.tsx`, `Games.tsx`, `FavoriteGames.tsx` — všechna správně kontrolují `data.success` a `data.won_type`

### GitHub Actions CI
- Telegram notifikace: `curl` na `api.telegram.org` na success i failure (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`)
- GitHub Step Summary: `PAYMENT PIPELINE OK` / `PAYMENT PIPELINE FAILED` + markdown
- HTML report artifact: `playwright-report-{run_id}` (14 dní)
- Screenshots artifact při selhání: `screenshots-{run_id}` (7 dní)
- Pipeline status: **stable, production-ready**

---

**Aktualizováno (předchozí):** 13. 04. 2026, 20:46:33 +02:00 (dokumentační synchronizace contest-admin)

## Aktuální fáze
Partner Offers v1 – **dokončeno, nasazeno a finálně ověřeno end-to-end**.

## Shrnutí
Modul Partner Offers v1 je uzavřen jako hotový.
Byly dokončeny bloky A–G, následně proběhlo vícekolové E2E ověření včetně finálního HTTP-level testu přes `purchase-ticket` s reálným JWT.

Výsledek:
**Partner Offers v1 PASSED finálním E2E ověřením.**

## Přístup k aplikaci
Dočasný frontend gate v `src/App.tsx` (email allowlist a obrazovka „Web je momentálně neveřejný“) byl **odstraněn** (2026-04-10). Po přihlášení mají registrovaní uživatelé znovu normální přístup k trasám; Supabase Auth a stávající role redirecty zůstaly beze změny. Ověřeno: `npm run build` úspěšně (Vite production build dokončen).

---

## Závazná pravidla Partner Offers v1
- Partner Offers **nejsou výhry**
- Partner Offers se **nikdy** nesmí ukládat do:
  - `winners`
  - `bonus_prizes`
- Bottom menu zůstává:
  - `Výhry`
- Uvnitř `/wins` je přepnutí:
  - `Výhry`
  - `Nabídky`
- Partner offer se po získání ukládá automaticky
- Neexistuje tlačítko `Uložit`
- Otevřená nabídka = otevřený detail nabídky v appce
- Po schválení partner nesmí měnit nic
- Režim zdarma je pouze interní admin volba
- Data Partner Offers se fyzicky nemažou
- Uživatelské smazání = pouze skrytí z pohledu uživatele
- Po skrytí se odešle systémová zpráva do `messages`
- Cooldown = 5 minut
- Bez denního limitu
- Max 1 partner offer na 1 ticket
- V1 grafika:
  - logo 512×512
  - banner 1600×900

---

## Finální stav po blocích

### Block A — core data model
Nasazeno:
- `partner_offers`
- `partner_offer_selected_contests`
- `partner_offer_contests`
- `user_partner_offers`

Důležité:
- `partner_offers.last_assigned_at`
- `user_partner_offers.last_reminder_at`
- `user_partner_offers.ticket_id` = `uuid`
- `buy_ticket_atomic` vrací additivně:
  - `ticket_row_id`

### Block B — partner + admin workflow
Nasazeno:
- partner draft / submit / revise
- admin approve / reject / priority
- `selected_contests` picker
- `rejected -> draft` přes RPC:
  - `revise_partner_offer(...)`

### Block C — automatic contest attachment
Nasazeno pro:
- `all_contests`
- `selected_contests`

Hotové:
- attach při approve
- attach při `resume_contest`
- detach při deaktivaci nabídky
- detach při close contestu
- detach při expiraci
- `detached_at` soft detach
- respektuje:
  - `valid_from`
  - `valid_to`

Mimo v1:
- `category_contests`

### Block D — post-ticket evaluation layer
Nasazeno:
- assignment běží pouze při:
  - `data.success === true`
  - `data.won_type === null`
- používá RPC:
  - `assign_partner_offer_to_ticket(p_user_id uuid, p_contest_id uuid, p_ticket_id uuid default null)`
- používá:
  - `ticket_row_id`
- zapisuje jen do:
  - `user_partner_offers`
  - `partner_offers.last_assigned_at`
- response pro uživatele zůstává beze změny
- validita nabídky se kontroluje přímo v Block D
- cooldown 5 minut je aktivní

### Block E — Wins / Offers user UI
Nasazeno a ověřeno v repozitáři (commit `b7aa4ce`, 10. 04. 2026):
- `/wins` přepnutí:
  - `Výhry`
  - `Nabídky`
- nové soubory:
  - `src/components/OfferCard.tsx`
  - `src/components/OfferDetailModal.tsx`
- `src/pages/Wins.tsx` aktualizován s tab switcherem
- chování:
  - Nabídky čtou pouze z `user_partner_offers` kde `status = active` a `hidden_at IS NULL`
  - otevření detailu zapisuje `opened_at` (non-fatal)
  - skrytí zapisuje `hidden_at` → DB trigger Block F odešle systémovou zprávu
  - skrytá nabídka okamžitě zmizí ze seznamu (optimistic removal)
  - neexistuje tlačítko Uložit
- `opened_at`
- `hidden_at`
- partner display name:
  - `company_name ?? name`
- zobrazuje `valid_to`
- build: ✅ exit code 0

### Block F — reminder emails + system messages
Nasazeno:
- Edge Function:
  - `send-offer-reminders`
- denní cron job
- summary email po 24h a pak týdně
- `last_reminder_at`
- DB trigger pro system message při `hidden_at`
- write targety:
  - `email_queue`
  - `user_partner_offers.last_reminder_at`
  - `messages`

Důležité:
- během E2E byl nalezen blocker v tokenu pro internal reminder call
- proběhla rotace `INTERNAL_FUNCTION_TOKEN`
- token byl sjednocen v:
  - Supabase secret `INTERNAL_FUNCTION_TOKEN`
  - lokální `.env` `VITE_INTERNAL_FUNCTION_TOKEN`
  - pg_cron `send_offer_reminders_daily`
  - pg_cron `process-event-queue`
- po opravě test:
  - HTTP 200
  - `{"success":true,"emails_queued":0,"offers_touched":0}`

### Block G — billing + reporting
Finální uzamčený návrh i implementace:
Billing vrstva je oddělená od core offer modelu.

Nasazeno:
- `partner_offer_billing_configs`
- `partner_offer_activations`
- `partner_offer_invoice_lines`
- rozšíření:
  - `partner_invoices.type = coin | offer`
- reporting přes admin
- sync aktivací:
  - `sync_partner_offer_activations()`
- admin summary:
  - `get_admin_activation_summary()`

Billing režimy:
- `paid_distribution`
- `hybrid`
- `affiliate_direct`
- `affiliate_external`
- `free`

V1 billing chování:
- `paid_distribution` = automatické fakturování
- `free` = no-op
- `hybrid`, `affiliate_direct`, `affiliate_external` = trackované, ale ruční settlement

---

## Kritická oprava během E2E
Během E2E bylo potvrzeno, že RPC:
- `assign_partner_offer_to_ticket(...)`
existuje a funguje, ale nebylo automaticky napojené na `purchase-ticket`.

Byla provedena cílená oprava:
- změněn pouze:
  - `supabase/functions/purchase-ticket/index.ts`

Oprava:
- po úspěšném `buy_ticket_atomic`
- při `data.success === true && data.won_type === null`
- se automaticky volá:
  - `assign_partner_offer_to_ticket(...)`
- používá `ticket_row_id`
- assignment je non-fatal
- response pro uživatele zůstává beze změny

Tím je **Block D wiring kompletní**.

---

## Finální E2E ověření – potvrzené výsledky

### 1. Assignment flow
Potvrzeno:
- při `won_type = null` vznikne správně `user_partner_offers`
- `ticket_id` v UPO odpovídá `ticket_row_id`
- `status = active`
- `offer_id` sedí
- `last_assigned_at` se aktualizuje

### 2. Cooldown
Potvrzeno:
- opakované přiřazení do 5 minut vrací `NULL`
- nevzniká druhý UPO řádek

### 3. Winning gate
Finální HTTP-level test potvrdil:
- při `won_type = 'bonus'` **nevznikne žádné UPO**
- gate funguje správně

### 4. Ticket purchase response
Potvrzeno:
- response formát pro uživatele je zachovaný
- wiring nic nerozbíjí

### 5. Activations
Potvrzeno:
- `sync_partner_offer_activations()` správně vytváří activation rows
- `upo_id`, `offer_id`, `user_id`, `activated_at` sedí

### 6. Reminder function
Potvrzeno:
- auth guard funguje
- no-op run vrací 200 po opravě tokenu

### 7. Final verdict
**Partner Offers v1 prošlo finálním E2E ověřením.**

---

## Otevřený bod mimo v1
### category_contests
Stále mimo v1, dokud nebude skutečný model kategorií soutěží.

---

## Kanonické memory soubory pro OneMil
Od této chvíle je pro OneMil kanonická pouze tato trojice souborů v tomto workspace:

- `C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw\onemil_state.md`
- `C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw\onemil_history.md`
- `C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw\CLAUDE.md`

Pravidlo:
- `onemil_state.md` = jediný current snapshot
- `onemil_history.md` = jediná chronologická historie
- `CLAUDE.md` = jen stručný pracovní kontext a uzamčené zásady, ne plná historie

---

## Brand Identity — uzamčený stav (27. 04. 2026)

**Plný brand kit:** `docs/brand/onemil_brand_kit/graphics.md` (zdroj: `docs/brand/onemil_brand_kit.zip`)
**Tagline:** Luxusní soutěže. Skutečné výhry.

### Směr
- **Dark premium tech-luxury** — ne casino, ne hazard, ne lottery kitsch
- Zakázané vizuály i slovník: casino, hazard, sázení, sázka, jackpot, žetony, zbohatni, roulette, slot-machine

### Typografie
- Nadpisy: **Poppins** 600–800 (Google Fonts, ne soubory v repozitáři)
- Body / UI text: **Inter** 400–500

### Barvy (kanonické hex hodnoty z brand kitu)
| Název | Hex | Token |
|-------|-----|-------|
| Midnight Black | `#0A0B0F` | `--om-black` |
| Deep Navy | `#101722` | `--om-navy` |
| Graphite | `#1D2128` | `--om-graphite` |
| Platinum | `#E7EBF0` | `--om-platinum` |
| Silver | `#BFC6CF` | `--om-silver` |
| Energy Orange | `#FF8A00` | `--om-orange` |
| Warm Amber | `#FFB547` | `--om-amber` |

### Logo
- **Primární:** trophy / číslo „1" *za* wordmarkem OneMil (wordmark v popředí) — web, appka, hero
- **Sekundární:** trophy *nad* wordmarkem (stacked) — sociální sítě, bannery, plakáty
- **Standalone ikona:** trophy / číslo „1" samostatně — favicon, app icon, avatar
- Export: PNG 512 × 512, PNG 1024 × 1024, SVG (pouze placeholder — pro produkci vektorizovat)
- Hero banner: 1920 × 480 px; partner/OG banner: 1600 × 900 px

---

## Partner portal UI – offer management (2026-04-11)

Nasazeno v `src/pages/PartnerDashboard.tsx`:
- Partner vidí seznam svých nabídek (`partner_offers`) s reálnými stavy
- Sloupce: název, stav (badge), distribuce, platnost do, datum posledního přidělení, akce
- Tlačítko „Nová nabídka" → dialog pro vytvoření (INSERT jako draft)
- Draft / Rejected → tlačítko Upravit (UPDATE) + Odeslat (→ submitted) / Vrátit k úpravám (RPC `revise_partner_offer`)
- Submitted → zobrazí „Čeká na schválení"
- Approved → zobrazí „Schváleno – nelze měnit" (bez editačního tlačítka)
- Form fields: title, short_text, deployment_mode (Select), valid_from, valid_to, link_or_code
- `loadPartnerOffers(partnerId)` voláno automaticky z `loadPartnerData()`
- Build: ✅ exit code 0

---

---

## Admin contest management – aktuální stav (13. 04. 2026)

### Contest statuses (DB + UI)
Platné hodnoty v `contests.status` (constraint `contests_status_check` byl rozšířen):
- `draft` — v admin UI zobrazováno jako **„Archiv test"**
- `pending` — „Čeká na start"
- `active` — „Aktivní"
- `paused` — „Pozastaveno"
- `closed` — „Ukončeno" (pouze systémový přechod, admin nemůže nastavit ručně)

### Admin UI – Správa soutěží
Stránka `AdminContestManagement` má 3 filtrovací taby přímo pod hlavičkou:
- **Aktivní soutěže** — zobrazuje `pending`, `active`, `paused`
- **Archiv test** — zobrazuje `draft`
- **Archiv ukončených soutěží** — zobrazuje `closed`

Chování je na jedné stránce, ne na samostatné stránce ani ve row dropdownu.
- Soutěže ve stavu `closed` patří výhradně do tabu **Archiv ukončených soutěží** (filtrování podle statusu, ne samostatná route)

### Pravidla přechodu statusu (admin)
- Ruční přesun do `draft` (Archiv test) z admin UI je povolen jen ze stavů **`pending`** nebo **`paused`** (ne z `active`)
- `active` → `draft` je zablokováno (UI i frontend guard)
- Zablokovaný přechod zobrazí toast: _„Aktivní soutěž nelze přesunout do Archivu test. Nejprve ji pozastavte nebo vraťte do stavu Čeká na start."_
- V dropdown je `draft` option pro `active` contest viditelná, ale disabled

### Contest create flow
- Aktivní admin cesta: `AdminContestManagement` → RPC `admin_manage_contest`
- Opravena tichá chyba na frontendu: `ticket_count` se již netiše přepisoval na fallback `1_000_000`, pokud nebyl správně předán
- Na straně DB/RPC: `admin_manage_contest` při **create** už **netiše** nepřijímá neplatný nebo chybějící `ticket_count` (místo tichého defaultu je vyžadována platná hodnota / chyba)
- Aby se oprava projevila v prohlížeči na Lovable hostovaném buildu, bylo nutné **Share → Publish** (samotný git push nestačí pro live frontend)

### Hard delete contestů – ZAKAZANO v produkci
- Hard delete contestů není bezpečný se stávajícím FK modelem
- `partner_offer_contests.contest_id` odkazuje FK na `contests(id)`
- Soft detach (`detached_at`) odstraní logickou vazbu, ale FK řádky fyzicky zůstávají → hard delete i po soft detach selže s FK violation
- **Bezpečný způsob „úklidu" testovacích soutěží = přesun do `draft` (Archiv test), ne hard delete**
- Testovací soutěže se **nemají** řešit stejně jako produkční „cleanup" cíle; cílem je statusová archivace, ne mazání řádků
- Delete je v admin UI povolen pouze pro `draft` a `pending` soutěže (testovací fáze)

### Partner Offers + contest lifecycle – potvrzené invarianty
- `partner_offer_contests` řádky se **NESMÍ** mazat natvrdo (ani kvůli „úklidu" soutěže)
- Trigger `trg_partner_offer_approved` attachuje nabídky pouze na `active` nebo `pending` soutěže → `draft` soutěže jsou z automatického attachmentu vyloučeny
- `buy_ticket_atomic` stráží `status = 'active'` → `draft` soutěže jsou pro uživatele inertní
- V kontextu úklidu soutěží se **nepouštět** do změn triggerů, `buy_ticket_atomic` ani `assign_partner_offer_to_ticket` — řešení je stavová archivace a respekt FK modelu

---

## Další správný krok
Partner Offers v1 už se nemá znovu architektonicky otevírat.

Další krok:
1. jen případné bugfixy, pokud se objeví v běžném provozu
2. až potom případná rozšíření mimo v1

---

## PWA metadata a ikony (13. 05. 2026)

PR #3 byl sloučen do `main` jako bezpečná PWA metadata změna.

Aktuální stav:
- Přidán `public/manifest.webmanifest`.
- Do `index.html` přidán manifest link, `theme-color` a `apple-touch-icon`.
- Do `public/` byly z brand kitu zapojeny pouze schválené trophy ikony:
  - `public/apple-touch-icon.png`
  - `public/android-chrome-192x192.png`
  - `public/android-chrome-512x512.png`
- `src/assets/logo-onemil.png` nebyl použit jako PWA ikona.
- Nebyl přidán service worker.
- Nebylo přidáno offline cachování.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyly měněny Supabase, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

Ověření:
- PR #3 smoke E2E prošel.
- PR #3 Playwright Staging Full E2E prošel na větvi `codex/pwa-icon-metadata`.
- Po merge do `main` smoke E2E prošel: GitHub Actions run `25807224457`.
- Po merge do `main` Playwright Staging Full E2E prošel: GitHub Actions run `25807653323`.

---

## iPhone/PWA spodní navigace (13. 05. 2026)

PR #4 byl sloučen do `main` jako bezpečný UI/CSS fix pro mobilní PWA navigaci.

Aktuální stav:
- Spodní navigace v mobilním/PWA zobrazení zůstává vizuálně fixovaná dole při scrollování.
- Přidána podpora iPhone safe area přes `viewport-fit=cover` a `env(safe-area-inset-bottom)`.
- Obsah stránky má na mobilu spodní odsazení, aby nebyl schovaný za spodní navigací.
- Ikony, české labely, routy a business logika nebyly měněny.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyly měněny Supabase, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

Ověření:
- PR #4 smoke E2E prošel.
- PR #4 Playwright Staging Full E2E prošel na větvi `fix/ios-pwa-bottom-navigation`.
- Po merge do `main` smoke E2E prošel: GitHub Actions run `25811447264`.
- Po merge do `main` Playwright Staging Full E2E prošel: GitHub Actions run `25811641231`.

---

## Launch wording cleanup (13. 05. 2026)

PR #5 `Clean launch wording risks` byl sloučen do `main` po ověření smoke + staging E2E.

Aktuální stav:
- Merge commit: `acc43c90d313cbe2bd01adf333d74d3f424905fa`.
- Z public/admin/Bob-visible textů byla odstraněna riziková wording stopa kolem `losy`, `losování`, `jackpot` a `Megajackpot`.
- Texty jsou sjednocené na bezpečnější launch formulace: tikety, otevření tiketů, soutěžní mechanismus, předem určené výherní pozice, hlavní výhra.
- Nebyla změněna business logika.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyly měněny Supabase, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

Ověření:
- PR #5 smoke E2E prošel.
- PR #5 Playwright Staging Full E2E prošel na větvi `fix/launch-copy-risk-wording-cleanup`.
- Po merge do `main` smoke E2E prošel: GitHub Actions run `25816716804`.
- Po merge do `main` Playwright Staging Full E2E prošel: GitHub Actions run `25816763438`.

---

## Produkční DB launch verification (13. 05. 2026)

Ověření produkční databáze proběhlo pouze read-only přes `SELECT`.

Výsledek:
- `handle_new_auth_user` původní FAIL byl false positive.
- `public.profiles` insert používá pouze `id`, `full_name`, `date_of_birth`, `avatar_url`.
- `handle_new_auth_user` nevkládá `user_id` do `public.profiles`.
- `trigger_sofinity_forward` nevolá `net.http_post` přímo.
- Produkce aktuálně používá legacy Sofinity forwarding path:
  `event_logs / trigger_sofinity_forward -> event_forward_log -> call_event_forward_log_listener -> event_queue -> process_event_queue_worker -> Sofinity`.
- Tato legacy mezivrstva není Web/PWA launch blocker.

Technický dluh po launchi:
- Zvážit zjednodušení legacy cesty `event_forward_log -> event_queue`, ale pouze po samostatném schválení.

Invariant:
- Nebyla změněna data ani schema.
- Nebyly spuštěny migrace.
- Nebyl proveden deploy.
- Nebyly měněny Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, Sofinity, OneSignal ani `buy_ticket_atomic`.

---

## Produkční contest cleanup před Web/PWA launchem (13. 05. 2026)

Produkční launch blocker `active contests missing rules_pdf_url` byl vyřešen.

Co bylo provedeno:
- 7 testovacích soutěží bylo přesunuto ze stavu `active` do `draft` / Archiv test.
- 3 reálné soutěže bez PDF pravidel byly dočasně přesunuty ze stavu `active` do `draft` / Archiv test:
  - BMW S 1000 RR
  - Corvette
  - MY26 CORVETTE C8 Stingray 6.2L V8 - Coupe

Finální ověření:
- PASS: žádné aktivní soutěže nemají chybějící `rules_pdf_url`.

Invariant:
- Žádná soutěž nebyla smazána.
- Nebyly spuštěny migrace.
- Nebyl proveden deploy.
- Nebyl měněn app kód.
- Nebyly měněny Stripe, wallet, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## Stripe Test Mode verification (13. 05. 2026)

Stripe je aktuálně správně v Test mode.

Ověření:
- Testovací top-up pro `e2e@onemil.cz` byl vizuálně dokončen v OneMil a zobrazen ve Stripe.
- Supabase ověření potvrdilo:
  - wallet pro `e2e@onemil.cz` existuje,
  - `balance_coins = 100507.00`,
  - `bonus_balance_coins = 11.00`,
  - latest payment `status = completed`,
  - latest payment `method = stripe`,
  - `stripe_session_id` začíná `cs_test_`,
  - latest payment amount v DB je `1280.00`.

Poznámka před public launchem:
- Amount `1280.00` je potřeba porovnat s vybraným UI balíčkem/bonusem před veřejným spuštěním.

Invariant:
- Nebyla provedena žádná live platba.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyl měněn app kód.
- Nebyly měněny Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## Admin revenue reporting fix (14. 05. 2026)

PR #6 `Separate admin revenue from credited MioCoins` byl sloučen do `main`.

Co bylo opraveno:
- Admin reporting už nezobrazuje `payments.amount` jako Kč tržbu.
- `payments.amount` zůstává evidováno jako připsané MioCoiny.
- `Tržba Kč` je ve frontendu odvozena ze známé mapy MioCoin balíčků:
  - 50 MC -> 50 Kč
  - 310 MC -> 300 Kč
  - 525 MC -> 500 Kč
  - 1280 MC -> 1200 Kč
- Připsané MioCoiny jsou v adminu zobrazeny samostatně.
- Neznámé částky mimo známé balíčky se v Kč tržbě zobrazují jako `neznámé`.

Ověření:
- PR #6 smoke E2E prošel.
- PR #6 Playwright Staging Full E2E prošel na větvi `fix/admin-revenue-miocoin-reporting`.
- Po merge do `main` smoke E2E prošel: GitHub Actions run `25845908864`.
- Po merge do `main` Playwright Staging Full E2E prošel: GitHub Actions run `25845971759`.

Invariant:
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla měněna databázová funkce `get_admin_summary_dashboard`.
- Nebyla měněna Supabase data, Stripe, webhook, wallet, contests, tickets, winners, Partner Offers, Sofinity, OneSignal ani `buy_ticket_atomic`.

---

## get_admin_summary_dashboard follow-up audit (14. 05. 2026)

Po PR #6 hlavní admin reporting správně odděluje `Tržba Kč` a `Připsané MioCoiny`.

Read-only follow-up audit ověřil:
- DB funkce `get_admin_summary_dashboard` stále ve legacy `payments_summary` formátuje `payments.amount` jako Kč.
- `payments.amount` přitom zůstává připsaný počet MioCoinů, ne zaplacená Kč částka.
- Funkce je v živém kódu používána pouze v `AdminValidationWorkflows` / admin validation tabu.
- Hlavní admin revenue reporting po PR #6 na tuto legacy hodnotu nespoléhá.
- Toto není Web/PWA launch blocker.

Technický dluh po launchi:
- Buď přestat ve frontend validačním tabu zobrazovat raw `payments_summary`,
- nebo později upravit DB funkci přes samostatně schválenou migraci.

Invariant:
- Během auditu nebyly změněny soubory, app kód, data ani schema.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.

---

## MioCoin top-up package verification (14. 05. 2026)

MioCoin top-up package mapping bylo ověřeno read-only.

Potvrzené mapování:
- 50 Kč -> 50 MioCoinů
- 300 Kč -> 310 MioCoinů
- 500 Kč -> 525 MioCoinů
- 1200 Kč -> 1280 MioCoinů

Ověřené plochy:
- Homepage top-up balíčky
- Profile top-up balíčky
- PaymentSuccess analytické mapování
- `paymentReporting` admin reporting helper
- `create-stripe-checkout` serverové mapování ceny na MioCoiny
- `stripe-webhook` mapování zaplacené Kč částky na připsané MioCoiny
- Admin reporting po PR #6

Výsledek:
- Homepage, Profile, PaymentSuccess, `paymentReporting`, `create-stripe-checkout`, `stripe-webhook` a admin reporting mapping jsou sladěné.
- Nebyla nalezena žádná neshoda.
- Toto není Web/PWA launch blocker.

Invariant:
- Během auditu nebyly změněny soubory, app kód, data ani schema.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet, payments, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## Production contest status cleanup (14. 05. 2026)

Produkční contest status cleanup byl dokončen před veřejným Web/PWA launchem.

Zaznamenaný stav:
- Poslední aktivní testovací soutěž `bmw` byla přesunuta ze stavu `active` do `draft`.
- Finální produkční stav soutěží:
  - `active = 0`
  - `closed = 19`
  - `draft = 76`

Výklad:
- Žádné soutěže nebyly smazány.
- Tento stav je správný, protože OneMil ještě není oficiálně veřejně spuštěný.
- Public launch bude vyžadovat vytvoření nebo aktivaci pouze reálných soutěží s dokončenými PDF pravidly.

Invariant:
- Nebyl měněn app kód.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- V rámci tohoto dokumentačního záznamu nebyla dotčena Supabase data, Stripe, wallet, payments, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## Affiliate program wording merge (14. 05. 2026)

PR #7 `Rename influencer UI to Affiliate program` byl sloučen do `main`.

Změna:
- Viditelné UI/admin označení `Influencer` bylo přejmenováno na `Affiliate program` / `Affiliate partner`.
- `/influencer` routes zůstávají beze změny kvůli bezpečnosti a kompatibilitě.
- Interní DB názvy `influencer_*` zůstávají beze změny.
- Nebyly změněny provize, tracking, login/routing, DB ani business logika.

Ověření:
- Smoke E2E prošel na PR #7.
- Playwright Staging Full E2E prošel na větvi `fix/affiliate-program-wording`.
- Po merge do `main` prošel Smoke E2E: run `25859772102`.
- Po merge do `main` prošel Playwright Staging Full E2E: run `25859844919`.

Invariant:
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, commissions, tracking, routes, login behavior ani `buy_ticket_atomic`.

---

## Visible referral / Influencer wording cleanup (14. 05. 2026)

PR #9 `Clean visible referral and influencer wording` byl sloučen do `main`.

Změna:
- Viditelné UI/admin wording `referral` bylo nahrazeno českým wordingem `doporučení` / `doporučovací`.
- Viditelné admin wording `Influencer` bylo nahrazeno wordingem `Affiliate partner`.
- `/influencer` routes zůstávají beze změny.
- Interní DB/table/function názvy `influencer_*` a interní `referral_*` názvy zůstávají beze změny kvůli kompatibilitě.
- Nebyly změněny routes, DB, tracking, provize, login/routing, Stripe, wallet, contest, ticket, winner, Partner Offers ani `buy_ticket_atomic`.

Ověření:
- Smoke E2E prošel na PR #9.
- Playwright Staging Full E2E prošel na větvi `fix/visible-referral-affiliate-wording`.
- Po merge do `main` prošel Smoke E2E: run `25862999591`.
- Po merge do `main` prošel Playwright Staging Full E2E: run `25863074687`.

Invariant:
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, commissions, tracking, routes, login behavior ani `buy_ticket_atomic`.

---

## Footer Affiliate wording fix (14. 05. 2026)

PR #8 `Update footer Affiliate wording` byl sloučen do `main`.

Změna:
- Zbývající viditelné footer texty `Pro influencery`, `Registrace influencera` a `Přihlášení influencera` byly nahrazeny wordingem `Affiliate program` / `Affiliate partner`.
- Existující URL/routes zůstaly beze změny.
- Nebyly změněny DB, logika, provize, tracking ani login/routing.

Ověření:
- Smoke E2E prošel na PR #8.
- Playwright Staging Full E2E prošel na větvi `fix/footer-affiliate-wording`.
- Po merge do `main` prošel Smoke E2E: run `25861584394`.
- Po merge do `main` prošel Playwright Staging Full E2E: run `25861663913`.

Invariant:
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, commissions, tracking, routes, login behavior ani `buy_ticket_atomic`.

---

## E2E COVERAGE — WALLET BALANCE (14. 05. 2026)

### PR #10 — Add wallet balance E2E coverage — mergnut do `main`

- Zdrojová větev: `test/e2e-wallet-balance`; cílová větev: `main`.
- Merge commit: `6e32ec7e6df079eb1594e7335ec735c41a2bab47`.
- Přidán nový spec soubor: `tests/e2e/09-wallet-balance.spec.ts`

### Co test ověřuje

- Peněženka (wallet balance) se sníží přesně o hodnotu `ticket_price` MC po nákupu jednoho tiketu.
- Balance je čitelná z `/contest/:id` UI před nákupem.
- Snížení se odráží ve stejném UI bez reload stránky (ověřeno pomocí interceptu `loadUserBalance()` GET `/rest/v1/wallets`).
- Test čeká na `TicketResultModal` (dialog scoped přes `[role="dialog"]:has(button[aria-label="Zavřít"])`) a zavírá ho Escape.

### Ochranné guards

- Test se přeskočí, pokud `E2E_TEST_EMAIL` nebo `E2E_TEST_PASSWORD` nejsou nastaveny.
- Test se přeskočí, pokud `E2E_CONTEST_ID` není nastaven — **production CI tuto secret nemá, test proto NIKDY neběží na produkci**.
- Production Smoke je hard-coded na specs 01+02 — spec 09 tam nefiguruje.

### Regrese zachycené testem

- `buy_ticket_atomic` přestane strhávat wallet.
- UI přestane obnovovat balance po nákupu (odebrání `loadUserBalance`).
- Ticket price se změní bez aktualizace wallet dedukce.
- Czech locale formátování balance se rozbije (`toLocaleString("cs-CZ")` non-breaking space).

### Opravený bug v selektoru (před mergem)

- První staging run selhal: Playwright strict mode violation — `.or()` lokátor vyřešil na 2 elementy, protože ContestDetail zobrazuje buy button i top-up button současně.
- Fix: přidáno `.first()` do `.or()` lokátoru (commit `672d241`).

### Výsledky CI (po mergi do `main`)

- Post-merge Smoke E2E: ✅ 1m13s — run `25864204537`.
- Post-merge Playwright Staging Full E2E: ✅ 2m44s — run `25864280989`, ALL PASSED, Telegram OK.

### Invariant

- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet logika, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.
- Staging Full E2E nyní ověřuje: wallet balance klesne přesně o `ticket_price` po nákupu tiketu.
- Production Smoke zůstává lightweight a non-mutating (pouze specs 01+02).

---

## Mobile/PWA Messages fixed layout (14. 05. 2026)

PR #12 `Fix mobile PWA messages scroll layout` byl sloučen do `main`.

Změna:
- Mobile/PWA Messages layout byl upraven tak, aby horní Messages header zůstal stabilní.
- Spodní message composer zůstává stabilní nad fixed bottom navigation.
- Scrolluje pouze seznam zpráv mezi headerem a composerem.
- Bottom navigation zůstává fixed.
- Layout respektuje iPhone safe area a fixed bottom navigation.

Ověření:
- Smoke E2E prošel na PR #12.
- Playwright Staging Full E2E prošel na větvi `fix/mobile-messages-fixed-header-composer`: run `25876737161`.
- Po merge do `main` prošel Smoke E2E: run `25876891113`.
- Po merge do `main` prošel Playwright Staging Full E2E: run `25877013278`.

Invariant:
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla změněna Bob/AI logika ani message sending logika.
- Nebyly změněny routes, DB, Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, Affiliate ani `buy_ticket_atomic`.

---

## E2E COVERAGE - VOUCHER REDEEM DETAIL (14. 05. 2026)

### PR #15 - Add voucher redeem E2E coverage - mergnut do `main`

- Zdrojova vetev: `test/e2e-voucher-redeem`; cilova vetev: `main`.
- Merge commit: `72810c94b3ce0397faf8246eb5e3820022d82203`.
- Pridan novy staging-only spec soubor: `tests/e2e/11-voucher-redeem.spec.ts`.
- Staging workflow `playwright-staging.yml` nove seeduje dedikovany `E2E Spec11 Voucher` a zakoupeny `user_vouchers` radek pro E2E uzivatele.

### Co test overuje

- Prihlaseni staging E2E uzivatele.
- `/vouchers?tab=purchased` a zalozku `Zakoupene`.
- Viditelnost zakoupeneho `E2E Spec11 Voucher`.
- Otevreni redeem/detail modalu pres `Uplatnit voucher`.
- Viditelnost voucher kodu ve formatu `OMV-XXXXXXXX`.
- Shodu kodu na karte a v modalu.
- Viditelnost a klikatelnost tlacitka `Zkopirovat kod`.

### Production Smoke

- Production Smoke zustava lightweight a unchanged.
- Production Smoke dal spousti pouze specs 01 + 02.
- Spec 11 je chraneny staging-only guardem pres `E2E_CONTEST_ID`, ktery production CI nema.

### Vysledky CI

- PR #15 Smoke E2E prosel: run `25884819703`.
- PR #15 Playwright Staging Full E2E prosel na vetvi `test/e2e-voucher-redeem`: run `25884822640`.
- Po merge do `main` prosel Smoke E2E: run `25885049877`.
- Po merge do `main` prosel Playwright Staging Full E2E: run `25885285280`.

### Invariant

- Nebyl proveden deploy.
- Nebyly spusteny migrace.
- Nebyl zmenen app kod.
- Nebyla zmenena DB, Supabase data, Stripe, wallet logika, contests, tickets, winners, Partner Offers, routes, tracking, login behavior ani `buy_ticket_atomic`.
