# INTERNAL_FUNCTION_TOKEN ↔ frontend

## Supabase (Edge Functions)

- **Name:** `INTERNAL_FUNCTION_TOKEN` only.
- **Plaintext** is only visible in the Supabase Dashboard (Edge Functions → Secrets → reveal). The CLI `supabase secrets list` shows **names + digests**, not values.
- **Do not** create a second secret named `VITE_INTERNAL_FUNCTION_TOKEN` on Supabase. Vite vars belong in **local `.env` / hosting build env**, not Edge secrets.
- If `VITE_INTERNAL_FUNCTION_TOKEN` was ever added to Edge secrets by mistake, remove it with:  
  `npx supabase secrets unset VITE_INTERNAL_FUNCTION_TOKEN`  
  (safe no-op if it does not exist.)

## Frontend / Vite

- **Name:** `VITE_INTERNAL_FUNCTION_TOKEN`
- **Value:** paste the **same plaintext** as `INTERNAL_FUNCTION_TOKEN` from the Dashboard into `.env` (and into your host’s build environment, e.g. Vercel).
- The app adds header **`x-internal-token`** on selected `supabase.functions.invoke` calls via `withEdgeInternalToken()` in `src/integrations/supabase/client.ts`.

## Verify the header

1. Open DevTools → **Network** while logged in as admin/partner.
2. Trigger an action that calls a protected function (e.g. **rotate partner API key**).
3. Inspect the request to `functions/v1/...`: confirm **`x-internal-token`** is present and matches the Dashboard value (character-for-character).

## `purchase-ticket` and Unauthorized

The **`purchase-ticket`** Edge Function does **not** read `INTERNAL_FUNCTION_TOKEN` or `x-internal-token`. It requires a valid **`Authorization: Bearer <user JWT>`**.

- **401 Missing authorization** without a JWT is expected at the gateway/function.
- To confirm purchases work, call with a real session JWT (e.g. from the app after login), not the internal function token.

## Optional: redundant Edge secrets

`supabase secrets list` may show `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. No Edge function in this repo uses `VITE_*` env names; they are redundant with `SUPABASE_URL` / `SUPABASE_ANON_KEY`. Removing them is optional cleanup—only after you confirm nothing external depends on those names.
