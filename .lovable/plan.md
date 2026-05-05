## Root cause

The contest is created/updated via `admin_manage_contest` RPC (security definer, bypasses RLS). The RPC does **not** accept `rules` or `rules_pdf_url` parameters, so `AdminContestManagement.tsx` (lines 1253–1327) does a follow-up direct `supabase.from("contests").update({ rules_pdf_url, rules, ... })`.

DB check confirms `public.contests` has only these RLS policies:
- SELECT (public visible + admin select-all)
- DELETE (admin)
- **No INSERT, no UPDATE policy exists.**

So the direct UPDATE matches **zero rows** under RLS. The PDF uploads to the `contest-rules` bucket successfully (bucket is public), but the URL is never persisted. Contest `93dc5cdc-…` confirms: `rules_pdf_url = NULL`.

The frontend already detects 0 rows and shows the Czech toast `"Chyba ukládání pravidel / obrázků"` — so the existing error UX is correct, but the write itself is blocked.

## Fix

### 1. Add admin UPDATE policy on `public.contests` (migration)

This mirrors the existing `contests_admin_delete` / `contests_admin_select_all` pattern. No schema change, no function change, no policy weakening — purely an additive policy that matches workspace rules ("add additional RLS policy ONLY if explicitly requested").

```sql
CREATE POLICY "contests_admin_update"
ON public.contests
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));
```

This unblocks the existing follow-up UPDATE for `rules_pdf_url`, `rules`, `main_prize_secondary_image`, `banner_image`. No other code paths gain new abilities (non-admins still can't update — `has_role` check enforces it).

### 2. `src/components/AdminContestManagement.tsx` — keep the current flow, tighten the error message

The existing flow at lines 1261–1327 is already correct:
- Upload PDF to `contest-rules` bucket
- Get public URL → `additionalUpdates.rules_pdf_url`
- `update(...).eq("id", contestId).select("id")` → if 0 rows or error, show Czech destructive toast and `return` (modal stays open, no success toast)

Only adjust the toast title/description for the rules-PDF specific case to match the requested Czech wording, e.g. `"Nepodařilo se uložit pravidla soutěže. Zkuste to prosím znovu."` when `rules_pdf_url` was part of the failed update. Keep the modal open, do not call the success toast or close logic.

### 3. `src/pages/ContestDetail.tsx` — no change

Lines 1035–1048 already render the "📄 Zobrazit pravidla soutěže" link conditionally on `contest.rules_pdf_url`. Once the column saves, the link appears automatically.

## Out of scope (untouched)

- `admin_manage_contest` RPC signature
- `buy_ticket_atomic`, winner logic, Partner Offers, `partner_offer_contests`
- Storage bucket config (`contest-rules` already public)
- Public contest cards, routes, ContestDetail layout
- `contests` table schema, columns, types

## Verification after apply

1. Edit contest `93dc5cdc-8bd2-4906-92b4-948d5eba1e60` in admin, upload a PDF, save.
2. Confirm: success toast, modal closes, `SELECT rules_pdf_url FROM contests WHERE id='93dc5cdc-…'` returns the public URL with `?t=` cache-bust.
3. Open `/contest/93dc5cdc-…` as a customer → "📄 Zobrazit pravidla soutěže" link visible and opens the PDF.
