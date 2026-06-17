Cíl: Windows badge nesmí otevírat tento návod, pokud prohlížeč umí nativní instalaci. Kliknutí má rovnou zavolat Chrome/Edge install prompt a vytvořit zástupce/aplikaci.

Plán:
1. Upravit pouze `src/components/InstallAppButton.tsx`.
2. Windows badge bude na desktopu vždy tlačítko, ale s dvěma stavy:
   - pokud existuje `beforeinstallprompt` (`canShowDesktopInstall`), kliknutí zavolá `handleInstall()` a otevře nativní dialog Chrome/Edge;
   - pokud prompt není k dispozici, badge zůstane jen pasivní/instruktážní a může otevřít návod.
3. Změnit text aktivního Windows tlačítka tak, aby bylo jasné, že jde o instalaci: `Stáhnout` / `Do počítače` nebo `Stáhnout Windows`.
4. Zachovat iPhone a Android badge beze změny a nezměnit mobilní chování.
5. Nezasahovat do `usePwaInstallPrompt`, manifestu, public ikon, OneSignal, Supabase, Stripe, routes, legal pages ani `AdminCompanyLeads.tsx`.
6. Po implementaci spustit dostupný build/check a potvrdit přesně změněné soubory.

Důležitá technická poznámka: Chrome/Edge dovolí otevřít nativní install prompt pouze tehdy, když už prohlížeč poslal událost `beforeinstallprompt`. Pokud ji neposlal (např. Lovable preview/iframe, app už je nainstalovaná, nebo prohlížeč ještě nevyhodnotil PWA jako instalovatelnou), web nemůže programově vytvořit zástupce na ploše bez souhlasu prohlížeče. V takovém stavu můžeme jen ukázat návod.