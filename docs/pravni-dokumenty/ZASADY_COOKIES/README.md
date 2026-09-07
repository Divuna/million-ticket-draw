# Zásady používání cookies

## Aktuální znění

**Jednoznačné, bez konfliktu.** Existuje jediná verze a nemá žádný PDF protějšek.

| | |
|---|---|
| Zdroj | produkční `content_pages`, `section='legal'`, `slug='cookies'` |
| Veřejná adresa | `/legal/cookies` (přes `ContentPage` na `/:section/:slug`) |
| Délka | 2 328 znaků |
| Platné od | 28. 12. 2025 (uvedeno v textu) |
| Editace | `/admin/content` |

Odkazuje se z patičky i z cookie lišty (`CookieConsentBanner.tsx`).

## Rozpory se skutečnou implementací — `VYŽADUJE PRÁVNÍ SCHVÁLENÍ`

Porovnáno s `src/lib/consent.ts` a `CookieConsentBanner.tsx`:

| Text tvrdí | Skutečnost |
|---|---|
| „Platební brána" | je to konkrétně **Stripe** — jmenovat ho |
| kategorie **Bezpečnostní cookies** | v `consent.ts` **neexistuje**; kategorie jsou jen `essential`, `analytics`, `marketing` |
| neuvádí **OneSignal** | push notifikace ukládají do prohlížeče vlastní data (SDK, worker, IndexedDB) |
| neuvádí **Google Tag Manager** | `GTM-MK25MC9P` se načítá a teprve přes něj jdou GA4 a Meta Pixel |
| „změnu provedete v nastavení prohlížeče" | souhlas se ukládá do `localStorage` (`cookie_consent`) **a do databáze** (`cookie_consents`, 92 řádků). Vymazání cookies v prohlížeči ho tedy nezruší — je potřeba popsat, kde se souhlas mění uvnitř aplikace. |

Uváděné Google Analytics a Meta Pixel odpovídají skutečnosti.

## Historické soubory

Žádné. Cookies jako jediné ze čtyř právních textů **nemají PDF export** v repozitáři.
