# Launch TODO

## Security follow-up - Supabase advisor email

Status: HOTOVO dokumentacne a fix aplikovan (16. 06. 2026).

- Stary Supabase advisor email byl provereny.
- Aktualne se nereprodukuji `auth_users_exposed` ani `rls_disabled_in_public`.
- Realne opraveny advisor error byl `public.contest_progress` jako `security definer`.
- Opravna migrace: `supabase/migrations/20260616170000_fix_contest_progress_security.sql`.
- Oprava byla aplikovana na staging `dxmowysntemfqfnanxua` i produkci `xkzhjldrojjlrkezorey`.
- Po refreshi advisoru ma zmizet error `contest_progress`.
- Zbyva samostatny budouci hardening pass pro `function_search_path_mutable`, security definer function execute grants a `auth_leaked_password_protection`.

## C22 - Zakaznicky reset hesla

Status: HOTOVO na vetvi `codex/affiliate-payouts-audit` (14. 06. 2026).

- Pridana zakaznicka route `/reset-password`.
- `/login` obsahuje odkaz `Zapomenute heslo?`.
- Zakaznik muze pozadat o reset e-mailem pres Supabase Auth `resetPasswordForEmail` s redirectem na `/reset-password`.
- Po otevreni recovery session umi `/reset-password` nastavit nove heslo pres `supabase.auth.updateUser`.
- `PASSWORD_RECOVERY` uz nerozesila vsechny recovery linky na `/partner/set-password`; AuthContext rozlisuje `/reset-password` vs `/partner/set-password` podle aktualni recovery URL.
- Partner set-password flow zustava na `/partner/set-password`.
- Overeno: `npm run build` a `npx playwright test tests/e2e/44-customer-password-reset.spec.ts --project=chromium`.

Nedotceno: Partner API, fakturace, reward logika, SQL, produkcni data.
