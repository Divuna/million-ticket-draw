# OneMil – Change history

Referenced in `.cursor/rules.md`. Log high-level changes here so context is preserved across sessions.

## Format

- **YYYY-MM-DD** – Short description of what changed and why (optional: ticket/PR).

## Recent entries

- **2026-03-15** – Security: `buy_ticket_atomic` / `buy_voucher_atomic` enforce `p_user_id = auth.uid()`; `redeem_miocoin` fixed (bonus by contest+position, winner from `winners` table).
- **2026-03-15** – Audit improvements: manual contest close unified to DB `close_contest` (random draw); atomic refund RPC `deduct_wallet_for_refund`; `wallets.balance_coins >= 0` CHECK (NOT VALID).
- **2026-03-15** – Application completion: referral-on-signup – Register reads `?ref=`, applies after signup and on OAuth return via `useApplyPendingReferral`; stub docs added (`state.md`, `onemil_history.md`, `prompt_rules.md`).

Add new lines at the top of "Recent entries" when you make notable changes.
