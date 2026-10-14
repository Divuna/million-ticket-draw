# Produkční bezpečnostní oprava RPC — 18. 07. 2026

## Stav

Oprava je aplikovaná v produkčním Supabase projektu `xkzhjldrojjlrkezorey` a zapsaná v GitHubu přes PR #243.

- PR #243: `fix(security): hardening contest, bonus transfer and hidden vouchers`
- Merge commit: `1c66b211857a9a949efd81878066874a77f0ceaa`
- Migrace: `supabase/migrations/20260718163000_security_rpc_hardening.sql`

## Opravené chyby

1. `pause_contest(uuid)` a `resume_contest(uuid)`
   - anonymní přístup odebraný,
   - běžný přihlášený uživatel nemůže soutěž změnit,
   - úspěšné použití vyžaduje roli `admin` nebo `superadmin`.

2. `transfer_bonus_to_main(uuid)`
   - anonymní a běžný přihlášený přístup odebraný,
   - funkce s libovolným `user_id` je dostupná pouze `service_role`,
   - běžná vlastní varianta `transfer_bonus_to_main()` bez parametru nebyla změněna.

3. `buy_voucher_atomic(uuid, uuid)`
   - znovu vyžaduje `v.is_public = true`,
   - skrytý voucher nelze koupit přímým voláním,
   - anonymní přístup je odebraný,
   - `authenticated` a `service_role` přístup zůstal zachovaný,
   - uživatel smí nakupovat pouze pro vlastní `auth.uid()`.

## Ověření

- výsledná oprávnění byla ověřena přímo v produkční databázi,
- žádná soutěž, platba, voucher ani peněženka nebyla při kontrole změněna,
- žádné zůstatky ani existující nákupy nebyly upraveny,
- produkce a GitHub jsou po merge PR #243 ve shodě.
