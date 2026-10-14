import type { CapacitorConfig } from '@capacitor/cli';

/**
 * OneMil — nativní obal (Capacitor).
 *
 * Pravidla (neměnit bez schválení Pavla):
 * - `appId` je trvalý Android application ID `cz.onemil.app` — po zveřejnění
 *   v Google Play už nejde změnit.
 * - Aplikace se spouští z LOKÁLNÍHO webového buildu (`webDir: 'dist'`).
 *   Nepoužívat `server.url` na produkční web jako hlavní obsah aplikace.
 * - Detekce nativního běhu je v `src/lib/nativeApp.ts` (Capacitor runtime),
 *   žádný User-Agent.
 */
const config: CapacitorConfig = {
  appId: 'cz.onemil.app',
  appName: 'OneMil',
  webDir: 'dist',
};

export default config;
