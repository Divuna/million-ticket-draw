# L03 — GDPR admin editability note

Datum: 15. 06. 2026
Typ změny: dokumentace pouze

## Výsledek ověření

Admin může upravovat GDPR text přes `/admin/content`, pokud bude kanonická stránka `/gdpr`.

- `/gdpr` je CMS editovatelná stránka přes `content_pages.slug = 'gdpr'`.
- `/legal/ochrana-osobnich-udaju` je také CMS editovatelná stránka.
- `/privacy` je statická stránka v kódu a admin ji bez zásahu do kódu měnit nemůže.

## Owner-managed obsah

GDPR obsah je owner-managed CMS obsah. Pavel si text `/gdpr` průběžně spravuje sám přes `/admin/content` podle aktuálních podkladů a požadavků.

Technický úkol je pouze sjednotit routy a odkazy na jednu kanonickou CMS stránku `/gdpr`. Právní obsah `/gdpr` se nemá měnit v kódu ani automaticky bez Pavlova/legal schválení.

## Doporučení

Technicky doporučený kanonický kandidát je `/gdpr`, protože registrace ukládá `document_slug='gdpr'` do evidence souhlasů a Pavel si pak může finální GDPR text měnit sám přes admin.

## Status

L03 zůstává P0 owner/legal blocker, dokud Pavel/legal nepotvrdí:

1. finální kanonickou URL,
2. finální právní obsah,
3. co udělat s `/privacy` a `/legal/ochrana-osobnich-udaju`,
4. co má zůstat ve footeru a registračním checkboxu.

Nebyl změněn kód, SQL, CMS obsah ani deploy.
