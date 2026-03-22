# OneMil – Project state

This file is referenced in `.cursor/rules.md`. Update it when making significant changes so the next session has context.

## Current state (summary)

- **Core flows:** Voucher purchase (Stripe → payments → wallet), ticket purchase (`buy_ticket_atomic`), contest close (manual = random draw via `close_contest` RPC), winners and bonus prizes wired.
- **Security:** RLS fixes applied for `user_contest_favorites` and `user_vouchers`. `buy_ticket_atomic` and `buy_voucher_atomic` enforce `p_user_id = auth.uid()`. `redeem_miocoin` fixed (no `bonus_prizes.user_id`). Refund uses atomic `deduct_wallet_for_refund`; `wallets.balance_coins >= 0` CHECK (NOT VALID).
- **Referral:** Register and OAuth return apply `?ref=` referral code via `set_my_referrer_by_code` (pending ref in sessionStorage).
- **Docs:** `state.md`, `onemil_history.md`, `prompt_rules.md` exist as stubs; extend as needed.

## Where to update

- After schema or RLS changes: note here and in migrations.
- After new features (e.g. new admin pages): one-line note.
- Before large refactors: snapshot current behavior here.
