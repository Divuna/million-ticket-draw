## Problém

Na Windows desktopu se aplikace nedá nainstalovat přes Windows badge v patičce — tlačítko sice je vidět, ale klik nic nedělá nebo není aktivní.

## Pravděpodobné příčiny

1. **`beforeinstallprompt` event ještě nenastal** v okamžiku kliknutí (Chrome ho vystřeluje až po splnění PWA install criteria — manifest, ikony, návštěva, HTTPS).
2. **PWA install kritéria nejsou splněna** v aktuálním prostředí (preview iframe / dev) — Chrome v Lovable preview iframu install prompt obvykle vůbec nevystřelí. Funguje až na produkční doméně `onemil.cz` v samostatném tabu.
3. **Aplikace už je nainstalovaná** → `isInstalled=true` → Windows badge je pasivní.
4. **Edge/Chrome verze / profil** install nepovolí (např. už dříve odmítnuto, browser cache `beforeinstallprompt`).
5. **Hook `usePwaInstallPrompt`** případně neukládá `deferredPrompt` správně (event listener registrován pozdě, prompt už proběhl).

## Co navrhuji udělat (jen diagnostika + drobná oprava v `InstallAppButton.tsx` / `usePwaInstallPrompt.ts`)

### Krok 1 — Diagnostika (bez změny chování)
Přidat do `InstallAppButton.tsx` viditelný debug stav **jen v dev/preview** (skrytý na produkci), který ukáže:
- `canInstall` (přišel `beforeinstallprompt`?)
- `isInstalled` / standalone mode
- `isIOS`, `isMobileDevice`
- jestli běží v iframe (Lovable preview blokuje install)

Tím okamžitě uvidíme, proč Windows badge není aktivní.

### Krok 2 — Drobná oprava UX na desktopu
V `InstallAppButton.tsx`:
- Když je desktop a `canInstall=false` a NENÍ instalováno → zobrazit Windows badge s **tooltipem / hint textem** „Pro instalaci otevřete onemil.cz v Chrome nebo Edge mimo náhled".
- Když `canInstall=true` → aktivní button (už funguje).

### Krok 3 — Ověření hooku
V `usePwaInstallPrompt.ts` zkontrolovat, že:
- listener `beforeinstallprompt` se registruje co nejdřív (idealne hned při mountu),
- `e.preventDefault()` je voláno (jinak Chrome prompt sežere),
- `deferredPrompt` se nereseuje předčasně.

### Co NEMĚNIT
- manifest, public ikony, OneSignal worker, Supabase, Stripe, payments, routes, legal pages, `AdminCompanyLeads.tsx`, jakákoli business logika.
- Rozsah souborů: pouze `src/components/InstallAppButton.tsx` a případně `src/hooks/usePwaInstallPrompt.ts`.

## Otázka před implementací

Kde přesně to zkoušíš? To je klíč k diagnóze:

- **A)** V Lovable **preview** (iframe v editoru) → tam Chrome install prompt NIKDY nevystřelí, to je očekávané chování prohlížeče. Test musí probíhat na **publikované doméně** (`onemil.cz` nebo `million-ticket-draw.lovable.app`) v samostatném tabu Chrome/Edge.
- **B)** Na publikované doméně `onemil.cz` v Chrome/Edge → pak je to skutečný bug a pustím se do Kroku 1+2+3.
- **C)** Aplikace už je u tebe nainstalovaná z dřívějška → potřeba ji nejdřív odinstalovat (Chrome → ⋮ → Odinstalovat OneMil).

**Potvrď prosím A/B/C** (nebo napiš, kde přesně klikáš), a podle toho buď vysvětlím (A/C), nebo nasadím opravu (B).
