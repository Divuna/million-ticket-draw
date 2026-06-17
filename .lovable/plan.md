Plan:

1. Upravím pouze `src/components/InstallAppButton.tsx`.

2. Windows badge nechám vždy viditelný jako trust badge, ale klikací bude jen tehdy, když Chrome/Edge opravdu poskytne nativní `beforeinstallprompt` (`canShowDesktopInstall`).

3. Když je `beforeinstallprompt` dostupný:
   - Windows badge bude aktivní tlačítko `Stáhnout Windows`.
   - Kliknutí zavolá `install()` a otevře nativní Chrome/Edge instalaci aplikace.
   - Nebude se zobrazovat žádná vysvětlující hláška místo instalace.

4. Když `beforeinstallprompt` dostupný není:
   - Windows zůstane jen pasivní badge `Dostupné Windows`.
   - Nebude falešně vypadat jako stažení a nebude po kliknutí ukazovat toast.

5. iPhone a Android ponechám beze změny:
   - iPhone otevře Safari instrukce.
   - Android použije nativní install prompt, když ho browser nabídne.

6. Nedotknu se PWA hooku, manifestu, public ikon/assets, OneSignal workeru, Supabase, Stripe, plateb, rout, legal pages ani jiných UI souborů.

7. Po implementaci ověřím build/check a zkontroluji, že změněný soubor je jen `src/components/InstallAppButton.tsx`.