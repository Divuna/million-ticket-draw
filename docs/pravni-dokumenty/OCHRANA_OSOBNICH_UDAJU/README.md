# Ochrana osobních údajů (GDPR)

## ⛔ STOP — nevyřešený konflikt dvou verzí

**Aktuální znění nelze bezpečně určit. Nevybírám ani jednu z verzí.**

V produkční databázi jsou **dvě různé aktivní** GDPR stránky:

| | `legal/gdpr` | `legal/ochrana-osobnich-udaju` |
|---|---|---|
| `is_active` | true | true |
| Délka | 1 281 znaků | **3 030 znaků** |
| Poslední úprava | **29. 4. 2026** | 28. 12. 2025 |
| Verze v textu | neuvedena | „Verze: 1.0 \| Platné od: 28. 12. 2025" |
| Odkaz na Nařízení EU 2016/679 | ne | **ano** |
| IČO správce | ne | **ano (17795851)** |
| Dostupné veřejně | **ano — `/gdpr`** | ne (route redirectuje na `/gdpr`) |

### Proč to nejde rozhodnout automaticky

Novější **není** obsáhlejší. `legal/gdpr` je novější o čtyři měsíce, ale je to stručný číslovaný
výčet bez verze, bez IČO a bez odkazu na nařízení. `legal/ochrana-osobnich-udaju` je starší, ale
podstatně důkladnější a nese vlastní verzování.

Nedá se tedy říct, jestli novější text vznikl jako **vědomé zjednodušení**, nebo jako **náhrada
naslepo**, která o obsah přišla. To je rozhodnutí pro Pavla a právníka, ne pro AI.

### Co je potřeba rozhodnout

1. Které znění je platné.
2. Co udělat s tím druhým — deaktivovat, nebo sloučit.
3. Doplnit chybějící zpracovatele (viz níže).

---

## Známé věcné nedostatky obou verzí

Platí bez ohledu na to, která zvítězí:

- **Chybí Supabase** — přitom drží *všechna* osobní data (účty, platby, tikety, výhry). Uvedeni
  jsou Stripe, Resend, OneSignal, Google, Meta. `VYŽADUJE PRÁVNÍ SCHVÁLENÍ`
- **Chybí Vercel** — od 2. 9. 2026 produkční hosting. `VYŽADUJE PRÁVNÍ SCHVÁLENÍ`
- Doby uchování jsou popsané obecně („po dobu trvání účtu"). `VYŽADUJE PRÁVNÍ SCHVÁLENÍ`

## Historické soubory

`OneMil_GDPR_FINAL.pdf` v kořeni repozitáře je export **kratší** verze (`legal/gdpr`) z 1. 5. 2026.
Není autoritativní — viz [`../HISTORICKE_SOUBORY.md`](../HISTORICKE_SOUBORY.md).

## Kde text dnes reálně žije

Produkční databáze, tabulka `content_pages`, editovatelná v `/admin/content`. Zobrazuje se přes
`/gdpr` (route `SlugContentPage slug="gdpr"`); `/privacy` i `/legal/ochrana-osobnich-udaju`
redirectují na `/gdpr`.
