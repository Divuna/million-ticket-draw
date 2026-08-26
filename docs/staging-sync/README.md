# ⛔ STAGING ONLY — nikdy nespouštět na produkci

Tato složka **není** `supabase/migrations/` a její obsah **není migrace**.

Jsou to záznamy jednorázových provozních zásahů provedených **výhradně na stagingu
`dxmowysntemfqfnanxua`**. Leží tady schválně, mimo `supabase/migrations/`, aby je
žádný budoucí `supabase db push` nemohl omylem aplikovat na produkci
`xkzhjldrojjlrkezorey`.

## Pravidla

- **Nikdy nespouštět na produkci.** Ani „pro jistotu", ani „vždyť je to no-op".
- **Nepřesouvat zpět do `supabase/migrations/`.** Umístění mimo migrace je ta pojistka.
- **Není potřeba je znovu spouštět.** Staging už jimi byl dorovnán 26. 08. 2026.
- Větev `fix/staging-security-drift-sync` se **nemerguje do `main`**.

## Proč tyto soubory vznikly

Produkce dostala sérii bezpečnostních hardening migrací, které staging nikdy
nedostal. Staging byl proto výrazně slabší a bezpečnostní testy tam dávaly
**falešně optimistický obraz** — něco, co produkce blokuje, na stagingu prošlo.

Strojový diff všech `SECURITY DEFINER` funkcí (signatura + `anon`/`authenticated`
EXECUTE) ukázal:

| | před | po |
|---|---|---|
| Klientsky volatelné `SECURITY DEFINER` | staging 152 / produkce 125 | staging 122 / produkce 125 |
| Skutečné bezpečnostní rozdíly (staging slabší) | **47** | **0** |
| Zapisující, klientsky volatelné, bez guardu | **101** | **0** |

Produkce byla brána jako kanonický bezpečnostní stav, ale **nic se nekopírovalo
naslepo**. Porovnání těl ukázalo, že staging běží u prakticky celé drift množiny
**starší logiku**, takže se měnily jen granty a přenášely pouze guardy — s jedinou
výjimkou (`activate_partner_reward_sql`), kde produkce žádný guard nemá, protože
logiku místo toho odstranila.

## Obsah

| Soubor | Commit | Co dělá |
|---|---|---|
| `20260826170000_staging_security_drift_sync.sql` | `742903a2` | Srovnání grantů (A1/A2/D) + guard u tří test/CRUD RPC (B) |
| `20260826180000_staging_security_drift_category_c_guards.sql` | `a28ac051` | Přenos 5 chybějících guardů kategorie C |
| `20260826190000_staging_activate_partner_reward_sql_match_production.sql` | `7afe129e` | Srovnání `activate_partner_reward_sql` na produkční stub |

## Co zůstává odlišné (a je to v pořádku)

Dva rozdíly běží **opačným směrem** — produkce je permisivnější:
`get_admin_top_bar_stats` a `get_latest_winners_homepage_public` jsou na produkci
`anon`-volatelné, ale **na stagingu vůbec neexistují**. Jde tedy o chybějící
funkce, ne o drift grantů.
