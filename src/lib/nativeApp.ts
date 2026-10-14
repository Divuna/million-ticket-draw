import { Capacitor } from '@capacitor/core';

/**
 * Centrální rozpoznání, zda OneMil běží jako nativní Android/iOS aplikace
 * v Capacitor obalu.
 *
 * Jediný zdroj pravdy pro platform detekci — všechna budoucí místa
 * (skrývání dobíjení apod.) MUSÍ používat výhradně tento modul.
 *
 * Pravidla (neměnit):
 * - Používá výhradně vestavěné Capacitor API (`Capacitor.isNativePlatform()`),
 *   nikdy User-Agent — ten je křehký a dá se podvrhnout.
 * - Web i nainstalovaná PWA vrací vždy `false` (Capacitor runtime tam
 *   neexistuje, `isNativePlatform()` je `false`).
 * - Výchozí/bezpečný stav je `false` — při jakékoli chybě se aplikace
 *   chová jako web, takže web nikdy nemůže omylem přijít o funkce.
 */

let cachedIsNativeApp: boolean | null = null;

/** True pouze uvnitř nativního Capacitor obalu (Android/iOS). Web a PWA → false. */
export function isNativeApp(): boolean {
  if (cachedIsNativeApp === null) {
    try {
      cachedIsNativeApp = Capacitor.isNativePlatform();
    } catch {
      cachedIsNativeApp = false;
    }
  }
  return cachedIsNativeApp;
}

/** 'android' | 'ios' uvnitř nativní aplikace, jinak 'web'. */
export function getNativePlatform(): 'android' | 'ios' | 'web' {
  try {
    const platform = Capacitor.getPlatform();
    return platform === 'android' || platform === 'ios' ? platform : 'web';
  } catch {
    return 'web';
  }
}

/** React-friendly alias — hodnota je za běhu neměnná, hook není potřeba. */
export function useIsNativeApp(): boolean {
  return isNativeApp();
}
