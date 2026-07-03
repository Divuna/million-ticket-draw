# INTERNAL_FUNCTION_TOKEN

## Server / Edge Only

- `INTERNAL_FUNCTION_TOKEN` is a server-side secret for Supabase Edge Functions, database cron/pg_net dispatchers, and local server-side verification scripts.
- Do not expose this value through any `VITE_` environment variable.
- Browser code must authenticate with the user's Supabase JWT and role checks in the target Edge Function.
- If a browser/admin action needs privileged work, the Edge Function must validate the caller JWT and enforce the required role before using service-role access.

## Supabase Edge Functions

- Secret name: `INTERNAL_FUNCTION_TOKEN`.
- Plaintext is only visible in the Supabase Dashboard under Edge Functions secrets.
- `supabase secrets list` shows names and digests, not values.
- Do not create a Supabase secret named `VITE_INTERNAL_FUNCTION_TOKEN`.

## Local Scripts And Tests

- Server-side scripts or API-only E2E specs may read `INTERNAL_FUNCTION_TOKEN` from `process.env`.
- These scripts may send `x-internal-token` only from Node/GitHub Actions/server contexts.
- Frontend files under `src/` must not read `INTERNAL_FUNCTION_TOKEN`, `VITE_INTERNAL_FUNCTION_TOKEN`, or send `x-internal-token`.

## Browser Verification

1. Open DevTools Network while using the app as an admin, partner, or customer.
2. Trigger browser actions that call Edge Functions.
3. Confirm browser requests use `Authorization: Bearer <user JWT>` and do not include `x-internal-token`.

## `purchase-ticket` And Unauthorized

The `purchase-ticket` Edge Function does not read `INTERNAL_FUNCTION_TOKEN` or `x-internal-token`. It requires a valid user JWT.

- `401` without a JWT is expected.
- To confirm purchases work, call with a real session JWT from the app after login, not with an internal function token.
