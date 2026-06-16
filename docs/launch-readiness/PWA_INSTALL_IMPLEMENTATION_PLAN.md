# PWA Install Implementation Plan

## Goal
Add a complete OneMil PWA install experience without changing the existing manifest,
icons, OneSignal worker, payments, Supabase, or unrelated application behavior.

## Status Legend
- TODO: not started
- IN PROGRESS: actively being implemented or verified
- DONE: completed and verified for this task

## Phases
1. DONE - Create this implementation plan before code changes.
2. DONE - Add shared PWA install logic in a reusable hook.
3. DONE - Add the homepage install CTA component with Android and iPhone behavior.
4. DONE - Place the CTA near the existing top homepage action boxes.
5. DONE - Run build and local verification.
6. DONE - Update handoff documentation.
7. DONE - Commit and push the branch.

## Files To Create Or Change
- Create `src/hooks/usePwaInstallPrompt.ts`
  - Detect installed mode with `window.matchMedia('(display-mode: standalone)')`.
  - Detect iOS standalone mode with `navigator.standalone`.
  - Detect iPhone/iOS Safari-like mobile browsers for manual install instructions.
  - Capture `beforeinstallprompt` for Android/Chrome.
  - Expose `canInstall`, `isInstalled`, `isIOS`, `install()`, and `dismiss()`.
- Create `src/components/InstallAppButton.tsx`
  - Render a small OneMil-styled install CTA.
  - Use existing `lucide-react` icons.
  - Show Android native install behavior when available.
  - Show iPhone instructions in a small modal/dialog.
- Change `src/pages/Homepage.tsx`
  - Import and place `InstallAppButton` near the existing top action boxes:
    `Probíhající soutěže` and `Koupit voucher se slevou`.
- Update documentation after implementation:
  - `docs/launch-readiness/PWA_INSTALL_IMPLEMENTATION_PLAN.md`
  - `onemil_state.md`
  - `onemil_history.md`
  - `CLAUDE.md`

## Android Install Behavior
- The hook listens for `beforeinstallprompt`.
- When the browser provides the event and the app is not installed, the CTA appears.
- Clicking `Nainstalovat aplikaci` calls `prompt()` on the saved event.
- The hook waits for `userChoice`.
- If the user accepts, the CTA hides.
- If the user dismisses, the CTA also avoids broken UI by clearing the saved prompt.
- The hook listens for `appinstalled` and hides the CTA once installation finishes.

## iPhone Install Instructions
- iPhone/iOS does not use the Android native install prompt.
- If the app is not already running standalone, the CTA opens a Czech instruction modal:
  1. Otevři OneMil v Safari.
  2. Klepni na Sdílet.
  3. Zvol „Přidat na plochu“.
  4. Potvrď „Přidat“.
- The modal includes the note:
  `Na iPhonu instalaci potvrzuješ ručně přes Safari.`
- The UI must not pretend that iOS supports a native Android-style install prompt.

## Homepage CTA Placement
- Place the CTA in the same top action area as the homepage boxes:
  `Probíhající soutěže` and `Koupit voucher se slevou`.
- Keep the visual language consistent:
  dark premium card, amber/orange accent, compact action layout, no new visual system.

## What Will Not Be Touched
- No `vite-plugin-pwa`.
- No new service worker.
- No changes to `public/OneSignalSDKWorker.js`.
- No changes to `public/manifest.webmanifest`.
- No changes to public icons.
- No Supabase changes.
- No Stripe changes.
- No payments, wallet, contests, tickets, winners, Partner Offers, affiliate, Bob,
  routes, legal pages, or unrelated UI changes.
- No temp files committed:
  - `supabase/.temp/*`
  - `scripts/cleanup-ticket-shares.ts`
  - `tmp-gh-artifacts-27259074667/`

## Manual Test Checklist
- TODO - Android Chrome: CTA appears and native install dialog opens.
- TODO - Android installed mode: CTA hidden.
- TODO - iPhone Safari: CTA opens instruction modal.
- TODO - iPhone installed from home screen: CTA hidden.
- TODO - Desktop: no unwanted UI unless browser exposes a real install prompt.

## Implementation Handoff
- Implementation commit: `a030ad512f2b01fa81ec84de110e92dabdbf9ddd`
- Created files:
  - `src/hooks/usePwaInstallPrompt.ts`
  - `src/components/InstallAppButton.tsx`
- Changed files:
  - `src/pages/Homepage.tsx`
  - `docs/launch-readiness/PWA_INSTALL_IMPLEMENTATION_PLAN.md`
  - `onemil_state.md`
  - `onemil_history.md`
  - `CLAUDE.md`
- Build result: `npm run build` passed.
- Untouched by this task:
  - `public/manifest.webmanifest`
  - public icons
  - `public/OneSignalSDKWorker.js`
  - Supabase
  - Stripe
- Remaining manual phone checks:
  - real Android Chrome install dialog on a physical phone,
  - Android installed launch from home screen,
  - real iPhone Safari add-to-home-screen instructions,
  - iPhone launch from home screen hides CTA.

## Build And Verification Plan
- DONE - `npm run build` passed.
- DONE - Runtime checks completed:
  - desktop without `beforeinstallprompt`: install CTA hidden,
  - Android/Chrome simulated `beforeinstallprompt`: CTA appears and calls `prompt()`,
  - accepted Android install choice: CTA hidden,
  - iPhone Safari user agent: CTA appears and opens Czech instruction modal,
  - standalone display mode: CTA hidden.

## Continuation Notes For Another Chat
- Worktree: `C:\Users\divis\Documents\million-ticket-draw-pwa-install`
- Branch: `feature/pwa-install-ui`
- Start by checking `git status --short --branch`.
- Continue phases in this document and update each phase status to TODO / IN PROGRESS / DONE.
- Keep implementation scoped to the files listed above.
- Before final commit, confirm `git diff --name-only` contains only the intended files.
